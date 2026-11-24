import test from "node:test";
import assert from "node:assert/strict";
import { cooldownElapsed, withSecurityHeaders, SECURITY_HEADERS, CSP, publicErrorMessage } from "./security.mjs";
import { readFileSync } from "node:fs";

test("cooldownElapsed gates repeated MFI refreshes", () => {
  const now = Date.parse("2026-11-24T12:00:00Z");
  assert.equal(cooldownElapsed(null, 60000, now), true);
  assert.equal(cooldownElapsed("garbage", 60000, now), false);
  assert.equal(cooldownElapsed("2026-11-24T11:59:30Z", 60000, now), false);
  assert.equal(cooldownElapsed("2026-11-24T11:58:00Z", 60000, now), true);
  assert.equal(cooldownElapsed("2026-11-24T12:05:00Z", 60000, now), false);
});

test("withSecurityHeaders adds headers, keeps status/body and works on immutable responses", async () => {
  const res = withSecurityHeaders(Response.redirect("https://x.test/", 302));
  assert.equal(res.status, 302);
  for (const k of Object.keys(SECURITY_HEADERS)) assert.ok(res.headers.get(k), k);
  const ok = withSecurityHeaders(new Response("hi", { status: 200 }));
  assert.equal(await ok.text(), "hi");
});

test("CSP blocks framing, plugins and foreign scripts", () => {
  assert.match(CSP, /frame-ancestors 'none'/);
  assert.match(CSP, /object-src 'none'/);
  assert.match(CSP, /script-src 'self'(;|$)/);
  assert.doesNotMatch(CSP, /unsafe-eval|fonts\.googleapis|fonts\.gstatic/);
});

test("publicErrorMessage hides internals", () => {
  const orig = console.error; console.error = () => {};
  try { assert.equal(publicErrorMessage(new Error("D1_ERROR: no such table secrets"), "Cached read failed"), "Cached read failed"); }
  finally { console.error = orig; }
});

test("Worker exposes only the MFI research API and no user/admin/accounting routes", () => {
  const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  for (const route of ["/api/health", "/api/pipeline/status", "/api/mfi/screen", "/api/stocks"]) assert.ok(src.includes(route), route);
  for (const retired of ["/api/fundamentals/", "/api/admin/", "/api/universe/", "/api/ai/", "UNIVERSE_SYNC_TOKEN", "GEMINI_API_KEY", "ScheduledController", "Yahoo Finance"]) {
    assert.ok(!src.includes(retired), retired);
  }
  assert.match(src, /cooldownElapsed\(meta\?\.source_updated_at, MFI_FORCE_COOLDOWN_MS\)/);
  assert.match(src, /withSecurityHeaders\(await handleRequest\(request, env\)\)/);
});
