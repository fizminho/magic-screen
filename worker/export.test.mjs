import test from "node:test";
import assert from "node:assert/strict";
import { buildExportCsv, handleExportRequest } from "./lib/export.mjs";

const origin = "https://folio.example";
const envConfig = { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: origin };
const cookie = `__Host-session=${"s".repeat(43)}`;

function fakeDb({ authenticated = true } = {}) {
  const DB = {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() {
          if (sql.includes("FROM session WHERE token_hash")) {
            return authenticated ? {
              token_hash: "session-hash", credential_id: "passkey-id",
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              last_seen_at: new Date().toISOString()
            } : null;
          }
          return null;
        },
        async all() {
          if (sql.includes("FROM holding")) return { results: [{
            symbol: "AAPL", market: "US", name: "Apple Inc.", currency: "USD", cik: "0000320193",
            quantity: 2, avgCost: 100, notes: '=HYPERLINK("bad")', updatedAt: "2026-11-25T00:00:00.000Z"
          }] };
          if (sql.includes("FROM watchlist")) return { results: [{
            symbol: "1155", market: "MY", name: "Maybank", currency: "MYR", cik: null,
            note: "Watch, results\nsoon", addedAt: "2026-11-25T00:00:00.000Z"
          }] };
          if (sql.includes("FROM setting")) return { results: [
            { key: "alert_move_pct", value: "5" },
            { key: "max_position_pct", value: "25" }
          ] };
          return { results: [] };
        }
      };
    }
  };
  return { DB };
}

test("export CSV escapes formula-leading user notes and quoted delimiters", () => {
  const csv = buildExportCsv([
    { symbol: "AAPL", market: "US", name: "Apple Inc.", currency: "USD", cik: "0000320193",
      quantity: 2, avgCost: 100, notes: '=HYPERLINK("bad")', updatedAt: "2026-11-25" }
  ], [
    { symbol: "1155", market: "MY", name: "Maybank", currency: "MYR", cik: null,
      note: "Watch, results\nsoon", addedAt: "2026-11-25" }
  ]);
  assert.match(csv, /^record_type,symbol,market/);
  assert.match(csv, /holding,AAPL,US,Apple Inc\.,USD,2,100,0000320193,"'=HYPERLINK/);
  assert.match(csv, /watchlist,1155,MY,Maybank,MYR,,,,"Watch, results\nsoon"/);
});

test("portfolio export requires an owner session", async () => {
  const { DB } = fakeDb({ authenticated: false });
  const response = await handleExportRequest(
    new Request(`${origin}/api/export`), { ...envConfig, DB }, new URL(`${origin}/api/export`)
  );
  assert.equal(response.status, 401);
});

test("JSON export includes holdings watchlist and settings", async () => {
  const { DB } = fakeDb();
  const response = await handleExportRequest(
    new Request(`${origin}/api/export`, { headers: { cookie } }),
    { ...envConfig, DB }, new URL(`${origin}/api/export`)
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.holdings.length, 1);
  assert.equal(body.watchlist.length, 1);
  assert.deepEqual(body.settings, { alert_move_pct: 5, max_position_pct: 25 });
});

test("CSV export is an attachment with no-store and nosniff headers", async () => {
  const { DB } = fakeDb();
  const response = await handleExportRequest(
    new Request(`${origin}/api/export?format=csv`, { headers: { cookie } }),
    { ...envConfig, DB }, new URL(`${origin}/api/export?format=csv`)
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/csv/);
  assert.match(response.headers.get("content-disposition"), /attachment; filename="magic-folio-\d{4}-\d{2}-\d{2}\.csv"/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("export rejects unknown formats", async () => {
  const { DB } = fakeDb();
  const response = await handleExportRequest(
    new Request(`${origin}/api/export?format=xml`, { headers: { cookie } }),
    { ...envConfig, DB }, new URL(`${origin}/api/export?format=xml`)
  );
  assert.equal(response.status, 400);
});
