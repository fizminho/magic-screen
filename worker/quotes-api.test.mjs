import test from "node:test";
import assert from "node:assert/strict";
import { handleQuoteRequest } from "./lib/quotes.mjs";

const origin = "https://folio.example";
const envConfig = { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: origin };
const sessionCookie = `__Host-session=${"s".repeat(43)}`;

function fakeDb({ batchChanges = 1, quoteRows = [] } = {}) {
  const calls = { batch: 0, statements: [] };
  const DB = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes("FROM session WHERE token_hash")) {
            return { token_hash: "session-hash", expires_at: new Date(Date.now() + 60_000).toISOString(), last_seen_at: new Date().toISOString() };
          }
          return null;
        },
        async all() { return { results: quoteRows }; },
        async run() { return { meta: { changes: 1 } }; }
      };
      return statement;
    },
    async batch(statements) {
      calls.batch++;
      calls.statements.push(...statements);
      return statements.map(() => ({ meta: { changes: batchChanges } }));
    }
  };
  return { DB, calls };
}

test("quote snapshots cannot be read without an owner session", async () => {
  const { DB } = fakeDb();
  DB.prepare = (sql) => ({
    bind() { return this; },
    async first() { return null; },
    async run() { return { meta: { changes: 0 } }; }
  });
  const response = await handleQuoteRequest(
    new Request(`${origin}/api/quotes/latest`),
    { ...envConfig, DB },
    "/api/quotes/latest"
  );
  assert.equal(response.status, 401);
});

test("quote writes require the configured request origin", async () => {
  const { DB } = fakeDb();
  const response = await handleQuoteRequest(new Request(`${origin}/api/quotes/snapshots`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({ quotes: [] })
  }), { ...envConfig, DB }, "/api/quotes/snapshots");
  assert.equal(response.status, 403);
});

test("quote snapshots are validated and persisted in one D1 batch", async () => {
  const { DB, calls } = fakeDb();
  const quote = {
    symbol: "AAPL", market: "US", price: 101, prevClose: 100, changePct: 0.01,
    asOf: new Date().toISOString(), currency: "USD", provider: "yahoo-finance", status: "ok"
  };
  const response = await handleQuoteRequest(new Request(`${origin}/api/quotes/snapshots`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({ quotes: [quote] })
  }), { ...envConfig, DB }, "/api/quotes/snapshots");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { saved: 1, unmatchedSymbols: [] });
  assert.equal(calls.batch, 1);
  assert.equal(calls.statements.length, 1);
  assert.match(calls.statements[0].sql, /AND active = 1/);
});

test("quote snapshots reject invalid provider-market combinations before writing", async () => {
  const { DB, calls } = fakeDb();
  const quote = {
    symbol: "AAPL", market: "US", price: 210, prevClose: 200, changePct: 0.05,
    asOf: new Date().toISOString(), currency: "USD", provider: "manual-csv", status: "ok"
  };
  const response = await handleQuoteRequest(new Request(`${origin}/api/quotes/snapshots`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({ quotes: [quote] })
  }), { ...envConfig, DB }, "/api/quotes/snapshots");
  assert.equal(response.status, 400);
  assert.equal(calls.batch, 0);
});

test("unmatched instruments are returned without pretending quotes were saved", async () => {
  const { DB, calls } = fakeDb({ batchChanges: 0 });
  const quote = {
    symbol: "AAPL", market: "US", price: 101, prevClose: 100, changePct: 0.01,
    asOf: new Date().toISOString(), currency: "USD", provider: "yahoo-finance", status: "ok"
  };
  const response = await handleQuoteRequest(new Request(`${origin}/api/quotes/snapshots`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({ quotes: [quote] })
  }), { ...envConfig, DB }, "/api/quotes/snapshots");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { saved: 0, unmatchedSymbols: ["AAPL"] });
  assert.equal(calls.batch, 1);
});

test("latest quote endpoint returns owner-only D1 rows", async () => {
  const row = { symbol: "AAPL", market: "US", price: 101, status: "ok" };
  const { DB } = fakeDb({ quoteRows: [row] });
  const response = await handleQuoteRequest(new Request(`${origin}/api/quotes/latest`, {
    headers: { cookie: sessionCookie }
  }), { ...envConfig, DB }, "/api/quotes/latest");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { quotes: [row] });
});

test("owner can refresh US and Bursa quotes from Yahoo without a provider token", async () => {
  const { DB, calls } = fakeDb({ quoteRows: [
    { symbol: "AAPL", market: "US" },
    { symbol: "1155", market: "MY" }
  ] });
  const requested = [];
  const asOf = Math.floor(Date.now() / 1000);
  const fetcher = async (url) => {
    requested.push(url);
    return new Response(JSON.stringify({
      chart: { result: [{
        meta: { regularMarketPrice: 210, previousClose: 200, regularMarketTime: asOf },
        indicators: { quote: [{ close: [198, 200, 210] }] }
      }] }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const response = await handleQuoteRequest(new Request(`${origin}/api/quotes/refresh`, {
    method: "POST",
    headers: { origin, cookie: sessionCookie, "content-type": "application/json" },
    body: "{}"
  }), { ...envConfig, DB }, "/api/quotes/refresh", fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    saved: 2, failed: 0, symbols: 2, failedSymbols: [],
    byMarket: {
      US: { saved: 1, failed: 0, symbols: 1 },
      MY: { saved: 1, failed: 0, symbols: 1 }
    }
  });
  assert.equal(requested.length, 2);
  assert.ok(requested.some((url) => url.includes("/1155.KL?")));
  assert.ok(requested.some((url) => url.includes("/AAPL?")));
  assert.equal(calls.batch, 1);
  assert.deepEqual(calls.statements.map((statement) => statement.values[6]), ["US", "MY"]);
  assert.deepEqual(calls.statements.map((statement) => statement.values[7]), ["AAPL", "1155"]);
  assert.ok(calls.statements.every((statement) => statement.values[4] === "yahoo-finance"));
});

test("failed Yahoo symbols are not written and existing snapshots remain untouched", async () => {
  const { DB, calls } = fakeDb({ quoteRows: [
    { symbol: "AAPL", market: "US" },
    { symbol: "1155", market: "MY" }
  ] });
  const asOf = Math.floor(Date.now() / 1000);
  const fetcher = async (url) => url.includes("/1155.KL?")
    ? new Response(JSON.stringify({ chart: { result: null, error: { code: "Not Found" } } }), { status: 404 })
    : new Response(JSON.stringify({
        chart: { result: [{
          meta: { regularMarketPrice: 210, previousClose: 200, regularMarketTime: asOf },
          indicators: { quote: [{ close: [198, 200, 210] }] }
        }] }
      }), { status: 200 });
  const response = await handleQuoteRequest(new Request(`${origin}/api/quotes/refresh`, {
    method: "POST", headers: { origin, cookie: sessionCookie, "content-type": "application/json" }, body: "{}"
  }), { ...envConfig, DB }, "/api/quotes/refresh", fetcher);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.saved, 1);
  assert.deepEqual(result.failedSymbols, ["MY:1155"]);
  assert.equal(result.byMarket.MY.failed, 1);
  assert.equal(calls.batch, 1);
  assert.equal(calls.statements.length, 1);
});

test("market quote refresh rejects unauthenticated requests", async () => {
  const { DB, calls } = fakeDb();
  DB.prepare = () => ({ bind() { return this; }, async first() { return null; } });
  const response = await handleQuoteRequest(new Request(`${origin}/api/quotes/refresh`, {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}"
  }), { ...envConfig, DB }, "/api/quotes/refresh", async () => { throw new Error("must not fetch"); });
  assert.equal(response.status, 401);
  assert.equal(calls.batch, 0);
});
