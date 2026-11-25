import { useEffect, useState } from "react";
import { client as webauthnClient } from "@passwordless-id/webauthn";

type AuthState = { registered: boolean; authenticated: boolean; passkeyCount: number; needsSetup: boolean };
type RegistrationOptions = { challenge: string; user: { id: string; name: string; displayName: string }; rpId: string; rpName: string; excludeCredentials: Array<{ id: string; type: "public-key" }> };
type WebAuthnTransport = "ble" | "hybrid" | "internal" | "nfc" | "usb" | "smart-card";
type LoginOptions = { challenge: string; rpId: string; allowCredentials: Array<{ id: string; transports: WebAuthnTransport[] }> };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init, credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init.headers || {}) }
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload &&
      typeof payload.error === "string" ? payload.error : "Request failed. Please try again.";
    throw new Error(message);
  }
  return payload as T;
}
const post = (body = "{}", headers: Record<string, string> = {}): RequestInit => ({ method: "POST", body, headers });

function decodeCredentialId(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

async function withoutWebAuthnDebug<T>(operation: () => Promise<T>): Promise<T> {
  const original = console.debug;
  console.debug = () => undefined;
  try { return await operation(); }
  finally { console.debug = original; }
}

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [setupToken, setSetupToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [supported, setSupported] = useState(true);

  async function refreshState() { setAuth(await api<AuthState>("/api/auth/state")); }
  useEffect(() => {
    setSupported(window.isSecureContext && typeof window.PublicKeyCredential !== "undefined" &&
      typeof navigator.credentials?.create === "function" && typeof navigator.credentials?.get === "function");
    refreshState().catch(() => setError("Unable to connect to Magic Folio. Please refresh the page."));
  }, []);

  async function registerPasskey(isFirst: boolean) {
    setError(""); setNotice("");
    if (isFirst && setupToken.trim().length < 32) { setError("Enter the one-time setup key."); return; }
    setBusy(true);
    try {
      const headers: Record<string, string> = {};
      if (isFirst) headers["x-setup-token"] = setupToken.trim();
      const options = await api<RegistrationOptions>("/api/auth/register/options", post("{}", headers));
      const registration = await withoutWebAuthnDebug(() => webauthnClient.register({
        user: options.user, challenge: options.challenge, userVerification: "required",
        discoverable: "required", domain: options.rpId, attestation: false,
        customProperties: {
          rp: { id: options.rpId, name: options.rpName },
          excludeCredentials: options.excludeCredentials.map((credential) => ({
            ...credential,
            id: decodeCredentialId(credential.id)
          }))
        }
      }));
      await api("/api/auth/register/verify", post(JSON.stringify(registration), headers));
      setSetupToken("");
      await refreshState();
      setNotice("Passkey registered. Keep at least two passkeys on separate devices for recovery.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Passkey registration failed.");
    } finally { setBusy(false); }
  }

  async function login() {
    setError(""); setNotice(""); setBusy(true);
    try {
      const options = await api<LoginOptions>("/api/auth/login/options", post());
      const authentication = await withoutWebAuthnDebug(() => webauthnClient.authenticate({
        challenge: options.challenge, allowCredentials: options.allowCredentials,
        userVerification: "required", domain: options.rpId
      }));
      await api("/api/auth/login/verify", post(JSON.stringify(authentication)));
      await refreshState();
      setNotice("You're signed in.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Passkey sign-in failed.");
    } finally { setBusy(false); }
  }

  async function logout() {
    setError(""); setNotice(""); setBusy(true);
    try { await api("/api/auth/logout", post()); await refreshState(); setNotice("Signed out."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sign-out failed."); }
    finally { setBusy(false); }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Magic Folio home">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>MAGIC <span className="brand-light">FOLIO</span><small>PERSONAL PORTFOLIO INTELLIGENCE</small></span>
        </a>
        <span className="market-pill">US · BURSA MALAYSIA</span>
      </header>
      <main className="content">
        <section className="page-heading">
          <span className="eyebrow"><span className="eyebrow-line" /> PRIVATE BY DESIGN</span>
          <h1>Your portfolio.<br /><em>Your keys.</em></h1>
          <p className="intro">A private research workspace, protected by passkeys.</p>
        </section>
        {auth === null ? (
          <section className="auth-panel"><span className="eyebrow">SECURE SESSION</span><p>Checking your workspace…</p></section>
        ) : !supported ? (
          <section className="auth-panel"><span className="eyebrow">PASSKEY SUPPORT REQUIRED</span><h2>Use a supported browser</h2><p>Magic Folio requires HTTPS and WebAuthn passkeys. Open this page in an up-to-date Safari, Chrome or Edge browser.</p></section>
        ) : auth.authenticated ? (
          <section className="auth-panel">
            <span className="eyebrow"><span className="status-dot" /> OWNER SESSION ACTIVE</span>
            <h2>Welcome back.</h2>
            <p>Your workspace is protected by {auth.passkeyCount} registered {auth.passkeyCount === 1 ? "passkey" : "passkeys"}.</p>
            <div className="session-card">
              <div><b>Passkey recovery</b><span>Keep a second passkey on another device in case your primary device is lost.</span></div>
              <button className="button button-secondary" onClick={() => registerPasskey(false)} disabled={busy}>{busy ? "Working…" : "Add recovery passkey"}</button>
            </div>
            <button className="button button-quiet" onClick={logout} disabled={busy}>Sign out</button>
          </section>
        ) : auth.needsSetup ? (
          <section className="auth-panel">
            <span className="eyebrow">FIRST-TIME SETUP</span>
            <h2>Create your owner passkey.</h2>
            <p>Use the one-time setup key to register the first passkey. This key is not a login password and is never stored in the browser.</p>
            <label className="field-label" htmlFor="setup-token">One-time setup key</label>
            <input id="setup-token" className="text-field" type="password" autoComplete="one-time-code"
              value={setupToken} onChange={(event) => setSetupToken(event.target.value)} placeholder="Paste your setup key" />
            <button className="button button-primary" onClick={() => registerPasskey(true)} disabled={busy || !setupToken.trim()}>
              {busy ? "Waiting for passkey…" : "Create passkey"}
            </button>
            <p className="fine-print">Your device will ask for Face ID, Touch ID, Windows Hello or a security key. Register a second passkey after signing in.</p>
          </section>
        ) : (
          <section className="auth-panel">
            <span className="eyebrow">OWNER SIGN-IN</span><h2>Unlock your workspace.</h2>
            <p>Use a passkey saved on this device or synced through your password manager. No password is used.</p>
            <button className="button button-primary" onClick={login} disabled={busy}>{busy ? "Waiting for passkey…" : "Sign in with passkey"}</button>
          </section>
        )}
        {error && <p className="feedback feedback-error" role="alert">{error}</p>}
        {notice && <p className="feedback feedback-success" role="status">{notice}</p>}
      </main>
      <footer className="content"><span>MAGIC FOLIO</span><span>Research and education only. Not investment advice.</span></footer>
    </div>
  );
}
