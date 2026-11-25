import { getOwnerSession, assertRequestOrigin, readJsonBody, jsonResponse } from "../lib/auth.mjs";
import { runSecRefresh } from "./refresh.mjs";
import { runScheduledResearchBrief } from "../lib/analysis.mjs";

const JOBS = new Set(["sec_refresh", "research_brief"]);
const LOCK_KEY = "manual_job_lock";
const LOCK_TTL_MS = 30 * 60 * 1000;

async function listRuns(env) {
  const result = await env.DB.prepare(
    "SELECT id,job,started_at AS startedAt,finished_at AS finishedAt,status,detail " +
    "FROM job_run WHERE job IN ('manual_sec_refresh','manual_research_brief','sec_refresh','scheduled_research_brief') " +
    "ORDER BY id DESC LIMIT 20"
  ).all();
  return (result.results || []).map((row) => {
    let detail = row.detail;
    try { detail = JSON.parse(detail); } catch { /* Keep legacy text details readable. */ }
    return { ...row, detail };
  });
}

export async function handleAdminJobsRequest(request, env, url, ctx) {
  try {
    const session = await getOwnerSession(request, env);
    if (!session) return jsonResponse({ error: "Sign in required." }, 401);

    if (request.method === "GET" && url.pathname === "/api/admin/jobs") {
      return jsonResponse({ runs: await listRuns(env) });
    }
    if (request.method !== "POST" || url.pathname !== "/api/admin/jobs/run") {
      return jsonResponse({ error: "Not found." }, 404);
    }

    assertRequestOrigin(request, env);
    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some((key) => key !== "job") || !JOBS.has(body.job)) {
      return jsonResponse({ error: "Choose a supported job." }, 400);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS).toISOString();
    const lockValue = expiresAt + "|" + crypto.randomUUID();
    const lock = await env.DB.prepare(
      "INSERT INTO setting(key,value) VALUES(?,?) " +
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value " +
      "WHERE substr(setting.value,1,24) < ? RETURNING value"
    ).bind(LOCK_KEY, lockValue, now.toISOString()).first();
    if (!lock) {
      return jsonResponse({ error: "Another manual job is already running. Refresh execution history before trying again." }, 409);
    }

    const task = (async () => {
      try {
        if (body.job === "sec_refresh") {
          await runSecRefresh(env, { triggerType: "manual" });
        } else {
          await runScheduledResearchBrief(env, { triggerType: "manual" });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        console.error("Manual job failed:", body.job, message.slice(0, 120));
      } finally {
        await env.DB.prepare("DELETE FROM setting WHERE key=? AND value=?")
          .bind(LOCK_KEY, lockValue).run().catch(() => undefined);
      }
    })();

    ctx.waitUntil(task);
    return jsonResponse({ accepted: true, job: body.job, startedAt: now.toISOString() }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "origin_rejected") return jsonResponse({ error: "Request origin rejected." }, 403);
    if (message === "json_required") return jsonResponse({ error: "Content-Type must be application/json." }, 415);
    if (message === "body_too_large") return jsonResponse({ error: "Request too large." }, 413);
    console.error("Admin jobs request failed:", message);
    return jsonResponse({ error: "Unable to process job request." }, 400);
  }
}
