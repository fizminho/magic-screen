import test from "node:test";
import assert from "node:assert/strict";
import { handleResearchRequest, RESEARCH_MODEL } from "./lib/research.mjs";

const origin = "https://folio.example";
const cookie = `__Host-session=${"s".repeat(43)}`;
const envConfig = { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: origin };

function brief(sourceAccessions = ["0000320193-26-000101", "9999999999-26-000001"]) {
  return {
    company_summary: "Apple reported revenue and operating income in its latest SEC filing.",
    financial_strengths: ["Operating income was positive in the reported period."],
    financial_risks: ["Cash and debt metrics should be compared with prior periods."],
    filing_signals: ["A recent quarterly filing is available."],
    unknowns: ["Future performance cannot be inferred from this dataset."],
    confidence: "medium",
    source_accessions: sourceAccessions
  };
}

function fakeDb({
  authenticated = true,
  factsCache = {
    cik: "0000320193",
    fetchedAt: new Date().toISOString(),
    factsJson: JSON.stringify({
      entityName: "Apple Inc.",
      facts: [{
        accessionNumber: "0000320193-26-000101",
        form: "10-Q",
        filed: "2026-11-20",
        facts: {
          revenue: { value: 1000, unit: "USD", start: "2026-07-01", end: "2026-09-30" },
          operatingIncome: { value: 250, unit: "USD", start: "2026-07-01", end: "2026-09-30" }
        }
      }]
    })
  },
  filings = [{
    accessionNumber: "0000320193-26-000101",
    form: "10-Q",
    title: "Apple quarterly report",
    summary: "Quarterly report filed by the issuer.",
    filingDate: "2026-11-20",
    reportDate: "2026-09-30",
    url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000101/aapl.htm"
  }],
  cached = null,
  dailyCount = 0,
  attempts = 1
} = {}) {
  const calls = { analysisWrites: 0, rateWrites: 0, analysisValues: null };
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
              credential_id: "credential-1",
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              last_seen_at: new Date().toISOString()
            } : null;
          }
          if (sql.includes("FROM instrument WHERE market='US'")) return { id: 7, cik: "0000320193" };
          if (sql.includes("FROM sec_companyfacts_cache")) return factsCache;
          if (sql.includes("FROM analysis WHERE kind='brief' AND input_hash")) return cached;
          if (sql.includes("COUNT(*) AS count FROM analysis")) return { count: dailyCount };
          if (sql.includes("SELECT count FROM auth_attempt")) return { count: attempts };
          return null;
        },
        async all() {
          if (sql.includes("FROM sec_filing")) return { results: filings };
          return { results: [] };
        },
        async run() {
          if (sql.includes("INSERT INTO analysis")) {
            calls.analysisWrites++;
            calls.analysisValues = this.values;
          }
          if (sql.includes("auth_attempt")) calls.rateWrites++;
          return { meta: { changes: 1 } };
        }
      };
      return statement;
    }
  };
  return { DB, calls };
}

function request(body = { symbol: "AAPL" }) {
  return new Request(`${origin}/api/research/brief`, {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json", "CF-Connecting-IP": "203.0.113.50" },
    body: JSON.stringify(body)
  });
}

test("research endpoint requires an owner session and exact request Origin", async () => {
  const unauth = fakeDb({ authenticated: false });
  const response = await handleResearchRequest(
    request(), { ...envConfig, DB: unauth.DB, AI: { run: async () => ({ response: "{}" }) } },
    new URL(`${origin}/api/research/brief`)
  );
  assert.equal(response.status, 401);

  const wrongOrigin = new Request(`${origin}/api/research/brief`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", origin: "https://attacker.example" },
    body: JSON.stringify({ symbol: "AAPL" })
  });
  const forbidden = await handleResearchRequest(
    wrongOrigin, { ...envConfig, DB: unauth.DB, AI: { run: async () => ({ response: "{}" }) } },
    new URL(`${origin}/api/research/brief`)
  );
  assert.equal(forbidden.status, 403);
});

test("research endpoint validates ticker and requires fresh public SEC facts", async () => {
  const db = fakeDb();
  const invalid = await handleResearchRequest(
    request({ symbol: "../../x" }),
    { ...envConfig, DB: db.DB, AI: { run: async () => ({ response: "{}" }) } },
    new URL(`${origin}/api/research/brief`)
  );
  assert.equal(invalid.status, 400);

  const noFacts = fakeDb({ factsCache: null });
  const missing = await handleResearchRequest(
    request(), { ...envConfig, DB: noFacts.DB, AI: { run: async () => ({ response: "{}" }) } },
    new URL(`${origin}/api/research/brief`)
  );
  assert.equal(missing.status, 409);
});

test("research endpoint sends only public company facts and filing metadata to Workers AI", async () => {
  const { DB, calls } = fakeDb();
  let model = "";
  let prompt = "";
  const response = await handleResearchRequest(
    request(),
    {
      ...envConfig, DB,
      AI: {
        async run(name, input) {
          model = name;
          prompt = input.messages.map((item) => item.content).join("\n");
          return { response: JSON.stringify(brief()) };
        }
      }
    },
    new URL(`${origin}/api/research/brief`)
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(model, RESEARCH_MODEL);
  assert.equal(body.cached, false);
  assert.equal(body.brief.company_summary.startsWith("Apple reported"), true);
  assert.deepEqual(body.brief.source_accessions, ["0000320193-26-000101"]);
  assert.equal(body.sources.length, 1);
  assert.equal(calls.analysisWrites, 1);
  assert.ok(prompt.includes("Apple Inc."));
  assert.ok(prompt.includes("1000"));
  assert.ok(prompt.includes("0000320193-26-000101"));
  assert.equal(/quantity|avgCost|notes|watchlist|holding/i.test(prompt), false);
});

test("research endpoint serves a 24-hour cached brief without another AI call", async () => {
  const output = brief(["0000320193-26-000101"]);
  const { DB } = fakeDb({
    cached: {
      outputJson: JSON.stringify(output),
      model: RESEARCH_MODEL,
      createdAt: new Date().toISOString()
    }
  });
  let calls = 0;
  const response = await handleResearchRequest(
    request(),
    { ...envConfig, DB, AI: { run: async () => { calls++; throw new Error("cache should be used"); } } },
    new URL(`${origin}/api/research/brief`)
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).cached, true);
  assert.equal(calls, 0);
});

test("research endpoint enforces daily and per-IP limits", async () => {
  const daily = fakeDb({ dailyCount: 5 });
  let calls = 0;
  const dailyResponse = await handleResearchRequest(
    request(), { ...envConfig, DB: daily.DB, AI: { run: async () => { calls++; return { response: "{}" }; } } },
    new URL(`${origin}/api/research/brief`)
  );
  assert.equal(dailyResponse.status, 429);
  assert.equal(calls, 0);

  const limited = fakeDb({ attempts: 6 });
  const limitedResponse = await handleResearchRequest(
    request(), { ...envConfig, DB: limited.DB, AI: { run: async () => { calls++; return { response: "{}" }; } } },
    new URL(`${origin}/api/research/brief`)
  );
  assert.equal(limitedResponse.status, 429);
  assert.equal(calls, 0);
});

test("research endpoint retries malformed JSON once and rejects invented SEC citations", async () => {
  const { DB, calls } = fakeDb();
  let aiCalls = 0;
  const response = await handleResearchRequest(
    request(),
    {
      ...envConfig, DB,
      AI: {
        async run() {
          aiCalls++;
          return { response: JSON.stringify(brief()) };
        }
      }
    },
    new URL(`${origin}/api/research/brief`)
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.brief.source_accessions, ["0000320193-26-000101"]);
  assert.equal(aiCalls, 1);
  assert.equal(calls.analysisWrites, 1);
});
