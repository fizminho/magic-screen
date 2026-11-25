import { getOwnerSession, jsonResponse } from "./auth.mjs";

const JOB_NAMES = new Set(["sec_refresh", "scheduled_research_brief", "weekly_housekeeping"]);

export async function readRecentJobRuns(env) {
  const result = await env.DB.prepare(
    "SELECT job,started_at AS startedAt,finished_at AS finishedAt,status,detail " +
    "FROM job_run WHERE job IN ('sec_refresh','scheduled_research_brief','weekly_housekeeping') " +
    "ORDER BY started_at DESC,id DESC LIMIT 20"
  ).all();
  return (result.results || []).filter((row) => JOB_NAMES.has(row.job)).map((row) => ({
    job: row.job,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt || null,
    status: row.status,
    detail: typeof row.detail === "string" ? row.detail.slice(0, 1000) : null
  }));
}

export async function handleJobRunsRequest(request, env, url) {
  if (url.pathname !== "/api/jobs/recent") return jsonResponse({ error: "Not found." }, 404);
  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed." }, 405, { allow: "GET" });
  try {
    const session = await getOwnerSession(request, env);
    if (!session) return jsonResponse({ error: "Sign in required." }, 401);
    return jsonResponse({ runs: await readRecentJobRuns(env) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("Job history request failed:", message.slice(0, 100));
    return jsonResponse({ error: "Unable to load scheduled job history." }, 503);
  }
}
