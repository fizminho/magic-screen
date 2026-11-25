import test from "node:test";
import assert from "node:assert/strict";
import { base64url, constantTimeEqual, parseCookies, sha256Hex } from "./auth.mjs";

test("base64url encodes without padding and uses URL-safe alphabet", () => {
  assert.equal(base64url(new Uint8Array([251, 255, 239])), "-__v");
});

test("cookie parser handles spaces, equals signs and duplicate cookie names safely", () => {
  assert.deepEqual({ ...parseCookies("a=1; __Host-magicfolio_session=abc==; a=2") }, {
    a: "1",
    "__Host-magicfolio_session": "abc=="
  });
});

test("constantTimeEqual compares equal and unequal values without early length assumptions", () => {
  assert.equal(constantTimeEqual("same-secret", "same-secret"), true);
  assert.equal(constantTimeEqual("same-secret", "same-secreu"), false);
  assert.equal(constantTimeEqual("short", "much-longer"), false);
  assert.equal(constantTimeEqual("", ""), true);
});

test("session hashes are stable SHA-256 hex and do not expose the source token", async () => {
  const hash = await sha256Hex("session-token");
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, "session-token");
  assert.equal(await sha256Hex("session-token"), hash);
});
