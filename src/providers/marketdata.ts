import type { QuoteProvider, QuoteSnapshot } from "./types";

type MarketDataPayload = {
  s?: string;
  symbol?: string[];
  last?: number[];
  change?: number[];
  changepct?: number[];
  updated?: number[];
  errmsg?: string;
};

const API_ROOT = "https://api.marketdata.app/v1/stocks/quotes/";
const MAX_SYMBOLS_PER_REQUEST = 50;
const MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

function normalizeSymbols(symbols: string[]): string[] {
  const normalized = [...new Set(symbols.map((value) => value.trim().toUpperCase()))];
  if (normalized.some((symbol) => !/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol))) {
    throw new Error("One or more US ticker symbols are invalid.");
  }
  return normalized;
}

export function parseMarketDataQuotes(
  payload: MarketDataPayload,
  requestedSymbols: string[],
  now = Date.now()
): QuoteSnapshot[] {
  const symbols = normalizeSymbols(requestedSymbols);
  const result = new Map<string, QuoteSnapshot>();
  const returned = Array.isArray(payload.symbol) ? payload.symbol : [];

  for (const symbol of symbols) {
    const index = returned.indexOf(symbol);
    const price = index >= 0 ? Number(payload.last?.[index]) : NaN;
    const change = index >= 0 ? Number(payload.change?.[index]) : NaN;
    const changePct = index >= 0 ? Number(payload.changepct?.[index]) : NaN;
    const updated = index >= 0 ? Number(payload.updated?.[index]) : NaN;
    const asOfDate = Number.isFinite(updated) && updated > 0 ? new Date(updated * 1000) : null;
    const validDate = asOfDate && Number.isFinite(asOfDate.getTime()) && asOfDate.getTime() <= now + 5 * 60 * 1000;
    const validPrice = Number.isFinite(price) && price > 0;

    if (!validPrice || !validDate) {
      result.set(symbol, {
        symbol, market: "US", price: null, prevClose: null, changePct: null,
        asOf: null, currency: "USD", provider: "marketdata.app", status: "unavailable"
      });
      continue;
    }

    result.set(symbol, {
      symbol,
      market: "US",
      price,
      prevClose: Number.isFinite(change) && price - change > 0 ? price - change : null,
      changePct: Number.isFinite(changePct) ? changePct : null,
      asOf: asOfDate.toISOString(),
      currency: "USD",
      provider: "marketdata.app",
      status: now - asOfDate.getTime() > MAX_AGE_MS ? "stale" : "ok"
    });
  }

  return symbols.map((symbol) => result.get(symbol)!);
}

async function fetchChunk(
  symbols: string[],
  token: string,
  fetcher: typeof fetch
): Promise<QuoteSnapshot[]> {
  const url = new URL(API_ROOT);
  url.searchParams.set("symbols", symbols.join(","));
  url.searchParams.set("extended", "false");

  let response: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetcher(url.toString(), {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (response.status >= 500 && attempt === 0) continue;
      break;
    } catch (error) {
      if (attempt === 1) throw new Error("Market Data request timed out or could not connect.");
    }
  }

  if (!response) throw new Error("Market Data did not return a response.");
  if (response.status === 429) throw new Error("Market Data daily request limit reached. Try again after the quota resets.");
  if (response.status === 401 || response.status === 403) throw new Error("Market Data rejected the API token or account access.");
  if (!response.ok) throw new Error(`Market Data request failed (HTTP ${response.status}).`);

  const payload = await response.json() as MarketDataPayload;
  if (payload.s === "error") throw new Error("Market Data could not provide quotes for this request.");
  return parseMarketDataQuotes(payload, symbols);
}

/**
 * Browser-only personal-use adapter. The API token must never be sent to the Worker.
 * Call only after owner passkey authentication and only from one device/IP at a time.
 */
export async function fetchMarketDataQuotes(
  requestedSymbols: string[],
  token: string,
  fetcher: typeof fetch = fetch
): Promise<QuoteSnapshot[]> {
  const symbols = normalizeSymbols(requestedSymbols);
  if (!symbols.length) return [];
  if (!token || token.trim().length < 12) throw new Error("Enter your Market Data API token.");
  const snapshots: QuoteSnapshot[] = [];

  for (let i = 0; i < symbols.length; i += MAX_SYMBOLS_PER_REQUEST) {
    const chunk = symbols.slice(i, i + MAX_SYMBOLS_PER_REQUEST);
    snapshots.push(...await fetchChunk(chunk, token.trim(), fetcher));
  }
  return snapshots;
}

export function createMarketDataProvider(token: string, fetcher: typeof fetch = fetch): QuoteProvider {
  return {
    id: "marketdata.app",
    market: "US",
    getQuotes: (symbols) => fetchMarketDataQuotes(symbols, token, fetcher)
  };
}
