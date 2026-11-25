import test from "node:test";
import assert from "node:assert/strict";
import { base64url, constantTimeEqual, parseCookies, sha256Hex, handleAuthRequest, decodeClientChallenge, decodeBase64urlBytes, extractAttestedCredentialId } from "./lib/auth.mjs";

test("base64url encodes without padding and uses URL-safe alphabet", () => {
  assert.equal(base64url(new Uint8Array([251, 255, 239])), "-__v");
});

test("cookie parser handles spaces, equals signs and duplicate cookie names safely", () => {
  assert.deepEqual({ ...parseCookies("a=1; __Host-session=abc==; a=2") }, {
    a: "1",
    "__Host-session": "abc=="
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

test("unknown auth routes fail closed", async () => {
  const response = await handleAuthRequest(new Request("https://folio.example/api/auth/unknown", { method: "POST" }), {}, "/api/auth/unknown");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Not found." });
});

test("auth mutation rejects missing Origin before database access", async () => {
  const response = await handleAuthRequest(new Request("https://folio.example/api/auth/login/options", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  }), { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: "https://folio.example" }, "/api/auth/login/options");
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Request origin rejected." });
});

test("auth endpoints do not allow method confusion", async () => {
  const response = await handleAuthRequest(new Request("https://folio.example/api/auth/login/verify", {
    method: "GET"
  }), {}, "/api/auth/login/verify");
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, POST, PATCH, DELETE");
});

test("auth mutations reject JSON lookalike media types", async () => {
  const response = await handleAuthRequest(new Request("https://folio.example/api/auth/login/verify", {
    method: "POST",
    headers: {
      origin: "https://folio.example",
      "content-type": "application/jsonp"
    },
    body: "{}"
  }), { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: "https://folio.example" }, "/api/auth/login/verify");
  assert.equal(response.status, 415);
});

test("challenge parser binds registration and login to different ceremony types", () => {
  const encode = (value) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const registration = encode({ type: "webauthn.create", challenge: "registration-challenge" });
  const login = encode({ type: "webauthn.get", challenge: "login-challenge" });
  assert.equal(decodeClientChallenge(registration), "registration-challenge");
  assert.equal(decodeClientChallenge(login), null);
  assert.equal(decodeClientChallenge(login, "webauthn.get"), "login-challenge");
  assert.equal(decodeClientChallenge("not-valid"), null);
});

test("auth rejects a matching Origin header on a mismatched request host", async () => {
  const response = await handleAuthRequest(new Request("https://attacker.example/api/auth/login/options", {
    method: "POST",
    headers: { origin: "https://folio.example", "content-type": "application/json" },
    body: "{}"
  }), { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: "https://folio.example" }, "/api/auth/login/options");
  assert.equal(response.status, 403);
});

test("passkey inventory is private without an owner session", async () => {
  const response = await handleAuthRequest(new Request("https://folio.example/api/auth/credentials", {
    method: "GET"
  }), { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: "https://folio.example" }, "/api/auth/credentials");
  assert.equal(response.status, 401);
});

test("passkey mutations require both same-origin and an owner session", async () => {
  const env = { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: "https://folio.example" };
  const response = await handleAuthRequest(new Request("https://folio.example/api/auth/credentials/credential-id", {
    method: "DELETE",
    headers: { origin: "https://folio.example", "content-type": "application/json" },
    body: "{}"
  }), env, "/api/auth/credentials/credential-id");
  assert.equal(response.status, 401);
});

test("sign out everywhere requires an owner session", async () => {
  const response = await handleAuthRequest(new Request("https://folio.example/api/auth/logout-all", {
    method: "POST",
    headers: { origin: "https://folio.example", "content-type": "application/json" },
    body: "{}"
  }), { APP_ENV: "production", RP_ID: "folio.example", RP_ORIGIN: "https://folio.example" }, "/api/auth/logout-all");
  assert.equal(response.status, 401);
});

test("authenticator data decoder accepts padded and unpadded base64url", () => {
  assert.deepEqual([...decodeBase64urlBytes("AQI=")], [1, 2]);
  assert.deepEqual([...decodeBase64urlBytes("AQI")], [1, 2]);
  assert.equal(decodeBase64urlBytes("%%%"), null);
});

test("registration credential ID must be present in authenticator attested data", () => {
  const authenticatorData = new Uint8Array(58);
  authenticatorData[32] = 0x41; // user present + attested credential data
  authenticatorData[53] = 0;
  authenticatorData[54] = 3;
  authenticatorData.set([1, 2, 3], 55);
  assert.deepEqual([...extractAttestedCredentialId(base64url(authenticatorData))], [1, 2, 3]);
  authenticatorData[32] = 0x01;
  assert.equal(extractAttestedCredentialId(base64url(authenticatorData)), null);
});
