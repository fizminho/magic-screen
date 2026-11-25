import test from "node:test";
import assert from "node:assert/strict";
import { validateResearchBrief } from "./lib/analysis.mjs";

const allowed = new Set(["0000320193-26-000101", "0000320193-26-000102"]);

test("research brief validator enforces required fields and confidence", () => {
  const brief = validateResearchBrief({
    company_summary: "Revenue increased in the reported quarter.",
    financial_strengths: ["Positive operating cash flow."],
    financial_risks: ["Receivables increased."],
    filing_signals: ["A quarterly report was filed."],
    unknowns: ["Future performance is unknown."],
    confidence: "medium",
    source_accessions: ["0000320193-26-000101", "invented-accession"]
  }, allowed, "AAPL");
  assert.equal(brief.symbol, "AAPL");
  assert.equal(brief.confidence, "medium");
  assert.deepEqual(brief.source_accessions, ["0000320193-26-000101"]);
  assert.equal(brief.disclaimer.includes("Not personalized"), true);
});

test("research brief validator rejects missing summary and invalid confidence", () => {
  assert.equal(validateResearchBrief({ confidence: "high" }, allowed, "AAPL"), null);
  assert.equal(validateResearchBrief({
    company_summary: "Summary", confidence: "certain"
  }, allowed, "AAPL"), null);
});

test("research brief validator rejects explicit trading directives", () => {
  assert.equal(validateResearchBrief({
    company_summary: "You should buy the stock.", confidence: "high"
  }, allowed, "AAPL"), null);
});

test("research brief validator bounds model-controlled strings and list sizes", () => {
  const brief = validateResearchBrief({
    company_summary: "x".repeat(1000),
    financial_strengths: Array.from({ length: 10 }, () => "y".repeat(1000)),
    financial_risks: [], filing_signals: [], unknowns: [],
    confidence: "low", source_accessions: []
  }, allowed, "AAPL");
  assert.equal(brief.company_summary.length, 700);
  assert.equal(brief.financial_strengths.length, 5);
  assert.equal(brief.financial_strengths[0].length, 400);
});

const origin = "https://folio.example";
const cookie = `__Host-session=${"s".repeat(43)}`;
const envConfig = { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: origin };

function analysisDb({ authenticated = true, factsAgeMs = 60_000, cached = null, quotaAllowed = true } = {}) {
  const calls = { analysisWrites: 0, quotaReservations: 0 };
  const facts = {
    symbol: "AAPL",
    cik: "0000320193",
    entityName: "Apple Inc.",
    taxonomy: "us-gaap",
    facts: [{
      accessionNumber: "0000320193-26-000101",
      form: "10-Q",
      filed: "2026-11-20",
      facts: { revenue: { value: 1000, unit: "USD", start: "2026-07-01", end: "2026-09-30" } }
    }]
  };
  const DB = {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes("FROM session WHERE token_hash")) return authenticated ? {
            token_hash: "session-hash",
            credential_id: "credential-1",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            last_seen_at: new Date().toISOString()
          } : null;
          if (sql.includes("FROM instrument WHERE market='US'")) return { id: 7, cik: "0000320193" };
          if (sql.includes("FROM sec_companyfacts_cache")) return {
            cik: "0000320193",
            fetchedAt: new Date(Date.now() - factsAgeMs).toISOString(),
            factsJson: JSON.stringify(facts)
          };
          if (sql.includes("FROM analysis WHERE kind='brief' AND input_hash")) return cached;
          if (sql.includes("INSERT INTO setting")) {
            calls.quotaReservations++;
            return quotaAllowed ? { value: "1" } : null;
          }
          return null;
        },
        async all() {
          if (sql.includes("FROM sec_filing")) return { results: [{
            accessionNumber: "0000320193-26-000101",
            form: "10-Q",
            title: "Apple quarterly report",
            summary: "Quarterly report.",
            filingDate: "2026-11-20",
            reportDate: "2026-09-30",
            url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000101/aapl.htm"
          }] };
          if (sql.includes("FROM analysis WHERE kind='brief'")) return { results: [] };
          return { results: [] };
        },
        async run() {
          if (sql.includes("INSERT INTO analysis")) calls.analysisWrites++;
          return { meta: { changes: 1 } };
        }
      };
      return statement;
    }
  };
  return { DB, calls };
}

function analysisRequest(body = { symbol: "AAPL" }) {
  return new Request(`${origin}/api/analysis/run`, {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

test("analysis endpoint requires owner session and exact Origin", async () => {
  const { DB } = analysisDb({ authenticated: false });
  const response = await (await import("./lib/analysis.mjs")).handleAnalysisRequest(
    analysisRequest(), { ...envConfig, DB, AI: { run: async () => ({ response: "{}" }) } },
    new URL(`${origin}/api/analysis/run`)
  );
  assert.equal(response.status, 401);
});

test("analysis endpoint rejects stale public SEC facts before calling the model", async () => {
  const { DB } = analysisDb({ factsAgeMs: 7 * 60 * 60 * 1000 });
  let called = false;
  const response = await (await import("./lib/analysis.mjs")).handleAnalysisRequest(
    analysisRequest(), { ...envConfig, DB, AI: { run: async () => { called = true; return { response: "{}" }; } } },
    new URL(`${origin}/api/analysis/run`)
  );
  assert.equal(response.status, 409);
  assert.equal(called, false);
});

test("analysis endpoint sends only public SEC facts and metadata to Workers AI", async () => {
  const { DB, calls } = analysisDb();
  let prompt = "";
  const response = await (await import("./lib/analysis.mjs")).handleAnalysisRequest(
    analysisRequest(), {
      ...envConfig, DB,
      AI: { async run(model, input) {
        assert.equal(model, "@cf/zai-org/glm-4.7-flash");
        prompt = input.messages.map((message) => message.content).join("\n");
        return { response: JSON.stringify({
          company_summary: "Apple reported revenue in its latest filing.",
          financial_strengths: ["Revenue was reported."],
          financial_risks: ["More periods are needed for comparison."],
          filing_signals: ["A recent quarterly filing exists."],
          unknowns: ["Future performance is unknown."],
          confidence: "medium",
          source_accessions: ["0000320193-26-000101", "invented-accession"]
        }) };
      } }
    }, new URL(`${origin}/api/analysis/run`)
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.brief.symbol, "AAPL");
  assert.equal(body.model, "@cf/zai-org/glm-4.7-flash");
  assert.equal(body.cached, false);
  assert.deepEqual(body.brief.source_accessions, ["0000320193-26-000101"]);
  assert.equal(body.sources.length, 1);
  assert.ok(body.sources[0].url.startsWith("https://www.sec.gov/Archives/"));
  assert.equal(/quantity|avg_cost|notes|watchlist|holding/i.test(prompt), false);
  assert.equal(calls.analysisWrites, 1);
  assert.equal(calls.quotaReservations, 1);
});

test("analysis endpoint atomically blocks requests beyond the daily quota", async () => {
  const { DB, calls } = analysisDb({ quotaAllowed: false });
  let called = false;
  const response = await (await import("./lib/analysis.mjs")).handleAnalysisRequest(
    analysisRequest(), { ...envConfig, DB, AI: { run: async () => { called = true; return { response: "{}" }; } } },
    new URL(`${origin}/api/analysis/run`)
  );
  assert.equal(response.status, 429);
  assert.equal(called, false);
  assert.equal(calls.analysisWrites, 0);
});
