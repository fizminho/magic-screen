import test from "node:test";
import assert from "node:assert/strict";
import { handleSecCompanyFactsRequest, parseSecCompanyFacts } from "./lib/sec-companyfacts.mjs";

const origin = "https://folio.example";
const cookie = `__Host-session=${"s".repeat(43)}`;
const userAgent = "Magic Folio/0.1 (contact: owner@example.com)";
const envConfig = { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: origin };

function entry(accn, form, filed, start, end, val, fy = 2026, fp = "FY") {
  return { accn, form, filed, start, end, val, fy, fp };
}

function companyFacts() {
  const accn1 = "0000320193-26-000101";
  const accn2 = "0000320193-25-000201";
  return {
    cik: 320193,
    entityName: "Apple Inc.",
    facts: { "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
        entry(accn1, "10-Q", "2026-11-01", "2026-07-01", "2026-09-30", 1000, 2026, "Q3"),
        entry(accn2, "10-K", "2025-11-01", "2024-09-29", "2025-09-27", 4000, 2025, "FY")
      ] } },
      OperatingIncomeLoss: { units: { USD: [
        entry(accn1, "10-Q", "2026-11-01", "2026-07-01", "2026-09-30", 250, 2026, "Q3"),
        entry(accn2, "10-K", "2025-11-01", "2024-09-29", "2025-09-27", 1000, 2025, "FY")
      ] } },
      CashAndCashEquivalentsAtCarryingValue: { units: { USD: [
        entry(accn1, "10-Q", "2026-11-01", undefined, "2026-09-30", 1500, 2026, "Q3")
      ] } },
      LongTermDebtCurrent: { units: { USD: [
        entry(accn1, "10-Q", "2026-11-01", undefined, "2026-09-30", 100, 2026, "Q3")
      ] } },
      LongTermDebtNoncurrent: { units: { USD: [
        entry(accn1, "10-Q", "2026-11-01", undefined, "2026-09-30", 900, 2026, "Q3")
      ] } },
      AssetsCurrent: { units: { USD: [
        entry(accn1, "10-Q", "2026-11-01", undefined, "2026-09-30", 3000, 2026, "Q3")
      ] } },
      LiabilitiesCurrent: { units: { USD: [
        entry(accn1, "10-Q", "2026-11-01", undefined, "2026-09-30", 2000, 2026, "Q3")
      ] } }
    } }
  };
}

function fakeDb({ authenticated = true, instrument = { id: 7, cik: "0000320193" }, cache = null, count = 1 } = {}) {
  const calls = { queries: [], writes: [] };
  const DB = {
    prepare(sql) {
      const statement = {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          calls.queries.push({ sql, values: this.values });
          if (sql.includes("FROM session WHERE token_hash")) return authenticated ? {
            token_hash: "session-hash", credential_id: "credential-1",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            last_seen_at: new Date().toISOString()
          } : null;
          if (sql.includes("SELECT count FROM auth_attempt")) return { count };
          if (sql.includes("FROM instrument")) return instrument;
          if (sql.includes("FROM sec_companyfacts_cache")) return cache;
          return null;
        },
        async run() { calls.writes.push({ sql, values: this.values }); return { meta: { changes: 1 } }; }
      };
      return statement;
    }
  };
  return { DB, calls };
}

test("SEC companyfacts parser groups only allowlisted USD facts by exact accession", () => {
  const result = parseSecCompanyFacts(companyFacts(), "AAPL", "0000320193");
  assert.equal(result.entityName, "Apple Inc.");
  assert.equal(result.taxonomy, "us-gaap");
  assert.equal(result.facts.length, 2);
  const current = result.facts.find((item) => item.accessionNumber === "0000320193-26-000101");
  assert.equal(current.form, "10-Q");
  assert.equal(current.facts.revenue.value, 1000);
  assert.equal(current.facts.operatingIncome.value, 250);
  assert.equal(current.facts.cashAndEquivalents.value, 1500);
  assert.equal(current.facts.currentDebt.value, 100);
  assert.equal(current.facts.longTermDebt.value, 900);
  assert.equal(current.facts.revenue.start, "2026-07-01");
  assert.equal(current.facts.cashAndEquivalents.start, null);
  assert.equal(result.facts.some((item) => item.facts.revenue && item.facts.operatingIncome), true);
});

test("SEC companyfacts parser rejects mismatched CIK and ignores malformed or unsupported facts", () => {
  const payload = companyFacts();
  assert.throws(() => parseSecCompanyFacts(payload, "AAPL", "0000789019"), /sec_facts_invalid_response/);
  payload.facts["us-gaap"].OperatingIncomeLoss.units.USD.push(
    entry("0000789019-26-000001", "10-Q", "2026-11-01", "2026-07-01", "2026-09-30", 999)
  );
  const result = parseSecCompanyFacts(payload, "AAPL", "0000320193");
  const current = result.facts.find((item) => item.accessionNumber === "0000320193-26-000101");
  assert.equal(current.facts.operatingIncome.value, 250);
});

test("SEC companyfacts endpoint requires an owner session", async () => {
  const { DB } = fakeDb({ authenticated: false });
  const response = await handleSecCompanyFactsRequest(
    new Request(`${origin}/api/sec/companyfacts?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, DB, SEC_USER_AGENT: userAgent },
    new URL(`${origin}/api/sec/companyfacts?symbol=AAPL`),
    async () => { throw new Error("must not fetch"); }
  );
  assert.equal(response.status, 401);
});

test("SEC companyfacts endpoint serves a fresh matching cache without an upstream call", async () => {
  const facts = parseSecCompanyFacts(companyFacts(), "AAPL", "0000320193");
  const { DB } = fakeDb({
    cache: { cik: "0000320193", fetchedAt: new Date().toISOString(), factsJson: JSON.stringify(facts) }
  });
  let fetchCalls = 0;
  const response = await handleSecCompanyFactsRequest(
    new Request(`${origin}/api/sec/companyfacts?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, DB, SEC_USER_AGENT: userAgent },
    new URL(`${origin}/api/sec/companyfacts?symbol=AAPL`),
    async () => { fetchCalls++; throw new Error("cache should be used"); }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.cached, true);
  assert.equal(body.facts.length, 2);
  assert.equal(fetchCalls, 0);
});

test("SEC companyfacts endpoint fetches official data and stores compact normalized facts", async () => {
  const { DB, calls } = fakeDb();
  let requestedUrl = "";
  let requestedAgent = "";
  const response = await handleSecCompanyFactsRequest(
    new Request(`${origin}/api/sec/companyfacts?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, DB, SEC_USER_AGENT: userAgent },
    new URL(`${origin}/api/sec/companyfacts?symbol=AAPL`),
    async (url, init) => {
      requestedUrl = String(url);
      requestedAgent = init.headers["user-agent"];
      return new Response(JSON.stringify(companyFacts()), { status: 200 });
    }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.cached, false);
  assert.equal(body.facts.length, 2);
  assert.equal(requestedUrl, "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json");
  assert.equal(requestedAgent, userAgent);
  assert.equal(calls.writes.length, 1);
  assert.match(calls.writes[0].sql, /INSERT INTO sec_companyfacts_cache/);
});

test("SEC companyfacts endpoint respects the shared SEC rate limit", async () => {
  const { DB } = fakeDb({ count: 6 });
  const response = await handleSecCompanyFactsRequest(
    new Request(`${origin}/api/sec/companyfacts?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, DB, SEC_USER_AGENT: userAgent },
    new URL(`${origin}/api/sec/companyfacts?symbol=AAPL`),
    async () => { throw new Error("must not fetch"); }
  );
  assert.equal(response.status, 429);
});
