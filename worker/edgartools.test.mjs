import test from "node:test";
import assert from "node:assert/strict";
import { handleEdgarToolsRequest } from "./lib/edgartools.mjs";

const token = "test-provider-token-with-at-least-32-characters";
function mockDb() {
  const calls = { batches: [], sql: [] };
  const DB = {
    prepare(sql) {
      calls.sql.push(sql);
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async all() {
          if (sql.includes("FROM instrument i")) return { results: [{ symbol: "AAPL" }, { symbol: "MSFT" }] };
          if (sql.includes("FROM edgartools_provider_status")) return { results: [{ symbol: "AAPL", providerStatus: "supported" }] };
          return { results: [] };
        }
      };
    },
    async batch(items) { calls.batches.push(items); return items.map(() => ({ meta: { changes: 1 } })); }
  };
  return { DB, calls };
}
function request(path, { method = "GET", body, authorization = `Bearer ${token}` } = {}) {
  return new Request(`https://folio.example${path}`, {
    method, headers: { authorization, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test("EdgarTools endpoints reject missing or invalid machine credentials", async () => {
  const { DB } = mockDb();
  const response = await handleEdgarToolsRequest(request("/api/fundamentals/edgartools/universe", { authorization: "Bearer wrong" }), { DB, UNIVERSE_SYNC_TOKEN: token }, new URL("https://folio.example/api/fundamentals/edgartools/universe"));
  assert.equal(response.status, 401);
});

test("EdgarTools universe contains only active owned US instruments", async () => {
  const { DB } = mockDb();
  const response = await handleEdgarToolsRequest(request("/api/fundamentals/edgartools/universe"), { DB, UNIVERSE_SYNC_TOKEN: token }, new URL("https://folio.example/api/fundamentals/edgartools/universe"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.symbols, ["AAPL", "MSFT"]);
  assert.equal(body.universe_source, "active_owner_holdings_and_watchlist");
});

test("EdgarTools ingestion stores raw evidence and explicitly leaves production metrics unchanged", async () => {
  const { DB, calls } = mockDb();
  const report = {
    generated_at: "2026-11-25T02:00:00.000Z",
    edgartools_version: "6.3.0",
    primary_provider: "EdgarTools",
    production_data_modified: false,
    symbols: ["AAPL"],
    companies: [{
      symbol: "AAPL", provider_status: "supported",
      filing: { accession_number: "0000320193-26-000101", period_of_report: "2026-09-30", form: "10-K", filing_date: "2026-11-01" },
      statements: { income_statement: { rows: [] }, balance_sheet: { rows: [] } }
    }]
  };
  const response = await handleEdgarToolsRequest(request("/api/fundamentals/edgartools/ingest", { method: "POST", body: report }), { DB, UNIVERSE_SYNC_TOKEN: token }, new URL("https://folio.example/api/fundamentals/edgartools/ingest"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.received, 1);
  assert.equal(body.ingested, 1);
  assert.equal(body.production_fundamentals_changed, false);
  assert.equal(body.rankings_changed, false);
  assert.equal(calls.batches.length, 1);
  assert.ok(calls.batches[0].some((item) => item.sql.includes("INSERT INTO edgartools_filing_evidence")));
  assert.ok(calls.batches[0].some((item) => item.sql.includes("INSERT INTO edgartools_provider_status")));
});

test("EdgarTools ingestion rejects invalid accession and production-mutating reports", async () => {
  const { DB } = mockDb();
  const base = { generated_at: "2026-11-25T02:00:00.000Z", primary_provider: "EdgarTools", production_data_modified: false, symbols: ["AAPL"], companies: [{
    symbol: "AAPL", provider_status: "supported", filing: { accession_number: "bad", period_of_report: "2026-09-30" }, statements: {}
  }] };
  const badAccession = await handleEdgarToolsRequest(request("/api/fundamentals/edgartools/ingest", { method: "POST", body: base }), { DB, UNIVERSE_SYNC_TOKEN: token }, new URL("https://folio.example/api/fundamentals/edgartools/ingest"));
  assert.equal(badAccession.status, 400);
  base.production_data_modified = true;
  const mutating = await handleEdgarToolsRequest(request("/api/fundamentals/edgartools/ingest", { method: "POST", body: base }), { DB, UNIVERSE_SYNC_TOKEN: token }, new URL("https://folio.example/api/fundamentals/edgartools/ingest"));
  assert.equal(mutating.status, 400);
});
