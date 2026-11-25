import {
  getOwnerSession,
  assertRequestOrigin,
  readJsonBody,
  jsonResponse
} from "./auth.mjs";

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;
const MAX_HOLDINGS = 20;
const MAX_QUANTITY = 1_000_000_000_000;
const MAX_AVG_COST = 1_000_000_000_000;

function normalizeCik(value, market, errorCode = "invalid_holding") {
  if (value === null || value === undefined || value === "") return null;
  if (market !== "US" || typeof value !== "string" || !/^[0-9]{1,10}$/.test(value)) throw new Error(errorCode);
  return value.padStart(10, "0");
}

function validateHolding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_holding");
  const { symbol, market, quantity, avgCost = null, notes = null, cik = null } = value;
  if (typeof symbol !== "string" || symbol !== symbol.trim().toUpperCase() || !SYMBOL_PATTERN.test(symbol)) {
    throw new Error("invalid_holding");
  }
  if (!["US", "MY"].includes(market)) throw new Error("invalid_holding");
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    throw new Error("invalid_holding");
  }
  if (avgCost !== null && (typeof avgCost !== "number" || !Number.isFinite(avgCost) || avgCost < 0 || avgCost > MAX_AVG_COST)) {
    throw new Error("invalid_holding");
  }
  if (notes !== null && (typeof notes !== "string" || notes.length > 500)) throw new Error("invalid_holding");
  const normalizedCik = normalizeCik(cik, market);
  return { symbol, market, quantity, avgCost, notes, cik: normalizedCik };
}

async function listHoldings(request, env) {
  const session = await getOwnerSession(request, env);
  if (!session) return jsonResponse({ error: "Sign in required." }, 401);
  const rows = await env.DB.prepare(
    "SELECT i.symbol, i.market, i.name, i.currency, i.cik, i.sector, i.shariah_flag AS shariahFlag, " +
    "h.quantity, h.avg_cost AS avgCost, h.notes, h.updated_at AS updatedAt, " +
    "q.price, q.prev_close AS prevClose, q.change_pct AS changePct, q.as_of AS quoteAsOf, " +
    "q.provider AS quoteProvider, COALESCE(q.status, 'unavailable') AS quoteStatus " +
    "FROM holding h JOIN instrument i ON i.id = h.instrument_id " +
    "LEFT JOIN quote_latest q ON q.instrument_id = i.id " +
    "ORDER BY i.market, i.symbol"
  ).all();
  return jsonResponse({ holdings: rows.results || [] });
}

async function upsertHoldings(request, env) {
  assertRequestOrigin(request, env);
  const session = await getOwnerSession(request, env);
  if (!session) return jsonResponse({ error: "Sign in required." }, 401);
  const payload = await readJsonBody(request);
  if (!Array.isArray(payload?.holdings) || payload.holdings.length > MAX_HOLDINGS) {
    return jsonResponse({ error: "Provide up to 20 holdings per request." }, 400);
  }

  const holdings = payload.holdings.map(validateHolding);
  const seen = new Set();
  for (const holding of holdings) {
    const key = `${holding.market}:${holding.symbol}`;
    if (seen.has(key)) return jsonResponse({ error: "Duplicate holdings are not allowed." }, 400);
    seen.add(key);
  }
  if (!holdings.length) return jsonResponse({ saved: 0 });

  const currentRows = await env.DB.prepare(
    "SELECT i.market, i.symbol FROM holding h JOIN instrument i ON i.id = h.instrument_id"
  ).all();
  const existing = new Set((currentRows.results || []).map((row) => `${row.market}:${row.symbol}`));
  const additional = holdings.filter((holding) => !existing.has(`${holding.market}:${holding.symbol}`)).length;
  if (existing.size + additional > MAX_HOLDINGS) {
    return jsonResponse({ error: "Magic Folio supports up to 20 holdings. Update or remove an existing position first." }, 409);
  }

  const now = new Date().toISOString();
  const statements = holdings.flatMap((holding) => {
    const currency = holding.market === "US" ? "USD" : "MYR";
    return [
      env.DB.prepare(
        "INSERT INTO instrument(symbol,market,quote_symbol,name,currency,cik) VALUES(?,?,?,?,?,?) " +
        "ON CONFLICT(market,symbol) DO UPDATE SET active=1, cik=COALESCE(excluded.cik,instrument.cik)"
      ).bind(holding.symbol, holding.market, holding.symbol, holding.symbol, currency, holding.cik),
      env.DB.prepare(
        "INSERT INTO holding(instrument_id,quantity,avg_cost,notes,updated_at) " +
        "SELECT id,?,?,?,? FROM instrument WHERE market=? AND symbol=? " +
        "ON CONFLICT(instrument_id) DO UPDATE SET quantity=excluded.quantity, " +
        "avg_cost=excluded.avg_cost, notes=excluded.notes, updated_at=excluded.updated_at"
      ).bind(holding.quantity, holding.avgCost, holding.notes, now, holding.market, holding.symbol)
    ];
  });

  const results = await env.DB.batch(statements);
  const saved = holdings.filter((_, index) => Number(results[index * 2 + 1]?.meta?.changes || 0) === 1).length;
  return jsonResponse({ saved });
}

async function deactivateUnusedInstrument(env, market, symbol) {
  const inactiveInstrument = "(SELECT i.id FROM instrument i WHERE i.market=? AND i.symbol=? AND i.active=0 " +
    "AND NOT EXISTS (SELECT 1 FROM holding h WHERE h.instrument_id=i.id) " +
    "AND NOT EXISTS (SELECT 1 FROM watchlist w WHERE w.instrument_id=i.id))";
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE instrument AS i SET active=0 WHERE i.market=? AND i.symbol=? " +
      "AND NOT EXISTS (SELECT 1 FROM holding h WHERE h.instrument_id=i.id) " +
      "AND NOT EXISTS (SELECT 1 FROM watchlist w WHERE w.instrument_id=i.id)"
    ).bind(market, symbol),
    env.DB.prepare(`DELETE FROM quote_latest WHERE instrument_id = ${inactiveInstrument}`).bind(market, symbol),
    env.DB.prepare(`DELETE FROM sec_filing WHERE instrument_id = ${inactiveInstrument}`).bind(market, symbol),
    env.DB.prepare(`DELETE FROM sec_fetch_cache WHERE instrument_id = ${inactiveInstrument}`).bind(market, symbol)
  ]);
}

async function deleteHolding(request, env, pathname) {
  assertRequestOrigin(request, env);
  const session = await getOwnerSession(request, env);
  if (!session) return jsonResponse({ error: "Sign in required." }, 401);
  await readJsonBody(request);

  const parts = pathname.split("/");
  if (parts.length !== 5) return jsonResponse({ error: "Invalid holding." }, 400);
  let market;
  let symbol;
  try {
    market = decodeURIComponent(parts[3]);
    symbol = decodeURIComponent(parts[4]);
  } catch {
    return jsonResponse({ error: "Invalid holding." }, 400);
  }
  symbol = symbol.toUpperCase();
  if (!["US", "MY"].includes(market) || !SYMBOL_PATTERN.test(symbol)) {
    return jsonResponse({ error: "Invalid holding." }, 400);
  }

  const deleted = await env.DB.prepare(
    "DELETE FROM holding WHERE instrument_id = " +
    "(SELECT id FROM instrument WHERE market = ? AND symbol = ?) RETURNING instrument_id"
  ).bind(market, symbol).first();
  if (!deleted) return jsonResponse({ error: "Holding not found." }, 404);
  await deactivateUnusedInstrument(env, market, symbol);
  return jsonResponse({ deleted: true, market, symbol });
}


const MAX_WATCHLIST_ITEMS = 20;
const MAX_WATCHLIST_TOTAL = 50;

function validateWatchlistItem(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_watchlist_item");
  const { symbol, market, note = null, cik = null } = value;
  if (typeof symbol !== "string" || symbol !== symbol.trim().toUpperCase() || !SYMBOL_PATTERN.test(symbol)) {
    throw new Error("invalid_watchlist_item");
  }
  if (!["US", "MY"].includes(market)) throw new Error("invalid_watchlist_item");
  if (note !== null && (typeof note !== "string" || note.length > 500)) throw new Error("invalid_watchlist_item");
  const normalizedCik = normalizeCik(cik, market, "invalid_watchlist_item");
  return { symbol, market, note, cik: normalizedCik };
}

async function listWatchlist(request, env) {
  const session = await getOwnerSession(request, env);
  if (!session) return jsonResponse({ error: "Sign in required." }, 401);
  const rows = await env.DB.prepare(
    "SELECT i.symbol, i.market, i.name, i.currency, i.cik, i.sector, w.note, w.added_at AS addedAt, " +
    "q.price, q.prev_close AS prevClose, q.change_pct AS changePct, q.as_of AS quoteAsOf, " +
    "q.provider AS quoteProvider, COALESCE(q.status, 'unavailable') AS quoteStatus " +
    "FROM watchlist w JOIN instrument i ON i.id = w.instrument_id " +
    "LEFT JOIN quote_latest q ON q.instrument_id = i.id " +
    "ORDER BY i.market, i.symbol"
  ).all();
  return jsonResponse({ items: rows.results || [] });
}

async function addWatchlistItems(request, env) {
  assertRequestOrigin(request, env);
  const session = await getOwnerSession(request, env);
  if (!session) return jsonResponse({ error: "Sign in required." }, 401);
  const payload = await readJsonBody(request);
  if (!Array.isArray(payload?.items) || payload.items.length > MAX_WATCHLIST_ITEMS) {
    return jsonResponse({ error: "Provide up to 20 watchlist items per request." }, 400);
  }

  const items = payload.items.map(validateWatchlistItem);
  const seen = new Set();
  for (const item of items) {
    const key = `${item.market}:${item.symbol}`;
    if (seen.has(key)) return jsonResponse({ error: "Duplicate watchlist items are not allowed." }, 400);
    seen.add(key);
  }
  if (!items.length) return jsonResponse({ added: 0 });

  const currentRows = await env.DB.prepare(
    "SELECT i.market, i.symbol FROM watchlist w JOIN instrument i ON i.id = w.instrument_id"
  ).all();
  const existing = new Set((currentRows.results || []).map((row) => `${row.market}:${row.symbol}`));
  const additional = items.filter((item) => !existing.has(`${item.market}:${item.symbol}`)).length;
  if (existing.size + additional > MAX_WATCHLIST_TOTAL) {
    return jsonResponse({ error: "The watchlist is limited to 50 instruments. Remove an item before adding another." }, 409);
  }

  const now = new Date().toISOString();
  const statements = items.flatMap((item) => {
    const currency = item.market === "US" ? "USD" : "MYR";
    return [
      env.DB.prepare(
        "INSERT INTO instrument(symbol,market,quote_symbol,name,currency,cik) VALUES(?,?,?,?,?,?) " +
        "ON CONFLICT(market,symbol) DO UPDATE SET active=1, cik=COALESCE(excluded.cik,instrument.cik)"
      ).bind(item.symbol, item.market, item.symbol, item.symbol, currency, item.cik),
      env.DB.prepare(
        "INSERT INTO watchlist(instrument_id,note,added_at) " +
        "SELECT id,?,? FROM instrument WHERE market=? AND symbol=? " +
        "ON CONFLICT(instrument_id) DO UPDATE SET note=excluded.note"
      ).bind(item.note, now, item.market, item.symbol)
    ];
  });

  const results = await env.DB.batch(statements);
  const added = items.filter((_, index) => Number(results[index * 2 + 1]?.meta?.changes || 0) === 1).length;
  return jsonResponse({ added });
}

async function deleteWatchlistItem(request, env, pathname) {
  assertRequestOrigin(request, env);
  const session = await getOwnerSession(request, env);
  if (!session) return jsonResponse({ error: "Sign in required." }, 401);
  await readJsonBody(request);

  const parts = pathname.split("/");
  if (parts.length !== 5) return jsonResponse({ error: "Invalid watchlist item." }, 400);
  let market;
  let symbol;
  try {
    market = decodeURIComponent(parts[3]);
    symbol = decodeURIComponent(parts[4]);
  } catch {
    return jsonResponse({ error: "Invalid watchlist item." }, 400);
  }
  symbol = symbol.toUpperCase();
  if (!["US", "MY"].includes(market) || !SYMBOL_PATTERN.test(symbol)) {
    return jsonResponse({ error: "Invalid watchlist item." }, 400);
  }

  const deleted = await env.DB.prepare(
    "DELETE FROM watchlist WHERE instrument_id = " +
    "(SELECT id FROM instrument WHERE market = ? AND symbol = ?) RETURNING instrument_id"
  ).bind(market, symbol).first();
  if (!deleted) return jsonResponse({ error: "Watchlist item not found." }, 404);
  await deactivateUnusedInstrument(env, market, symbol);
  return jsonResponse({ deleted: true, market, symbol });
}

export async function handlePortfolioRequest(request, env, pathname) {
  try {
    if (pathname === "/api/holdings" && request.method === "GET") return await listHoldings(request, env);
    if (pathname === "/api/holdings" && request.method === "PUT") return await upsertHoldings(request, env);
    if (pathname.startsWith("/api/holdings/") && request.method === "DELETE") {
      return await deleteHolding(request, env, pathname);
    }
    if (pathname === "/api/watchlist" && request.method === "GET") return await listWatchlist(request, env);
    if (pathname === "/api/watchlist" && request.method === "POST") return await addWatchlistItems(request, env);
    if (pathname.startsWith("/api/watchlist/") && request.method === "DELETE") {
      return await deleteWatchlistItem(request, env, pathname);
    }
    return jsonResponse({ error: "Not found." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "origin_rejected") return jsonResponse({ error: "Request origin rejected." }, 403);
    if (message === "body_too_large") return jsonResponse({ error: "Request too large." }, 413);
    if (message === "json_required") return jsonResponse({ error: "Content-Type must be application/json." }, 415);
    if (message === "invalid_holding") return jsonResponse({ error: "One or more holdings are invalid." }, 400);
    if (message === "invalid_watchlist_item") return jsonResponse({ error: "One or more watchlist items are invalid." }, 400);
    console.error("Portfolio API request failed:", message);
    return jsonResponse({ error: "Portfolio request failed." }, 400);
  }
}
