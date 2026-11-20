# Intentional design decisions

This document records deliberate behaviour in Magic Screen. These are guardrails, not unfinished work to "clean up" without understanding the trade-off.

## US candidate universe and ranking

- **Magic Formula Investing (MFI) is the US candidate-universe source.** The SEC ticker directory is used only to map MFI tickers to CIKs for fundamentals lookup. Do not merge the full SEC-listed universe into the displayed US screener.
- **US universe ownership is exclusive to MFI.** The frontend must not call the legacy `/api/universe?market=US` endpoint. That endpoint is read-only for compatibility/diagnostics; the former SEC directory import via `sync=1` is retired. SEC's ticker directory is only for ticker-to-CIK mapping. Keep the Bursa `/api/universe?market=MY` flow unchanged.
- **MFI's screening table is not a Magic Formula ranking.** Its returned rows are alphabetically ordered and do not include Earnings Yield or Return on Capital. Do not treat source order as a score or rank.
- **The `MFI CANDIDATE` stock-card flag is a source-membership label only.** It indicates that the stock was intentionally included by the MFI screener; it does not mean the stock has passed the Magic Formula ranking or a Shariah screen.
- **Ranks are all-or-nothing.** A combined rank (Earnings Yield rank + Return on Capital rank) is published only when every active MFI candidate has complete required fundamentals. If candidate membership changes or any candidate becomes incomplete, clear the old ranks; recalculate when the new full universe is ready. This avoids presenting stale or partial rankings. Equal Earnings Yield or Return on Capital values share the same component rank (`RANK()`); tied companies are not assigned arbitrary sequential positions.
- **The MFI result is cached for six hours** when screen settings match. Normal page loads use the cache; an explicit refresh can bypass it. This is intentional to reduce authenticated requests and avoid making every visit dependent on MFI session availability.
- **MFI authentication belongs in a Cloudflare Worker secret.** Never put session cookies in source code, frontend configuration, logs, documentation, or chat. The session can expire and must be refreshed in the secret configuration.

## Financial-data integrity

- **USD-only SEC facts are intentional.** MFI market capitalisation is in USD, so the current calculation only accepts SEC facts reported in USD. Do not mix local-currency financial statements with USD market cap. Add a reliable, dated FX conversion process before expanding currency support.
- **Missing debt is not assumed to be zero.** A company must have a recognized debt fact before the calculation is considered complete. A zero-debt company should be represented by a reported fact, not by missing data.
- **Missing required facts mean no ratios and no rank.** Unsupported XBRL tags, unavailable statements, non-positive denominators, and unsupported currency should remain incomplete rather than being filled with guesses.
- **Wait for market cap before SEC ingestion.** The background job skips candidates without a market-cap snapshot. This prevents an import/quote timing gap from prematurely marking a company incomplete.
- **Annual SEC inputs are tied to one filing accession.** The selected annual period is anchored by a recognised full-year USD fact from a 10-K, 20-F, or 40-F. EBIT and balance-sheet inputs must match both that fiscal year end and the anchor filing accession. Matching dates alone is insufficient because facts can be repeated or revised in later filings. Annual EBIT is never annualized from a partial quarter or backfilled from an older period; unsupported current-period tags remain incomplete.

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


## Stale fundamentals safeguard

- **Annual SEC periods older than 550 days are stale, not rankable.** Keep the SEC facts and filing dates for diagnosis, but set the calculated ratios to null, mark the record `stale_fiscal_period`, and expose a short `STALE FACTS` stock-card flag. The pipeline retries stale records on the normal incomplete-facts cadence. This is a conservative freshness guard, not a claim that every issuer files on the same schedule.


## Gemini-assisted SEC fact discovery

- **Gemini is a tag-mapping assistant, not a financial-data source.** The diagnostic endpoint supplies only SEC Company Facts entries in USD from one annual filing accession and fiscal period. Gemini may select an XBRL concept, but it may not invent values, combine periods, annualize quarters, or calculate missing inputs.
- **Every selected value must exactly match a supplied SEC fact.** The Worker rejects a selection unless its tag, numeric value, fact type (annual EBIT versus instant balance-sheet fact), accession, period end, and USD unit are represented in the candidate set.
- **AI extraction is review-only and never rankable.** The endpoint returns `AI_EXTRACTED_REVIEW_REQUIRED` and `eligible_for_magic_formula: false`. A matching tag is not enough to certify accounting meaning or formula suitability. Do not write these results into `stock_fundamentals`, calculate ratios, or publish ranks until a separate deterministic validation and reconciliation stage is implemented.
- **Gemini is on hold in the product UI.** Keep the diagnostic endpoint and server-side safeguards dormant for now, but do not expose a Gemini action in the screener until API project access is resolved and the user explicitly resumes this work.
- **The Gemini diagnostic is manually invoked and protected.** It requires the existing `UNIVERSE_SYNC_TOKEN` bearer authorization and the Cloudflare Worker secret `GEMINI_API_KEY`. The key must never be placed in frontend code, GitHub, logs, or chat. The endpoint does not run during normal page loads or scheduled ingestion and does not write to D1.
- **Gemini uses a Flash-Lite-only fallback chain.** `gemini-2.5-flash-lite` is first because it successfully completed the HRB diagnostic and is the lowest-cost proven choice in the current workflow. If unavailable or repeatedly rate-limited, try `gemini-3.5-flash-lite` and then `gemini-3.1-flash-lite`. Never automatically escalate to Pro or standard Flash models. Actual model availability and free-tier quota remain project-specific. HTTP 429/500/503 receives one short retry per model before moving to the next; HTTP 404 skips an unavailable model ID. Authentication, permission, and malformed-request errors stop immediately. The result records the model actually used and attempted model sequence. HTTP success with malformed/truncated JSON is also treated as a model failure: the Worker makes one short retry, then advances to the next model. Markdown fences and surrounding prose are tolerated only when a single JSON object can be safely extracted. Every model receives the identical bounded SEC candidate set and must pass the same exact-tag/value/kind validation. The final provider error message is surfaced in a bounded form.
- **The diagnostic input is bounded.** Only a maximum of 500 same-accession USD concepts are sent to the model, prioritised by financial-statement-related labels. If a required concept is not in that set or cannot be mapped safely, it remains missing.
- **Short-term AI extraction flags must remain explicit.** If AI-derived data is later surfaced in a stock card, use a short label such as `AI REVIEW` and explain that it is not yet eligible for the Magic Formula. Never label model output as verified solely because it matches a supplied fact.



- **Gemini JSON must satisfy the full extraction contract.** A response is not accepted merely because it parses as a JSON object. All six required fields must be present with the expected nullable tag/value and reason shape; partial or malformed objects are retried and then passed to the next Flash-Lite model. This prevents an empty or truncated-but-parseable response from being reported as a successful diagnostic.

- **SEC missing facts and explicit zeros remain distinct.** Company Facts `null` means no matching standard entity-wide observation was found, not that the issuer reported zero or necessarily omitted the item. Preserve numeric zero as a reported value and expose missing/zero field flags separately for review.
- **Balance-sheet facts must match the exact annual period end.** Do not carry forward an earlier quarter-end or comparative balance-sheet value, even when it falls within 120 days of the annual period. A missing exact-date fact remains missing and prevents the affected calculation.
- **Debt must have a complete current/non-current split.** Keep accounting scopes matched: US-GAAP `DebtCurrent` pairs with a non-current debt-and-lease aggregate; IFRS `BorrowingsCurrent` pairs with `BorrowingsNoncurrent`; debt-only split tags pair only with debt-only tags. Never mix lease-inclusive and debt-only facts or fill missing components with zero. Prefer the US-GAAP `DebtCurrent` aggregate plus a non-current debt fact; it already combines short-term borrowings and current maturities, so never add it to those component facts. If the aggregate is unavailable, require the separately reported current components and a non-current component. Never coerce missing facts to zero. A finance-lease-only fallback requires both current and non-current values and is allowed only when no borrowing facts exist. Require at least one current borrowing component and a non-current borrowing component from the same filing accession. Only when no borrowing components are reported may a complete current/non-current finance-lease pair be used. Never coerce a missing component to zero or treat a lone long-term debt fact as total debt; incomplete debt keeps Enterprise Value and ratios unavailable.
- **Restricted cash is not treated as available cash for Enterprise Value.** The SEC fundamentals pipeline and Gemini diagnostic accept unrestricted cash and cash-equivalent concepts only. Concepts whose XBRL tag includes restricted cash are rejected, even if they match the filing accession and period. If an issuer reports only combined restricted and unrestricted cash, leave cash unresolved rather than overstating cash available to repay debt.


The HRB diagnostic also attempts to discover the filing's extracted XBRL instance document from the SEC accession directory and expose same-period, non-dimensional USD annual operating/revenue/expense facts as `instance_operating_facts`. This is diagnostic-only: instance facts are not sent to Gemini, stored, calculated, or ranked. If the SEC directory index or instance document is unavailable, the response reports `instance_facts_status` and continues with Company Facts results.


- **SEC presentation-linkbase evidence is diagnostic-only.** The Worker may inspect the filing's presentation linkbase to report the statement role and direct parent/child concept relationships for a candidate expense fact. This evidence supports human review but cannot independently establish expense completeness or enable a production EBIT derivation. Keep it separate from formula calculations and ranking. Preserve each matching arc's `order` and optional `preferredLabel` metadata; without these attributes, a flattened parent/child list can lose the filing's intended presentation sequence. This additional metadata is still not proof of expense completeness. Where the filing schema provides a matching `roleType`, expose its `definition` beside the role URI. Treat this as filing-supplied context, not a semantic approval of the expense concept.\n\n- **HRB derived EBIT diagnostic is filing-scoped.** The current revenue-minus-`CostsAndExpenses` reconciliation is permitted only for HRB accession `0000012659-26-000026`, fiscal period ending `2026-06-30`. Other issuers and other HRB filings receive `out_of_scope`; they must not inherit this issuer-specific tag interpretation. The candidate remains review-only and cannot populate fundamentals or rankings.

- **Gemini HTTP 403 handling:** treat HTTP 403 as a non-retryable project/key access denial, preserve only safe Google error metadata (HTTP/API status, reason, service), and do not cycle through additional models. Model fallback is reserved for model availability and transient service failures; changing models cannot repair a project-level permission restriction. Never expose the Gemini API key in diagnostics.
- **The SEC extension diagnostic initializes its own D1 schema.** Its protected route calls the shared schema initializer before querying the active MFI universe and SEC CIK map. This keeps the diagnostic independently callable on a fresh or newly provisioned Worker without relying on a prior screener page/API request.
- **Custom SEC extension facts are discovery-only.** The protected extension diagnostic may list filing-specific XBRL facts and labels from the selected annual accession, but it cannot map them to required fundamentals, write D1, calculate ratios, or rank. Candidate tags must be reviewed for period, unit, dimensions, presentation, and accounting meaning before any production mapping.
- **SEC extension labels are indexed by both locator ID and local concept name.** XBRL linkbase locators commonly use a `namespace_localName` fragment, while the instance element uses only `localName`. Preserve both lookup forms so the diagnostic can attach issuer-provided labels without assuming the namespace prefix is part of the XML element name.

## HRB 2026 SEC extension review

- **HRB's 2026 extension scan did not identify a usable custom EBIT concept.** The annual filing diagnostic returned 17 issuer-specific facts. They were deferred contract liabilities, debt-covenant ratios, credit-facility capacity, accrued PP&E additions, deferred-tax disclosures, future debt maturities, and loan-loss provisions. None is a defensible replacement for reported operating income, total debt, unrestricted cash, or the PP&E balance.
- **Dimensional HRB extension facts are not company-wide totals.** The deferred contract-liability facts and debt-covenant metrics carry dimensions. Do not combine them with non-dimensional facts or treat them as consolidated totals without reviewing the exact dimensional members and statement presentation.
- **HRB's accrued PP&E additions are not net PP&E.** A duration fact describing additions during the year cannot substitute for the instant balance-sheet carrying amount.
- **HRB's debt maturity in year eleven is not total debt.** A maturity-schedule fact is a future principal repayment disclosure and must not be used as the issuer's current total debt.
- **HRB EBIT remains a filing-specific review candidate only.** The previously reconciled FY2026 operating-income candidate of USD 907.686 million is based on reported revenue less reported operating costs/expenses and reconciles to pretax income after the disclosed non-operating item and interest expense. It is not a generic production rule and must not be applied to other issuers or periods. The standard SEC Company Facts OperatingIncomeLoss concept was not present for this filing.

## SEC presentation-linkbase diagnostic

- **Presentation relationships remain diagnostic evidence only.** The SEC extension inspector now reads the filing's `_pre.xml` presentation linkbase and reports the role URI, parent/child concept relationship, order, and preferred label for matching extension concepts. These relationships help distinguish statement presentation from footnote placement, but they do not prove that a concept is a complete or correctly scoped accounting total. No presentation relationship is automatically mapped into production fundamentals, ratios, or rankings.


## SEC filing inspector: standard facts alongside extensions

- **Standard taxonomy facts are displayed beside issuer extensions, but both remain diagnostic-only.** The filing inspector now returns a separate `statement_facts` collection for relevant US-GAAP and IFRS concepts found in the extracted XBRL instance, including their labels when available, value, unit, period, dimensions, context, and presentation relationships. Extension facts remain in `extension_facts`.
- **No diagnostic fact is promoted automatically.** The combined view helps reviewers reconcile reported operating income, revenue, costs, debt, cash, and asset concepts against the filing's presentation structure. It does not write facts to D1, change production EBIT selection, calculate ratios, or create rankings.
- **The diagnostic is intentionally bounded.** It includes instant facts and full-year duration facts ending on the selected annual filing period, filters to relevant financial concept names, and caps returned statement facts at 150 and extension facts at 100. The `truncated` flag indicates when either cap is exceeded.


## SEC filing diagnostic response size

- **The default diagnostic response is intentionally compact.** It returns at most 30 extension facts and 40 standard statement facts, with only concise presentation parent/role hints. This keeps the response usable in browser clients and avoids flooding the user with repeated context and relationship metadata.
- **Standard statement facts are prioritized without dimensional breakdowns first.** This makes primary company-wide values easier to spot; extension facts retain dimensional-first ordering to support discovery.
- **Counts and truncation are explicit.** The response reports total fact counts and a `truncated` flag. Production calculations, D1 storage, and ranking remain unchanged.


## SEC filing diagnostic: prioritize Magic Formula inputs

- **The diagnostic is intentionally focused on likely formula inputs rather than an alphabetical sample.** Standard facts are prioritized for operating income/profit, revenue, debt, cash, current assets/liabilities, PP&E, operating costs, and interest expense. This makes relevant facts visible within the response limit.
- **Repeated non-dimensional facts are deduplicated.** Facts repeated through multiple contexts or presentation roles are returned once; dimensional facts are retained separately because they may represent distinct members.
- **The response is smaller by default.** It returns up to 24 prioritized standard facts and 12 extension facts, with one concise presentation hint per fact. Counts report the deduplicated candidate totals; `truncated` signals omitted candidates.
- **Priority is not approval.** These are discovery candidates only. No fact is automatically mapped into production calculations, ratios, or rankings.


## SEC filing diagnostic: exact concept priority and dimensional deduplication

- **Fact priority uses complete concept names for core inputs.** EBIT candidates are restricted to explicit operating-income concepts; non-operating income and operating-loss tax-note concepts must not be promoted by substring matches. Revenue, debt, cash, current assets/liabilities, PP&E, operating costs, and interest expense follow in review priority.
- **Facts are deduplicated using their dimensional signature.** Repeated contexts or presentation roles no longer inflate the response, while genuinely different dimensional members remain distinct.
- **Priority is not an accounting approval.** The endpoint remains read-only and diagnostic. No facts are mapped into production ratios or rankings without separate review.


## SEC diagnostic: consolidated facts before dimensional breakdowns

- **The compact standard-fact list intentionally excludes dimensional facts.** Consolidated, non-dimensional facts are the first review target for company-wide Magic Formula inputs. Segment and other dimensional facts remain outside this short list so they cannot crowd out balance-sheet and income-statement totals.
- **This is a display-selection rule, not a data deletion or accounting mapping.** The diagnostic remains read-only; dimensional facts are not written to production or used in ratios/rankings.


## SEC diagnostic: filing-specific arithmetic review checks

- **A narrowly scoped review-only arithmetic check may be returned when consolidated annual revenue and costs/expenses are both explicitly tagged in the same extracted filing.** The result is labelled `review_only_not_approved_ebit`; it is not an EBIT fact, approved mapping, or production input.
- **The diagnostic checks for an explicit operating-income fact separately.** If none is present, the arithmetic result remains a lead for manual reconciliation, not a substitute. Cost classifications and non-operating items vary by issuer, so no generic inference is permitted.
- **This check is intentionally read-only.** It does not update SEC fundamentals, earnings yield, return on capital, or Magic Formula ranks.


## SEC diagnostic: pretax reconciliation for review-only EBIT candidates

- **The filing inspector may cross-check a revenue-minus-costs arithmetic candidate against reported pretax income.** When same-period consolidated annual interest expense, other non-operating income/expense, and pretax income facts are available, it calculates candidate EBIT less interest expense plus other non-operating income/expense and reports the difference from reported pretax income.
- **An exact reconciliation is supporting evidence, not automatic approval.** The check remains issuer- and filing-specific, read-only, and labelled for manual review. It does not change production EBIT mappings, fundamentals, ratios, or rankings.
- **Missing components remain null.** The diagnostic does not infer zero for missing interest, non-operating, or pretax facts.


## SEC diagnostic: direct operating-income fact visibility

- The filing-level inspector reports a direct operating-income fact when it finds one of the exact concepts already recognized by the production parser across the supported US-GAAP and IFRS taxonomies.
- It returns the concept, label, amount, unit, duration type, and a presentation hint so reviewers can see which direct fact was found. The boolean is retained for simple client checks.
- **INTENTIONAL:** this is diagnostic visibility only. It does not broaden production tag support or accept generic profit, pretax income, or non-operating income as EBIT. Production calculations remain governed by the existing explicit-tag parser.


### SEC debt fallback when current debt is explicitly zero

- Adobe FY2025 reports aggregate `DebtCurrent` as an explicit zero and `LongTermDebt` as USD 6.210 billion on its non-current liabilities statement.
- The production pipeline may use `LongTermDebt` as the debt balance only when the same annual accession explicitly reports `DebtCurrent = 0`.
- INTENTIONAL: do not use this fallback when current debt is non-zero or missing. In those cases, `LongTermDebt` may overlap current maturities and could be double-counted; a matched current/non-current split remains required.
- This is a conservative, narrow fallback. It does not infer lease-inclusive debt or treat missing debt components as zero.
- The ADBE diagnostic itself remains review-only; the production fallback uses exact-accession SEC Company Facts values and does not rely on the diagnostic endpoint.


## SEC directory must never expand the stock universe

- INTENTIONAL: company_tickers_exchange.json is fetched as an in-memory CIK lookup only. Its full directory must never be inserted into stock_master or treated as the US screener universe. Only active MFI candidates are eligible for persistent CIK mappings and SEC fundamentals.
- On a mapping refresh, resolve each active MFI ticker first, then perform one upsert per ticker into sec_company_map, storing either the CIK or UNMAPPED. Never write a placeholder row and then update it in a second D1 operation.
- This bounds mapping writes to the active MFI list (normally 30 or 50 candidates), not the SEC directory's approximately 95,000 companies. The in-memory SEC directory download itself does not create D1 row writes.
