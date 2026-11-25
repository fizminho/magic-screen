import test from "node:test";
import assert from "node:assert/strict";
import { fetchMarketDataQuotes, parseMarketDataQuotes } from "../src/providers/marketdata.ts";

test("normalizes delayed quote payload and derives previous close", () => {
  const now = Date.now();
  const payload = {
    s: "ok",
    symbol: ["AAPL"],
    last: [101.25],
    change: [1.25],
    changepct: [0.0125],
    updated: [Math.floor((now - 24 * 60 * 60 * 1000) / 1000)]
  };
  const [quote] = parseMarketDataQuotes(payload, ["aapl"], now);
  assert.equal(quote.symbol, "AAPL");
  assert.equal(quote.price, 101.25);
  assert.equal(quote.prevClose, 100);
  assert.equal(quote.changePct, 0.0125);
  assert.equal(quote.currency, "USD");
  assert.equal(quote.provider, "marketdata.app");
  assert.equal(quote.status, "ok");
  assert.ok(quote.asOf);
});

test("missing and no-data symbols are unavailable, never filled with old values", () => {
  const [quote] = parseMarketDataQuotes({ s: "no_data" }, ["MSFT"]);
  assert.equal(quote.status, "unavailable");
  assert.equal(quote.price, null);
  assert.equal(quote.asOf, null);
});

test("quotes older than the stale threshold are explicitly stale", () => {
  const now = Date.now();
  const [quote] = parseMarketDataQuotes({
    s: "ok", symbol: ["NVDA"], last: [120], change: [2], changepct: [0.01],
    updated: [Math.floor((now - 6 * 24 * 60 * 60 * 1000) / 1000)]
  }, ["NVDA"], now);
  assert.equal(quote.status, "stale");
});

test("browser adapter sends bearer token only in header and batches symbols", async () => {
  const calls = [];
  const symbols = Array.from({ length: 51 }, (_, i) => `T${String(i).padStart(3, "0")}`);
  const fakeFetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const batch = url.searchParams.get("symbols").split(",");
    const now = Math.floor(Date.now() / 1000);
    return new Response(JSON.stringify({
      s: "ok", symbol: batch, last: batch.map(() => 10),
      change: batch.map(() => 1), changepct: batch.map(() => 0.1),
      updated: batch.map(() => now)
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const quotes = await fetchMarketDataQuotes(symbols, "test-token-123456", fakeFetch);
  assert.equal(calls.length, 2);
  assert.equal(quotes.length, 51);
  assert.equal(calls[0].url.searchParams.get("symbols").split(",").length, 50);
  assert.equal(calls[1].url.searchParams.get("symbols").split(",").length, 1);
  assert.equal(calls[0].init.headers.authorization, "Bearer test-token-123456");
  assert.equal(calls[0].url.searchParams.has("token"), false);
  assert.equal(calls[0].init.credentials, "omit");
});

test("rate limit errors are surfaced without retrying", async () => {
  let calls = 0;
  const fakeFetch = async () => { calls++; return new Response("{}", { status: 429 }); };
  await assert.rejects(
    fetchMarketDataQuotes(["AAPL"], "test-token-123456", fakeFetch),
    /daily request limit/
  );
  assert.equal(calls, 1);
});

test("transient network failures are retried once", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    if (calls === 1) throw new Error("network down");
    const now = Math.floor(Date.now() / 1000);
    return new Response(JSON.stringify({
      s: "ok", symbol: ["AAPL"], last: [10], change: [1], changepct: [0.1], updated: [now]
    }), { status: 200 });
  };
  const [quote] = await fetchMarketDataQuotes(["AAPL"], "test-token-123456", fakeFetch);
  assert.equal(calls, 2);
  assert.equal(quote.status, "ok");
});

test("invalid tickers and empty tokens are rejected before network access", async () => {
  let calls = 0;
  const fakeFetch = async () => { calls++; throw new Error("must not run"); };
  await assert.rejects(fetchMarketDataQuotes(["AAPL/"], "test-token-123456", fakeFetch), /invalid/);
  await assert.rejects(fetchMarketDataQuotes(["AAPL"], "", fakeFetch), /API token/);
  assert.equal(calls, 0);
});
