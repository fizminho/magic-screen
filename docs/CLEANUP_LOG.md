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
