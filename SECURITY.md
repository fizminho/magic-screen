# Security

Magic Folio is designed as a private, single-owner portfolio research application. The rebuild is in progress; do not expose personal portfolio APIs until passkey authentication and authorization checks are implemented and tested.

## Security requirements

- Passkey-only authentication using a reviewed WebAuthn implementation. No password fallback.
- First-run registration must require a temporary setup secret. After owner enrollment, remove that secret.
- Store only hashed session tokens; use secure, HttpOnly, SameSite cookies.
- Require an authenticated owner session for all portfolio, settings, export, push-subscription and AI-analysis endpoints.
- Rate-limit authentication challenge and verification endpoints.
- Never send holding quantities, session tokens, passkey material, provider credentials or setup secrets to an LLM.
- Treat quote, news, RSS and user-supplied text as untrusted data.
- Keep API keys in Worker secrets, never in frontend bundles or Git.
- Use parameterized D1 queries and schema migrations. Do not execute DDL at request time.

## Worker response protections

The Worker applies a restrictive Content Security Policy, HSTS, content-type protection, anti-framing, referrer and permissions policies. CSP does not allow inline scripts or styles.

## Production data reset

The owner authorized a one-time clean reset of the existing `magic-screen-db`, without backup or migration of legacy data. The reset workflow is separate from ordinary deployment and requires explicit manual confirmation. It must not run until the replacement Worker is complete and the legacy endpoints are absent.

## Verification

CI runs the build, Node regression tests, production dependency audit and Wrangler dry-run. A successful CI run does not prove the live Cloudflare deployment has completed. Verify the live Worker and authentication boundary separately after release. Report security issues privately to the repository owner.
