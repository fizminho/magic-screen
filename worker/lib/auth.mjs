import { server as webauthn } from "@passwordless-id/webauthn";

const COOKIE = "__Host-magicfolio_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const CHALLENGE_SECONDS = 5 * 60;
const MAX_BODY_BYTES = 32 * 1024;

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});

const nowIso = () => new Date().toISOString();
const addSeconds = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();

export function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function parseCookies(header = "") {
  const result = Object.create(null);
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key && !(key in result)) result[key] = value;
  }
  return result;
}

export async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left ?? ""));
  const b = new TextEncoder().encode(String(right ?? ""));
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return mismatch === 0;
}

async function bodyJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) throw new Error("body_too_large");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("body_too_large");
  return JSON.parse(raw || "{}");
}

function cookieHeader(token, maxAge = SESSION_SECONDS) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function getRp(env, request) {
  const origin = env.RP_ORIGIN || new URL(request.url).origin;
  const rpId = env.RP_ID || new URL(origin).hostname;
  if (new URL(origin).hostname !== rpId) throw new Error("invalid_rp_configuration");
  return { origin, rpId };
}

function checkOrigin(request, env) {
  const { origin } = getRp(env, request);
  if (request.headers.get("origin") !== origin) throw new Error("origin_rejected");
}

async function sessionFor(request, env) {
  const token = parseCookies(request.headers.get("cookie") || "")[COOKIE];
  if (!token || token.length < 32 || token.length > 256) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    "SELECT token_hash, expires_at FROM session WHERE token_hash = ? AND expires_at > ?"
  ).bind(tokenHash, nowIso()).first();
  if (!row) return null;
  await env.DB.prepare("UPDATE session SET last_seen_at = ? WHERE token_hash = ?")
    .bind(nowIso(), tokenHash).run();
  return { tokenHash, expiresAt: row.expires_at };
}

async function passkeyCount(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM passkey_credential").first();
  return Number(row?.total || 0);
}

async function authorizeRegistration(request, env) {
  const count = await passkeyCount(env);
  const session = await sessionFor(request, env);
  if (count > 0 && session) return { count, session, setup: false };
  if (count === 0 && env.SETUP_TOKEN) {
    const supplied = request.headers.get("x-setup-token") || "";
    if (supplied.length >= 24 && supplied.length <= 256 &&
        constantTimeEqual(await sha256Hex(supplied), await sha256Hex(env.SETUP_TOKEN))) {
      return { count, session: null, setup: true };
    }
  }
  throw new Error("registration_not_authorized");
}

async function ownerHandle(env) {
  const row = await env.DB.prepare("SELECT value FROM setting WHERE key = 'owner_user_handle'").first();
  return row?.value || crypto.randomUUID();
}

async function recordAttempt(request, env, kind, limit) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipHash = await sha256Hex(`${env.RP_ID || "local"}:${ip}`);
  const window = new Date().toISOString().slice(0, 13);
  await env.DB.prepare(
    "INSERT INTO auth_attempt(ip_hash, window, kind, count) VALUES(?,?,?,1) " +
    "ON CONFLICT(ip_hash, window, kind) DO UPDATE SET count = count + 1"
  ).bind(ipHash, window, kind).run();
  const row = await env.DB.prepare(
    "SELECT count FROM auth_attempt WHERE ip_hash = ? AND window = ? AND kind = ?"
  ).bind(ipHash, window, kind).first();
  if (Number(row?.count || 0) > limit) throw new Error("rate_limited");
}

async function issueChallenge(env, purpose) {
  const challenge = webauthn.randomChallenge();
  await env.DB.prepare(
    "INSERT INTO auth_challenge(challenge, purpose, expires_at) VALUES(?,?,?)"
  ).bind(challenge, purpose, addSeconds(CHALLENGE_SECONDS)).run();
  return challenge;
}

async function consumeChallenge(env, challenge, purpose) {
  if (typeof challenge !== "string" || challenge.length < 20 || challenge.length > 256) return false;
  const row = await env.DB.prepare(
    "DELETE FROM auth_challenge WHERE challenge = ? AND purpose = ? AND expires_at > ? RETURNING challenge"
  ).bind(challenge, purpose, nowIso()).first();
  return Boolean(row);
}

async function createSession(env, request) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64url(bytes);
  const tokenHash = await sha256Hex(token);
  const now = nowIso();
  await env.DB.prepare(
    "INSERT INTO session(token_hash, created_at, expires_at, last_seen_at, user_agent) VALUES(?,?,?,?,?)"
  ).bind(tokenHash, now, addSeconds(SESSION_SECONDS), now,
    (request.headers.get("user-agent") || "").slice(0, 300)).run();
  return token;
}

function algorithmName(algorithm) {
  if (algorithm === -7) return "ES256";
  if (algorithm === -257) return "RS256";
  throw new Error("unsupported_passkey_algorithm");
}

async function handleState(request, env) {
  const [count, session] = await Promise.all([passkeyCount(env), sessionFor(request, env)]);
  return json({ registered: count > 0, authenticated: Boolean(session), passkeyCount: count, needsSetup: count === 0 });
}

async function registerOptions(request, env) {
  checkOrigin(request, env);
  await recordAttempt(request, env, "options", 20);
  await authorizeRegistration(request, env);
  const challenge = await issueChallenge(env, "register");
  return json({
    challenge,
    user: { id: await ownerHandle(env), name: "Magic Folio owner", displayName: "Magic Folio" },
    rpId: getRp(env, request).rpId
  });
}

async function registerVerify(request, env) {
  checkOrigin(request, env);
  const authorization = await authorizeRegistration(request, env);
  const payload = await bodyJson(request);
  const challenge = payload?.response?.clientDataJSON
    ? decodeClientChallenge(payload.response.clientDataJSON)
    : null;
  if (!await consumeChallenge(env, challenge, "register")) return json({ error: "Registration expired. Try again." }, 400);

  const { origin, rpId } = getRp(env, request);
  const verified = await webauthn.verifyRegistration(payload, {
    challenge,
    origin,
    domain: rpId,
    userVerified: true
  });

  const credential = verified.credential;
  if (!credential?.id || !credential.publicKey || !credential.algorithm) {
    return json({ error: "Passkey registration could not be verified." }, 400);
  }
  const algorithm = credential.algorithm === "ES256" ? -7 : credential.algorithm === "RS256" ? -257 : null;
  if (!algorithm) return json({ error: "This passkey algorithm is not supported." }, 400);

  const ownerId = payload?.user?.id;
  if (typeof ownerId !== "string" || ownerId.length < 16 || ownerId.length > 128) {
    return json({ error: "Passkey registration could not be verified." }, 400);
  }
  const transports = Array.isArray(credential.transports) ? JSON.stringify(credential.transports) : null;
  const now = nowIso();
  let inserted = 0;

  if (authorization.count === 0) {
    const results = await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO setting(key,value) VALUES('owner_user_handle',?)").bind(ownerId),
      env.DB.prepare(
        "INSERT INTO passkey_credential(id,public_key,algorithm,counter,transports,backed_up,name,created_at,last_used_at) " +
        "SELECT ?,?,?,?,?,?,?,?,NULL WHERE (SELECT value FROM setting WHERE key='owner_user_handle') = ? " +
        "AND NOT EXISTS (SELECT 1 FROM passkey_credential)"
      ).bind(credential.id, credential.publicKey, algorithm, Number(verified.authenticator?.counter || 0),
        transports, verified.synced ? 1 : 0, "Primary passkey", now, ownerId)
    ]);
    inserted = Number(results?.[1]?.meta?.changes || 0);
  } else {
    const result = await env.DB.prepare(
      "INSERT OR IGNORE INTO passkey_credential(id,public_key,algorithm,counter,transports,backed_up,name,created_at,last_used_at) VALUES(?,?,?,?,?,?,?,?,NULL)"
    ).bind(credential.id, credential.publicKey, algorithm, Number(verified.authenticator?.counter || 0),
      transports, verified.synced ? 1 : 0, "Passkey", now).run();
    inserted = Number(result?.meta?.changes || 0);
  }
  if (inserted !== 1) return json({ error: "This passkey could not be added. Refresh and try again." }, 409);

  const token = await createSession(env, request);
  return json({ ok: true, authenticated: true, passkeyCount: await passkeyCount(env) }, 201, {
    "set-cookie": cookieHeader(token)
  });
}

function decodeClientChallenge(encoded) {
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(normalized);
    const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed?.type === "webauthn.create" ? parsed.challenge : null;
  } catch {
    return null;
  }
}

async function loginOptions(request, env) {
  checkOrigin(request, env);
  await recordAttempt(request, env, "options", 20);
  const rows = await env.DB.prepare("SELECT id, transports FROM passkey_credential ORDER BY created_at").all();
  if (!rows.results?.length) return json({ error: "No passkey is registered yet." }, 403);
  const challenge = await issueChallenge(env, "login");
  return json({
    challenge,
    rpId: getRp(env, request).rpId,
    allowCredentials: rows.results.map((row) => ({
      id: row.id,
      transports: row.transports ? JSON.parse(row.transports) : []
    }))
  });
}

async function loginVerify(request, env) {
  checkOrigin(request, env);
  const payload = await bodyJson(request);
  const credentialId = payload?.id;
  if (typeof credentialId !== "string" || credentialId.length > 1024) return json({ error: "Sign-in failed." }, 401);
  const row = await env.DB.prepare(
    "SELECT id, public_key, algorithm, counter FROM passkey_credential WHERE id = ?"
  ).bind(credentialId).first();
  if (!row) {
    await recordAttempt(request, env, "verify_fail", 10);
    return json({ error: "Sign-in failed." }, 401);
  }

  const challenge = decodeClientChallenge(payload?.response?.clientDataJSON);
  if (!await consumeChallenge(env, challenge, "login")) return json({ error: "Sign-in expired. Try again." }, 400);
  const { origin, rpId } = getRp(env, request);
  try {
    const expected = { challenge, origin, domain: rpId, userVerified: true };
    if (Number(row.counter) > 0) expected.counter = Number(row.counter);
    const verified = await webauthn.verifyAuthentication(payload, {
      id: row.id,
      publicKey: row.public_key,
      algorithm: algorithmName(Number(row.algorithm)),
      transports: []
    }, expected);
    await env.DB.prepare(
      "UPDATE passkey_credential SET counter = ?, last_used_at = ? WHERE id = ?"
    ).bind(Math.max(Number(row.counter), Number(verified.authenticator?.counter || 0)), nowIso(), row.id).run();
  } catch {
    await recordAttempt(request, env, "verify_fail", 10);
    return json({ error: "Sign-in failed." }, 401);
  }

  const token = await createSession(env, request);
  return json({ ok: true, authenticated: true }, 200, { "set-cookie": cookieHeader(token) });
}

async function logout(request, env) {
  checkOrigin(request, env);
  const session = await sessionFor(request, env);
  if (session) await env.DB.prepare("DELETE FROM session WHERE token_hash = ?").bind(session.tokenHash).run();
  return json({ ok: true }, 200, { "set-cookie": cookieHeader("", 0) });
}

export async function handleAuthRequest(request, env, pathname) {
  try {
    if (pathname === "/api/auth/state" && request.method === "GET") return await handleState(request, env);
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { allow: "GET, POST" });
    if (pathname === "/api/auth/register/options") return await registerOptions(request, env);
    if (pathname === "/api/auth/register/verify") return await registerVerify(request, env);
    if (pathname === "/api/auth/login/options") return await loginOptions(request, env);
    if (pathname === "/api/auth/login/verify") return await loginVerify(request, env);
    if (pathname === "/api/auth/logout") return await logout(request, env);
    return json({ error: "Not found." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "rate_limited") return json({ error: "Too many attempts. Try again later." }, 429);
    if (message === "body_too_large") return json({ error: "Request too large." }, 413);
    if (message === "origin_rejected") return json({ error: "Request origin rejected." }, 403);
    if (message === "registration_not_authorized") return json({ error: "Registration is not authorized." }, 403);
    console.error("Passkey request failed:", message);
    return json({ error: "Authentication request failed." }, 400);
  }
}
