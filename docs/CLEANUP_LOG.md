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
