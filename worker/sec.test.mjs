import test from "node:test";
import assert from "node:assert/strict";
import { handleSecRequest, parseSecSubmissions } from "./lib/sec.mjs";

const origin = "https://folio.example";
const cookie = `__Host-session=${"s".repeat(43)}`;
const userAgent = "Magic Folio/0.1 (contact: owner@example.com)";
const envConfig = { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: origin };

function fakeDb({
  cik = "0000320193",
  count = 1,
  authenticated = true,
  cache = null,
  filings = [],
  instrument = undefined
} = {}) {
  const calls = { batch: 0, statements: [], queries: [] };
  const DB = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          calls.queries.push({ sql, values: this.values });
          if (sql.includes("FROM session WHERE token_hash")) {
            return authenticated ? {
              token_hash: "session-hash",
              credential_id: "credential-1",
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              last_seen_at: new Date().toISOString()
            } : null;
          }
          if (sql.includes("SELECT count FROM auth_attempt")) return { count };
          if (sql.includes("FROM instrument")) return instrument === undefined ? { id: 7, cik } : instrument;
          if (sql.includes("FROM sec_fetch_cache")) return cache;
          return null;
        },
        async all() {
          calls.queries.push({ sql, values: this.values });
          return { results: filings };
        },
        async run() { return { meta: { changes: 1 } }; }
      };
      return statement;
    },
    async batch(statements) {
      calls.batch++;
      calls.statements.push(...statements);
      return statements.map(() => ({ meta: { changes: 1 } }));
    }
  };
  return { DB, calls };
}

function submissions(forms = ["10-Q", "8-K"], filingDates = ["2026-11-24", "2026-11-20"]) {
  return {
    name: "Apple Inc.",
    filings: { recent: {
      form: forms,
      filingDate: filingDates,
      accessionNumber: forms.map((_, i) => `0000320193-26-${String(123456 + i).padStart(6, "0")}`),
      primaryDocument: forms.map((_, i) => `filing-${i}.htm`),
      reportDate: forms.map(() => "2026-09-30")
    } }
  };
}

test("SEC submissions parser filters forms, sorts and builds official archive URLs", () => {
  const now = Date.parse("2026-11-25T00:00:00Z");
  const payload = submissions(["10-Q", "4", "8-K", "NT 10-Q", "10-K"], [
    "2026-11-24", "2026-11-23", "2026-11-20", "2026-11-22", "2026-10-30"
  ]);
  const filings = parseSecSubmissions(payload, "AAPL", "0000320193", now);
  assert.equal(filings.length, 4);
  assert.equal(filings[0].form, "10-Q");
  assert.equal(filings[1].form, "4");
  assert.equal(filings[0].symbol, "AAPL");
  assert.equal(filings[0].cik, "0000320193");
  assert.equal(filings[0].source, "SEC EDGAR");
  assert.match(filings[0].url, /Archives\/edgar\/data\/320193\/000032019326123456\/filing-0\.htm$/);
});

test("SEC submissions parser limits results to the most recent 20", () => {
  const forms = Array.from({ length: 25 }, () => "8-K");
  const dates = Array.from({ length: 25 }, (_, index) => `2026-11-${String(25 - index).padStart(2, "0")}`);
  const filings = parseSecSubmissions(submissions(forms, dates), "AAPL", "0000320193", Date.parse("2026-11-25T00:00:00Z"));
  assert.equal(filings.length, 20);
});

test("SEC filings endpoint requires owner authentication", async () => {
  const { DB } = fakeDb({ authenticated: false });
  const response = await handleSecRequest(
    new Request(`${origin}/api/sec/filings?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, DB, SEC_USER_AGENT: userAgent },
    new URL(`${origin}/api/sec/filings?symbol=AAPL`),
    async () => { throw new Error("must not fetch"); }
  );
  assert.equal(response.status, 401);
});

test("SEC filings endpoint fails closed without a real contact User-Agent", async () => {
  const { DB } = fakeDb();
  const response = await handleSecRequest(
    new Request(`${origin}/api/sec/filings?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, DB, SEC_USER_AGENT: "Magic Folio/0.1" },
    new URL(`${origin}/api/sec/filings?symbol=AAPL`),
    async () => { throw new Error("must not fetch"); }
  );
  assert.equal(response.status, 503);
});

test("SEC filings endpoint requires a CIK on an active US instrument", async () => {
  const { DB } = fakeDb({ instrument: { id: 7, cik: null } });
  const response = await handleSecRequest(
    new Request(`${origin}/api/sec/filings?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, DB, SEC_USER_AGENT: userAgent },
    new URL(`${origin}/api/sec/filings?symbol=AAPL`),
    async () => { throw new Error("must not fetch"); }
  );
  assert.equal(response.status, 409);
});

test("SEC filings endpoint fetches only official submissions using declared User-Agent", async () => {
  const { DB } = fakeDb();
  let requestedUrl = "";
  let requestedAgent = "";
  const response = await handleSecRequest(
    new Request(`${origin}/api/sec/filings?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, DB, SEC_USER_AGENT: userAgent },
    new URL(`${origin}/api/sec/filings?symbol=AAPL`),
    async (url, init) => {
      requestedUrl = String(url);
      requestedAgent = init.headers["user-agent"];
      return new Response(JSON.stringify(submissions()), { status: 200, headers: { "content-type": "application/json" } });
    }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.companyName, "Apple Inc.");
  assert.equal(body.filings.length, 2);
  assert.equal(requestedUrl, "https://data.sec.gov/submissions/CIK0000320193.json");
  assert.equal(requestedAgent, userAgent);
});

test("SEC lookup is rate-limited and handles SEC upstream throttling", async () => {
  const limitedDb = fakeDb({ count: 6 }).DB;
  const limited = await handleSecRequest(
    new Request(`${origin}/api/sec/filings?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, DB: limitedDb, SEC_USER_AGENT: userAgent },
    new URL(`${origin}/api/sec/filings?symbol=AAPL`),
    async () => { throw new Error("must not fetch"); }
  );
  assert.equal(limited.status, 429);

  const { DB } = fakeDb();
  const upstream = await handleSecRequest(
    new Request(`${origin}/api/sec/filings?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, DB, SEC_USER_AGENT: userAgent },
    new URL(`${origin}/api/sec/filings?symbol=AAPL`),
    async () => new Response("{}", { status: 429 })
  );
  assert.equal(upstream.status, 503);
});

test("fresh SEC filing metadata is served from D1 without an upstream request", async () => {
  const fetchedAt = new Date().toISOString();
  const { DB, calls } = fakeDb({
    cache: { cik: "0000320193", fetchedAt, companyName: "Apple Inc." },
    filings: [{
      form: "10-Q", title: "AAPL · 10-Q filed 2026-11-24", summary: "Quarterly report.",
      filingDate: "2026-11-24", reportDate: "2026-09-30",
      accessionNumber: "0000320193-26-123456", primaryDocument: "aapl.htm",
      fetchedAt, url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326123456/aapl.htm"
    }]
  });
  let fetchCalls = 0;
  const response = await handleSecRequest(
    new Request(`${origin}/api/sec/filings?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, DB, SEC_USER_AGENT: userAgent },
    new URL(`${origin}/api/sec/filings?symbol=AAPL`),
    async () => { fetchCalls++; throw new Error("cache should be used"); }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.cached, true);
  assert.equal(body.companyName, "Apple Inc.");
  assert.equal(body.filings.length, 1);
  assert.equal(fetchCalls, 0);
  assert.equal(calls.batch, 0);
});

test("SEC cache miss persists filing metadata and a six-hour cache marker", async () => {
  const { DB, calls } = fakeDb();
  const response = await handleSecRequest(
    new Request(`${origin}/api/sec/filings?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, DB, SEC_USER_AGENT: userAgent },
    new URL(`${origin}/api/sec/filings?symbol=AAPL`),
    async () => new Response(JSON.stringify(submissions()), { status: 200 })
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.cached, false);
  assert.equal(body.filings.length, 2);
  assert.equal(calls.batch, 1);
  assert.equal(calls.statements.length, 4);
  assert.match(calls.statements[1].sql, /INSERT INTO sec_filing/);
  assert.match(calls.statements[3].sql, /INSERT INTO sec_fetch_cache/);
});

test("SEC cache is invalidated when an instrument CIK changes", async () => {
  const fetchedAt = new Date().toISOString();
  const { DB, calls } = fakeDb({
    cache: { cik: "0000789019", fetchedAt, companyName: "Old Company" },
    filings: []
  });
  let fetchCalls = 0;
  const response = await handleSecRequest(
    new Request(`${origin}/api/sec/filings?symbol=AAPL`, { headers: { cookie } }),
    { ...envConfig, DB, SEC_USER_AGENT: userAgent },
    new URL(`${origin}/api/sec/filings?symbol=AAPL`),
    async () => {
      fetchCalls++;
      return new Response(JSON.stringify(submissions()), { status: 200 });
    }
  );
  assert.equal(response.status, 200);
  assert.equal(fetchCalls, 1);
  assert.equal(calls.batch, 1);
});
