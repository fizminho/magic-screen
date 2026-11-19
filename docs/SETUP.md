# Magic Screen setup

## What is in this first build

- React + TypeScript screener UI, responsive for mobile and desktop.
- Cloudflare Worker API and D1 cache.
- 30 Bursa Malaysia and 30 US starter tickers.
- Weekday scheduled quote refresh, split by market.
- Search, market switcher, sort and browser-session watchlist.
- Conservative Shariah labels: all records start as **Unverified**.
- No fabricated Magic Formula scores. Earnings Yield and Return on Capital remain blank until a reliable fundamentals source is integrated.

## One-time Cloudflare setup

### 1. Create the D1 database

In the Cloudflare dashboard, open **Storage & databases → D1 SQL Database** and create a database named `magic-screen-db`.

Copy its database ID. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.toml` with that ID. The repository is already configured to bind the database as `DB`.

The Worker creates its tables and index automatically on the first API request or scheduled refresh. You do not need to run SQL manually.

### 2. Connect GitHub for automatic deployment

In Cloudflare, open **Workers & Pages → Create application → Connect to Git**. Select GitHub, then choose `fizminho/magic-screen` and the `main` branch.

Use these build settings:
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`

Save and deploy. Cloudflare Workers Builds can then build and deploy automatically whenever a commit is pushed to `main`. The Worker name in Cloudflare must remain `magic-screen`, matching `wrangler.toml`.

## Automatic quote refresh

Two Cron Triggers run separate batches to stay within Cloudflare's per-invocation subrequest limits:
- Bursa Malaysia: 22:17 UTC Sunday to Thursday (06:17 Malaysia time, Monday to Friday).
- US equities: 22:47 UTC Monday to Friday (17:47 US Eastern during standard time, 18:47 during daylight time).

The first quote adapter uses Yahoo Finance's chart endpoint for indicative quotes. The selected ticker universe is currently static; automatic universe discovery and Magic Formula re-ranking are future steps. This endpoint is unofficial and has no uptime or usage guarantee. Do not use it as an execution-price feed. Provider throttling or market holidays can result in partial updates. The scheduled refresh does not fetch financial statements.

## Shariah status and Magic Formula

The first release intentionally does not infer Shariah compliance from a company name, sector, or ticker.

For Bursa Malaysia, the Securities Commission Malaysia (SC) publishes the SAC list twice yearly. The latest general list available at project start is dated 29 May 2026. The SC also publishes status updates for newly listed companies. The SC dataset still needs to be mapped to Bursa tickers and imported before Malaysian rows can be labelled.

For US equities, Mizan publishes a free personal-use API covering 424 large-cap US companies and reports results under AAOIFI, Dow Jones Islamic, S&P Shariah and MSCI Islamic. Its documentation states that it is research output, not a fatwa, and that side-activity income is not yet checked. US API integration is a next step; until then, all US rows remain Unverified.

References:
- Malaysia: [SC SAC list](https://www.sc.com.my/development/icm/shariah-compliant-securities/list-of-shariah-compliant-securities) and [new-listing status updates](https://www.sc.com.my/development/icm/shariah-compliant-securities/shariah-status-for-companies-seeking-listing-on-bursa-malaysia-securities-berhad).
- US: [Mizan API documentation](https://askmizan.com/api-docs).

Magic Formula ranking requires Earnings Yield and Return on Capital calculated from consistent, current financial statements. Those fields are not guessed from quote data. A future fundamentals provider integration should record the provider, reporting period, currency and refresh timestamp for every value.

## Local development

```bash
npm install
npm run dev
```

The frontend can run without D1, but the live API requires the Worker runtime and an initialised D1 database.

## Important

This is an educational research tool, not investment advice. Prices can be delayed, incomplete or unavailable. Verify all information with the exchange, issuer filings and your broker before making investment decisions.
