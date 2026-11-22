import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { ensureLedgerSchema, persistCompletedReview, recordReviewDecision, validateDecisionPayload,
  listReviewHistory, listReviewDecisions, parsePageParams, MAX_PAGE_SIZE } from "./gemini-review-ledger.mjs";

// Minimal D1 shim over real SQLite so constraints, triggers and RETURNING are genuinely exercised.
function sqliteD1() {
  const db = new DatabaseSync(":memory:");
  const wrap = sql => {
    let args = [];
    const stmt = { bind(...a) { args = a; return stmt; },
      async run() { db.prepare(sql).run(...args); return { success: true }; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      exec() { db.prepare(sql).run(...args); } };
    return stmt;
  };
  return { raw: db, prepare: wrap,
    async batch(stmts) { db.exec("BEGIN"); try { for (const s of stmts) s.exec(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}

const CACHE_SQL = `INSERT INTO gemini_accounting_review_cache
  (cache_key,symbol,accession,task,input_hash,prompt_version,policy_version,model,status,response_json,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;
const H = c => c.repeat(64);
const row = (over = {}) => ({ cacheKey: H("a"), symbol: "ABC", accession: "0000000000-25-000001", task: "debt_scope", inputHash: H("b"),
  promptVersion: "p", policyVersion: "q", model: "m", status: "REVIEW_REQUIRED", responseJson: "{}", createdAt: "2026-11-22T00:00:00Z", ...over });

async function setup() {
  const DB = sqliteD1();
  DB.raw.exec(`CREATE TABLE gemini_accounting_review_cache (cache_key TEXT PRIMARY KEY, symbol TEXT NOT NULL, accession TEXT, task TEXT NOT NULL,
    input_hash TEXT NOT NULL, prompt_version TEXT NOT NULL, policy_version TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL,
    response_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  const env = { DB };
  await ensureLedgerSchema(env);
  return env;
}
const decision = (over = {}) => ({ symbol: "ABC", task: "debt_scope", cache_key: H("a"), input_hash: H("b"), decision: "ACCEPT",
  rationale: "Checked note 7 against the balance sheet.", reviewer: "analyst-1", ...over });

test("schema initialisation is idempotent", async () => {
  const env = await setup();
  await ensureLedgerSchema(env); await ensureLedgerSchema(env);
});

test("cache and history are written together, once per cache key", async () => {
  const env = await setup();
  await persistCompletedReview(env, CACHE_SQL, row());
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM gemini_accounting_review_history").get().n, 1);
  // A second write for the same key fails atomically: the cache PK conflict rolls back the batch, no duplicate history.
  await assert.rejects(() => persistCompletedReview(env, CACHE_SQL, row()));
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM gemini_accounting_review_history").get().n, 1);
});

test("a history failure rolls back the cache insert", async () => {
  const env = await setup();
  env.DB.raw.exec("DROP TABLE gemini_accounting_review_history");
  await assert.rejects(() => persistCompletedReview(env, CACHE_SQL, row()));
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM gemini_accounting_review_cache").get().n, 0);
});

test("history and decisions are append-only at the database layer", async () => {
  const env = await setup();
  await persistCompletedReview(env, CACHE_SQL, row());
  assert.throws(() => env.DB.raw.exec("UPDATE gemini_accounting_review_history SET status='X'"), /append-only/);
  assert.throws(() => env.DB.raw.exec("DELETE FROM gemini_accounting_review_history"), /append-only/);
  assert.equal((await recordReviewDecision(env, decision())).ok, true);
  assert.throws(() => env.DB.raw.exec("UPDATE gemini_accounting_review_decisions SET decision='REJECT'"), /append-only/);
  assert.throws(() => env.DB.raw.exec("DELETE FROM gemini_accounting_review_decisions"), /append-only/);
});

test("decisions require an exact matching cached review", async () => {
  const env = await setup();
  await persistCompletedReview(env, CACHE_SQL, row());
  assert.equal((await recordReviewDecision(env, decision({ cache_key: H("c") }))).status, 404);
  assert.equal((await recordReviewDecision(env, decision({ symbol: "XYZ" }))).status, 409);
  assert.equal((await recordReviewDecision(env, decision({ task: "cash_scope" }))).status, 409);
  assert.equal((await recordReviewDecision(env, decision({ input_hash: H("d") }))).status, 409);
  assert.equal((await recordReviewDecision(env, decision({ accession: "0000000000-25-999999" }))).status, 409);
  const ok = await recordReviewDecision(env, decision({ accession: "0000000000-25-000001" }));
  assert.equal(ok.status, 201);
  assert.equal(ok.decision.reviewer_identity_verified, false);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM gemini_accounting_review_decisions").get().n, 1);
});

test("payload validation: enums, OVERRIDE classification, lengths", () => {
  assert.equal(validateDecisionPayload(decision({ decision: "MAYBE" })).ok, false);
  assert.equal(validateDecisionPayload(decision({ decision: "OVERRIDE" })).ok, false);
  assert.equal(validateDecisionPayload(decision({ decision: "OVERRIDE", classification: "made_up" })).ok, false);
  assert.equal(validateDecisionPayload(decision({ decision: "OVERRIDE", classification: "conventional_debt" })).ok, true);
  assert.equal(validateDecisionPayload(decision({ classification: "conventional_debt" })).ok, false);
  assert.equal(validateDecisionPayload(decision({ rationale: "  " })).ok, false);
  assert.equal(validateDecisionPayload(decision({ rationale: "x".repeat(2001) })).ok, false);
  assert.equal(validateDecisionPayload(decision({ reviewer: "" })).ok, false);
  assert.equal(validateDecisionPayload(decision({ reviewer: "a".repeat(81) })).ok, false);
  assert.equal(validateDecisionPayload(decision({ cache_key: "short" })).ok, false);
  assert.equal(validateDecisionPayload(decision({ symbol: "bad symbol!" })).ok, false);
  assert.equal(validateDecisionPayload(null).ok, false);
});

test("reads are bounded, filtered and omit raw response payloads", async () => {
  const env = await setup();
  for (let i = 0; i < 3; i++) await persistCompletedReview(env, CACHE_SQL, row({ cacheKey: String(i).repeat(64), symbol: i === 2 ? "XYZ" : "ABC" }));
  const all = await listReviewHistory(env, { limit: 2, offset: 0 });
  assert.equal(all.length, 2);
  assert.equal("response_json" in all[0], false);
  assert.equal((await listReviewHistory(env, { symbol: "XYZ", limit: 10, offset: 0 })).length, 1);
  assert.equal((await listReviewDecisions(env, { limit: 10, offset: 0 })).length, 0);
  assert.equal(parsePageParams(new URLSearchParams("limit=9999")).limit, MAX_PAGE_SIZE);
  assert.equal(parsePageParams(new URLSearchParams("limit=0")).ok, false);
  assert.equal(parsePageParams(new URLSearchParams("offset=-1")).ok, false);
});

