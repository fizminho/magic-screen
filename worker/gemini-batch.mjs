// Resumable batch layer over the per-task Gemini accounting review.
//
// Per-task caching, in-flight coalescing (locks), quota handling and request pacing already live in
// gemini-accounting-review.mjs (runGeminiAccountingReview). This module adds the universe-level loop:
// deterministic-first planning, bounded pages, a symbol cursor for resumption, and batch statuses.
// It is dependency-injected so the control flow can be tested without D1 or Gemini.

export const BATCH_STATUS = Object.freeze({
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  PENDING_RETRY: "PENDING_RETRY",
  QUOTA_EXHAUSTED: "QUOTA_EXHAUSTED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  FAILED: "FAILED",
  SKIPPED_DETERMINISTIC: "SKIPPED_DETERMINISTIC",
  UNSUPPORTED: "UNSUPPORTED",
  AWAITING_EVIDENCE: "AWAITING_EVIDENCE"
});

// Map a per-task review result onto a batch status. Quota exhaustion is never COMPLETED.
export function classifyReviewOutcome(result) {
  const status = String(result?.status ?? "");
  if (status === "QUOTA_EXHAUSTED") return BATCH_STATUS.QUOTA_EXHAUSTED;
  if (result?.review_state === "PENDING_RETRY" || status === "MODEL_FALLBACK_EXHAUSTED") return BATCH_STATUS.PENDING_RETRY;
  if (status === "IN_PROGRESS") return BATCH_STATUS.PROCESSING;
  if (status === "NOT_APPLICABLE") return BATCH_STATUS.SKIPPED_DETERMINISTIC;
  if (status === "ACCEPTED_CANDIDATE") return BATCH_STATUS.COMPLETED;
  if (["REVIEW_REQUIRED", "CONFLICTING_EVIDENCE", "INSUFFICIENT_EVIDENCE"].includes(status)) return BATCH_STATUS.REVIEW_REQUIRED;
  return BATCH_STATUS.FAILED;
}

export function selectBatchTasks(escalations, { includeFullScope = false } = {}) {
  // full_scope re-sends the union of the specific tasks' evidence. It is opt-in so unchanged,
  // already-reviewed evidence is not paid for twice.
  return (Array.isArray(escalations) ? escalations : [])
    .map(item => String(item.task))
    .filter(task => includeFullScope || task !== "full_scope");
}

function emptyCounts() {
  return Object.fromEntries(Object.values(BATCH_STATUS).map(status => [status, 0]));
}

/**
 * Process one bounded page of the active universe.
 *
 * symbols       sorted active US symbols (resume with symbols strictly greater than `cursor`)
 * loadIssuer    async (symbol) => { state: "supported"|"unsupported"|"awaiting_evidence", accession, fiscalPeriod, company, resolver, escalations }
 * runReview     async ({symbol, accession, fiscalPeriod, company, resolver, task}) => per-task review result (may throw)
 * maxNewCalls   stop after this many non-cached Gemini calls (cost/latency bound per Worker request)
 * maxTasks      stop after this many task evaluations including cached ones (subrequest bound)
 * dryRun        plan only: never call runReview
 */
export async function runBatchPage({ symbols, cursor = null, loadIssuer, runReview, maxNewCalls = 2, maxTasks = 12, includeFullScope = false, dryRun = false }) {
  const pending = symbols.filter(symbol => cursor == null || symbol > cursor);
  const counts = emptyCounts();
  const issuers = [];
  let newCalls = 0;
  let taskEvaluations = 0;
  let retryAfterMs = 0;
  let stoppedBecause = null;
  let lastCompleted = cursor;

  for (const symbol of pending) {
    const issuer = await loadIssuer(symbol);
    if (issuer.state !== "supported") {
      const status = issuer.state === "awaiting_evidence" ? BATCH_STATUS.AWAITING_EVIDENCE : BATCH_STATUS.UNSUPPORTED;
      counts[status]++;
      issuers.push({ symbol, status, tasks: [] });
      lastCompleted = symbol;
      continue;
    }
    const tasks = selectBatchTasks(issuer.escalations, { includeFullScope });
    if (tasks.length === 0) {
      counts[BATCH_STATUS.SKIPPED_DETERMINISTIC]++;
      issuers.push({ symbol, status: BATCH_STATUS.SKIPPED_DETERMINISTIC, accession: issuer.accession, tasks: [] });
      lastCompleted = symbol;
      continue;
    }
    const taskResults = [];
    let issuerIncomplete = false;
    for (const task of tasks) {
      if (taskEvaluations >= maxTasks || newCalls >= maxNewCalls) { issuerIncomplete = true; stoppedBecause = stoppedBecause ?? (newCalls >= maxNewCalls ? "max_new_calls" : "max_tasks"); break; }
      if (dryRun) { taskResults.push({ task, status: BATCH_STATUS.PENDING }); counts[BATCH_STATUS.PENDING]++; continue; }
      taskEvaluations++;
      let result;
      try {
        result = await runReview({ symbol, accession: issuer.accession, fiscalPeriod: issuer.fiscalPeriod, company: issuer.company, resolver: issuer.resolver, task });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Transient provider/network problems are retryable; contract/validation errors are FAILED and surfaced.
        const transient = /HTTP (429|5\d\d)|timeout|fetch failed|network/i.test(message);
        const status = transient ? BATCH_STATUS.PENDING_RETRY : BATCH_STATUS.FAILED;
        counts[status]++;
        taskResults.push({ task, status, error: message.slice(0, 300) });
        continue;
      }
      const status = classifyReviewOutcome(result);
      if (!result.cached && status !== BATCH_STATUS.SKIPPED_DETERMINISTIC && status !== BATCH_STATUS.PROCESSING) newCalls++;
      counts[status]++;
      taskResults.push({ task, status, cached: !!result.cached, model: result.model ?? null, review_status: result.status ?? null });
      if (status === BATCH_STATUS.QUOTA_EXHAUSTED) {
        // Do not hammer the provider: stop the page and tell the orchestrator how long to wait.
        retryAfterMs = Math.max(retryAfterMs, Number(result.retry_after_ms ?? 0) || 60_000);
        stoppedBecause = "quota_exhausted";
        issuerIncomplete = true;
        break;
      }
    }
    issuers.push({ symbol, accession: issuer.accession, status: issuerIncomplete ? BATCH_STATUS.PENDING : rollUp(taskResults), tasks: taskResults });
    if (stoppedBecause) break;
    lastCompleted = symbol;
  }

  // An issuer interrupted mid-way is revisited from the previous cursor; completed tasks come back
  // as cache hits, so resumption never re-sends unchanged evidence.
  const done = !stoppedBecause && (pending.length === 0 || lastCompleted === pending[pending.length - 1]);
  return { cursor: lastCompleted, done, stoppedBecause, retryAfterMs, counts, issuers, newCalls, taskEvaluations, dryRun };
}

function rollUp(taskResults) {
  const statuses = taskResults.map(task => task.status);
  for (const status of [BATCH_STATUS.QUOTA_EXHAUSTED, BATCH_STATUS.PENDING_RETRY, BATCH_STATUS.PROCESSING, BATCH_STATUS.FAILED, BATCH_STATUS.REVIEW_REQUIRED]) {
    if (statuses.includes(status)) return status;
  }
  return statuses.length && statuses.every(s => s === BATCH_STATUS.SKIPPED_DETERMINISTIC) ? BATCH_STATUS.SKIPPED_DETERMINISTIC : BATCH_STATUS.COMPLETED;
}

// Orchestrator loop (used by scripts/run_gemini_review_batch.mjs). `callPage(cursor)` returns a runBatchPage result.
export async function orchestrate({ callPage, sleep, maxPages = 200, maxWaitMs = 15 * 60_000, now = () => Date.now(), deadlineMs = Infinity, log = () => {} }) {
  let cursor = null;
  const totals = emptyCounts();
  let pages = 0;
  let quotaWaits = 0;
  let sameCursorStalls = 0;
  while (pages < maxPages && now() < deadlineMs) {
    const page = await callPage(cursor);
    pages++;
    for (const [status, n] of Object.entries(page.counts)) totals[status] = (totals[status] ?? 0) + n;
    for (const issuer of page.issuers) log(issuer);
    if (page.done) return { finished: true, cursor: page.cursor, pages, totals, quotaWaits };
    if (page.stoppedBecause === "quota_exhausted") {
      quotaWaits++;
      const wait = Math.min(maxWaitMs, page.retryAfterMs || 60_000);
      if (now() + wait >= deadlineMs) return { finished: false, cursor, pages, totals, quotaWaits, reason: "quota_exhausted_deadline" };
      await sleep(wait);
      continue; // same cursor: completed tasks are cache hits
    }
    sameCursorStalls = page.cursor === cursor ? sameCursorStalls + 1 : 0;
    if (sameCursorStalls >= 3) return { finished: false, cursor, pages, totals, quotaWaits, reason: "no_progress" };
    cursor = page.cursor;
  }
  return { finished: false, cursor, pages, totals, quotaWaits, reason: pages >= maxPages ? "max_pages" : "deadline" };
}
