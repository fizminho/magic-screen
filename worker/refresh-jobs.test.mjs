import test from "node:test";
import assert from "node:assert/strict";
import { runSecRefresh, runWeeklyHousekeeping } from "./jobs/refresh.mjs";

function mockDb({ instruments = [] } = {}) {
  const calls = { prepared: [], batches: [], all: 0 };
  const DB = {
    prepare(sql) {
      const statement = {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async all() { calls.all++; return { results: instruments }; },
        async first() { return null; },
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
  ] } } }
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
  assert.equal(calls.batches[0].length, 7);
  assert.ok(calls.batches[0].some((item) => item.sql.includes("DELETE FROM sec_filing")));
  assert.ok(calls.batches[0].some((item) => item.sql.includes("DELETE FROM auth_challenge")));
});
