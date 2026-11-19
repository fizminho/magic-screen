# Intentional design decisions

This document records deliberate behaviour in Magic Screen. These are guardrails, not unfinished work to "clean up" without understanding the trade-off.

## US candidate universe and ranking

- **Magic Formula Investing (MFI) is the US candidate-universe source.** The SEC ticker directory is used only to map MFI tickers to CIKs for fundamentals lookup. Do not merge the full SEC-listed universe into the displayed US screener.
- **MFI's screening table is not a Magic Formula ranking.** Its returned rows are alphabetically ordered and do not include Earnings Yield or Return on Capital. Do not treat source order as a score or rank.
- **The `MFI CANDIDATE` stock-card flag is a source-membership label only.** It indicates that the stock was intentionally included by the MFI screener; it does not mean the stock has passed the Magic Formula ranking or a Shariah screen.
- **Ranks are all-or-nothing.** A combined rank (Earnings Yield rank + Return on Capital rank) is published only when every active MFI candidate has complete required fundamentals. If candidate membership changes or any candidate becomes incomplete, clear the old ranks; recalculate when the new full universe is ready. This avoids presenting stale or partial rankings.
- **The MFI result is cached for six hours** when screen settings match. Normal page loads use the cache; an explicit refresh can bypass it. This is intentional to reduce authenticated requests and avoid making every visit dependent on MFI session availability.
- **MFI authentication belongs in a Cloudflare Worker secret.** Never put session cookies in source code, frontend configuration, logs, documentation, or chat. The session can expire and must be refreshed in the secret configuration.

## Financial-data integrity

- **USD-only SEC facts are intentional.** MFI market capitalisation is in USD, so the current calculation only accepts SEC facts reported in USD. Do not mix local-currency financial statements with USD market cap. Add a reliable, dated FX conversion process before expanding currency support.
- **Missing debt is not assumed to be zero.** A company must have a recognized debt fact before the calculation is considered complete. A zero-debt company should be represented by a reported fact, not by missing data.
- **Missing required facts mean no ratios and no rank.** Unsupported XBRL tags, unavailable statements, non-positive denominators, and unsupported currency should remain incomplete rather than being filled with guesses.
- **Wait for market cap before SEC ingestion.** The background job skips candidates without a market-cap snapshot. This prevents an import/quote timing gap from prematurely marking a company incomplete.
- **Annual EBIT is not annualized from a partial quarter.** The first version uses annual 10-K, 20-F, or 40-F periods and balance-sheet facts around the corresponding fiscal period end.

## Background processing

- **SEC fundamentals sync runs every thirty minutes**, independently of browser page loads, processing at most ten candidates per invocation. This allows the initial 30-stock batch to complete in roughly one hour while reducing idle scheduled work. The UI reads progress; it does not drive the ingestion job.
- **The SEC cron is a separate lane from quote refresh.** Its scheduled handler returns after starting the fundamentals job so the same invocation does not also refresh quotes. Ranking is recalculated when at least one active candidate is unranked and the entire active universe has current, complete fundamentals. This also repairs ranks after a universe change without forcing unnecessary SEC fetches; idle runs with a complete ranking preserve it.
- **Successful calculations refresh after 30 days; incomplete/provider-error rows retry after seven days.** This balances freshness against repeated requests for issuers whose tagging or provider response has not changed.
- The manual `/api/fundamentals/sync` endpoint remains for controlled diagnostics. Normal UI usage should not call it.

## Market and compliance labels

- **Shariah status defaults to unverified.** Do not infer Shariah compliance from a ticker, sector, or company name. A verified status needs a credible source and an as-of date.
- **Yahoo Finance chart data is an unofficial quote source.** Treat it as best-effort data, not a guaranteed exchange feed.

When changing one of these behaviours, update this document and the related inline code comments together.

- **Avoid redundant D1 writes:** SEC ranking updates only write rows when a rank changes. MFI stock-master and market-cap snapshot upserts only update existing rows when the stored values differ. This is intentional to preserve the Cloudflare D1 daily row-write allowance, especially during scheduled SEC runs and manual MFI refreshes.
- **Inactive MFI candidates are only marked inactive when their status changes.** Re-importing the same candidate universe must not repeatedly write unchanged inactive rows to D1.

- **The SEC scheduled handler must match the cron expression in `wrangler.toml`.** The active expression is `*/30 * * * *`; changing the schedule requires changing the dispatch condition too. The pipeline status endpoint reports MFI import time separately from SEC fact-processing time and quote-cache time so these timestamps are not conflated.

- **MFI ranking inputs invalidate combined ranks.** Candidate membership or market-cap changes clear existing ranks. SEC facts are reprocessed when the stored market cap differs from the latest MFI snapshot; the full ranking is rebuilt only when every active candidate's fundamentals match its current market cap. The SEC job also checks for unranked candidates and can rebuild ranks without an unnecessary SEC fetch when all inputs are already current.

- **CI performs a Wrangler dry-run after the TypeScript/Vite build.** This validates Cloudflare Worker bundling and static-asset configuration without deploying or changing production resources. A successful GitHub build still does not prove a live Cloudflare deployment.

- **Pipeline status separates pending stages.** The US status panel distinguishes candidates waiting for a market-cap snapshot, candidates mapped and ready for their first SEC facts attempt, incomplete facts, stale market-cap valuations, unmapped tickers, and provider errors. These states are not interchangeable and should remain separately visible.
