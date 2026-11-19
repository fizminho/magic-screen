# Intentional design decisions

This document records deliberate behaviour in Magic Screen. These are guardrails, not unfinished work to "clean up" without understanding the trade-off.

## US candidate universe and ranking

- **Magic Formula Investing (MFI) is the US candidate-universe source.** The SEC ticker directory is used only to map MFI tickers to CIKs for fundamentals lookup. Do not merge the full SEC-listed universe into the displayed US screener.
- **MFI's screening table is not a Magic Formula ranking.** Its returned rows are alphabetically ordered and do not include Earnings Yield or Return on Capital. Do not treat source order as a score or rank.
- **Ranks are all-or-nothing.** A combined rank (Earnings Yield rank + Return on Capital rank) is published only when every active MFI candidate has complete required fundamentals. Until then, leave all formula ranks blank. This avoids presenting a misleading partial ranking.
- **The MFI result is cached for six hours** when screen settings match. Normal page loads use the cache; an explicit refresh can bypass it. This is intentional to reduce authenticated requests and avoid making every visit dependent on MFI session availability.
- **MFI authentication belongs in a Cloudflare Worker secret.** Never put session cookies in source code, frontend configuration, logs, documentation, or chat. The session can expire and must be refreshed in the secret configuration.

## Financial-data integrity

- **USD-only SEC facts are intentional.** MFI market capitalisation is in USD, so the current calculation only accepts SEC facts reported in USD. Do not mix local-currency financial statements with USD market cap. Add a reliable, dated FX conversion process before expanding currency support.
- **Missing debt is not assumed to be zero.** A company must have a recognized debt fact before the calculation is considered complete. A zero-debt company should be represented by a reported fact, not by missing data.
- **Missing required facts mean no ratios and no rank.** Unsupported XBRL tags, unavailable statements, non-positive denominators, and unsupported currency should remain incomplete rather than being filled with guesses.
- **Wait for market cap before SEC ingestion.** The background job skips candidates without a market-cap snapshot. This prevents an import/quote timing gap from prematurely marking a company incomplete.
- **Annual EBIT is not annualized from a partial quarter.** The first version uses annual 10-K, 20-F, or 40-F periods and balance-sheet facts around the corresponding fiscal period end.

## Background processing

- **SEC fundamentals sync runs every ten minutes**, independently of browser page loads, processing at most ten candidates per invocation. The UI reads progress; it does not drive the ingestion job.
- **The SEC cron is a separate lane from quote refresh.** Its scheduled handler returns after starting the fundamentals job so the same invocation does not also refresh quotes.
- **Successful calculations refresh after 30 days; incomplete/provider-error rows retry after seven days.** This balances freshness against repeated requests for issuers whose tagging or provider response has not changed.
- The manual `/api/fundamentals/sync` endpoint remains for controlled diagnostics. Normal UI usage should not call it.

## Market and compliance labels

- **Shariah status defaults to unverified.** Do not infer Shariah compliance from a ticker, sector, or company name. A verified status needs a credible source and an as-of date.
- **Yahoo Finance chart data is an unofficial quote source.** Treat it as best-effort data, not a guaranteed exchange feed.

When changing one of these behaviours, update this document and the related inline code comments together.
