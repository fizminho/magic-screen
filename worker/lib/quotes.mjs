import {
  getOwnerSession,
  assertRequestOrigin,
  readJsonBody,
  jsonResponse
} from "./auth.mjs";

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;
const MAX_SNAPSHOTS = 50;

function validateSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_quote");
  const { symbol, market, price, prevClose, changePct, asOf, currency, provider, status } = value;
  if (typeof symbol !== "string" || !SYMBOL_PATTERN.test(symbol) || symbol !== symbol.toUpperCase()) throw new Error("invalid_quote");
  if (!["US", "MY"].includes(market)) throw new Error("invalid_quote");
  if (!["USD", "MYR"].includes(currency)) throw new Error("invalid_quote");
  if ((market === "US" && (currency !== "USD" || provider !== "marketdata.app")) ||
      (market === "MY" && (currency !== "MYR" || provider !== "manual-csv"))) throw new Error("invalid_quote");
  if (!["ok", "stale", "unavailable"].includes(status)) throw new Error("invalid_quote");

  if (status === "unavailable") {
    if (price !== null || asOf !== null) throw new Error("invalid_quote");
  } else {
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) throw new Error("invalid_quote");
    if (typeof asOf !== "string" || !Number.isFinite(Date.parse(asOf)) || Date.parse(asOf) > Date.now() + 5 * 60 * 1000) {
      throw new Error("invalid_quote");
    }
  }
  if (prevClose !== null && (!Number.isFinite(prevClose) || prevClose <= 0)) throw new Error("invalid_quote");
  if (changePct !== null && !Number.isFinite(changePct)) throw new Error("invalid_quote");
  if (status === "unavailable" && (prevClose !== null || changePct !== null)) throw new Error("invalid_quote");

  return {
    symbol, market, price, prevClose, changePct,
    asOf: asOf === null ? null : new Date(asOf).toISOString(),
    provider, status
  };
}

async function listLatestQuotes(request, env) {
  const session = await getOwnerSession(request, env);
  if (!session) return jsonResponse({ error: "Sign in required." }, 401);
  const rows = await env.DB.prepare(
    "SELECT i.symbol, i.name, i.market, i.currency, q.price, q.prev_close AS prevClose, " +
    "q.change_pct AS changePct, q.as_of AS asOf, q.provider, " +
    "COALESCE(q.status, 'unavailable') AS status " +
    "FROM instrument i LEFT JOIN quote_latest q ON q.instrument_id = i.id " +
    "WHERE i.active = 1 ORDER BY i.market, i.symbol"
  ).all();
  return jsonResponse({ quotes: rows.results || [] });
}

async function saveSnapshots(request, env) {
  assertRequestOrigin(request, env);
  const session = await getOwnerSession(request, env);
  if (!session) return jsonResponse({ error: "Sign in required." }, 401);
  const payload = await readJsonBody(request);
  if (!Array.isArray(payload?.quotes) || payload.quotes.length > MAX_SNAPSHOTS) {
    return jsonResponse({ error: "Provide up to 50 quote snapshots per request." }, 400);
  }

  const seen = new Set();
  const snapshots = payload.quotes.map(validateSnapshot);
  for (const quote of snapshots) {
    const key = `${quote.market}:${quote.symbol}`;
    if (seen.has(key)) return jsonResponse({ error: "Duplicate quote symbols are not allowed." }, 400);
    seen.add(key);
  }
  if (!snapshots.length) return jsonResponse({ saved: 0, unmatchedSymbols: [] });

  const statements = snapshots.map((quote) => env.DB.prepare(
    "INSERT INTO quote_latest(instrument_id, price, prev_close, change_pct, as_of, provider, status) " +
    "SELECT id, ?, ?, ?, ?, ?, ? FROM instrument WHERE market = ? AND symbol = ? " +
    "ON CONFLICT(instrument_id) DO UPDATE SET price=excluded.price, prev_close=excluded.prev_close, " +
    "change_pct=excluded.change_pct, as_of=excluded.as_of, provider=excluded.provider, status=excluded.status"
  ).bind(
    quote.price, quote.prevClose, quote.changePct, quote.asOf, quote.provider, quote.status,
    quote.market, quote.symbol
  ));

  const results = await env.DB.batch(statements);
  const unmatchedSymbols = snapshots.filter((_, index) => Number(results[index]?.meta?.changes || 0) === 0)
    .map((quote) => quote.symbol);
  return jsonResponse({
    saved: snapshots.length - unmatchedSymbols.length,
    unmatchedSymbols
  });
}

export async function handleQuoteRequest(request, env, pathname) {
  try {
    if (pathname === "/api/quotes/latest" && request.method === "GET") return await listLatestQuotes(request, env);
    if (pathname === "/api/quotes/snapshots" && request.method === "POST") return await saveSnapshots(request, env);
    return jsonResponse({ error: "Not found." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "origin_rejected") return jsonResponse({ error: "Request origin rejected." }, 403);
    if (message === "body_too_large") return jsonResponse({ error: "Request too large." }, 413);
    if (message === "json_required") return jsonResponse({ error: "Content-Type must be application/json." }, 415);
    if (message === "invalid_quote") return jsonResponse({ error: "One or more quote snapshots are invalid." }, 400);
    console.error("Quote API request failed:", message);
    return jsonResponse({ error: "Quote request failed." }, 400);
  }
}
