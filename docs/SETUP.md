# Magic Screen setup

## Application overview

- React + TypeScript screener UI, responsive for mobile and desktop.
- Cloudflare Worker API and D1 cache.
- Bursa Malaysia and US market views.
- US MFI candidate universe integration.
- Manual Shariah-first shortlist workflow for US MFI candidates.
- Manual Investing Paths observations; no automated collection from that provider.

## One-time Cloudflare setup

### 1. Create the D1 database

In the Cloudflare dashboard, open **Storage & databases → D1 SQL Database** and create a database named `magic-screen-db`.

Copy its database ID and confirm it matches the `database_id` value in `wrangler.toml`. The Worker binds the database as `DB`.

### 2. Connect GitHub for automatic deployment

In Cloudflare, open **Workers & Pages → Create application → Connect to Git**. Select GitHub, then choose `fizminho/magic-screen` and the `main` branch.

Use these build settings:
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`

Save and deploy. Cloudflare Workers Builds can then build and deploy automatically whenever a commit is pushed to `main`. The Worker name in Cloudflare must remain `magic-screen`, matching `wrangler.toml`.

A successful GitHub build or Wrangler dry-run is not proof of a successful live deployment. Verify the deployed Worker and application separately after release.

## Automatic quote refresh

The configured Cron Triggers run scheduled quote-refresh work:
- `17 22 * * MON-FRI`
- `47 22 * * MON-FRI`
- `*/30 * * * *`

Check the Worker implementation and Cloudflare dashboard before relying on the schedule. The first quote adapter uses Yahoo Finance's chart endpoint for indicative quotes. This endpoint is unofficial and has no uptime or usage guarantee. Do not use it as an execution-price feed. Provider throttling or market holidays can result in partial updates.

## US MFI and Shariah workflow

The active US candidate universe remains sourced from Magic Formula Investing (MFI). The Shariah shortlist only includes active MFI candidates.

A ticker is eligible only when both Musaffa and HalalScreener have fresh Halal results, with a checked date and source reference recorded for each provider. Doubtful, Not Halal, missing, stale, conflicting or unsupported evidence is not eligible; cases requiring clarification go to manual review.

The application supports copyable AI prompts and paste-only JSON import for Shariah evidence, plus a manual Investing Paths entry form. Investing Paths rank, Earnings Yield, Return on Capital, fiscal period, checked date and source reference are entered manually.

These records are stored in the current browser's local storage. They do not automatically sync across devices or browsers. The workflow uses copy/paste text only.

The application does not scrape provider websites or make automated Musaffa, HalalScreener or Investing Paths requests. Do not use old research snapshots as current evidence. Re-check provider results and dates before relying on a ticker's status.

## Data-source limitations and project controls

- MFI screening results define the candidate universe; they are not Investing Paths rankings.
- Shariah status is evidence-based and manually recorded. No compliance status is inferred from a company name, ticker or sector.
- Investing Paths observations are manually entered, not collected through automated access.
- The app has no LLM API integration and requires no Gemini account or API key. AI research runs externally using the copied prompt.
- The accounting-policy and EdgarTools production migration work is paused. Existing research artifacts may be retained, but AI task statuses are not human or policy approvals.
- Do not add automated third-party data collection, production accounting writes, ranking changes or provider cutover without a fresh terms review and explicit owner approval.

See the [US MFI masterplan](US_MFI_MASTERPLAN.md) for the current implementation checklist and release gates.

## Local development

```bash
npm install
npm run dev
```

The frontend can run without D1, but the live API requires the Worker runtime and an initialised D1 database.

## Important

This is an educational research tool, not investment advice. Prices can be delayed, incomplete or unavailable. Verify company information, provider evidence and Shariah status before making investment decisions.
