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
    asOf: new Date().toISOString(), currency: "USD", provider: "marketdata.app", status: "ok"
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
    symbol: "1155", market: "MY", price: 6.2, prevClose: 6.1, changePct: 0.01,
    asOf: new Date().toISOString(), currency: "MYR", provider: "marketdata.app", status: "ok"
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
    asOf: new Date().toISOString(), currency: "USD", provider: "marketdata.app", status: "ok"
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
