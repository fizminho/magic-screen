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

The legacy screener UI and public MFI Worker endpoints have been removed. The replacement includes passkey bootstrap/sign-in, passkey inventory and recovery controls, owner-only holdings and watchlist APIs/UI, currency-separated dashboard summaries and risk thresholds, quote snapshot APIs, an optional browser-only MarketData.app US delayed-quote adapter, and a strict manual Bursa CSV import parser/UI.

MarketData.app is optional and not enabled until the owner supplies their own API token. Its free tier is 100 credits/day, at least 24-hour delayed, US-only and one source IP at a time. The token stays in browser session storage and is never sent to the Worker. Bursa prices are manual/CSV until a licensed data source is approved. On-demand SEC EDGAR filing metadata lookup is implemented for US instruments with an owner-supplied CIK and configured contact User-Agent. Scheduled SEC refresh, news caching, publisher news scraping, push alerts and Cloudflare Workers AI analysis is planned behind a strict public-data-only boundary; Gemini API is not used.

The D1 schema is defined in `migrations/`. A one-time production reset is separately guarded by `.github/workflows/reset-production-d1.yml` and requires the exact manual confirmation `DROP-ALL-LEGACY-DATA`. It is not run by ordinary deployments.

## Development

Use `npm run cf:dev` to run the Worker, local D1 database and Vite assets together. `npm run dev` starts Vite only and does not provide the Worker APIs.

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run cf:dev
npm run build
node --experimental-strip-types --test worker/*.test.mjs
```

## Deployment

GitHub Actions builds the app, applies pending non-destructive D1 migrations and deploys the Cloudflare Worker on changes merged to `main`. The one-time destructive reset must be run separately after the replacement Worker is complete, configured and reviewed.

See [setup](docs/SETUP.md), [data sources](docs/DATA_SOURCES.md), [free-tier budget](docs/FREE_TIER_BUDGET.md), [references](docs/REFERENCES.md), and [security](SECURITY.md).

Research and education only. Not investment advice.
