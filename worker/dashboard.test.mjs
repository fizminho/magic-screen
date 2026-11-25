import test from "node:test";
import assert from "node:assert/strict";
import { calculateDashboard, handleDashboardRequest } from "./lib/dashboard.mjs";

const origin = "https://folio.example";
const envConfig = { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: origin };
const cookie = `__Host-session=${"s".repeat(43)}`;

function fakeDb({ authenticated = true, rows = [], maxPositionPct = null } = {}) {
  const DB = {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() {
          if (sql.includes("FROM session WHERE token_hash")) {
            return authenticated ? {
              token_hash: "session-hash",
              credential_id: "passkey-id",
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              last_seen_at: new Date().toISOString()
            } : null;
          }
          if (sql.includes("FROM setting WHERE key")) return maxPositionPct === null ? null : { value: String(maxPositionPct) };
          return null;
        },
        async all() { return { results: rows }; },
        async run() { return { meta: { changes: 1 } }; }
      };
    }
  };
  return { DB };
}

test("dashboard computes concentration and sector weights separately by currency", () => {
  const result = calculateDashboard([
    { symbol: "AAPL", market: "US", sector: "Technology", quantity: 2, price: 100, prevClose: 98, quoteStatus: "ok" },
    { symbol: "MSFT", market: "US", sector: "Technology", quantity: 1, price: 50, prevClose: 50, quoteStatus: "ok" },
    { symbol: "KO", market: "US", sector: "Consumer Staples", quantity: 1, price: 50, prevClose: 52, quoteStatus: "stale" },
    { symbol: "1155", market: "MY", sector: "Financials", quantity: 500, price: 6.42, prevClose: 6.3, quoteStatus: "ok" }
  ]);
  assert.equal(result.holdingsCount, 4);
  assert.deepEqual(result.marketCountSplit, {
    US: { count: 3, pct: 75 },
    MY: { count: 1, pct: 25 }
  });
  const us = result.markets.find((item) => item.market === "US");
  const my = result.markets.find((item) => item.market === "MY");
  assert.equal(us.marketValue, 300);
  assert.equal(us.dayChangeValue, 2);
  assert.equal(us.dayChangePct, 0.67);
  assert.equal(us.currency, "USD");
  assert.equal(us.largestPosition.symbol, "AAPL");
  assert.equal(us.largestPosition.weightPct, 66.67);
  assert.equal(us.topThreeConcentrationPct, 100);
  assert.equal(us.staleQuoteCount, 1);
  assert.equal(us.sectorWeights[0].sector, "Technology");
  assert.equal(my.marketValue, 3210);
  assert.equal(my.dayChangeValue, 60);
  assert.equal(my.dayChangePct, 1.9);
  assert.equal(my.currency, "MYR");
  assert.equal(result.staleQuoteCount, 1);
});

test("dashboard marks missing prices and avoids fabricating a combined USD/MYR total", () => {
  const result = calculateDashboard([
    { symbol: "AAPL", market: "US", quantity: 1, price: null, quoteStatus: "unavailable" },
    { symbol: "1155", market: "MY", quantity: 10, price: 2, quoteStatus: "ok" }
  ]);
  assert.equal(result.unavailableQuoteCount, 1);
  assert.equal(result.markets.find((item) => item.market === "US").marketValue, 0);
  assert.equal(result.markets.find((item) => item.market === "US").quoteCoveragePct, 0);
  assert.equal(result.markets.find((item) => item.market === "MY").marketValue, 20);
  assert.equal("totalMarketValue" in result, false);
});

test("empty dashboard returns zero holdings and null concentration", () => {
  const result = calculateDashboard([]);
  assert.equal(result.holdingsCount, 0);
  assert.equal(result.marketCountSplit.US.pct, 0);
  assert.equal(result.markets.find((item) => item.market === "US").marketValue, 0);
  assert.equal(result.markets.find((item) => item.market === "US").topThreeConcentrationPct, null);
});

test("dashboard endpoint requires an owner session", async () => {
  const { DB } = fakeDb({ authenticated: false });
  const response = await handleDashboardRequest(
    new Request(`${origin}/api/dashboard`), { ...envConfig, DB }, "/api/dashboard"
  );
  assert.equal(response.status, 401);
});

test("dashboard endpoint returns calculated metrics for the owner", async () => {
  const { DB } = fakeDb({ rows: [
    { symbol: "AAPL", market: "US", sector: "Technology", quantity: 2, price: 100, quoteStatus: "ok" }
  ] });
  const response = await handleDashboardRequest(
    new Request(`${origin}/api/dashboard`, { headers: { cookie } }),
    { ...envConfig, DB }, "/api/dashboard"
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.holdingsCount, 1);
  assert.equal(result.markets.find((item) => item.market === "US").marketValue, 200);
});

test("dashboard emits configurable concentration and quote-quality flags", () => {
  const result = calculateDashboard([
    { symbol: "AAPL", market: "US", quantity: 8, price: 100, prevClose: 100, quoteStatus: "ok" },
    { symbol: "MSFT", market: "US", quantity: 2, price: 100, prevClose: 100, quoteStatus: "stale" },
    { symbol: "NVDA", market: "US", quantity: 1, price: null, prevClose: null, quoteStatus: "unavailable" }
  ], 50);
  assert.equal(result.thresholds.maxPositionPct, 50);
  assert.ok(result.riskFlags.some((flag) => flag.code === "position_concentration"));
  assert.ok(result.riskFlags.some((flag) => flag.code === "stale_quotes"));
  assert.ok(result.riskFlags.some((flag) => flag.code === "missing_quotes"));
  assert.ok(result.riskFlags.every((flag) => flag.market === "US"));
});

test("dashboard endpoint applies the owner's configured concentration threshold", async () => {
  const { DB } = fakeDb({
    maxPositionPct: 20,
    rows: [
      { symbol: "AAPL", market: "US", sector: "Technology", quantity: 8, price: 100, quoteStatus: "ok" },
      { symbol: "MSFT", market: "US", sector: "Technology", quantity: 2, price: 100, quoteStatus: "ok" }
    ]
  });
  const response = await handleDashboardRequest(
    new Request(`${origin}/api/dashboard`, { headers: { cookie } }),
    { ...envConfig, DB }, "/api/dashboard"
  );
  const result = await response.json();
  assert.equal(result.thresholds.maxPositionPct, 20);
  assert.ok(result.riskFlags.some((flag) => flag.code === "position_concentration"));
});
