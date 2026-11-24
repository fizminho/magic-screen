import test from "node:test";
import assert from "node:assert/strict";
import { timingSafeEqual, checkBearer, isBearerAuthorized, cooldownElapsed, withSecurityHeaders, SECURITY_HEADERS, CSP, publicErrorMessage } from "./security.mjs";

const req = (auth) => new Request("https://x.test/api", { headers: auth === undefined ? {} : { Authorization: auth } });

test("timingSafeEqual matches only identical strings", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "abcd"), false);
  assert.equal(timingSafeEqual("", "a"), false);
  assert.equal(timingSafeEqual(undefined, undefined), true);
});

test("checkBearer fails closed when token is not configured", () => {
  assert.deepEqual(checkBearer(req("Bearer x"), undefined), { status: 503, error: "UNIVERSE_SYNC_TOKEN is not configured" });
  assert.equal(checkBearer(req("Bearer "), "").status, 503);
});

test("checkBearer rejects missing, malformed and wrong tokens", () => {
  for (const h of [undefined, "", "Bearer", "Bearer ", "Basic secret", "bearer secret", "Bearer wrong", "Bearer secret2"]) {
    assert.equal(checkBearer(req(h), "secret")?.status, 401, String(h));
  }
});

test("checkBearer accepts the exact bearer token", () => {
  assert.equal(checkBearer(req("Bearer secret"), "secret"), null);
  assert.equal(isBearerAuthorized(req("Bearer secret"), "secret"), true);
  assert.equal(isBearerAuthorized(req("Bearer nope"), "secret"), false);
});

test("cooldownElapsed gates repeat refreshes", () => {
  const now = Date.parse("2026-11-24T12:00:00Z");
  assert.equal(cooldownElapsed(null, 60000, now), true);
  assert.equal(cooldownElapsed("garbage", 60000, now), false);
  assert.equal(cooldownElapsed("2026-11-24T11:59:30Z", 60000, now), false);
  assert.equal(cooldownElapsed("2026-11-24T11:58:00Z", 60000, now), true);
  assert.equal(cooldownElapsed("2026-11-24T12:05:00Z", 60000, now), false); // clock skew
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
  assert.doesNotMatch(CSP, /unsafe-eval/);
});

test("publicErrorMessage hides internals", () => {
  const orig = console.error; console.error = () => {};
  try { assert.equal(publicErrorMessage(new Error("D1_ERROR: no such table secrets"), "Cached read failed"), "Cached read failed"); }
  finally { console.error = orig; }
});

// ---- Route access regression guard (reads the Worker source) ----
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const routeBlock = (needle) => {
  const start = src.indexOf(needle);
  assert.ok(start > 0, `route not found: ${needle}`);
  return src.slice(start, start + 700);
};

test("no hand-rolled bearer comparison remains (must use constant-time checkBearer)", () => {
  assert.doesNotMatch(src, /!==\s*"Bearer "\s*\+\s*env\./);
});

test("sensitive routes require the bearer token", () => {
  for (const route of [
    'url.pathname==="/api/fundamentals/sync"',
    'url.pathname==="/api/fundamentals/edgartools/ingest"',
    'url.pathname==="/api/admin/cleanup-sec-universe"',
    'url.pathname==="/api/universe/import-my"',
    'url.pathname==="/api/universe/us/stocks"',
  ]) assert.match(routeBlock(route), /checkBearer\(request,env\.UNIVERSE_SYNC_TOKEN\)/, route);
});

test("responses are wrapped with security headers and no wildcard CORS", () => {
  assert.match(src, /withSecurityHeaders\(await handleRequest\(request, env\)\)/);
  assert.doesNotMatch(src, /access-control-allow-origin/i);
});

test("anonymous refresh paths are rate-limited", () => {
  assert.match(src, /cooldownElapsed\(meta\?\.source_updated_at, MFI_FORCE_COOLDOWN_MS\)/);
  assert.match(src, /cooldownElapsed\(lastRefresh\?\.t, QUOTE_REFRESH_COOLDOWN_MS\)/);
});
