# Blockers

## Production D1 reset decision

The owner explicitly authorized a complete clean rebuild of the existing `magic-screen-db` database:

- No production backup is required.
- All existing user tables and their data, including MFI/Shariah and retired SEC/EdgarTools data, are disposable and may be dropped.
- The replacement schema is defined in `migrations/0002_portfolio_schema.sql`.
- The one-time reset is implemented by `scripts/reset-production-d1.sh` and `.github/workflows/reset-production-d1.yml`.
- The workflow requires the exact manual confirmation `DROP-ALL-LEGACY-DATA`, enumerates actual table names from `sqlite_master`, drops all user tables (including `d1_migrations`), applies the new migrations, then deploys the replacement Worker.
- A guard refuses to run while the old MFI endpoints/session-cookie code remains in `worker/index.ts`.
- The reset workflow has not been run. No production D1 data has been changed by this implementation.

The normal deployment workflow only applies pending migrations and deploys. It does **not** perform a blanket reset. This keeps future deployments non-destructive.

## Remaining technical gates

1. Complete the replacement Worker and remove the legacy MFI endpoints before the guarded reset workflow can pass its code check.
2. Confirm the configured Cloudflare API token has D1 Write permission for migration application and D1 Read/Write permission as required by the operation. The earlier export attempt returned Cloudflare error 10000, but export is no longer part of the plan.
3. Run the GitHub Actions baseline after the remaining code changes. Build/test success is not inferred from repository file writes.
4. Complete the security review, passkey recovery implementation, and deployment verification before declaring the rebuild complete.

Do not manually run `scripts/reset-production-d1.sh` against production outside the guarded workflow.
