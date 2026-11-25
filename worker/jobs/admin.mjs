import { getOwnerSession, assertRequestOrigin, readJsonBody, jsonResponse } from "../lib/auth.mjs";
import { runSecRefresh } from "./refresh.mjs";
import { runScheduledResearchBrief } from "../lib/analysis.mjs";

const LOCK_KEY = "manual_job_lock";
const ALLOWED_JOBS = new Set(["sec_refresh", "research_brief"]);

export async function handleAdminJobsRequest(request, env, url, ctx) {
  try {
    const session = await getOwnerSession(request, env);
    if (!session) return jsonResponse({ error: "Sign in required." }, 401);

    if (request.method === "GET" && url.pathname === "/api/admin/jobs") {
      const rows = await env.DB.prepare(
        "SELECT job,started_at AS startedAt,finished_at AS finishedAt,status,detail " +
        "FROM job_run ORDER BY started_at DESC,id DESC LIMIT 20"
      ).all();
      return jsonResponse({ runs: rows.results || [] });
    }

    if (request.method !== "POST" || url.pathname !== "/api/admin/jobs/run") {
      return jsonResponse({ error: "Not found." }, 404);
    }
    assertRequestOrigin(request, env);
    const body = await readJsonBody(request);
    if (!body || !ALLOWED_JOBS.has(body.job)) return jsonResponse({ error: "Unsupported job." }, 400);

    const running = await env.DB.prepare(
      "SELECT id FROM job_run WHERE status='running' AND job IN ('sec_refresh','manual_sec_refresh','scheduled_research_brief','manual_research_brief','weekly_housekeeping') LIMIT 1"
    ).first();
    if (running) return jsonResponse({ error: "A scheduled job is already running." }, 409);

    const now = new Date();
    const nowIso = now.toISOString();
    const lockValue = new Date(now.getTime() + 30 * 60 * 1000).toISOString() + "|" + crypto.randomUUID();
    const lock = await env.DB.prepare(
      "INSERT INTO setting(key,value) VALUES(?,?) " +
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value " +
      "WHERE substr(setting.value,1,24) < ? RETURNING value"
    ).bind(LOCK_KEY, lockValue, nowIso).first();
    if (!lock) return jsonResponse({ error: "Another job trigger is already active." }, 409);

    const task = (async () => {
      try {
        if (body.job === "sec_refresh") await runSecRefresh(env, { triggerType: "manual" });
        else await runScheduledResearchBrief(env, { triggerType: "manual" });
      } catch (error) {
        console.error("Manual job failed:", error instanceof Error ? error.message.slice(0, 120) : "unknown");
      } finally {
        await env.DB.prepare("DELETE FROM setting WHERE key=? AND value=?").bind(LOCK_KEY, lockValue).run();
      }
    })();
    ctx.waitUntil(task);
    return jsonResponse({ accepted: true, job: body.job }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "origin_rejected") return jsonResponse({ error: "Request origin rejected." }, 403);
    if (message === "json_required") return jsonResponse({ error: "Content-Type must be application/json." }, 415);
    console.error("Admin jobs request failed:", message.slice(0, 100));
    return jsonResponse({ error: "Unable to process job request." }, 500);
  }
}
