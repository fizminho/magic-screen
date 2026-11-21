import test from "node:test";
import assert from "node:assert/strict";
import { runGeminiAccountingReview } from "./gemini-accounting-review.mjs";

class FakeD1 {
  cache = new Map();
  locks = new Map();

  prepare(sql) {
    const db = this;
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() {
        if (sql.includes("SELECT response_json")) {
          const row = db.cache.get(values[0]);
          return row ? { ...row } : null;
        }
        if (sql.includes("INSERT INTO gemini_accounting_review_locks")) {
          const [key, createdAt, staleBefore] = values;
          const existing = db.locks.get(key);
          if (existing && existing >= staleBefore) return null;
          db.locks.set(key, createdAt);
          return { cache_key: key };
        }
        throw new Error("Unexpected D1 first query: " + sql);
      },
      async run() {
        if (sql.includes("CREATE TABLE")) return { success: true };
        if (sql.includes("DELETE FROM gemini_accounting_review_locks")) {
          db.locks.delete(values[0]);
          return { success: true };
        }
        if (sql.includes("INSERT INTO gemini_accounting_review_cache")) {
          const [cache_key,symbol,accession,task,input_hash,prompt_version,policy_version,model,status,response_json,created_at,updated_at] = values;
          db.cache.set(cache_key, { response_json, model, created_at, status, symbol, accession, task, input_hash, prompt_version, policy_version, updated_at });
          return { success: true };
        }
        throw new Error("Unexpected D1 run query: " + sql);
      }
    };
  }
}

function reviewInput(DB) {
  return {
    env: { DB, GEMINI_API_KEY: "test-key" },
    input: {
      task: "debt_scope",
      symbol: "ABC",
      accession: "0000000000-25-000001",
      company: { balance_sheet_fact_review: { categories: {
        current_debt_candidates: { status: "ambiguous", candidate_count: 2, candidates: [
          { concept: "NotesPayableCurrent", label: "Notes payable", value: 100 },
          { concept: "CreditFacilityCurrent", label: "Credit facility", value: 200 }
        ] }
      }, unresolved_categories: [] } },
      resolver: { symbol: "ABC", accession: "0000000000-25-000001", fiscal_period: "2025-12-31",
        review_flags: ["ambiguous current debt candidates"],
        enterprise_value_candidate_review: { conventional_debt_status: "incomplete_or_ambiguous_debt_inputs" } }
    }
  };
}

test("identical concurrent Gemini reviews make one API call and later reuse the cache", async () => {
  const DB = new FakeD1();
  const { env, input } = reviewInput(DB);
  const originalFetch = globalThis.fetch;
  let apiCalls = 0;
  let releaseFetch;
  let signalFetchStarted;
  const fetchStarted = new Promise(resolve => { signalFetchStarted = resolve; });
  const fetchGate = new Promise(resolve => { releaseFetch = resolve; });

  globalThis.fetch = async () => {
    apiCalls += 1;
    signalFetchStarted();
    await fetchGate;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      task: "debt_scope",
      status: "REVIEW_REQUIRED",
      summary: "Two current-debt candidates require instrument-level review.",
      findings: [{ evidence_id: "current_debt:0", classification: "conventional_debt",
        rationale: "The filing label identifies a debt instrument, but aggregation remains unresolved.",
        confidence: "medium" }],
      unresolved_questions: ["Which candidate represents the reported current-debt total?"]
    }) }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const firstPromise = runGeminiAccountingReview(env, input);
    await fetchStarted;
    const duplicate = await runGeminiAccountingReview(env, input);
    assert.equal(duplicate.status, "IN_PROGRESS");
    assert.equal(duplicate.duplicate_request, true);
    assert.equal(apiCalls, 1);

    releaseFetch();
    const first = await firstPromise;
    assert.equal(first.status, "REVIEW_REQUIRED");
    assert.equal(first.cached, false);

    const cached = await runGeminiAccountingReview(env, input);
    assert.equal(cached.status, "REVIEW_REQUIRED");
    assert.equal(cached.cached, true);
    assert.equal(apiCalls, 1);
  } finally {
    releaseFetch();
    globalThis.fetch = originalFetch;
  }
});


test("returns structured quota exhaustion without caching or retaining the request lock", async () => {
  const DB = new FakeD1();
  const { env, input } = reviewInput(DB);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: {
    code: 429, message: "You exceeded your current quota, please check your plan and billing details."
  } }), { status: 429, headers: { "content-type": "application/json" } });
  try {
    const result = await runGeminiAccountingReview(env, input);
    assert.equal(result.status, "QUOTA_EXHAUSTED");
    assert.equal(result.review_state, "PENDING_RETRY");
    assert.equal(result.retryable, false);
    assert.equal(result.production_write, false);
    assert.equal(DB.cache.size, 0);
    assert.equal(DB.locks.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns a retryable rate-limit status for non-quota HTTP 429 responses", async () => {
  const DB = new FakeD1();
  const { env, input } = reviewInput(DB);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: {
    code: 429, message: "Too many requests. Please retry in 30 seconds."
  } }), { status: 429, headers: { "content-type": "application/json" } });
  try {
    const result = await runGeminiAccountingReview(env, input);
    assert.equal(result.status, "RATE_LIMITED");
    assert.equal(result.retryable, true);
    assert.equal(DB.cache.size, 0);
    assert.equal(DB.locks.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
