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

A Cron Trigger is configured for 22:17 UTC Sunday to Thursday (06:17 Malaysia time, Monday to Friday). It refreshes the quote cache on trading weekdays. Provider throttling or market holidays can result in partial updates.

The initial quote adapter uses Yahoo Finance's chart endpoint for indicative market quotes. This endpoint is unofficial and has no uptime or usage guarantee. Do not use it as an execution price feed. The scheduled refresh does not fetch financial statements.

## Shariah status and Magic Formula

The first release intentionally does not infer Shariah compliance from a company name, sector, or ticker. For Bursa Malaysia, the Securities Commission Malaysia (SC) publishes the SAC list twice yearly; its latest general list available at project start is dated 29 May 2026. The SC also publishes status updates for newly listed companies. The SC dataset still needs to be mapped to Bursa tickers and imported before Malaysian rows can be labelled. For US equities, Mizan publishes a free personal-use API for 424 large-cap US companies and reports results under AAOIFI, Dow Jones Islamic, S&P Shariah and MSCI Islamic. Its docs state that it is research output, not a fatwa, and that side-activity income is not yet checked. US API integration is a next step; until then, all US rows remain Unverified.

Magic Formula ranking requires Earnings Yield and Return on Capital calculated from consistent, current financial statements. Those fields are not guessed from quote data. A future fundamentals provider integration should record the provider, reporting period, currency, and refresh timestamp for every value.

## Shariah data references\n\n- Malaysia: [SC SAC list](https://www.sc.com.my/development/icm/shariah-compliant-securities/list-of-shariah-compliant-securities) and [new-listing status updates](https://www.sc.com.my/development/icm/shariah-compliant-securities/shariah-status-for-companies-seeking-listing-on-bursa-malaysia-securities-berhad).\n- US: [Mizan API documentation](https://askmizan.com/api-docs). Personal-use API; check its methodology notes and coverage before relying on a result.\n\n## Local development

```bash
npm install
npm run dev
```

The frontend can run without D1, but the live API requires the Worker runtime and an initialised D1 database.

## Important

This is an educational research tool, not investment advice. Prices can be delayed, incomplete, or unavailable. Verify all information with the exchange, issuer filings, and your broker before making investment decisions.
