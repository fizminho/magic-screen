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


## SEC directory row cleanup

- The protected `/api/admin/cleanup-sec-universe` route can preview or delete only US `stock_master` rows whose source is exactly `SEC company_tickers_exchange.json`.
- **INTENTIONAL:** protect any row whose matching `stock_snapshot.provider` is `Magic Formula Investing`, because an earlier SEC upsert may have overwritten the original `stock_master.source` on a legitimate MFI symbol.
- Cleanup runs one bounded batch (maximum 5,000 rows) per request and does not call `ensureSchema`; this avoids unrelated schema/seed writes. Preview is read-only. Do not delete `stock_snapshot`, `stock_fundamentals`, or `sec_company_map` rows as part of this cleanup.
- D1 DELETE operations count toward daily rows-written quota. On Workers Free, wait until the daily reset if the write quota has already been exhausted, and run small batches while monitoring remaining quota.


## SEC fundamentals are authoritative for displayed US ratios

- **INTENTIONAL:** `stock_fundamentals` is the authoritative source for SEC-derived Earnings Yield and Return on Capital. `stock_snapshot` is a quote/cache projection and may lag after independent quote or universe refreshes.
- The US stocks API prefers ratios from `stock_fundamentals` only when its status is `calculated` and its stored market cap exactly matches the current quote snapshot market cap. If the SEC market cap no longer matches, the API returns null ratios and a `fundamentals_stale_market_cap` status rather than showing stale valuation ratios.
- The API derives the displayed fundamentals data status from the SEC record (`calculated`, `stale_fiscal_period`, or `missing_required_facts`) so a stale snapshot flag cannot label a completed SEC calculation as quote-only.
- The full-universe ranking rule remains unchanged: ranks are published only when all active MFI candidates have current, usable fundamentals.


## SEC extension diagnostic: prioritize accounting-input candidates

- **INTENTIONAL:** issuer-extension facts are sorted by likely Magic Formula input meaning (operating income, revenue, current assets/liabilities, PP&E, cash, debt/borrowings, interest and operating costs) after consolidated non-dimensional facts are placed ahead of dimensional breakdowns.
- The diagnostic returns up to 30 extension facts instead of 12 so relevant balance-sheet tags are less likely to be hidden by alphabetic ordering.
- This is a discovery and review aid only. Tag names, labels and presentation placement do not establish accounting equivalence; no extension fact is automatically mapped into production calculations or rankings.

- The diagnostic additionally returns `targeted_candidates` groups for operating income, PP&E, current assets, current liabilities, cash and debt. Each group is selected independently of the top-30 extension preview and reports its own count/truncation state, so a relevant fact cannot be hidden solely by the compact preview limit.
- Candidate output includes fact period/context and up to three presentation relationships to support filing review. This is still evidence gathering only: neither tag names nor presentation relationships authorize production mappings.
- The diagnostic also reads the filing schema's role definitions and classifies presentation relationships as `consolidated_statement`, `statement_role`, `disclosure_or_segment`, or `unclassified`. Candidate sorting prefers non-dimensional facts in statement roles, but this classification is supporting evidence only; it never approves a mapping. Unknown or ambiguous roles must be reviewed in the filing.


## Non-positive invested capital review state

- **INTENTIONAL:** if the reported current assets less current liabilities plus net PP&E is negative or zero, do not calculate ROC, do not substitute zero, and do not publish a Magic Formula rank for that company. Store `negative_invested_capital` or `zero_invested_capital` as an explicit review status and expose the corresponding stock-card data status. This is distinct from missing facts because the inputs may be present while the denominator is not meaningful for the formula.


## EdgarTools extraction bakeoff

- **INTENTIONAL:** the manual `EdgarTools fundamentals bakeoff` GitHub Actions workflow is a read-only research lane. It extracts annual 10-K financial-statement candidates for HRB, PBI and ADBE and uploads a short-lived JSON artifact; it never calls the Magic Screen Worker, writes D1, changes `stock_fundamentals`, calculates production ratios, or publishes ranks.
- The script uses EdgarTools to obtain the selected filing's income statement, balance sheet and cash-flow statement, then emits rows whose labels may relate to operating income, PP&E, current assets/liabilities, cash, debt, leases and interest. These are candidate rows for manual review, not approved accounting mappings.
- **INTENTIONAL:** candidate selection is based on text labels to make the first comparison manageable. A missing row means only that the label filter did not find it; it does not prove that the filing lacks the fact. Review the complete filing and statement before concluding that an input is unavailable.
- Filing metadata and fiscal periods must be checked before comparing values with the existing SEC diagnostic. If the filing-specific financials object is unavailable and the script falls back to company-level annual financials, the report labels that fallback explicitly.
- The workflow is manually triggered, uses Python 3.11+, installs the MIT-licensed EdgarTools package, and retains its JSON artifact for seven days. It does not run on the production fundamentals schedule.


- **The EdgarTools bakeoff stores each detailed statement row once.** Its compact JSON has one `rows` array per statement; each row carries a `candidate` boolean rather than being duplicated in full and filtered arrays. The broad financial-metrics dump is omitted because it repeats statement-derived values and adds noise. Filing metadata is kept once per company.
- **The EdgarTools EBIT bridge is review-only.** It identifies non-dimensional income-statement anchors and expense candidates, then shows alternative operating-income scenarios when financing-related expense classification is ambiguous. Each scenario shows its assumptions and reconciliation to reported pretax income. A matching reconciliation is not proof of classification; verify the issuer's presentation and notes. The bridge never writes D1, changes production EBIT mappings, calculates ratios, or publishes ranks.

- **EBIT bridge scenario assumptions must be explicit.** Each scenario states how financing cost, interest, pension/postretirement, other expense, and restructuring are treated. `other_expense` and `restructuring` remain review-required classifications even when included in a reconciliation scenario; arithmetic agreement does not settle their accounting presentation.
- **Pension/postretirement bridge matching uses the statement label independently of the XBRL concept suffix.** EdgarTools can expose issuer-specific pension wording under a generic `NonoperatingIncomeExpense` concept. The diagnostic therefore searches non-dimensional statement rows by pension/postretirement label and still retains the original concept and parent for review; it does not hardcode issuer amounts.
- **Missing EBIT bridge adjustments must not default silently to zero.** The review script searches pension/postretirement non-operating rows by both taxonomy concept and label. If interest, pension, or other-expense adjustments are not identified, it reports the missing items and reconciliation difference, marks the scenario `missing_adjustment_rows`, and does not claim a completed reconciliation.

- **EBIT bridge matching must be concept-specific and non-duplicating.** XBRL concepts include taxonomy prefixes (for example `us-gaap_`), so suffix-aware exact patterns are used for revenue and expense anchors. `FinancingInterestExpense` must not be mistaken for the separate `Interest expense` line merely because its concept contains the words `InterestExpense`. A concept may populate only one bridge category. Label constraints are used for ambiguous/non-operating rows. These safeguards improve extraction accuracy but do not validate the accounting classification; all reconstructed scenarios remain review-only.


## Filing-specific PBI 2025 EBIT research note

- **PBI's 2025 "Cost of financing and other" is a mixed line.** The 10-K states that a portion of total interest expense is allocated to finance interest expense included in this line. Do not classify the entire $61.503M as operating expense or the entire amount as non-operating interest.
- **The PBI 2025 bakeoff reports a filing-specific review calculation only.** The filing reports $101.460M interest expense net and $61.503M consolidated cost of financing and other. The SendTech segment table reports $13.807M cost of financing and other excluding allocated finance interest. The difference ($47.696M) is the finance interest allocated into the consolidated cost line. Total interest for the EBIT reconciliation is therefore $149.156M; reported pretax income $192.524M + total interest $149.156M = $341.680M.
- **This PBI calculation is not a universal tag mapping.** It is restricted to accession `0001628280-26-009650`, remains review-only, and must not populate production fundamentals or rankings. The generic expense-classification scenarios remain diagnostic and are not promoted simply because they reconcile.


## Filing-specific HRB and ADBE EBIT control cases

- **HRB FY2026 is a filing-specific reconstruction, not a direct EBIT fact.** For accession `0000012659-26-000026`, the review extracts reported revenue and total operating expenses and calculates $3,945.392M - $3,037.706M = $907.686M. It independently cross-checks this as pretax income $853.888M - other income $26.813M - signed interest expense (-$80.611M) = $907.686M. The two methods must reconcile within $1 before the review reports the candidate. The filing's statement presents the operating expense subtotal separately from the non-operating lines.
- **ADBE FY2025 is the direct EBIT control.** For accession `0000796343-26-000003`, the review reads the non-dimensional `OperatingIncomeLoss` row ($8.706B) and cross-checks it against pretax income $8.734B less net non-operating income $28M = $8.706B.
- **Exact accession, period and statement labels are required.** The script extracts only a unique non-dimensional row matching the selected filing's fiscal-period key. If a required fact is absent or ambiguous, it reports `review_required` instead of selecting a nearby row or a different annual column.
- **Balance-sheet comparison is diagnostic only.** HRB and ADBE review outputs include current assets, current liabilities, cash, net PP&E, current/noncurrent debt, working capital, invested capital and simple net debt excluding leases. These values are not fed into production EV, ROC, eligibility or ranking. Lease liabilities and short-term investments are deliberately kept outside this comparison pending a consistent production policy.


- **The three bakeoff cases carry explicit method labels, not automatic eligibility.** HRB is `statement_subtotal_reconstructed`; ADBE is `direct_reported_operating_income`; PBI is `filing_specific_interest_reconciliation`. Each remains `review_only`. The labels describe the evidence used in the research artifact and must not be interpreted as approval to populate production EBIT.


## Reproducible and configurable EdgarTools validation

- **Pin the research dependency.** The bakeoff uses `edgartools==6.3.0`, the version recorded in the successful three-company artifact. This avoids silent changes to statement extraction between runs.
- **Ticker membership is explicit input.** The script accepts comma-separated `BAKEOFF_SYMBOLS`; the manual GitHub workflow exposes this as a `symbols` input. The default HRB/PBI/ADBE set remains the control set. Additional symbols must be copied from a verified current MFI screen response; the script must not infer MFI membership from SEC's ticker directory or unrelated stored rows.
- **The validation script remains read-only.** Arbitrary supplied symbols only add SEC filing extraction to the local artifact. They do not write D1, change production fundamentals, or update Magic Formula rankings.


## Expanded MFI EdgarTools sample

- The default read-only sample is HRB, PBI and ADBE as control issuers plus seven symbols copied from the 2026-11-20 MFI screen response: AFMJF, HPQ, OTEX, PRDO, PLTK, UPWK and SNDK. This covers foreign issuer filing formats, mature hardware/software, education, gaming, marketplace and semiconductor reporting styles.
- **INTENTIONAL:** sample membership is grounded in the supplied MFI screen snapshot, not SEC directory membership. The sample is a technical extraction test, not a representative statistical sample or investment recommendation.
- The extractor now checks annual 10-K, 20-F and 40-F filings and chooses the most recently filed annual report. Interim 10-Q/6-K reports remain excluded to keep the initial comparison annual and accession-aligned.
- The package is pinned to EdgarTools 6.3.0. The artifact remains isolated from production data and calculations.


## SEC coverage and direct operating-income diagnostics

- The expanded default sample adds SGHC, a verified current MFI constituent whose FY2025 annual report is a Form 20-F, to exercise the foreign-private-issuer path. AFMJF remains as a deliberate negative coverage case: EdgarTools cannot resolve its OTC ticker in the SEC company index. Its annual financial statements are published outside SEC EDGAR; this is a source-coverage gap, not evidence that the company lacks financial statements.
- **INTENTIONAL:** a `CompanyNotFoundError` for an individual ticker is recorded as `not_found_in_sec_company_index` and does not fail otherwise successful sample extractions. Unexpected extraction errors still fail the workflow.
- The report now exposes a generic review-only direct `OperatingIncomeLoss` candidate when one unique consolidated non-dimensional row matches the selected annual fiscal period. This is evidence for manual comparison only, not an automatic EBIT mapping or production approval.


## Expanded MFI sample findings (2026-11-20)

The pinned EdgarTools 6.3.0 run extracted 10 of 11 symbols; AFMJF was recorded as a SEC company-index coverage gap. Direct consolidated `OperatingIncomeLoss` candidates were surfaced for ADBE, HPQ, OTEX, PRDO, PLTK, UPWK and SNDK. HRB and PBI retain their accession-specific manual-review candidates. SGHC's Form 20-F was successfully parsed, but no direct US-GAAP `OperatingIncomeLoss` fact was surfaced; IFRS line items require separate classification review. PLTK's negative operating income is retained as negative, not coerced to zero. SNDK's operating-income fact is surfaced with a pre/post-spin comparability note. None of these outputs changes production ratios, eligibility or ranks.


## Generalized balance-sheet candidate review (2026-11-20)

- **INTENTIONAL:** the EdgarTools bakeoff now emits `balance_sheet_fact_review` for every successfully extracted issuer, including Form 20-F/IFRS issuers. It searches exact fiscal-period values on consolidated, non-dimensional rows for unrestricted cash, restricted cash, current assets, current liabilities, net PP&E, current/noncurrent debt and current/noncurrent lease liabilities.
- A category is marked `unique_candidate`, `ambiguous_candidates` or `not_found`; even a unique candidate is not an approved accounting mapping. The artifact retains original concept, label, period, value and standard-concept hint.
- **INTENTIONAL:** restricted cash and lease liabilities are exposed separately; dimensional PP&E breakdowns are excluded from consolidated candidates. Multiple PPE concepts (for example rental equipment) remain visible as ambiguity rather than being added automatically.
- No candidate is selected for EV, invested capital, Earnings Yield or ROC. This remains a local research artifact and does not write production D1, fundamentals or rankings.


- **Balance-sheet candidate matching is taxonomy-aware as well as label-aware.** EdgarTools may label debt generically (for example, `Debt`) while its concept identifies current/noncurrent classification; lease rows may also have generic labels while their concepts carry the current/noncurrent distinction. The review checks both label and concept suffix, excludes restricted cash from unrestricted-cash candidates, and keeps current/noncurrent lease liabilities separate. It still reports all matching rows as candidates and does not resolve accounting scope automatically.


- **Balance-sheet candidate regression checks from the expanded sample:** taxonomy concepts must override ambiguous labels for current/noncurrent debt and leases. In particular, a label containing the substring `current` can also be `noncurrent`; current lease matching must explicitly exclude noncurrent concepts. A cash concept containing `RestrictedCash` must never be treated as unrestricted merely because its concept name also contains `CashAndCashEquivalents`. Rental property/equipment is surfaced as a separate PP&E candidate and is not automatically added to standard PP&E.


- **IFRS lease concept suffixes require an exact current/noncurrent boundary.** `NoncurrentLeaseLiabilities` contains the substring `CurrentLeaseLiabilities`; the current-category matcher therefore requires a taxonomy boundary before `CurrentLeaseLiabilities`, not a loose suffix substring.


- **Unrestricted is not restricted cash.** The cash-exclusion rule uses a whole-word `restricted` match so labels such as `Cash and cash equivalents, unrestricted` remain eligible for the unrestricted-cash candidate category.
