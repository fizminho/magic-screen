# Blockers and production cutover gates

## Production D1 reset decision

The owner explicitly authorized a complete clean rebuild of the existing `magic-screen-db` database:

- No production backup is required.
- All existing user tables and their data, including MFI/Shariah and retired SEC/EdgarTools data, are disposable and may be dropped.
- The replacement schema is defined across `migrations/0002_portfolio_schema.sql` through the current numbered migrations.
- The one-time reset is implemented by `scripts/reset-production-d1.sh` and `.github/workflows/reset-production-d1.yml`.
- The production workflow requires the exact manual confirmation `DROP-ALL-LEGACY-DATA`, can run only from `main`, explicitly sets `D1_SCOPE=--remote`, verifies the RP configuration and temporary setup secret, runs build/audit/tests/Wrangler dry-run, enumerates actual user tables, drops them, reapplies migrations, deploys and checks `/api/health`.
- The script is also exercised against a local D1 database in CI. It has successfully removed and recreated a local database with the full current migration schema. This is **not** a production reset.
- No production D1 data has been changed by this implementation.

The normal deployment workflow applies pending migrations and deploys. It does **not** perform a blanket reset. The one-time destructive reset remains a separate manual cutover.

## Current implementation status

- Legacy MFI endpoints, provider session-cookie usage, runtime DDL and old screener UI have been removed from the rebuild branch.
- New D1 portfolio schema and migrations are in place.
- Passkey bootstrap, login, session handling, credential management, recovery documentation and security headers are implemented.
- Owner-only quote snapshot, holdings, watchlist, dashboard and SEC EDGAR submissions APIs are implemented. SEC filing metadata is cached in D1 for six hours and retained for 30 days; only official SEC links are stored. Dashboard values, daily changes and concentration metrics are calculated separately for USD and MYR, avoiding a misleading cross-currency total. `PortfolioPanel` supports position entry/removal, holdings CSV import, US delayed-quote refresh with a tab-scoped Market Data token, Bursa CSV quote import and watchlist management. The token is sent directly to MarketData.app, not to the Worker. Watchlist UI is integrated with the owner-only API. JSON and spreadsheet-safe CSV exports are available in Settings. Settings exposes alert-move and maximum-position thresholds, push subscription controls, and per-device test/disable actions. The PWA includes a generated installable icon set, a production-only service worker, an offline dashboard snapshot and an iOS Home Screen hint.
- Build workflow run `45536999700` passed on the latest PWA build: locked install, production build (including generated PWA PNG icons), full dependency audit, complete Node regression suite and Wrangler dry-run. The expanded local D1 preflight is being rerun after correcting its cache-cleanup assertion; no production database or deployment is involved.
- No production deployment, production reset, or Cloudflare secret deletion has been performed.

## Remaining production gates

1. **Production RP hostname:** choose the final hostname and set `RP_ID` and `RP_ORIGIN` under `[vars]` in `wrangler.toml`. The deploy and reset workflows now fail closed until `RP_ORIGIN` is exactly `https://` plus `RP_ID`. Passkeys are bound to this hostname; changing it later requires re-registration.
2. **Bootstrap secret:** create a random 32-byte (or longer) `SETUP_TOKEN` and add it as a Cloudflare Worker secret before running the production cutover. The guarded workflow checks that the secret exists. After registering and testing at least two passkeys, delete it.
3. **Cloudflare permissions:** ensure `CLOUDFLARE_API_TOKEN` has Worker deploy permission, Worker secret-list permission and D1:Edit. The earlier export error 10000 showed that D1 write access was not confirmed. Although backup/export was waived, the normal deploy still runs `wrangler d1 migrations apply --remote` and requires D1 write access.
4. **Device testing:** registration and login still need to be exercised on Android Chrome, iOS Safari, iOS Home Screen PWA and desktop Chrome/Edge using the final production hostname. Actual hardware-backed WebAuthn has not been exercised in CI.
5. **Repository security settings:** secret scanning, push protection, Dependabot alerts and main-branch protection have not been changed or verified.
6. **Secret history review:** scan Git history and review any credential-like matches. Remove the retired Cloudflare `MFI_SESSION_COOKIE` secret only after the replacement Worker is live and verified.
7. **SEC data:** owner-only filing metadata and compact US-GAAP companyfacts are fetched from official SEC endpoints and cached in D1. Scheduled SEC refresh, public-data research briefs using Cloudflare Workers AI, and deduplicated SEC filing push alerts are implemented with daily AI/push caps. The owner must still add a 10-digit CIK to each US instrument and configure `SEC_USER_AGENT` with a real contact address. Automatic ticker-to-CIK resolution remains pending.
8. **Optional quote account:** MarketData.app adapter is implemented but disabled until the owner creates an account and enters their own token. No provider token has been supplied or stored.
9. **Push configuration:** generate a VAPID key pair and configure `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` and the `VAPID_PRIVATE_KEY` Worker secret. The UI remains disabled until the public key is configured. Never commit the private key.
10. **PWA/device validation:** run Lighthouse installability checks and test install, offline dashboard, passkeys and push on Android Chrome, iOS Safari Home Screen and desktop Chrome/Edge. PNG icons are generated during build; browser installability has not yet been validated on real devices.
11. **Remaining product phases:** automatic CIK resolution, light/dark theme validation, full Insights screens and final UI polish remain. Do not perform the production reset until the replacement application is ready for the intended cutover.

Do not manually run `scripts/reset-production-d1.sh` against production outside the guarded workflow.
