import {
  getOwnerSession,
  assertRequestOrigin,
  readJsonBody,
  jsonResponse
} from "./auth.mjs";

const DEFAULTS = Object.freeze({
  alertMovePct: 4,
  maxPositionPct: 25
});

const LIMITS = Object.freeze({
  alertMovePct: { min: 1, max: 20, key: "alert_move_pct" },
  maxPositionPct: { min: 5, max: 50, key: "max_position_pct" }
});

function parseSettings(rows) {
  const values = new Map((rows || []).map((row) => [row.key, Number(row.value)]));
  return {
    alertMovePct: Number.isFinite(values.get("alert_move_pct")) ? values.get("alert_move_pct") : DEFAULTS.alertMovePct,
    maxPositionPct: Number.isFinite(values.get("max_position_pct")) ? values.get("max_position_pct") : DEFAULTS.maxPositionPct
  };
}

async function readSettings(env) {
  const result = await env.DB.prepare(
    "SELECT key, value FROM setting WHERE key IN ('alert_move_pct','max_position_pct')"
  ).all();
  return parseSettings(result.results);
}

export async function handleSettingsRequest(request, env, pathname) {
  if (pathname !== "/api/settings") return jsonResponse({ error: "Not found." }, 404);
  try {
    const session = await getOwnerSession(request, env);
    if (!session) return jsonResponse({ error: "Sign in required." }, 401);

    if (request.method === "GET") {
      return jsonResponse({ settings: await readSettings(env) });
    }
    if (request.method !== "PUT") return jsonResponse({ error: "Method not allowed." }, 405);

    assertRequestOrigin(request, env);
    const payload = await readJsonBody(request);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return jsonResponse({ error: "Provide valid settings." }, 400);
    }
    const keys = Object.keys(payload);
    if (!keys.length || keys.some((key) => !(key in LIMITS))) {
      return jsonResponse({ error: "Only alertMovePct and maxPositionPct can be updated." }, 400);
    }

    const statements = [];
    for (const key of keys) {
      const value = payload[key];
      const limit = LIMITS[key];
      if (typeof value !== "number" || !Number.isFinite(value) ||
          value < limit.min || value > limit.max) {
        return jsonResponse({
          error: key === "alertMovePct"
            ? "Alert threshold must be between 1% and 20%."
            : "Maximum position size must be between 5% and 50%."
        }, 400);
      }
      statements.push(env.DB.prepare(
        "INSERT INTO setting(key,value) VALUES(?,?) " +
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value"
      ).bind(limit.key, String(value)));
    }
    await env.DB.batch(statements);
    return jsonResponse({ settings: await readSettings(env) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "origin_rejected") return jsonResponse({ error: "Request origin rejected." }, 403);
    if (message === "body_too_large") return jsonResponse({ error: "Request too large." }, 413);
    if (message === "json_required") return jsonResponse({ error: "Content-Type must be application/json." }, 415);
    console.error("Settings request failed:", message);
    return jsonResponse({ error: "Settings request failed." }, 400);
  }
}
