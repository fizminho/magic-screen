# Magic Folio

Magic Folio is a private, single-owner portfolio research workspace for US and Bursa Malaysia equities.

## Product principles

- Portfolio tracking and research, not brokerage or auto-trading.
- Passkey-only owner authentication. No password fallback.
- Shariah status is a manually maintained field, not an automated screening verdict or religious ruling.
- AI analysis receives only the minimum necessary portfolio context. Holding quantities and credentials must never be sent to an LLM.
- Market data and news are source-labelled, timestamped and treated as untrusted input.
- Free-tier-first architecture. Do not introduce paid services without explicit owner approval.

## Current rebuild status

The legacy screener UI and public MFI Worker endpoints have been removed from the rebuild branch. The current frontend is a clean Magic Folio shell. Backend portfolio APIs, passkey authentication, data providers, push alerts and AI analysis are implemented in later runbook phases.

The D1 schema is defined in `migrations/`. A one-time production reset is separately guarded by `.github/workflows/reset-production-d1.yml` and requires the exact manual confirmation `DROP-ALL-LEGACY-DATA`. It is not run by ordinary deployments.

## Development

Use `npm run cf:dev` to run the Worker, D1 local database and Vite assets together. `npm run dev` starts Vite only and does not provide the Worker auth API.

```bash
npm ci
npm run cf:dev
npm run build
node --experimental-strip-types --test worker/*.test.mjs
```

## Deployment

GitHub Actions builds the app, applies pending non-destructive D1 migrations and deploys the Cloudflare Worker on changes merged to `main`. The one-time destructive reset must be run separately after the replacement Worker is complete and reviewed.

See [setup](docs/SETUP.md), [free-tier budget](docs/FREE_TIER_BUDGET.md), [references](docs/REFERENCES.md), and [security](SECURITY.md).

Research and education only. Not investment advice.
