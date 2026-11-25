# Security

Magic Folio is a private, single-owner portfolio research application. Portfolio routes must remain unavailable until each route is explicitly protected by the owner session.

## Authentication model

- Passkey-only authentication using `@passwordless-id/webauthn`; no password login or password fallback.
- WebAuthn registration and authentication require user presence and verification, the expected one-time challenge, exact request host and Origin, RP ID hash, matching discoverable user handle and a valid signature. Registration also checks that the credential ID matches the authenticator's attested credential data and rejects cross-origin ceremonies.
- Challenges are cryptographically random, expire after 120 seconds and are consumed once.
- The first passkey requires the temporary `SETUP_TOKEN` Worker secret. Subsequent passkeys require an authenticated owner session.
- Register at least two passkeys on separate devices before removing `SETUP_TOKEN`.
- Session cookies are HttpOnly and SameSite=Strict. Production uses the `__Host-session` cookie with Secure and Path=/; local development uses a non-`__Host-` cookie over localhost.
- D1 stores only SHA-256 session-token hashes and binds each session to the passkey that created it. Removing a passkey revokes its sessions. Sessions expire after 7 days idle or 30 days absolute. Last-seen writes are throttled to once per hour.
- Auth endpoints require the exact configured Origin and JSON content type for state-changing requests. Challenges and failed-verification attempts are rate limited.
- Credential counters are checked when authenticators provide a non-zero counter. Synced passkeys that report zero remain supported.
- Credential listing, renaming, deletion and sign-out-everywhere endpoints require an owner session. Deletion is atomic and refuses to remove the final passkey.

## Data and API boundaries

- Require an authenticated owner session for all portfolio, settings, export, push-subscription and AI-analysis endpoints. Push delivery uses VAPID ES256 and RFC 8291 AES-GCM encryption; VAPID private material is held only as a Worker secret and push endpoints are restricted to supported HTTPS providers. The current quote snapshot, holdings, watchlist, dashboard and SEC filing routes enforce the owner session; state-changing requests also enforce exact Origin and JSON. SEC lookups require an explicit app/contact User-Agent, are limited to 5 fresh requests per IP/hour, cache metadata for 6 hours and retain only 30 days of filing metadata and official links.
- Keep authentication state and health endpoints minimal. Return generic public errors.
- Store only hashed session tokens; never log challenge payloads, credential public keys or session tokens.
- Never send holding quantities, cost basis, session tokens, passkey material, provider credentials or setup secrets to an LLM.
- Treat quote, news, RSS, SEC metadata and user-supplied text as untrusted data. Do not mirror SEC filing documents or send full filing text to an LLM.
- Keep server-side API keys in Worker secrets, never in frontend bundles or Git. JSON/CSV exports are `no-store`; CSV cells are quoted and formula-leading values are prefixed to prevent spreadsheet formula injection. The optional MarketData.app token is owner-entered, stored only in this tab's `sessionStorage`, and sent directly to MarketData.app; it is never sent to the Worker or stored in D1.
- Use parameterized D1 queries and schema migrations. Do not execute DDL at request time.

## Worker response protections

The Worker applies a restrictive Content Security Policy, HSTS, content-type protection, anti-framing, referrer and permissions policies. CSP does not allow inline scripts or styles.

## First-run setup and recovery

The owner authorized a one-time clean reset of the existing `magic-screen-db`, without backup or migration of legacy data. The reset workflow is separate from ordinary deployment and requires explicit manual confirmation. It must not run until the replacement Worker and authentication controls are complete.

For first registration, configure a long random `SETUP_TOKEN` as a Worker secret. Register the first passkey, sign in, add a second passkey on another device, then delete the setup secret. If every passkey is lost, use Cloudflare account access to set a fresh setup token, clear only the passkey and session records using the documented recovery procedure, register again, and remove the temporary token. Holdings remain intact. Protect the Cloudflare account itself with strong 2FA or a passkey.

## Verification

CI runs the build, Node regression tests, production dependency audit and Wrangler dry-run. A successful CI run does not prove the live Cloudflare deployment has completed. Verify the live Worker, authentication boundary and device matrix separately after release. Report security issues privately to the repository owner.
