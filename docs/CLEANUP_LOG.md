# AI Portfolio Rebuild Cleanup Log

## Phase A: repository triage

- Date: 2026-11-25
- Repository: `fizminho/magic-screen`
- Default branch: `main`
- Base commit inspected: `b02d67c1ffdbf2d0ea50142c4e8f5bb3808e9244`
- Working branch: `chore/ai-portfolio-rebuild`
- Open pull requests: none found during triage.
- Baseline run `45524812051`: dependency installation, `npm run build`, and Node regression tests passed.
- Production D1 backup/export: intentionally skipped by explicit owner decision. No backup artifact was created.
- Live D1 inventory: not required for the reset design. The one-time script discovers actual table names from `sqlite_master` immediately before dropping them; it does not hard-code unknown retired SEC table names.
- No production D1 changes have been made.

## Initial repository findings

1. `package-lock.json` is absent; workflows still use `npm install`.
2. Existing build workflow's production audit was advisory (`continue-on-error: true`).
3. Some existing GitHub Actions originally used mutable version tags.
4. No open PRs were found at triage.
5. The D1 binding targets the existing database `magic-screen-db`; `migrations_dir = "migrations"` is now configured.
6. The old Worker still contains unauthenticated MFI routes and runtime DDL at the time of this log update. These must be removed before the reset workflow is allowed to run.
7. Existing security headers still require the planned PWA/CSP review.
8. The repository already ignores local environment files; `backup-*.sql` is also ignored.

## Owner-approved clean rebuild

The owner explicitly confirmed that the existing `magic-screen-db` may be emptied completely, including all MFI and legacy data. The plan therefore does not include backup or data migration.

Implemented on `chore/ai-portfolio-rebuild`:

- `migrations/0001_drop_legacy.sql`: defensive drops for known legacy MFI tables.
- `migrations/0002_portfolio_schema.sql`: new Magic Folio schema from Runbook Appendix A.
- `scripts/reset-production-d1.sh`: enumerates real production user tables from `sqlite_master`, drops them safely by quoted identifier, then applies the clean migrations. It does not export or read row contents.
- `.github/workflows/reset-production-d1.yml`: manual, exact-string confirmation gate; checks that old MFI Worker routes/secrets are no longer referenced before reset; applies schema and deploys replacement Worker.
- `wrangler.toml`: configured `migrations_dir = "migrations"`.
- `.github/workflows/deploy-worker.yml`: ordinary deployments apply pending migrations but never blanket-drop tables.

The destructive workflow has **not** been executed. It will remain blocked until the replacement Worker is complete and legacy routes are removed. No Cloudflare token was changed and no secret was deleted.


## Phase B/C cleanup update

- Replaced the MFI frontend with a minimal Magic Folio shell.
- Removed all MFI routes, provider session-cookie usage, and runtime DDL from `worker/index.ts`.
- Deleted legacy Shariah screening and universe-membership modules/tests, retired MFI docs, and `db/schema.sql`.
- Replaced the old CSP with `style-src 'self'`; the app shell uses external stylesheet rules only.
- Removed unused `lucide-react` dependency.
- Pinned checkout/setup-node actions to immutable commit SHAs in build, preflight and deploy workflows.
- Made the production dependency audit blocking.
- Added Dependabot npm minor/patch grouping and a safe `.dev.vars.example`; fixed `.gitignore` to allow that example file.
- Rewrote README, SECURITY and setup documentation for the new product.
- Expanded deployment path filters to include HTML, CSS (under `src/**`), package metadata and Vite config.
- [x] Generated and committed `package-lock.json` (lockfile v3) using a branch-scoped GitHub Actions workflow; build, preflight and deployment workflows now use `npm ci`.
- Outstanding: inspect actual audit/outdated output, verify secret history and enable repository security settings.
- Outstanding: delete the Cloudflare `MFI_SESSION_COOKIE` secret only after the new Worker has been deployed successfully.
- No production D1 reset or Cloudflare secret deletion has been performed.


### CI verification and dependency triage

Latest branch preflight on `97e85ba043f33a7b4c3a5c09da700306b76565a0` completed successfully:

- `npm ci`: passed.
- `npm run build`: passed (TypeScript + Vite).
- `npm audit --audit-level=high`: passed, **0 vulnerabilities** across production and development dependencies.
- `node --experimental-strip-types --test worker/*.test.mjs`: passed.
- `npx --yes wrangler@4 deploy --dry-run`: passed.
- `npm outdated`: only major-version upgrades available in the reviewed list: React/React DOM 19, Vite 8, TypeScript 7, React types 19 and plugin-react 6. Current compatible major versions were retained to avoid unnecessary migration risk.
- Open Dependabot PRs reviewed: #75, #77, #79, #80, #81, #82, #83. All represent major upgrades or an obsolete dependency PR; no security patch/minor upgrade was found. PR #81 for `lucide-react` is obsolete because that dependency was removed from the project.
- A TypeScript import typing error in the new Worker shell was found by CI and fixed with an explicit JS helper boundary. The subsequent preflight passed all checks.

The latest passing preflight is linked from the repository Actions page. Earlier failures were caused by a typo in the pinned setup-node SHA and the TypeScript declaration boundary; both were corrected before the passing run.


### Fresh D1 migration verification

Preflight run `45527396444` on commit `9876af8cf8e696b17213092a80097e54197a9227` passed all steps:

- Clean `npm ci`, TypeScript/Vite build, full dependency audit (0 vulnerabilities), regression suite.
- Applied `0001_drop_legacy.sql` and `0002_portfolio_schema.sql` against a fresh local D1 database.
- Queried `sqlite_master`; the expected tables were present: `auth_challenge`, `holding`, `instrument`, `job_run`, `news_instrument`, `news_item`, `passkey_credential`, `price_daily`, `push_subscription`, `quote_latest`, `session`, `setting`, `watchlist`, plus `d1_migrations`.
- Wrangler dry-run confirmed the Worker bundle and `magic-screen-db` binding without contacting production.

This validates the new schema from an empty local D1 database. It does not apply or alter production D1.


## Passkey authentication implementation and verification

- Selected and pinned `@passwordless-id/webauthn@2.4.1` (MIT); provenance is in `docs/DATA_SOURCES.md`.
- Implemented first-run setup-token gate, discoverable passkey registration/login, strict RP/origin/host binding, challenge type/purpose/expiry/single-use checks, UP+UV checks, signature verification, user-handle binding and signature counter enforcement.
- Implemented hashed sessions, `__Host-session` production cookie, local-only cookie name, 7-day idle / 30-day absolute expiry, hourly last-seen refresh, logout and sign-out-everywhere.
- Implemented hashed-IP rate limits, JSON body/content-type/size checks, protected credential inventory, rename and atomic last-passkey deletion protection.
- Added mobile-first passkey UI, setup flow, second-passkey prompt, credential list/rename/remove and sign-out controls.
- Added tests for malformed JSON media types, missing/spoofed Origin, challenge ceremony type binding, protected credential inventory, mutation authorization and sign-out-everywhere authorization.
- Corrected the authentication counter persistence to use the library's `AuthenticationInfo.counter` result (not the registration result shape).
- Added a local Worker/D1 smoke test to CI. It checks health, first-run state, missing setup-token rejection, no-passkey login rejection and unauthenticated credential inventory rejection.

Latest full preflight `45528603689` on commit `e4f2d6e3f3ca6cc5ee442ee5842fd3be64b01944` passed:
- `npm ci`
- TypeScript + Vite build
- Full dependency audit (0 vulnerabilities)
- Node regression suite
- Fresh local D1 migration and schema inventory
- Foreign-key-aware destructive reset routine against local D1 only
- Wrangler Worker smoke test with local D1
- Wrangler deploy dry-run

Still pending before production: real passkey ceremony on iOS Safari/PWA, Android Chrome/PWA and desktop Chrome/Edge; production RP variables and temporary setup secret; deployment; two real passkeys; then removal of `SETUP_TOKEN` and obsolete `MFI_SESSION_COOKIE`. No production D1 reset, Worker deployment or Cloudflare secret deletion has been performed.


### Final auth-hardening CI

Preflight run `45528932617` on commit `89a5e20ee781d4486368da71846eacec65410e0b` passed after the final WebAuthn binding checks:

- Rejects `crossOrigin: true` in WebAuthn client data.
- Binds the request URL host and `Origin` header to the configured RP origin.
- Checks the credential ID and raw ID match each other and the ID embedded in authenticator attested data.
- Checks the attested data's user-presence and user-verification flags and matches the public-key algorithm.
- Full build, audit, regression, local D1 reset, Worker auth smoke and Wrangler dry-run all passed.


## Passkey, portfolio and data-provider implementation

- Added passkey-only registration/login with a 256-bit temporary bootstrap token, single-use 32-byte challenges, exact RP/origin/host validation, user-presence and user-verification checks, authenticator credential-ID binding, cross-origin ceremony rejection and signature-counter verification.
- Sessions are random bearer tokens stored only as SHA-256 hashes, bound to the authenticating passkey, with 7-day idle and 30-day absolute expiry. Removing a passkey revokes sessions created by that credential; the last credential cannot be removed. Added sign out everywhere.
- Added owner-only passkey inventory/rename/remove/recovery UI and a warning until at least two passkeys are registered.
- Added owner-only holdings and watchlist APIs/UI, 20-position and 50-watchlist limits, CSV holdings import, quote snapshot read/write endpoints and cleanup of quote snapshots when an instrument is no longer in holdings/watchlist.
- Rejected Yahoo Finance scraping, FMP free display, and unverified Alpha Vantage use. The provider decision is documented in `docs/DATA_SOURCES.md`.
- Added optional browser-only MarketData.app delayed US quote adapter. It uses the documented delayed-quotes endpoint, 100-credit/day free tier, 50-symbol request chunks, 8-second timeout, one transient retry, no retry on 429, and no Worker proxy. The token is kept in browser session storage only and is never sent to D1 or the Worker.
- Added a strict Bursa manual quote CSV parser and holdings CSV parser. Both validate rows, duplicates, numeric ranges, timestamps and import size.
- Added owner-authenticated `GET /api/quotes/latest` and `POST /api/quotes/snapshots`; quote rows are stored only against active owner instruments.
- CSP now permits only `https://api.marketdata.app` as an additional browser connection origin; scripts and styles remain self-hosted with no inline allowance.
- CI passed on branch commit `c84c002a41af21091de23e796693595e008eac9c`: locked install, production build, full dependency audit (0 vulnerabilities), Node regression suite, fresh local D1 migrations/schema checks, destructive reset exercise against local D1 only, Worker auth/portfolio/quote smoke tests, and Wrangler dry-run. No production D1 reset or deployment occurred.
- Outstanding: SEC EDGAR filing adapter and CIK mapping, scheduled jobs, Gemini, push notifications, PWA, full dashboard/insights screens, device-level passkey tests, GitHub repository security settings and Git-history secret review.


### SEC EDGAR filing metadata

- Added optional 10-digit CIK storage to US instruments through migration `0003_sec_company_identifier.sql`; CIK can be entered on holdings/watchlist forms or imported through the holdings CSV.
- Added owner-only `GET /api/sec/filings?symbol=...` using the official SEC submissions JSON API and a required `SEC_USER_AGENT` containing the owner's real contact email.
- The endpoint returns selected recent filing metadata and official SEC links only; no filing body is mirrored.
- Added a six-hour per-instrument D1 response cache and 30-day metadata retention in migration `0004_sec_filing_cache.sql`.
- SEC cache misses are limited to five upstream lookups per source IP per hour. Cached responses do not consume the upstream lookup allowance.
- Added fixture tests for filing filtering, accession/CIK binding, archive URL construction, owner-session gating, missing contact header, cache hit/miss and upstream throttling.
- Outstanding: automatic ticker-to-CIK lookup, companyfacts/fundamentals, scheduled SEC refresh and SEC filing alert rules.
