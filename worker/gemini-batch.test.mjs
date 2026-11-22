import assert from "node:assert/strict";
import testCase from "node:test";
import { BATCH_STATUS as S, classifyReviewOutcome, selectBatchTasks, runBatchPage, orchestrate } from "./gemini-batch.mjs";
import { getBatchExitCode } from "../scripts/run_gemini_review_batch.mjs";

const supported = (tasks, accession = "acc") => ({ state: "supported", accession, fiscalPeriod: "2025", company: {}, resolver: {}, escalations: tasks.map(task => ({ task })) });
const loader = map => async symbol => map[symbol] ?? { state: "awaiting_evidence" };

testCase("quota exhaustion is never COMPLETED; accepted and review outcomes map correctly", () => {
  assert.equal(classifyReviewOutcome({ status: "QUOTA_EXHAUSTED", review_state: "PENDING_RETRY" }), S.QUOTA_EXHAUSTED);
  assert.equal(classifyReviewOutcome({ status: "MODEL_FALLBACK_EXHAUSTED", review_state: "PENDING_RETRY" }), S.PENDING_RETRY);
  assert.equal(classifyReviewOutcome({ status: "IN_PROGRESS" }), S.PROCESSING);
  assert.equal(classifyReviewOutcome({ status: "NOT_APPLICABLE" }), S.SKIPPED_DETERMINISTIC);
  assert.equal(classifyReviewOutcome({ status: "ACCEPTED_CANDIDATE" }), S.COMPLETED);
  assert.equal(classifyReviewOutcome({ status: "CONFLICTING_EVIDENCE" }), S.REVIEW_REQUIRED);
  assert.equal(classifyReviewOutcome({ status: "weird" }), S.FAILED);
});

testCase("full_scope is opt-in so combined evidence is not paid for twice", () => {
  const esc = [{ task: "cash_scope" }, { task: "full_scope" }];
  assert.deepEqual(selectBatchTasks(esc), ["cash_scope"]);
  assert.deepEqual(selectBatchTasks(esc, { includeFullScope: true }), ["cash_scope", "full_scope"]);
});

testCase("deterministic-resolved, unsupported and awaiting issuers never reach Gemini and stay visible", async () => {
  const calls = [];
  const page = await runBatchPage({ symbols: ["A", "B", "C"], loadIssuer: loader({ A: supported([]), B: { state: "unsupported" } }), runReview: async i => { calls.push(i); return {}; } });
  assert.equal(calls.length, 0);
  assert.equal(page.counts.SKIPPED_DETERMINISTIC, 1);
  assert.equal(page.counts.UNSUPPORTED, 1);
  assert.equal(page.counts.AWAITING_EVIDENCE, 1);
  assert.equal(page.done, true);
});

testCase("cached results do not consume the new-call budget and are not re-sent", async () => {
  const sent = [];
  const runReview = async ({ symbol, task }) => { sent.push(symbol + task); return { status: "ACCEPTED_CANDIDATE", cached: symbol === "A" }; };
  const page = await runBatchPage({ symbols: ["A", "B"], loadIssuer: loader({ A: supported(["cash_scope", "debt_scope"]), B: supported(["cash_scope"]) }), runReview, maxNewCalls: 1 });
  assert.equal(page.newCalls, 1);
  assert.equal(page.counts.COMPLETED, 3);
  assert.equal(page.done, true);
});

testCase("page stops at the new-call budget and resumes without losing the interrupted issuer", async () => {
  const done = new Set();
  const runReview = async ({ symbol, task }) => { const key = symbol + task; const cached = done.has(key); done.add(key); return { status: "ACCEPTED_CANDIDATE", cached }; };
  const map = { A: supported(["cash_scope", "debt_scope"]), B: supported(["lease_scope"]) };
  const first = await runBatchPage({ symbols: ["A", "B"], loadIssuer: loader(map), runReview, maxNewCalls: 1 });
  assert.equal(first.done, false);
  assert.equal(first.stoppedBecause, "max_new_calls");
  assert.equal(first.cursor, null); // A was interrupted, so it is revisited
  const second = await runBatchPage({ symbols: ["A", "B"], cursor: first.cursor, loadIssuer: loader(map), runReview, maxNewCalls: 1 });
  const third = await runBatchPage({ symbols: ["A", "B"], cursor: second.cursor, loadIssuer: loader(map), runReview, maxNewCalls: 1 });
  assert.equal(third.done, true);
  assert.equal(done.size, 3);
});

testCase("quota exhaustion stops the page, reports retry delay, and is not completed", async () => {
  const page = await runBatchPage({ symbols: ["A", "B"], loadIssuer: loader({ A: supported(["cash_scope"]), B: supported(["cash_scope"]) }),
    runReview: async () => ({ status: "QUOTA_EXHAUSTED", review_state: "PENDING_RETRY", retry_after_ms: 45_000 }) });
  assert.equal(page.stoppedBecause, "quota_exhausted");
  assert.equal(page.retryAfterMs, 45_000);
  assert.equal(page.counts.COMPLETED, 0);
  assert.equal(page.counts.QUOTA_EXHAUSTED, 1);
  assert.equal(page.done, false);
});

testCase("transient errors are PENDING_RETRY, contract errors are FAILED, and the batch keeps going", async () => {
  const page = await runBatchPage({ symbols: ["A"], loadIssuer: loader({ A: supported(["cash_scope", "debt_scope", "lease_scope"]) }),
    runReview: async ({ task }) => { if (task === "cash_scope") throw new Error("Gemini API HTTP 503: unavailable"); if (task === "debt_scope") throw new Error("Gemini response contract error: bad id"); return { status: "ACCEPTED_CANDIDATE" }; } });
  assert.deepEqual([page.counts.PENDING_RETRY, page.counts.FAILED, page.counts.COMPLETED], [1, 1, 1]);
});

testCase("dry run plans tasks and never calls Gemini", async () => {
  let called = 0;
  const page = await runBatchPage({ symbols: ["A"], loadIssuer: loader({ A: supported(["cash_scope", "debt_scope"]) }), runReview: async () => { called++; return {}; }, dryRun: true });
  assert.equal(called, 0);
  assert.equal(page.counts.PENDING, 2);
  assert.equal(page.issuers[0].status, S.PENDING);
});

testCase("orchestrator waits out quota with the same cursor, then finishes", async () => {
  const waits = [];
  let n = 0;
  const pages = [
    { done: false, cursor: "A", stoppedBecause: "max_new_calls", retryAfterMs: 0, counts: { COMPLETED: 1 }, issuers: [] },
    { done: false, cursor: "A", stoppedBecause: "quota_exhausted", retryAfterMs: 30_000, counts: { QUOTA_EXHAUSTED: 1 }, issuers: [] },
    { done: true, cursor: "B", stoppedBecause: null, retryAfterMs: 0, counts: { COMPLETED: 2 }, issuers: [] }
  ];
  const seen = [];
  const result = await orchestrate({ callPage: async cursor => { seen.push(cursor); return pages[n++]; }, sleep: async ms => { waits.push(ms); } });
  assert.equal(result.finished, true);
  assert.deepEqual(waits, [30_000]);
  assert.deepEqual(seen, [null, "A", "A"]);
  assert.equal(result.totals.COMPLETED, 3);
});

testCase("orchestrator aborts on repeated no-progress and respects its deadline", async () => {
  const stuck = { done: false, cursor: "A", stoppedBecause: "max_tasks", retryAfterMs: 0, counts: {}, issuers: [] };
  const result = await orchestrate({ callPage: async () => stuck, sleep: async () => {} });
  assert.equal(result.reason, "no_progress");
  let t = 0;
  const timed = await orchestrate({ callPage: async () => ({ ...stuck, cursor: String(t) }), sleep: async () => {}, now: () => (t += 10), deadlineMs: 25 });
  assert.equal(timed.finished, false);
});


testCase("batch exit code distinguishes orchestration failure, task failure and review backlog", () => {
  assert.equal(getBatchExitCode({ finished: false, totals: { FAILED: 0 } }), 1);
  assert.equal(getBatchExitCode({ finished: true, totals: { FAILED: 1, REVIEW_REQUIRED: 4, UNSUPPORTED: 1 } }), 2);
  assert.equal(getBatchExitCode({ finished: true, totals: { FAILED: 0, REVIEW_REQUIRED: 4, UNSUPPORTED: 1 } }), 0);
  assert.equal(getBatchExitCode({ finished: true, totals: {} }), 0);
});

testCase("unclassified provider outcomes are surfaced as task errors", async () => {
  const page = await runBatchPage({ symbols: ["A"], loadIssuer: loader({ A: supported(["debt_scope"]) }),
    runReview: async () => ({ status: "UNEXPECTED_PROVIDER_STATE", message: "provider returned malformed payload" }) });
  assert.equal(page.counts.FAILED, 1);
  assert.equal(page.issuers[0].tasks[0].error, "provider returned malformed payload");
});
