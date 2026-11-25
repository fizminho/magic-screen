import test from "node:test";
import assert from "node:assert/strict";
import { extractCompanyFacts, handleCompanyFactsRequest } from "./lib/companyfacts.mjs";

const origin = "https://folio.example";
const cookie = `__Host-session=${"s".repeat(43)}`;
const userAgent = "Magic Folio/0.1 (contact: owner@binalah.co)";
const envConfig = { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: origin, SEC_USER_AGENT: userAgent };

function payload() {
  return {
    entityName: "Apple Inc.",
    fiscalYearEnd: "0930",
    facts: {
      "us-gaap": {
        Revenues: { units: { USD: [
          { start: "2025-10-01", end: "2026-09-30", filed: "2026-11-20", val: 1000, form: "10-K" },
          { start: "2026-07-01", end: "2026-09-30", filed: "2026-11-20", val: 300, form: "10-Q" },
          { start: "2026-01-01", end: "2026-09-30", filed: "2026-11-20", val: 800, form: "10-Q" },
          { start: "2026-07-01", end: "2026-09-30", filed: "2026-11-21", val: 999, form: "8-K" }
        ] } },
        NetIncomeLoss: { units: { USD: [
          { start: "2025-10-01", end: "2026-09-30", filed: "2026-11-20", val: 250, form: "10-K" }
        ] } },
        Assets: { units: { USD: [
          { end: "2026-09-30", filed: "2026-11-20", val: 3000, form: "10-K" },
          { end: "2026-06-30", filed: "2026-08-01", val: 2900, form: "10-Q" }
        ] } }
      }
    }
  };
}

function fakeDb({ authenticated = true, instrument = { id: 7, symbol: "AAPL", cik: "0000320193" }, cache = null, attempts = 1 } = {}) {
  const calls = { inserts: 0, rateLimitWrites: 0 };
  let storedCache = cache;
  const DB = {
    prepare(sql) {
      const statement = {
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
          if (sql.includes("FROM instrument WHERE market='US'")) return instrument;
          if (sql.includes("FROM sec_companyfacts_cache")) return storedCache;
          if (sql.includes("SELECT count FROM auth_attempt")) return { count: attempts };
          return null;
        },
        async run() {
          if (sql.includes("INSERT INTO sec_companyfacts_cache")) {
            calls.inserts++;
            storedCache = {
              cik: this.values[1],
              fetchedAt: this.values[2],
              factsJson: this.values[3]
            };
          }
          if (sql.includes("auth_attempt")) calls.rateLimitWrites++;
          return { meta: { changes: 1 } };
        }
      };
      return statement;
    }
  };
  return { DB, calls, get cache() { return storedCache; } };
}

test("companyfacts parser keeps annual, standalone quarterly and instant facts only", () => {
  const facts = extractCompanyFacts(payload(), "0000320193", "2026-11-25T00:00:00.000Z");
  assert.equal(facts.companyName, "Apple Inc.");
  assert.equal(facts.fiscalYearEnd, "0930");
  assert.equal(facts.metrics.revenue.annual.length, 1);
  assert.equal(facts.metrics.revenue.annual[0].value, 1000);
  assert.equal(facts.metrics.revenue.quarterly.length, 1);
  assert.equal(facts.metrics.revenue.quarterly[0].value, 300);
  assert.equal(facts.metrics.netIncome.annual[0].value, 250);
  assert.equal(facts.metrics.totalAssets.latest.length, 2);
});

test("companyfacts parser rejects malformed or empty SEC payloads", () => {
  assert.throws(() => extractCompanyFacts({}, "0000320193"), /sec_facts_invalid_response/);
  assert.throws(() => extractCompanyFacts({
    entityName: "No facts",
    facts: { "us-gaap": { Revenues: { units: { USD: [] } } } }
  }, "0000320193"), /sec_facts_empty/);
});

test("companyfacts endpoint requires an owner session", async () => {
  const { DB } = fakeDb({ authenticated: false });
  const response = await handleCompanyFactsRequest(
    new Request(`${origin}/api/sec/companyfacts?symbol=AAPL`),
    { ...envConfig, DB }, new URL(`${origin}/api/sec/companyfacts?symbol=AAPL`)
  );
  assert.equal(response.status, 401);
});

test("companyfacts endpoint validates ticker, instrument and CIK", async () => {
  const { DB } = fakeDb();
  const invalid = await handleCompanyFactsRequest(
    new Request(`${origin}/api/sec/companyfacts?symbol=../../x`, { headers: { cookie } }),
    { ...envConfig, DB }, new URL(`${origin}/api/sec/companyfacts?symbol=../../x`)
  );
  assert.equal(invalid.status, 400);

  const missingCikDb = fakeDb({ instrument: { id: 8, symbol: "MSFT", cik: null } });
  const missingCik = await handleCompanyFactsRequest(
    new Request(`${origin}/api/sec/companyfacts?symbol=MSFT`, { headers: { cookie } }),
    { ...envConfig, DB: missingCikDb.DB }, new URL(`${origin}/api/sec/companyfacts?symbol=MSFT`)
  );
  assert.equal(missingCik.status, 409);
});

test("companyfacts endpoint caches compact public facts for 24 hours", async () => {
  const { DB, calls } = fakeDb();
  let requestedUrl = "";
  let requestedAgent = "";
  const response = await handleCompanyFactsRequest(
    new Request(`${origin}/api/sec/companyfacts?symbol=AAPL`, {
      headers: { cookie, "CF-Connecting-IP": "203.0.113.30" }
    }),
    { ...envConfig, DB },
    new URL(`${origin}/api/sec/companyfacts?symbol=AAPL`),
    async (url, options) => {
      requestedUrl = url;
      requestedAgent = options.headers["user-agent"];
      return new Response(JSON.stringify(payload()), { status: 200 });
    }
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.companyName, "Apple Inc.");
  assert.equal(result.cacheHit, false);
  assert.equal(requestedUrl, "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json");
  assert.equal(requestedAgent, userAgent);
  assert.equal(calls.inserts, 1);

  let secondFetch = false;
  const cached = await handleCompanyFactsRequest(
    new Request(`${origin}/api/sec/companyfacts?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, DB },
    new URL(`${origin}/api/sec/companyfacts?symbol=AAPL`),
    async () => { secondFetch = true; throw new Error("cache_miss"); }
  );
  assert.equal(cached.status, 200);
  assert.equal((await cached.json()).cacheHit, true);
  assert.equal(secondFetch, false);
});

test("companyfacts endpoint enforces SEC contact and per-IP rate limits", async () => {
  const { DB } = fakeDb();
  const missingAgent = await handleCompanyFactsRequest(
    new Request(`${origin}/api/sec/companyfacts?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, SEC_USER_AGENT: "Magic Folio/0.1 (contact: your-email@example.com)", DB },
    new URL(`${origin}/api/sec/companyfacts?symbol=AAPL`)
  );
  assert.equal(missingAgent.status, 503);

  const limited = fakeDb({ attempts: 6 });
  const response = await handleCompanyFactsRequest(
    new Request(`${origin}/api/sec/companyfacts?symbol=AAPL`, {
      headers: { cookie, "CF-Connecting-IP": "203.0.113.31" }
    }),
    { ...envConfig, DB: limited.DB },
    new URL(`${origin}/api/sec/companyfacts?symbol=AAPL`),
    async () => { throw new Error("must_not_fetch"); }
  );
  assert.equal(response.status, 429);
});
