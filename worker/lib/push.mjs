import {
  getOwnerSession,
  assertRequestOrigin,
  readJsonBody,
  jsonResponse
} from "./auth.mjs";

const encoder = new TextEncoder();
const MAX_SUBSCRIPTIONS = 5;
const MAX_PAYLOAD_BYTES = 3800;

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid_base64url");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function concatBytes(...parts) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function isAllowedPushEndpoint(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    return host === "fcm.googleapis.com" ||
      host === "web.push.apple.com" ||
      host === "updates.push.services.mozilla.com" ||
      host.endsWith(".notify.windows.com");
  } catch {
    return false;
  }
}

export function validatePushSubscription(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !isAllowedPushEndpoint(value.endpoint) || !value.keys || typeof value.keys !== "object") return null;
  try {
    const p256dh = decodeBase64Url(value.keys.p256dh);
    const auth = decodeBase64Url(value.keys.auth);
    if (p256dh.length !== 65 || p256dh[0] !== 4 || auth.length !== 16) return null;
    return { endpoint: value.endpoint, p256dh: value.keys.p256dh, auth: value.keys.auth };
  } catch {
    return null;
  }
}

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

async function hkdfExpand(prk, info, length) {
  const blocks = [];
  let previous = new Uint8Array(0);
  let size = 0;
  for (let counter = 1; size < length; counter++) {
    previous = await hmac(prk, concatBytes(previous, info, new Uint8Array([counter])));
    blocks.push(previous);
    size += previous.length;
  }
  return concatBytes(...blocks).slice(0, length);
}

function publicKeyCoordinates(publicKey) {
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error("invalid_vapid_public_key");
  return { x: encodeBase64Url(publicKey.slice(1, 33)), y: encodeBase64Url(publicKey.slice(33, 65)) };
}

async function createVapidToken(endpoint, env, now = Date.now()) {
  const publicKey = decodeBase64Url(env.VAPID_PUBLIC_KEY);
  const privateKey = decodeBase64Url(env.VAPID_PRIVATE_KEY);
  if (publicKey.length !== 65 || publicKey[0] !== 4 || privateKey.length !== 32) {
    throw new Error("vapid_keys_invalid");
  }
  if (typeof env.VAPID_SUBJECT !== "string" || !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.VAPID_SUBJECT)) {
    throw new Error("vapid_subject_invalid");
  }
  const coordinates = publicKeyCoordinates(publicKey);
  const jwk = {
    kty: "EC", crv: "P-256", x: coordinates.x, y: coordinates.y,
    d: encodeBase64Url(privateKey), ext: true, key_ops: ["sign"]
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const audience = new URL(endpoint).origin;
  const header = encodeBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = encodeBase64Url(encoder.encode(JSON.stringify({
    aud: audience, exp: Math.floor(now / 1000) + 12 * 60 * 60, sub: env.VAPID_SUBJECT
  })));
  const signingInput = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(signingInput)
  ));
  if (signature.length !== 64) throw new Error("vapid_signature_invalid");
  return `${signingInput}.${encodeBase64Url(signature)}`;
}

async function encryptPayload(subscription, payload) {
  const receiverPublic = decodeBase64Url(subscription.p256dh);
  const authSecret = decodeBase64Url(subscription.auth);
  const receiverKey = await crypto.subtle.importKey(
    "raw", receiverPublic, { name: "ECDH", namedCurve: "P-256" }, false, []
  );
  const senderKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey("raw", senderKeys.publicKey));
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverKey }, senderKeys.privateKey, 256
  ));
  const authPrk = await hmac(authSecret, sharedSecret);
  const info = concatBytes(encoder.encode("WebPush: info\0"), receiverPublic, senderPublic);
  const ikm = await hkdfExpand(authPrk, info, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = await hkdfExpand(prk, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(prk, encoder.encode("Content-Encoding: nonce\0"), 12);
  const plaintext = concatBytes(encoder.encode(payload), new Uint8Array([2]));
  if (plaintext.length > MAX_PAYLOAD_BYTES) throw new Error("push_payload_too_large");
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, plaintext
  ));
  const recordSize = new Uint8Array([0, 0, 16, 0]);
  const body = concatBytes(salt, recordSize, new Uint8Array([senderPublic.length]), senderPublic, ciphertext);
  return body;
}

export async function sendPushToSubscription(env, subscription, payload, fetcher = fetch) {
  if (!isAllowedPushEndpoint(subscription.endpoint)) throw new Error("push_endpoint_rejected");
  const body = JSON.stringify(payload);
  if (encoder.encode(body).length > MAX_PAYLOAD_BYTES) throw new Error("push_payload_too_large");
  const jwt = await createVapidToken(subscription.endpoint, env);
  const encrypted = await encryptPayload(subscription, body);
  const response = await fetcher(subscription.endpoint, {
    method: "POST",
    headers: {
      authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "60",
      urgency: "normal"
    },
    body: encrypted
  });
  return response;
}

export async function handlePushRequest(request, env, url, fetcher = fetch) {
  try {
    const session = await getOwnerSession(request, env);
    if (!session) return jsonResponse({ error: "Sign in required." }, 401);
    assertRequestOrigin(request, env);

    if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
      const body = await readJsonBody(request);
      const subscription = validatePushSubscription(body);
      if (!subscription || Object.keys(body || {}).some((key) => !["endpoint", "keys"].includes(key))) {
        return jsonResponse({ error: "Provide a valid supported push subscription." }, 400);
      }
      const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM push_subscription").first();
      const exists = await env.DB.prepare("SELECT endpoint FROM push_subscription WHERE endpoint=?")
        .bind(subscription.endpoint).first();
      if (!exists && Number(count?.count || 0) >= MAX_SUBSCRIPTIONS) {
        return jsonResponse({ error: "Maximum number of registered devices reached." }, 409);
      }
      await env.DB.prepare(
        "INSERT INTO push_subscription(endpoint,p256dh,auth,user_agent,created_at) VALUES(?,?,?,?,?) " +
        "ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent"
      ).bind(subscription.endpoint, subscription.p256dh, subscription.auth,
        (request.headers.get("user-agent") || "").slice(0, 300), new Date().toISOString()).run();
      return jsonResponse({ subscribed: true });
    }

    if (url.pathname === "/api/push/subscribe" && request.method === "DELETE") {
      const body = await readJsonBody(request);
      if (!body || typeof body.endpoint !== "string" || !isAllowedPushEndpoint(body.endpoint) ||
          Object.keys(body).some((key) => key !== "endpoint")) {
        return jsonResponse({ error: "Provide a valid push endpoint." }, 400);
      }
      await env.DB.prepare("DELETE FROM push_subscription WHERE endpoint=?").bind(body.endpoint).run();
      return jsonResponse({ subscribed: false });
    }

    if (url.pathname === "/api/push/test" && request.method === "POST") {
      const body = await readJsonBody(request);
      if (body && Object.keys(body).length) return jsonResponse({ error: "Test request does not accept custom content." }, 400);
      if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT) {
        return jsonResponse({ error: "Push notifications are not configured." }, 503);
      }
      const subscriptions = await env.DB.prepare(
        "SELECT endpoint,p256dh,auth FROM push_subscription ORDER BY created_at DESC LIMIT ?"
      ).bind(MAX_SUBSCRIPTIONS).all();
      let sent = 0;
      let removed = 0;
      for (const subscription of subscriptions.results || []) {
        const response = await sendPushToSubscription(env, subscription, {
          title: "Magic Folio",
          body: "Push notifications are working.",
          url: "/"
        }, fetcher);
        if (response.status === 404 || response.status === 410) {
          await env.DB.prepare("DELETE FROM push_subscription WHERE endpoint=?").bind(subscription.endpoint).run();
          removed++;
        } else if (response.ok) {
          await env.DB.prepare("UPDATE push_subscription SET last_success_at=? WHERE endpoint=?")
            .bind(new Date().toISOString(), subscription.endpoint).run();
          sent++;
        }
      }
      return jsonResponse({ sent, removed });
    }

    return jsonResponse({ error: "Not found." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "origin_rejected") return jsonResponse({ error: "Request origin rejected." }, 403);
    if (message === "body_too_large") return jsonResponse({ error: "Request too large." }, 413);
    if (message === "json_required") return jsonResponse({ error: "Content-Type must be application/json." }, 415);
    if (message === "push_payload_too_large") return jsonResponse({ error: "Push payload exceeds the size limit." }, 413);
    console.error("Push request failed:", message.slice(0, 120));
    return jsonResponse({ error: "Push operation is temporarily unavailable." }, 503);
  }
}
