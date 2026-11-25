import { useEffect, useState } from "react";
import { client as webauthnClient } from "@passwordless-id/webauthn";
import PortfolioPanel from "./PortfolioPanel";

type AuthState = { registered: boolean; authenticated: boolean; passkeyCount: number; needsSetup: boolean };
type PasskeyCredential = { id: string; name: string; createdAt: string; lastUsedAt: string | null; backedUp: boolean };
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
  const [credentials, setCredentials] = useState<PasskeyCredential[]>([]);
  const [credentialNames, setCredentialNames] = useState<Record<string, string>>({});
  const [setupToken, setSetupToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [supported, setSupported] = useState(true);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);

  async function refreshState() {
    const next = await api<AuthState>("/api/auth/state");
    setAuth(next);
    if (next.authenticated) {
      const result = await api<{ credentials: PasskeyCredential[] }>("/api/auth/credentials");
      setCredentials(result.credentials);
      setCredentialNames(Object.fromEntries(result.credentials.map((item) => [item.id, item.name])));
    } else {
      setCredentials([]);
      setCredentialNames({});
      sessionStorage.removeItem("magicfolio.marketdata.token");
    }
  }
  useEffect(() => {
    const iosDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installed = window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setShowIosInstallHint(iosDevice && !installed);
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    setSupported(window.isSecureContext && typeof window.PublicKeyCredential !== "undefined" &&
      typeof navigator.credentials?.create === "function" && typeof navigator.credentials?.get === "function");
    refreshState().catch(() => setError("Unable to connect to Magic Folio. Please refresh the page."));
  }, []);

  async function registerPasskey(isFirst: boolean) {
    setError(""); setNotice("");
    if (isFirst && setupToken.trim().length < 43) { setError("Enter the one-time setup key."); return; }
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
    try { await api("/api/auth/logout", post()); sessionStorage.removeItem("magicfolio.marketdata.token"); await refreshState(); setNotice("Signed out."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sign-out failed."); }
    finally { setBusy(false); }
  }

  async function saveCredentialName(id: string) {
    setError(""); setNotice(""); setBusy(true);
    try {
      await api(`/api/auth/credentials/${encodeURIComponent(id)}`, {
        method: "PATCH", body: JSON.stringify({ name: credentialNames[id] || "" })
      });
      await refreshState();
      setNotice("Passkey name updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to rename passkey.");
    } finally { setBusy(false); }
  }

  async function removeCredential(id: string) {
    if (!window.confirm("Remove this passkey? You will no longer be able to sign in with it.")) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      await api(`/api/auth/credentials/${encodeURIComponent(id)}`, { method: "DELETE", body: "{}" });
      await refreshState();
      setNotice("Passkey removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove passkey.");
    } finally { setBusy(false); }
  }

  async function logoutEverywhere() {
    if (!window.confirm("Sign out all active sessions on every device?")) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      await api("/api/auth/logout-all", post());
      sessionStorage.removeItem("magicfolio.marketdata.token");
      await refreshState();
      setNotice("All sessions have been signed out.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign out all sessions.");
    } finally { setBusy(false); }
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
      {showIosInstallHint && (
        <aside className="install-hint">
          On iPhone or iPad, use Share → Add to Home Screen. Push notifications work only from the installed app on supported iOS versions.
        </aside>
      )}
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
            <div className={`recovery-note ${auth.passkeyCount < 2 ? "recovery-warning" : "recovery-ready"}`}>
              {auth.passkeyCount < 2
                ? "Recovery is not ready yet. Add a second passkey on another device before removing the setup token."
                : "Recovery ready. You have more than one passkey registered. Delete the temporary SETUP_TOKEN secret in Cloudflare now."}
            </div>
            <div className="session-card">
              <div><b>Passkey recovery</b><span>Register a passkey on another device in case your primary device is lost.</span></div>
              <button className="button button-secondary" onClick={() => registerPasskey(false)} disabled={busy}>{busy ? "Working…" : "Add another passkey"}</button>
            </div>
            <div className="credential-list">
              <div className="credential-heading"><b>Your passkeys</b><span>{credentials.length} registered</span></div>
              {credentials.map((item) => (
                <div className="credential-row" key={item.id}>
                  <div className="credential-meta">
                    <input className="credential-name" aria-label="Passkey name" maxLength={40}
                      value={credentialNames[item.id] ?? item.name}
                      onChange={(event) => setCredentialNames((current) => ({ ...current, [item.id]: event.target.value }))} />
                    <span>Added {new Date(item.createdAt).toLocaleDateString()} · {item.lastUsedAt ? `Last used ${new Date(item.lastUsedAt).toLocaleDateString()}` : "Not used yet"}</span>
                    <span>{item.backedUp ? "Backed up by authenticator" : "Not currently backed up"}</span>
                  </div>
                  <div className="credential-actions">
                    <button className="button button-small" onClick={() => saveCredentialName(item.id)} disabled={busy || !(credentialNames[item.id] || "").trim()}>Save</button>
                    <button className="button button-danger" onClick={() => removeCredential(item.id)} disabled={busy || credentials.length <= 1}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="session-actions">
              <button className="button button-quiet" onClick={logout} disabled={busy}>Sign out</button>
              <button className="button button-quiet" onClick={logoutEverywhere} disabled={busy}>Sign out everywhere</button>
            </div>
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
        {auth?.authenticated && supported && <PortfolioPanel onError={setError} onNotice={setNotice} />}
        {error && <p className="feedback feedback-error" role="alert">{error}</p>}
        {notice && <p className="feedback feedback-success" role="status">{notice}</p>}
      </main>
      <footer className="content"><span>MAGIC FOLIO</span><span>Research and education only. Not investment advice.</span></footer>
    </div>
  );
}
