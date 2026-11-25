import {
  getOwnerSession,
  assertRequestOrigin,
  readJsonBody,
  jsonResponse
} from "./auth.mjs";

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;
const MAX_SNAPSHOTS = 50;
const YAHOO_CHART_ROOT = "https://query1.finance.yahoo.com/v8/finance/chart/";
const QUOTE_TIMEOUT_MS = 8000;

function validateSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_quote");
  const { symbol, market, price, prevClose, changePct, asOf, currency, provider, status } = value;
  if (typeof symbol !== "string" || !SYMBOL_PATTERN.test(symbol) || symbol !== symbol.toUpperCase()) throw new Error("invalid_quote");
  if (!["US", "MY"].includes(market)) throw new Error("invalid_quote");
  if (!["USD", "MYR"].includes(currency)) throw new Error("invalid_quote");
  if ((market === "US" && (currency !== "USD" || provider !== "yahoo-finance")) ||
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

export function parseYahooChartQuote(payload, symbol, now = Date.now()) {
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta;
  const quote = result?.indicators?.quote?.[0];
  const closes = (quote?.close ?? []).filter((value) => typeof value === "number" && Number.isFinite(value));
  const price = typeof meta?.regularMarketPrice === "number" && Number.isFinite(meta.regularMarketPrice)
    ? meta.regularMarketPrice : closes.at(-1) ?? null;
  const prevClose = typeof meta?.previousClose === "number" && meta.previousClose > 0
    ? meta.previousClose
    : typeof meta?.regularMarketPreviousClose === "number" && meta.regularMarketPreviousClose > 0
      ? meta.regularMarketPreviousClose
      : closes.length > 1 ? closes.at(-2) : null;
  const timestamp = Number(meta?.regularMarketTime);
  const asOfDate = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000) : null;
  if (!Number.isFinite(price) || price <= 0 || !asOfDate || !Number.isFinite(asOfDate.getTime()) || asOfDate.getTime() > now + 5 * 60 * 1000) {
    throw new Error("quote_unavailable");
  }
  return {
    symbol, market: "US", price, prevClose,
    changePct: prevClose && prevClose > 0 ? (price - prevClose) / prevClose : null,
    asOf: asOfDate.toISOString(), currency: "USD", provider: "yahoo-finance",
    status: now - asOfDate.getTime() > 5 * 24 * 60 * 60 * 1000 ? "stale" : "ok"
  };
}

async function fetchYahooQuote(symbol, fetcher = fetch) {
  const url = new URL(YAHOO_CHART_ROOT + encodeURIComponent(symbol));
  url.searchParams.set("range", "5d");
  url.searchParams.set("interval", "1d");
  const response = await fetcher(url.toString(), {
    method: "GET",
    headers: { "user-agent": "Mozilla/5.0 MagicFolio/1.0", accept: "application/json" },
    signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
    cf: { cacheTtl: 60, cacheEverything: true }
  });
  if (!response.ok) throw new Error("quote_provider_error");
  return parseYahooChartQuote(await response.json(), symbol);
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
    "SELECT id, ?, ?, ?, ?, ?, ? FROM instrument WHERE market = ? AND symbol = ? AND active = 1 " +
    "ON CONFLICT(instrument_id) DO UPDATE SET price=excluded.price, prev_close=excluded.prev_close, " +
    "change_pct=excluded.change_pct, as_of=excluded.as_of, provider=excluded.provider, status=excluded.status"
  ).bind(
    quote.price, quote.prevClose, quote.changePct, quote.asOf, quote.provider, quote.status,
    quote.market, quote.symbol
  ));
  const results = await env.DB.batch(statements);
  const unmatchedSymbols = snapshots.filter((_, index) => Number(results[index]?.meta?.changes || 0) === 0)
    .map((quote) => quote.symbol);
  return jsonResponse({ saved: snapshots.length - unmatchedSymbols.length, unmatchedSymbols });
}

async function refreshUsQuotes(request, env, fetcher = fetch) {
  assertRequestOrigin(request, env);
  const session = await getOwnerSession(request, env);
  if (!session) return jsonResponse({ error: "Sign in required." }, 401);
  const rows = await env.DB.prepare(
    "SELECT symbol FROM instrument WHERE active = 1 AND market = 'US' ORDER BY symbol LIMIT 50"
  ).all();
  const symbols = [...new Set((rows.results || []).map((row) => row.symbol).filter((symbol) =>
    typeof symbol === "string" && SYMBOL_PATTERN.test(symbol) && symbol === symbol.toUpperCase()
  ))];
  if (!symbols.length) return jsonResponse({ saved: 0, failed: 0, symbols: 0, failedSymbols: [] });

  const quotes = [];
  const failedSymbols = [];
  for (const symbol of symbols) {
    try { quotes.push(await fetchYahooQuote(symbol, fetcher)); }
    catch { failedSymbols.push(symbol); }
  }
  let saved = 0;
  if (quotes.length) {
    const statements = quotes.map((quote) => env.DB.prepare(
      "INSERT INTO quote_latest(instrument_id, price, prev_close, change_pct, as_of, provider, status) " +
      "SELECT id, ?, ?, ?, ?, ?, ? FROM instrument WHERE market = 'US' AND symbol = ? AND active = 1 " +
      "ON CONFLICT(instrument_id) DO UPDATE SET price=excluded.price, prev_close=excluded.prev_close, " +
      "change_pct=excluded.change_pct, as_of=excluded.as_of, provider=excluded.provider, status=excluded.status"
    ).bind(quote.price, quote.prevClose, quote.changePct, quote.asOf, quote.provider, quote.status, quote.symbol));
    const results = await env.DB.batch(statements);
    saved = results.reduce((count, result) => count + (Number(result?.meta?.changes || 0) > 0 ? 1 : 0), 0);
  }
  return jsonResponse({ saved, failed: failedSymbols.length, symbols: symbols.length, failedSymbols });
}

export async function handleQuoteRequest(request, env, pathname, fetcher = fetch) {
  try {
    if (pathname === "/api/quotes/latest" && request.method === "GET") return await listLatestQuotes(request, env);
    if (pathname === "/api/quotes/snapshots" && request.method === "POST") return await saveSnapshots(request, env);
    if (pathname === "/api/quotes/refresh-us" && request.method === "POST") return await refreshUsQuotes(request, env, fetcher);
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
