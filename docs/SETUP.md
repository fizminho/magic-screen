# Magic Screen setup

## What is in this first build

- React + TypeScript screener UI, responsive for mobile and desktop.
- Cloudflare Worker API and D1 cache.
- Weekday scheduled quote refresh.
- Bursa Malaysia and US starter universes.
- Conservative Shariah labels: all records start as **Unverified**.
- No fabricated Magic Formula scores. Earnings Yield and Return on Capital remain blank until a fundamentals source is integrated.

## Deploy to Cloudflare

1. In Cloudflare, create a D1 database named `magic-screen-db`.
2. Copy the database ID into `wrangler.toml`, replacing `REPLACE_WITH_D1_DATABASE_ID`.
3. In a terminal, run:

   ```bash
   npm install
   npx wrangler d1 execute magic-screen-db --remote --file=./db/schema.sql
   npm run cf:deploy
   ```

4. Cloudflare Workers & Pages will provide the deployed `workers.dev` URL. Add a custom domain in the Worker settings if desired.

## Automatic refresh

A Cron Trigger is configured for 22:17 UTC Monday to Friday (06:17 Malaysia time, Tuesday to Saturday). It refreshes the quote cache on trading weekdays. Provider throttling or market holidays can result in partial updates.

The initial quote adapter uses Yahoo Finance's chart endpoint for indicative market quotes. This endpoint is unofficial and has no uptime or usage guarantee. Do not use it as an execution price feed. The scheduled refresh does not fetch financial statements.

## Shariah status and Magic Formula

The first release intentionally does not infer Shariah compliance from a company name, sector, or ticker. Bursa Malaysia's official Shariah list and a recognised US screening methodology/provider must be integrated before records can be labelled compliant or non-compliant. Unknown records remain Unverified.

Magic Formula ranking requires Earnings Yield and Return on Capital calculated from consistent, current financial statements. Those fields are not guessed from quote data. A future fundamentals provider integration should record the provider, reporting period, currency, and refresh timestamp for every value.

## Local development

```bash
npm install
npm run dev
```

The frontend can run without D1, but the live API requires the Worker runtime and an initialised D1 database.

## Important

This is an educational research tool, not investment advice. Prices can be delayed, incomplete, or unavailable. Verify all information with the exchange, issuer filings, and your broker before making investment decisions.
