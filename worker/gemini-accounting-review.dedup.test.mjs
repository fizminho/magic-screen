import test from "node:test";
import assert from "node:assert/strict";
import { runGeminiAccountingReview } from "./gemini-accounting-review.mjs";

class FakeD1 {
  cache = new Map();
  locks = new Map();
  history = new Map();
  gateNextAllowedAt = null;

  async batch(statements) { const out = []; for (const s of statements) out.push(await s.run()); return out; }

  prepare(sql) {
    const db = this;
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() {
        if (sql.includes("INSERT INTO gemini_api_request_gate")) {
          const [initialNextAllowedAt, now, intervalMs, subtractInterval] = values;
          if (db.gateNextAllowedAt === null) db.gateNextAllowedAt = initialNextAllowedAt;
          else db.gateNextAllowedAt = Math.max(db.gateNextAllowedAt, now) + intervalMs;
          return { scheduled_at: db.gateNextAllowedAt - subtractInterval };
        }
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
      async all() {
        if (sql.includes("SELECT response_json") && sql.includes("task<>?")) {
          const [symbol, accession, task] = values;
          return { results: [...db.cache.values()].filter(row => row.symbol === symbol && row.accession === accession && row.task !== task).map(row => ({ response_json: row.response_json })) };
        }
        return { results: [] };
      },
      async run() {
        if (sql.includes("CREATE ")) return { success: true };
        if (sql.includes("DELETE FROM gemini_accounting_review_locks")) {
          db.locks.delete(values[0]);
          return { success: true };
        }
        if (sql.includes("INSERT INTO gemini_accounting_review_cache")) {
          const [cache_key,symbol,accession,task,input_hash,prompt_version,policy_version,model,status,response_json,created_at,updated_at] = values;
          db.cache.set(cache_key, { response_json, model, created_at, status, symbol, accession, task, input_hash, prompt_version, policy_version, updated_at });
          return { success: true };
        }
        if (sql.includes("INSERT OR IGNORE INTO gemini_accounting_review_history")) {
          const [cache_key,symbol,accession,task,input_hash,prompt_version,policy_version,model,status,response_json,created_at] = values;
          if (!db.history.has(cache_key)) db.history.set(cache_key, { cache_key,symbol,accession,task,input_hash,model,status,created_at });
          return { success: true };
        }
        throw new Error("Unexpected D1 run query: " + sql);
      }
    };
  }
}

function reviewInput(DB) {
  return {
    env: { DB, GEMINI_API_KEY: "test-key", GEMINI_MIN_REQUEST_INTERVAL_MS: "1000", GEMINI_MODEL_FALLBACKS: "gemini-3.5-flash-lite" },
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
      findings: [{ evidence_id: "current_debt:0", evidence_ids: ["current_debt:0"], classification: "conventional_debt",
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
    // Ledger: exactly one history row for the one completed review; cache hits and in-flight duplicates add none.
    assert.equal(DB.history.size, 1);
    assert.equal([...DB.history.values()][0].status, "REVIEW_REQUIRED");
  } finally {
    releaseFetch();
    globalThis.fetch = originalFetch;
  }
});


test("fails over to another model on quota exhaustion and returns quota exhausted only when the pool is exhausted", async () => {
  const DB = new FakeD1();
  const { env, input } = reviewInput(DB);
  const originalFetch = globalThis.fetch;
  const requestedModels = [];
  globalThis.fetch = async url => {
    requestedModels.push(String(url).split("/models/")[1].split(":")[0]);
    return new Response(JSON.stringify({ error: { code: 429, message: "You exceeded your current quota, please check your plan and billing details." } }),
      { status: 429, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await runGeminiAccountingReview(env, input);
    assert.equal(result.status, "QUOTA_EXHAUSTED");
    assert.equal(result.review_state, "PENDING_RETRY");
    assert.equal(result.retryable, false);
    assert.equal(result.production_write, false);
    assert.equal(result.attempts, 2);
    assert.deepEqual(requestedModels, ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);
    assert.equal(DB.cache.size, 0);
    assert.equal(DB.locks.size, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("moves to the next model after a transient rate limit instead of retrying the same model", async () => {
  const DB = new FakeD1();
  const { env, input } = reviewInput(DB);
  const originalFetch = globalThis.fetch;
  const requestedModels = [];
  globalThis.fetch = async url => {
    requestedModels.push(String(url).split("/models/")[1].split(":")[0]);
    return new Response(JSON.stringify({ error: { code: 429, message: "Too many requests. Please retry in 30 seconds." } }),
      { status: 429, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await runGeminiAccountingReview(env, input);
    assert.equal(result.status, "MODEL_FALLBACK_EXHAUSTED");
    assert.equal(result.retryable, true);
    assert.equal(result.attempts, 2);
    assert.deepEqual(requestedModels, ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);
    assert.equal(DB.cache.size, 0);
    assert.equal(DB.locks.size, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("uses the next model successfully after the preferred model quota is exhausted", async () => {
  const DB = new FakeD1();
  const { env, input } = reviewInput(DB);
  const originalFetch = globalThis.fetch;
  const requestedModels = [];
  globalThis.fetch = async url => {
    const model = String(url).split("/models/")[1].split(":")[0];
    requestedModels.push(model);
    if (model === "gemini-3.1-flash-lite") {
      return new Response(JSON.stringify({ error: { code: 429, message: "Daily quota exceeded." } }), { status: 429 });
    }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      task: "debt_scope", status: "REVIEW_REQUIRED", summary: "Second model completed the review.",
      findings: [{ evidence_id: "current_debt:0", evidence_ids: ["current_debt:0"], classification: "conventional_debt",
        rationale: "The filing identifies a debt instrument.", confidence: "medium" }], unresolved_questions: []
    }) }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await runGeminiAccountingReview(env, input);
    assert.equal(result.status, "REVIEW_REQUIRED");
    assert.equal(result.model, "gemini-3.5-flash-lite");
    assert.equal(result.attempts, 2);
    assert.deepEqual(requestedModels, ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);
    assert.equal(DB.cache.size, 1);
    assert.equal(DB.locks.size, 0);
  } finally { globalThis.fetch = originalFetch; }
});


test("model pool includes supported text models and excludes unsupported model families", async () => {
  const { getGeminiModelCandidates } = await import("./gemini-accounting-review.mjs");
  assert.deepEqual(getGeminiModelCandidates("gemini-2.5-flash-lite", "gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.8-flash-tts"),
    ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);
  assert.deepEqual(getGeminiModelCandidates(null, null), [
    "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite",
    "gemini-3.6-flash", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-3.8-flash", "gemini-4-hydrogen"
  ]);
});
