import test from "node:test";
import assert from "node:assert/strict";
import { handlePortfolioRequest } from "./lib/portfolio.mjs";

const origin = "https://folio.example";
const envConfig = { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: origin };
const cookie = `__Host-session=${"s".repeat(43)}`;

function fakeDb({ authenticated = true, rows = [], changes = 1, deleted = true } = {}) {
  const calls = { batch: 0, statements: [], prepared: [] };
  const DB = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes("FROM session WHERE token_hash")) {
            return authenticated ? {
              token_hash: "session-hash",
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              last_seen_at: new Date().toISOString()
            } : null;
          }
          if (sql.startsWith("DELETE FROM holding") || sql.startsWith("DELETE FROM watchlist")) return deleted ? { instrument_id: 7 } : null;
          return null;
        },
        async all() { return { results: rows }; },
        async run() { return { meta: { changes: 1 } }; }
      };
      calls.prepared.push(statement);
      return statement;
    },
    async batch(statements) {
      calls.batch++;
      calls.statements.push(...statements);
      return statements.map(() => ({ meta: { changes } }));
    }
  };
  return { DB, calls };
}

test("holdings cannot be read without an owner session", async () => {
  const { DB } = fakeDb({ authenticated: false });
  const response = await handlePortfolioRequest(
    new Request(`${origin}/api/holdings`), { ...envConfig, DB }, "/api/holdings"
  );
  assert.equal(response.status, 401);
});

test("holdings list returns joined owner-only portfolio rows", async () => {
  const row = { symbol: "AAPL", market: "US", quantity: 2, avgCost: 100, quoteStatus: "ok" };
  const { DB } = fakeDb({ rows: [row] });
  const response = await handlePortfolioRequest(
    new Request(`${origin}/api/holdings`, { headers: { cookie } }),
    { ...envConfig, DB }, "/api/holdings"
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { holdings: [row] });
});

test("holdings writes require the configured Origin", async () => {
  const { DB, calls } = fakeDb();
  const response = await handlePortfolioRequest(new Request(`${origin}/api/holdings`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ holdings: [] })
  }), { ...envConfig, DB }, "/api/holdings");
  assert.equal(response.status, 403);
  assert.equal(calls.batch, 0);
});

test("holdings import validates and upserts instruments and holdings in one batch", async () => {
  const { DB, calls } = fakeDb();
  const response = await handlePortfolioRequest(new Request(`${origin}/api/holdings`, {
    method: "PUT",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ holdings: [
      { symbol: "AAPL", market: "US", quantity: 2, avgCost: 100 },
      { symbol: "1155", market: "MY", quantity: 50, avgCost: 6.2, notes: "Long-term" }
    ] })
  }), { ...envConfig, DB }, "/api/holdings");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { saved: 2 });
  assert.equal(calls.batch, 1);
  assert.equal(calls.statements.length, 4);
  assert.deepEqual(calls.statements[0].values, ["AAPL", "US", "AAPL", "AAPL", "USD"]);
  assert.deepEqual(calls.statements[3].values.slice(0, 3), [50, 6.2, "Long-term"]);
});

test("holdings import rejects invalid and duplicate rows before writing", async () => {
  const { DB, calls } = fakeDb();
  const invalid = await handlePortfolioRequest(new Request(`${origin}/api/holdings`, {
    method: "PUT",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ holdings: [{ symbol: "AAPL", market: "US", quantity: -1 }] })
  }), { ...envConfig, DB }, "/api/holdings");
  assert.equal(invalid.status, 400);

  const duplicate = await handlePortfolioRequest(new Request(`${origin}/api/holdings`, {
    method: "PUT",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ holdings: [
      { symbol: "AAPL", market: "US", quantity: 1 },
      { symbol: "AAPL", market: "US", quantity: 2 }
    ] })
  }), { ...envConfig, DB }, "/api/holdings");
  assert.equal(duplicate.status, 400);
  assert.equal(calls.batch, 0);
});

test("holdings import is bounded to 20 rows per D1 batch", async () => {
  const { DB, calls } = fakeDb();
  const holdings = Array.from({ length: 21 }, (_, index) => ({
    symbol: `T${index}`, market: "US", quantity: 1
  }));
  const response = await handlePortfolioRequest(new Request(`${origin}/api/holdings`, {
    method: "PUT",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ holdings })
  }), { ...envConfig, DB }, "/api/holdings");
  assert.equal(response.status, 400);
  assert.equal(calls.batch, 0);
});

test("holding deletion requires an owner session and same Origin", async () => {
  const { DB } = fakeDb({ authenticated: false });
  const response = await handlePortfolioRequest(new Request(`${origin}/api/holdings/US/AAPL`, {
    method: "DELETE",
    headers: { origin, cookie, "content-type": "application/json" },
    body: "{}"
  }), { ...envConfig, DB }, "/api/holdings/US/AAPL");
  assert.equal(response.status, 401);
});

test("holding deletion removes the position and deactivates an unused instrument", async () => {
  const { DB, calls } = fakeDb();
  const response = await handlePortfolioRequest(new Request(`${origin}/api/holdings/US/AAPL`, {
    method: "DELETE",
    headers: { origin, cookie, "content-type": "application/json" },
    body: "{}"
  }), { ...envConfig, DB }, "/api/holdings/US/AAPL");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true, market: "US", symbol: "AAPL" });
  assert.ok(calls.prepared.some((statement) => /^DELETE FROM holding/.test(statement.sql)));
  assert.ok(calls.prepared.some((statement) => statement.sql.startsWith("UPDATE instrument")));
  assert.ok(calls.prepared.some((statement) => statement.sql.startsWith("DELETE FROM quote_latest")));
});

test("holding deletion returns 404 when the holding does not exist", async () => {
  const { DB } = fakeDb({ deleted: false });
  const response = await handlePortfolioRequest(new Request(`${origin}/api/holdings/MY/1155`, {
    method: "DELETE",
    headers: { origin, cookie, "content-type": "application/json" },
    body: "{}"
  }), { ...envConfig, DB }, "/api/holdings/MY/1155");
  assert.equal(response.status, 404);
});

test("watchlist cannot be read without an owner session", async () => {
  const { DB } = fakeDb({ authenticated: false });
  const response = await handlePortfolioRequest(
    new Request(`${origin}/api/watchlist`), { ...envConfig, DB }, "/api/watchlist"
  );
  assert.equal(response.status, 401);
});

test("watchlist list returns owner-only rows with quote status", async () => {
  const row = { symbol: "MSFT", market: "US", note: "Watch earnings", quoteStatus: "stale" };
  const { DB } = fakeDb({ rows: [row] });
  const response = await handlePortfolioRequest(
    new Request(`${origin}/api/watchlist`, { headers: { cookie } }),
    { ...envConfig, DB }, "/api/watchlist"
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [row] });
});

test("watchlist additions require same Origin and an owner session", async () => {
  const { DB, calls } = fakeDb();
  const response = await handlePortfolioRequest(new Request(`${origin}/api/watchlist`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ items: [] })
  }), { ...envConfig, DB }, "/api/watchlist");
  assert.equal(response.status, 403);
  assert.equal(calls.batch, 0);
});

test("watchlist additions upsert instruments and notes in one bounded D1 batch", async () => {
  const { DB, calls } = fakeDb();
  const response = await handlePortfolioRequest(new Request(`${origin}/api/watchlist`, {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ items: [
      { symbol: "MSFT", market: "US", note: "Watch earnings" },
      { symbol: "1155", market: "MY" }
    ] })
  }), { ...envConfig, DB }, "/api/watchlist");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { added: 2 });
  assert.equal(calls.batch, 1);
  assert.equal(calls.statements.length, 4);
  assert.deepEqual(calls.statements[0].values, ["MSFT", "US", "MSFT", "MSFT", "USD"]);
  assert.deepEqual(calls.statements[1].values.slice(0, 1), ["Watch earnings"]);
});

test("watchlist rejects invalid or duplicate items before D1 writes", async () => {
  const { DB, calls } = fakeDb();
  const invalid = await handlePortfolioRequest(new Request(`${origin}/api/watchlist`, {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ items: [{ symbol: "MSFT", market: "OTHER" }] })
  }), { ...envConfig, DB }, "/api/watchlist");
  assert.equal(invalid.status, 400);

  const duplicate = await handlePortfolioRequest(new Request(`${origin}/api/watchlist`, {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ items: [
      { symbol: "MSFT", market: "US" },
      { symbol: "MSFT", market: "US" }
    ] })
  }), { ...envConfig, DB }, "/api/watchlist");
  assert.equal(duplicate.status, 400);
  assert.equal(calls.batch, 0);
});

test("watchlist deletion removes an item only after owner session and Origin checks", async () => {
  const { DB, calls } = fakeDb();
  const response = await handlePortfolioRequest(new Request(`${origin}/api/watchlist/MY/1155`, {
    method: "DELETE",
    headers: { origin, cookie, "content-type": "application/json" },
    body: "{}"
  }), { ...envConfig, DB }, "/api/watchlist/MY/1155");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true, market: "MY", symbol: "1155" });
  assert.ok(calls.prepared.some((statement) => /^DELETE FROM watchlist/.test(statement.sql)));
  assert.ok(calls.prepared.some((statement) => statement.sql.startsWith("UPDATE instrument")));
  assert.ok(calls.prepared.some((statement) => statement.sql.startsWith("DELETE FROM quote_latest")));
});

test("watchlist deletion returns 404 for an unknown item", async () => {
  const { DB } = fakeDb({ deleted: false });
  const response = await handlePortfolioRequest(new Request(`${origin}/api/watchlist/US/UNKNOWN`, {
    method: "DELETE",
    headers: { origin, cookie, "content-type": "application/json" },
    body: "{}"
  }), { ...envConfig, DB }, "/api/watchlist/US/UNKNOWN");
  assert.equal(response.status, 404);
});

test("holdings API enforces a 20-position total while allowing updates at the cap", async () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    market: "US", symbol: `T${index}`
  }));
  const { DB, calls } = fakeDb({ rows });
  const rejected = await handlePortfolioRequest(new Request(`${origin}/api/holdings`, {
    method: "PUT",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ holdings: [{ symbol: "NEW", market: "US", quantity: 1 }] })
  }), { ...envConfig, DB }, "/api/holdings");
  assert.equal(rejected.status, 409);
  assert.equal(calls.batch, 0);

  const { DB: updateDb, calls: updateCalls } = fakeDb({ rows });
  const updated = await handlePortfolioRequest(new Request(`${origin}/api/holdings`, {
    method: "PUT",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ holdings: [{ symbol: "T0", market: "US", quantity: 2 }] })
  }), { ...envConfig, DB: updateDb }, "/api/holdings");
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), { saved: 1 });
  assert.equal(updateCalls.batch, 1);
});

test("watchlist API enforces 50 total instruments while allowing updates", async () => {
  const rows = Array.from({ length: 50 }, (_, index) => ({
    market: "US", symbol: `T${index}`
  }));
  const { DB, calls } = fakeDb({ rows });
  const rejected = await handlePortfolioRequest(new Request(`${origin}/api/watchlist`, {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ items: [{ symbol: "NEW", market: "US" }] })
  }), { ...envConfig, DB }, "/api/watchlist");
  assert.equal(rejected.status, 409);
  assert.equal(calls.batch, 0);

  const { DB: updateDb, calls: updateCalls } = fakeDb({ rows });
  const updated = await handlePortfolioRequest(new Request(`${origin}/api/watchlist`, {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ items: [{ symbol: "T0", market: "US", note: "Updated note" }] })
  }), { ...envConfig, DB: updateDb }, "/api/watchlist");
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), { added: 1 });
  assert.equal(updateCalls.batch, 1);
});
