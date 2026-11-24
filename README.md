# Magic Screen

A Cloudflare-first stock research dashboard for Bursa Malaysia and US equities.

## Current capabilities

- Responsive React + TypeScript screener
- Bursa Malaysia and US market views
- US candidate universe sourced from the authenticated Magic Formula Investing (MFI) screener
- Quote snapshots cached in Cloudflare D1
- Search, sort, market switcher and watchlist
- Shariah-first US shortlist with separate eligible, review and excluded states
- Copyable AI research prompt and paste-only JSON import for Shariah evidence
- Manual Investing Paths observations with rank, Earnings Yield, Return on Capital, fiscal period, checked date and source reference

## US MFI and Shariah workflow

1. The active US candidate universe remains sourced from MFI. The Shariah shortlist only includes active MFI candidates.
2. A ticker is eligible only when both Musaffa and HalalScreener have a fresh Halal result and each check includes its checked date and source reference.
3. Doubtful, Not Halal, missing, stale, conflicting or unsupported evidence is not eligible. Cases requiring clarification are routed to manual review.
4. Investing Paths ranking observations are entered manually. The screener records rank, Earnings Yield, Return on Capital, fiscal period, checked date and source reference.
5. Shariah evidence and manual ranking observations are stored in the current browser's local storage. Copy/paste is the only import/export workflow; records do not automatically sync between devices.

The app does not scrape provider sites or make automated Musaffa, HalalScreener or Investing Paths requests. AI research is performed outside the app with a user-copied prompt; the app does not require a Gemini account, Gemini API key or any LLM integration. Do not treat old research snapshots as current screening evidence. Re-check provider results and dates before relying on a ticker's status.

## Data sources and limitations

- **US candidate list:** Magic Formula Investing. MFI screening results define the candidate universe; they are not the Investing Paths ranking.
- **Shariah evidence:** Musaffa and HalalScreener, recorded manually with provenance. No compliance status is inferred from a company name, ticker or sector.
- **Investing Paths observations:** manually recorded research values; not collected through automated access.
- **US financial statements:** SEC EDGAR is the underlying filing source. EdgarTools research and accounting validation remain a separate, paused migration lane; production ranking cutover is not approved.
- **Quotes:** Yahoo Finance's unofficial chart endpoint, provided on a best-effort basis without an uptime or usage guarantee.
- **Bursa Malaysia universe:** imported through the protected universe-import endpoint. Verify listing data against Bursa sources.

The screener is a research aid, not investment advice. Verify current filings, provider evidence and Shariah status before making an investment decision.

## Research and implementation status

- The Shariah-first manual workflow and screener UI are implemented; see the [US MFI masterplan](docs/US_MFI_MASTERPLAN.md).
- The external-provider evaluation found no provider approved for automated production use under the current free-only and permitted-access requirements. See the [replacement plan](docs/US_MFI_EXTERNAL_PROVIDER_REPLACEMENT_PLAN.md) and [read-only POC report](docs/US_MFI_EXTERNAL_PROVIDER_POC_2026-11-24.md).
- No LLM API integration or AI account is required. Do not add automated collection, scraping, or third-party ranking-site access without reviewing current terms and obtaining any required permission.
- The accounting-policy and EdgarTools production migration work is paused. Existing research artifacts and tests are retained, but AI task statuses are not human or policy approvals.
- Repository CI and Wrangler dry-run do not prove that the live application has deployed. Live deployment verification and release sign-off remain separate gates.

## Technical notes

- [Cloudflare setup](docs/SETUP.md)
- [Intentional design decisions](docs/INTENTIONAL_DESIGN_DECISIONS.md)
- [EdgarTools provider decision and rollout](docs/EDGARTOOLS_PROVIDER.md)
- [SEC fundamentals pipeline](docs/SEC_FUNDAMENTALS.md)
- [Magic Formula Investing integration](docs/MAGIC_FORMULA_INTEGRATION.md)
- [Stock universe and Bursa import](docs/STOCK_UNIVERSE.md)
- [Security](SECURITY.md)

## Stack

- React, TypeScript, Vite
- Cloudflare Workers Static Assets
- Cloudflare D1
- Workers Cron Triggers

**Important:** Do not enable automated third-party data collection, production accounting writes, ranking changes or provider cutover without a fresh terms review and explicit owner approval.
