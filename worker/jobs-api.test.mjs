import test from "node:test";
import assert from "node:assert/strict";
import { handleJobRunsRequest, readRecentJobRuns } from "./lib/jobs.mjs";

test("job history returns only known scheduled jobs with bounded detail", async () => {
  const DB = { prepare(sql) {
    assert.match(sql, /ORDER BY started_at DESC,id DESC LIMIT 20/);
    return { async all() { return { results: [
      { job: "sec_refresh", startedAt: "2026-11-25T01:00:00.000Z", finishedAt: null, status: "running", detail: "x".repeat(1200) },
      { job: "unknown_internal_job", startedAt: "2026-11-25T00:00:00.000Z", status: "success", detail: "{}" }
    ] }; } };
  } };
  const runs = await readRecentJobRuns({ DB });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].job, "sec_refresh");
  assert.equal(runs[0].finishedAt, null);
  assert.equal(runs[0].detail.length, 1000);
});

test("job history endpoint requires an owner session", async () => {
  const request = new Request("https://folio.example/api/jobs/recent");
  const response = await handleJobRunsRequest(request, {}, new URL(request.url));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Sign in required." });
});

test("job history endpoint rejects unsupported methods", async () => {
  const request = new Request("https://folio.example/api/jobs/recent", { method: "POST" });
  const response = await handleJobRunsRequest(request, {}, new URL(request.url));
  assert.equal(response.status, 405);
});
