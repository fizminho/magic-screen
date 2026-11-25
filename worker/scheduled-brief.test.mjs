import test from "node:test";
import assert from "node:assert/strict";
import { runScheduledResearchBrief } from "./lib/analysis.mjs";

const accession = "0000320193-26-000101";
const facts = {
  symbol: "AAPL", cik: "0000320193", taxonomy: "us-gaap",
  facts: [{ accessionNumber: accession, form: "10-Q", filed: "2026-11-24", facts: {} }]
};

function scheduledDb() {
  const calls = { statements: [], promptQueries: [] };
  const DB = {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          calls.statements.push({ type: "first", sql, values: this.values });
          if (sql.includes("FROM sec_companyfacts_cache")) return {
            cik: "0000320193", fetchedAt: "2026-11-25T00:30:00.000Z", factsJson: JSON.stringify(facts)
          };
          if (sql.includes("FROM analysis WHERE kind='brief' AND input_hash")) return null;
          if (sql.includes("INSERT INTO setting")) return { value: "1" };
          return null;
        },
        async all() {
          calls.statements.push({ type: "all", sql, values: this.values });
          if (sql.includes("SELECT DISTINCT i.id")) return {
            results: [{ id: 7, symbol: "AAPL", cik: "0000320193" }]
          };
          if (sql.includes("FROM sec_filing")) return {
            results: [{
              accessionNumber: accession, form: "10-Q", title: "Quarterly report",
              summary: "Public filing metadata", filingDate: "2026-11-24",
              reportDate: "2026-09-30",
              url: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000101/aapl.htm"
            }]
          };
          return { results: [] };
        },
        async run() {
          calls.statements.push({ type: "run", sql, values: this.values });
          return { meta: { last_row_id: 42, changes: 1 } };
        }
      };
      return statement;
    }
  };
  return { DB, calls };
}

test("scheduled brief uses only public SEC data and tracks the job", async () => {
  const { DB, calls } = scheduledDb();
  let modelCalls = 0;
  let prompt = "";
  const result = await runScheduledResearchBrief({
    DB,
    AI: { async run(model, input) {
      modelCalls++;
      assert.equal(model, "@cf/zai-org/glm-4.7-flash");
      prompt = input.messages.map((message) => message.content).join("\n");
      return { response: JSON.stringify({
        company_summary: "The latest filing reports financial information.",
        financial_strengths: ["Reported information is available."],
        financial_risks: ["Further periods are needed."],
        filing_signals: ["A recent quarterly filing is available."],
        unknowns: ["Future performance is unknown."],
        confidence: "medium",
        source_accessions: [accession]
      }) };
    } }
  }, { now: Date.parse("2026-11-25T01:00:00.000Z") });

  assert.equal(result.status, "success");
  assert.equal(result.generated, 1);
  assert.equal(modelCalls, 1);
  assert.equal(/quantity|avg_cost|notes|portfolio weight|watchlist|holding/i.test(prompt), false);
  assert.ok(calls.statements.some((item) => item.sql.includes("INSERT INTO analysis")));
  assert.ok(calls.statements.some((item) => item.sql.includes("UPDATE job_run SET finished_at")));
});

test("scheduled brief skips cleanly when no recent filing candidates exist", async () => {
  const { DB, calls } = scheduledDb();
  const originalPrepare = DB.prepare.bind(DB);
  DB.prepare = (sql) => {
    const statement = originalPrepare(sql);
    if (sql.includes("SELECT DISTINCT i.id")) {
      statement.all = async () => ({ results: [] });
    }
    return statement;
  };
  let modelCalled = false;
  const result = await runScheduledResearchBrief({
    DB, AI: { run: async () => { modelCalled = true; return {}; } }
  }, { now: Date.parse("2026-11-25T01:00:00.000Z") });
  assert.equal(result.status, "skipped_no_new_data");
  assert.equal(modelCalled, false);
  assert.ok(calls.statements.some((item) => item.sql.includes("UPDATE job_run SET finished_at")));
});
