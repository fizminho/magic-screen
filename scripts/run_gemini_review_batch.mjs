// GitHub Actions orchestrator for the resumable Gemini accounting-review batch.
// Calls the authenticated Worker one bounded page at a time, honours quota waits, and reports per issuer/task.
// Required env: WORKER_BASE_URL, UNIVERSE_SYNC_TOKEN. Optional: START_CURSOR, DRY_RUN, INCLUDE_FULL_SCOPE,
// MAX_NEW_CALLS, MAX_RUNTIME_MINUTES, SYMBOLS (optional comma-separated active tickers). The token is never printed.
import { appendFileSync } from "node:fs";
import { orchestrate } from "../worker/gemini-batch.mjs";

export async function runFromEnv(env = process.env, fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms))) {
  const base = String(env.WORKER_BASE_URL ?? "").replace(/\/$/, "");
  const token = env.UNIVERSE_SYNC_TOKEN;
  if (!base || !token) throw new Error("WORKER_BASE_URL and UNIVERSE_SYNC_TOKEN are required");
  const symbols = String(env.SYMBOLS ?? "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  const startedAt = Date.now();
  const deadlineMs = startedAt + Number(env.MAX_RUNTIME_MINUTES ?? 40) * 60_000;
  const lines = [];
  const callPage = async cursor => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetchImpl(base + "/api/fundamentals/edgartools/ai-review/batch", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + token },
        body: JSON.stringify({ cursor: cursor ?? env.START_CURSOR ?? null, dry_run: env.DRY_RUN === "true",
          include_full_scope: env.INCLUDE_FULL_SCOPE === "true", max_new_calls: Number(env.MAX_NEW_CALLS ?? 2),
          ...(symbols.length ? { symbols } : {}) })
      });
      if (response.status === 401 || response.status === 503 && attempt === 3) throw new Error("Worker returned HTTP " + response.status);
      if (response.ok) return response.json();
      // Transient Worker/provider errors: back off and retry the same page (idempotent via cache + locks).
      await sleep(Math.min(60_000, 2_000 * 2 ** attempt));
    }
    throw new Error("Worker page failed after retries");
  };
  const result = await orchestrate({ callPage, sleep, deadlineMs,
    log: issuer => lines.push("| " + issuer.symbol + " | " + issuer.status + " | " + issuer.tasks.map(t => t.task + ":" + t.status + (t.cached ? "(cached)" : "")).join(", ") + " |") });
  const summary = ["## Gemini accounting review batch", "", "Finished: **" + result.finished + "** (" + (result.reason ?? "all issuers processed") + "). Resume cursor: `" + (result.cursor ?? "") + "`",
    "", "Status totals: `" + JSON.stringify(result.totals) + "`", "", "| Issuer | Status | Tasks |", "|---|---|---|", ...lines].join("\n");
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary + "\n");
  console.log(summary);
  return result;
}

if (import.meta.url === "file://" + process.argv[1]) {
  runFromEnv().then(result => { if (!result.finished) process.exitCode = 2; if (result.totals.FAILED > 0) process.exitCode = 1; })
    .catch(error => { console.error("::error::" + error.message); process.exit(1); });
}
