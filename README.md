# Magic Screen

A Cloudflare-first stock research dashboard for Bursa Malaysia and US equities.

## Current capabilities

- React + TypeScript responsive screener
- Bursa Malaysia and US market views
- US candidate universe sourced from the authenticated Magic Formula Investing screener
- Quote snapshots cached in Cloudflare D1
- SEC EDGAR Company Facts ingestion for US fundamentals
- Earnings Yield and Return on Capital calculations when the required facts are available
- Combined Magic Formula ranking is published only after every active MFI candidate has usable fundamentals
- SEC fundamentals sync runs in the background every 10 minutes, processing up to 10 candidates per invocation
- Search, sort, market switcher, watchlist and Shariah-status filtering
- Shariah status remains **Unverified** until a credible screening source is integrated

## Data sources and limitations

- **US candidate list:** Magic Formula Investing. Its screening results are a candidate universe, not a ranked result list.
- **US financial statements:** SEC EDGAR Company Facts. Current calculations require USD-denominated facts because MFI market capitalisation is in USD. Non-USD facts remain unavailable until an auditable FX conversion process is implemented.
- **Quotes:** Yahoo Finance's unofficial chart endpoint, provided on a best-effort basis without an uptime or usage guarantee.
- **Bursa Malaysia universe:** imported through the protected universe-import endpoint. Verify listing data against Bursa sources.
- **Shariah:** no compliance status is inferred from a company name, ticker or sector.

The screener is a research aid, not investment advice. Verify current filings, company disclosures and Shariah status before making an investment decision.

## Intentional design decisions

Read [Intentional design decisions](docs/INTENTIONAL_DESIGN_DECISIONS.md) before changing candidate selection, ranking gates, currency handling, SEC retry rules, MFI caching or scheduled processing. These behaviours are deliberate safeguards against misleading financial data.

Additional technical notes:
- [SEC fundamentals pipeline](docs/SEC_FUNDAMENTALS.md)
- [Magic Formula Investing integration](docs/MAGIC_FORMULA_INTEGRATION.md)
- [Stock universe and Bursa import](docs/STOCK_UNIVERSE.md)
- [Cloudflare setup](docs/SETUP.md)

## Stack

- React, TypeScript, Vite
- Cloudflare Workers Static Assets
- Cloudflare D1
- Workers Cron Triggers
