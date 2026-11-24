// Shared security helpers for the Worker. Plain ESM so Node's test runner can exercise it directly.

const encoder = new TextEncoder();

// Constant-time string comparison. Hashing-free: compare over the longer length and fold the
// length difference into the result so neither content nor length short-circuits.
export function timingSafeEqual(a, b) {
  const x = encoder.encode(String(a ?? ""));
  const y = encoder.encode(String(b ?? ""));
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// Returns null when authorised, otherwise a { status, error } describing the failure.
// 503 = token not configured (fail closed), 401 = missing/incorrect bearer token.
export function checkBearer(request, expectedToken) {
  if (!expectedToken) return { status: 503, error: "UNIVERSE_SYNC_TOKEN is not configured" };
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match || !timingSafeEqual(match[1], expectedToken)) return { status: 401, error: "Unauthorized" };
  return null;
}

export function isBearerAuthorized(request, expectedToken) {
  return checkBearer(request, expectedToken) === null;
}

// Public refresh endpoints (MFI sync, quote refresh) are rate-limited server-side instead of
// being locked behind a token, because the UI calls them anonymously. Authorised callers bypass.
export function cooldownElapsed(lastIso, cooldownMs, now = Date.now()) {
  if (!lastIso) return true;
  const last = Date.parse(lastIso);
  if (Number.isNaN(last)) return false;
  const age = now - last;
  return age >= cooldownMs;
}

export const MFI_FORCE_COOLDOWN_MS = 15 * 60 * 1000;
export const QUOTE_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

// Content-Security-Policy matched to index.html: same-origin bundle, Google Fonts only.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export function withSecurityHeaders(response) {
  // Responses from the assets binding can have immutable headers, so always rebuild.
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) out.headers.set(name, value);
  return out;
}

// Public endpoints must not echo internal exception text (SQL, upstream URLs, config hints).
export function publicErrorMessage(error, fallback = "Request failed") {
  console.error(fallback, error instanceof Error ? error.stack ?? error.message : String(error));
  return fallback;
}
