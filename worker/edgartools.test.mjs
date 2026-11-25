import test from "node:test";
import assert from "node:assert/strict";
import { handleEdgarToolsRequest } from "./lib/edgartools.mjs";

const token = "test-provider-token-with-at-least-32-characters";
function mockDb(schemaColumns = []) {
  const calls = { batches: [], sql: [] };
  const DB = {
    prepare(sql) {
      calls.sql.push(sql);
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async all() {
          if (sql.includes("PRAGMA table_info(edgartools_filing_evidence)")) return { results: schemaColumns.map((name) => ({ name })) };
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

test("EdgarTools ingestion supports the deployed accession_key evidence schema", async () => {
  const { DB, calls } = mockDb(["symbol", "accession_key", "market", "cik", "accession", "fiscal_period", "form", "filed_at", "reporting_currency", "provider_status", "provider", "provider_version", "generated_at", "payload_json", "ingested_at"]);
  const report = {
    generated_at: "2026-11-25T02:00:00.000Z",
    edgartools_version: "6.3.0",
    primary_provider: "EdgarTools",
    production_data_modified: false,
    symbols: ["AAPL"],
    companies: [{
      symbol: "AAPL", provider_status: "supported",
      filing: { accession_number: "0000320193-26-000101", period_of_report: "2026-09-30", form: "10-K", filing_date: "2026-11-01", cik: "0000320193" },
      statements: { income_statement: { rows: [] } }
    }]
  };
  const response = await handleEdgarToolsRequest(request("/api/fundamentals/edgartools/ingest", { method: "POST", body: report }), { DB, UNIVERSE_SYNC_TOKEN: token }, new URL("https://folio.example/api/fundamentals/edgartools/ingest"));
  assert.equal(response.status, 200);
  const evidence = calls.batches[0].find((item) => item.sql.includes("INSERT INTO edgartools_filing_evidence"));
  assert.ok(evidence.sql.includes("accession_key"));
  assert.ok(evidence.sql.includes("ON CONFLICT(symbol,accession_key)"));
  assert.equal(evidence.values[1], "0000320193-26-000101");
  assert.equal(evidence.values[2], "0000320193");
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

test("normalized EdgarTools analytics ingestion stores metric records separately", async () => {
  const { DB, calls } = mockDb();
  const report = {
    service: "Magic Folio EdgarTools normalized analytics evidence",
    schema_version: 1,
    mapping_version: 2,
    production_data_modified: false,
    source_report_generated_at: "2026-11-25T02:00:00.000Z",
    companies: [{
      symbol: "AAPL", provider_status: "supported",
      accession: "0000320193-26-000101", form: "10-K", mapping_version: 2,
      metrics: [
        { statement: "income_statement", metric: "revenue", period_end: "2026-09-30", period_type: "duration", fiscal_label: "FY", value: 478834000000, currency: null, source_concept: "us-gaap_Revenue", source_label: "Revenue", standard_concept: "Revenue", balance: null },
        { statement: "balance_sheet", metric: "totalAssets", period_end: "2026-09-30", period_type: "instant", fiscal_label: null, value: 404548000000, currency: null, source_concept: "us-gaap_Assets", source_label: "Total assets", standard_concept: "Assets", balance: "debit" }
      ]
    }]
  };
  const response = await handleEdgarToolsRequest(request("/api/fundamentals/edgartools/normalized", { method: "POST", body: report }), { DB, UNIVERSE_SYNC_TOKEN: token }, new URL("https://folio.example/api/fundamentals/edgartools/normalized"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.metric_records, 2);
  assert.equal(body.production_fundamentals_changed, false);
  assert.equal(body.rankings_changed, false);
  assert.ok(calls.batches[0].some((item) => item.sql.includes("INSERT INTO edgartools_normalized_metric")));
});

test("normalized EdgarTools ingestion rejects malformed accession and period values", async () => {
  const { DB } = mockDb();
  const report = {
    service: "Magic Folio EdgarTools normalized analytics evidence",
    schema_version: 1,
    production_data_modified: false,
    source_report_generated_at: "2026-11-25T02:00:00.000Z",
    companies: [{
      symbol: "AAPL", provider_status: "supported", accession: "bad", form: "10-K", mapping_version: 2,
      metrics: [{ statement: "income_statement", metric: "revenue", period_end: "2026-09-30", period_type: "duration", value: 10, currency: null }]
    }]
  };
  const response = await handleEdgarToolsRequest(request("/api/fundamentals/edgartools/normalized", { method: "POST", body: report }), { DB, UNIVERSE_SYNC_TOKEN: token }, new URL("https://folio.example/api/fundamentals/edgartools/normalized"));
  assert.equal(response.status, 400);
});
