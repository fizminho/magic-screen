import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { validatePushSubscription, sendPushToSubscription, handlePushRequest } from "./lib/push.mjs";

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function makeReceiver() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    privateKey: pair.privateKey,
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
      p256dh: b64url(publicKey),
      auth: b64url(auth)
    }
  };
}

async function makeVapidEnv() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const privateKey = new Uint8Array(Buffer.from(jwk.d, "base64url"));
  return {
    VAPID_PUBLIC_KEY: b64url(publicKey),
    VAPID_PRIVATE_KEY: b64url(privateKey),
    VAPID_SUBJECT: "mailto:owner@example.com"
  };
}

test("push subscription validator allows supported HTTPS services and validates key lengths", async () => {
  const { subscription } = await makeReceiver();
  assert.ok(validatePushSubscription({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
  }));
  assert.equal(validatePushSubscription({
    endpoint: "https://attacker.example/collect",
    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
  }), null);
  assert.equal(validatePushSubscription({
    endpoint: "http://fcm.googleapis.com/send",
    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
  }), null);
});

test("push sender encrypts payload and signs VAPID authorization", async () => {
  const { subscription } = await makeReceiver();
  const env = await makeVapidEnv();
  let captured;
  const response = await sendPushToSubscription(env, subscription, {
    title: "Magic Folio", body: "Push test", url: "/"
  }, async (url, options) => {
    captured = { url, options };
    return new Response(null, { status: 201 });
  });
  assert.equal(response.status, 201);
  assert.equal(captured.url, subscription.endpoint);
  assert.match(captured.options.headers.authorization, /^vapid t=.+, k=.+$/);
  assert.equal(captured.options.headers["content-encoding"], "aes128gcm");
  assert.ok(captured.options.body instanceof Uint8Array);
  assert.ok(captured.options.body.length > 100);
  assert.equal(captured.options.body[20], 65);
});

test("push sender refuses endpoints outside the provider allowlist", async () => {
  const env = await makeVapidEnv();
  await assert.rejects(
    sendPushToSubscription(env, {
      endpoint: "https://attacker.example/x",
      p256dh: "A".repeat(87), auth: "A".repeat(22)
    }, { title: "x" }),
    /push_endpoint_rejected/
  );
});

test("public push config exposes only the VAPID public key without requiring a session", async () => {
  const request = new Request("https://folio.example/api/push/config");
  const response = await handlePushRequest(request, { VAPID_PUBLIC_KEY: "public-key" }, new URL(request.url));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { enabled: true, publicKey: "public-key" });
});
