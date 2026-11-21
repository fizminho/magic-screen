# Magic Screen

A Cloudflare-first stock research dashboard for Bursa Malaysia and US equities.

## Current capabilities

- React + TypeScript responsive screener
- Bursa Malaysia and US market views
- US candidate universe sourced from the authenticated Magic Formula Investing screener
- Quote snapshots cached in Cloudflare D1
- EdgarTools is the designated primary extraction provider for US fundamentals (Python extraction lane; runtime cutover in progress)
- SEC EDGAR filings remain the underlying source; Company Facts is not a planned fallback provider
- Earnings Yield and Return on Capital remain candidate metrics until deterministic accounting validation and full-universe checks are approved
- The shadow US MFI preview ranks the accounting-validated subset using classic Greenblatt ordinal-rank sums; unsupported and unresolved candidates remain visible in coverage and are excluded from the ranked subset
- Production US rankings remain gated until the full universe, accounting policy and shadow validation are approved
- SEC fundamentals sync runs in the background every 10 minutes, processing up to 10 candidates per invocation
- Search, sort, market switcher, watchlist and Shariah-status filtering
- Shariah status remains **Unverified** until a credible screening source is integrated

## Data sources and limitations

- **US candidate list:** Magic Formula Investing. Its screening results are a candidate universe, not a ranked result list.
- **US financial statements:** SEC EDGAR annual filings extracted through EdgarTools. The older Company Facts runtime lane remains a legacy comparison path during migration and is not the designated long-term provider.
- **Quotes:** Yahoo Finance's unofficial chart endpoint, provided on a best-effort basis without an uptime or usage guarantee.
- **Bursa Malaysia universe:** imported through the protected universe-import endpoint. Verify listing data against Bursa sources.
- **Shariah:** no compliance status is inferred from a company name, ticker or sector.

The screener is a research aid, not investment advice. Verify current filings, company disclosures and Shariah status before making an investment decision.

## Intentional design decisions

Read [Intentional design decisions](docs/INTENTIONAL_DESIGN_DECISIONS.md) before changing candidate selection, ranking gates, currency handling, SEC retry rules, MFI caching or scheduled processing. These behaviours are deliberate safeguards against misleading financial data.

Additional technical notes:
- [EdgarTools primary provider decision and rollout](docs/EDGARTOOLS_PROVIDER.md)
- [SEC fundamentals pipeline](docs/SEC_FUNDAMENTALS.md)
- [Magic Formula Investing integration](docs/MAGIC_FORMULA_INTEGRATION.md)
- [Stock universe and Bursa import](docs/STOCK_UNIVERSE.md)
- [Cloudflare setup](docs/SETUP.md)

## Stack

- React, TypeScript, Vite
- Cloudflare Workers Static Assets
- Cloudflare D1
- Workers Cron Triggers


**US MFI market-cap provenance:** Full-universe EdgarTools runs take market caps from the same refreshed Magic Formula Investing response as the active ticker list, use its quote date for FX alignment, and validate every active symbol before ranking. The pinned 18 November 2026 map is regression-only; custom maps replace it without filling missing tickers from stale values.
