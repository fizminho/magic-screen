import test from "node:test";
import assert from "node:assert/strict";
import { runSecRefresh, runWeeklyHousekeeping } from "./jobs/refresh.mjs";

function mockDb({ instruments = [], cursor = "" } = {}) {
  const calls = { prepared: [], batches: [], all: 0 };
  const DB = {
    prepare(sql) {
      const statement = {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async all() {
          calls.all++;
          if (!sql.includes("FROM instrument i") || sql.includes("i.cik IS NULL")) return { results: [] };
          const after = sql.includes("i.symbol > ?") ? String(this.values[0] || "") : "";
          const limit = Number(this.values[this.values.length - 1] || instruments.length);
          return { results: instruments.filter((item) => item.symbol > after).slice(0, limit) };
        },
        async first() {
          if (sql.includes("sec_refresh_cursor")) return cursor ? { value: cursor } : null;
          return null;
        },
        async run() {
          calls.prepared.push({ sql, values: this.values });
          if (sql.startsWith("INSERT INTO job_run")) return { meta: { last_row_id: 1, changes: 1 } };
          return { meta: { changes: 1 } };
        }
      };
      return statement;
    },
    async batch(statements) {
      calls.batches.push(statements.map((s) => ({ sql: s.sql, values: s.values })));
      return statements.map(() => ({ meta: { changes: 1 } }));
    }
  };
  return { DB, calls };
}

const userAgent = "Magic Folio/0.1 (contact: owner@example.com)";
const secSubmissions = {
  name: "Apple Inc.",
  filings: { recent: {
    form: ["10-Q"], filingDate: ["2026-11-24"],
    accessionNumber: ["0000320193-26-000101"],
    primaryDocument: ["q.htm"], reportDate: ["2026-09-30"]
  } }
};
const facts = {
  cik: 320193, entityName: "Apple Inc.",
  facts: { "us-gaap": { Assets: { units: { USD: [
    { accn: "0000320193-26-000101", form: "10-Q", filed: "2026-11-24", end: "2026-09-30", val: 1000 }
  ] } } } }
};

test("scheduled SEC refresh stores filing metadata and public facts without quote or holding data", async () => {
  const { DB, calls } = mockDb({ instruments: [{ id: 7, symbol: "AAPL", cik: "0000320193" }] });
  const requested = [];
  const env = { DB, SEC_USER_AGENT: userAgent };
  const fetcher = async (url) => {
    requested.push(url);
    return new Response(JSON.stringify(url.includes("/submissions/")
      ? secSubmissions : facts), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await runSecRefresh(env, { fetcher, now: Date.parse("2026-11-25T01:00:00Z") });
  assert.equal(result.status, "success");
  assert.equal(result.refreshed, 1);
  assert.equal(requested.length, 2);
  assert.ok(calls.batches.some((batch) => batch.some((item) => item.sql.includes("INSERT INTO sec_filing"))));
  assert.ok(calls.prepared.some((item) => item.sql.includes("INSERT INTO sec_companyfacts_cache")));
  assert.ok(calls.prepared.some((item) => item.sql.includes("UPDATE job_run SET finished_at")));
});

test("scheduled SEC refresh backfills missing US CIKs from the SEC ticker directory", async () => {
  const { DB, calls } = mockDb({ instruments: [{ id: 7, symbol: "AAPL", cik: "0000320193" }] });
  const requested = [];
  const originalPrepare = DB.prepare.bind(DB);
  DB.prepare = (sql) => {
    const statement = originalPrepare(sql);
    if (sql.includes("i.cik IS NULL")) statement.all = async () => ({ results: [{ id: 9, symbol: "MSFT" }] });
    return statement;
  };
  const fetcher = async (url) => {
    requested.push(String(url));
    if (String(url).includes("company_tickers.json")) {
      return new Response(JSON.stringify({ 0: { cik_str: 789019, ticker: "MSFT", title: "Microsoft Corporation" } }), { status: 200 });
    }
    if (String(url).includes("/submissions/")) {
      return new Response(JSON.stringify({ name: "Apple Inc.", filings: { recent: {
        form: [], filingDate: [], accessionNumber: [], primaryDocument: []
      } } }), { status: 200 });
    }
    return new Response(JSON.stringify({ cik: 320193, entityName: "Apple Inc.", facts: { "us-gaap": {} } }), { status: 200 });
  };
  const result = await runSecRefresh({ DB, SEC_USER_AGENT: userAgent }, {
    fetcher, now: Date.parse("2026-11-25T01:00:00Z")
  });
  assert.equal(result.cikResolved, 1);
  assert.ok(requested.includes("https://www.sec.gov/files/company_tickers.json"));
  assert.ok(calls.prepared.some((item) => item.sql.includes("UPDATE instrument SET cik=?") && item.values[0] === "0000789019"));
});

test("scheduled SEC refresh fails closed without a real contact User-Agent", async () => {
  const { DB } = mockDb();
  await assert.rejects(
    runSecRefresh({ DB, SEC_USER_AGENT: "Magic Folio example.com" }, { fetcher: async () => { throw new Error("must_not_fetch"); } }),
    /sec_user_agent_not_configured/
  );
});

test("weekly housekeeping uses bounded retention windows", async () => {
  const { DB, calls } = mockDb();
  const result = await runWeeklyHousekeeping({ DB }, { now: Date.parse("2026-11-25T02:00:00Z") });
  assert.equal(result.status, "success");
  assert.equal(calls.batches.length, 1);
  assert.equal(calls.batches[0].length, 8);
  assert.ok(calls.batches[0].some((item) => item.sql.includes("DELETE FROM sec_filing")));
  assert.ok(calls.batches[0].some((item) => item.sql.includes("DELETE FROM auth_challenge")));
});

test("scheduled SEC refresh rotates through symbols after the persisted cursor", async () => {
  const instruments = [
    { id: 1, symbol: "AAPL", cik: "0000000001" },
    { id: 2, symbol: "AMZN", cik: "0000000002" },
    { id: 3, symbol: "GOOG", cik: "0000000003" },
    { id: 4, symbol: "MSFT", cik: "0000000004" },
    { id: 5, symbol: "NVDA", cik: "0000000005" },
    { id: 6, symbol: "TSLA", cik: "0000000006" }
  ];
  const { DB, calls } = mockDb({ instruments, cursor: "MSFT" });
  const requested = [];
  const fetcher = async (url) => {
    requested.push(String(url));
    if (String(url).includes("/submissions/")) {
      return new Response(JSON.stringify({ name: "Company", filings: { recent: {
        form: [], filingDate: [], accessionNumber: [], primaryDocument: []
      } } }), { status: 200 });
    }
    return new Response(JSON.stringify({
      cik: Number(String(url).match(/CIK(\d+)\.json$/)?.[1]),
      entityName: "Company", facts: { "us-gaap": {} }
    }), { status: 200 });
  };
  const result = await runSecRefresh({ DB, SEC_USER_AGENT: userAgent }, {
    fetcher, now: Date.parse("2026-11-25T01:00:00Z")
  });
  assert.equal(result.instruments, 2);
  assert.ok(requested[0].endsWith("CIK0000000005.json"));
  assert.ok(requested[2].endsWith("CIK0000000006.json"));
  assert.ok(calls.prepared.some((item) => item.sql.includes("sec_refresh_cursor") && item.values[0] === "TSLA"));
});

test("scheduled SEC refresh stops immediately when SEC returns HTTP 429", async () => {
  const instruments = [
    { id: 1, symbol: "AAPL", cik: "0000320193" },
    { id: 2, symbol: "MSFT", cik: "0000789019" }
  ];
  const { DB, calls } = mockDb({ instruments });
  let requested = 0;
  const result = await runSecRefresh({ DB, SEC_USER_AGENT: userAgent }, {
    now: Date.parse("2026-11-25T01:00:00Z"),
    fetcher: async () => { requested++; return new Response("rate limited", { status: 429 }); }
  });
  assert.equal(requested, 1);
  assert.equal(result.rateLimited, true);
  assert.equal(result.failed, 1);
  assert.equal(calls.prepared.some((item) => item.sql.includes("sec_refresh_cursor")), false);
});
