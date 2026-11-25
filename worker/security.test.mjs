import test from "node:test";
import assert from "node:assert/strict";
import { withSecurityHeaders, SECURITY_HEADERS, CSP, publicErrorMessage } from "./security.mjs";
import { readFileSync } from "node:fs";

test("withSecurityHeaders preserves status/body and works on immutable responses", async () => {
  const res = withSecurityHeaders(Response.redirect("https://example.test/", 302));
  assert.equal(res.status, 302);
  for (const key of Object.keys(SECURITY_HEADERS)) assert.ok(res.headers.get(key), key);
  const ok = withSecurityHeaders(new Response("healthy", { status: 200 }));
  assert.equal(await ok.text(), "healthy");
});

test("CSP blocks inline styles, framing, plugins and foreign scripts", () => {
  assert.match(CSP, /style-src 'self'(;|$)/);
  assert.match(CSP, /frame-ancestors 'none'/);
  assert.match(CSP, /object-src 'none'/);
  assert.match(CSP, /script-src 'self'(;|$)/);
  assert.match(CSP, /connect-src 'self' https:\/\/api\.marketdata\.app/);
  assert.doesNotMatch(CSP, /unsafe-inline|unsafe-eval|fonts\.googleapis|fonts\.gstatic/);
});

test("publicErrorMessage hides internals from clients", () => {
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(publicErrorMessage(new Error("D1_ERROR: no such table private_data"), "Request failed"), "Request failed");
  } finally {
    console.error = original;
  }
});

test("Worker has no legacy MFI endpoints, runtime DDL or provider session secret", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.ok(source.includes("/api/health"));
  for (const retired of ["/api/" + "mfi/screen", "/api/" + "stocks", "/api/" + "pipeline/status", "MFI_" + "SESSION_COOKIE", "CREATE " + "TABLE", "syncMagic" + "FormulaUniverse", "Magic Formula " + "Investing"]) {
    assert.ok(!source.includes(retired), retired);
  }
});
