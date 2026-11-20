# US financial fundamentals: SEC EDGAR

The US screener uses SEC EDGAR Company Facts as its primary financial-statement source. The SEC's data.sec.gov XBRL APIs are public and do not require an API key. Requests include a declared User-Agent.

## Data flow

1. The Worker maps the active Magic Formula Investing tickers to SEC CIK identifiers using the SEC company ticker/exchange directory.
2. It fetches each company's Company Facts JSON from `/api/xbrl/companyfacts/CIK##########.json`.
3. It selects the latest available annual 10-K, 20-F, or 40-F Operating Income (EBIT), then reads balance-sheet facts for the same fiscal period.
4. It stores the extracted facts and calculated ratios in D1. Successfully calculated company facts are refreshed after 30 days; incomplete/provider-error cases are retried after seven days. Ticker mappings are refreshed weekly and when new MFI candidates have no mapping.
5. A Cloudflare Cron Trigger runs every 30 minutes and processes up to 10 companies per invocation. This works independently of browser visits, so the first 30/50-company universe is populated progressively in the background. The UI only reads the latest sync status; it does not fetch SEC facts itself.

## Initial Magic Formula calculations

- **Earnings Yield** = annual EBIT / Enterprise Value
- **Enterprise Value** = MFI market capitalization + reported debt - reported cash
- **Return on Capital** = annual EBIT / (Current Assets - Current Liabilities + Net PP&E)

The calculation uses annual income-statement facts and balance-sheet facts from the same filing accession and exact fiscal year-end. If a balance-sheet fact is only available at an earlier quarter-end or comparative date, it remains missing rather than being carried forward. It does not annualize a partial quarter. Because MFI market capitalisation is denominated in USD, the pipeline only uses SEC XBRL facts explicitly reported in USD. Issuers reporting only in another currency remain incomplete until currency conversion is implemented; their local-currency values are never mixed with USD market capitalisation. A ratio remains unavailable when required facts or a usable denominator are missing. Debt must have a complete current/non-current split before Enterprise Value is calculated, with components kept within matching accounting scopes. Pair US-GAAP `DebtCurrent` (which includes current maturities and capital-lease obligations) only with a non-current debt-and-lease aggregate. Pair IFRS `BorrowingsCurrent` only with `BorrowingsNoncurrent`. If no aggregate exists, the US-GAAP debt-only fallback requires `LongTermDebtCurrent`, short-term borrowings, and `LongTermDebtNoncurrent`. A narrow fallback accepts `LongTermDebt` only when the same filing explicitly reports aggregate `DebtCurrent` as zero; this prevents adding a current portion twice but is not generalized to non-zero current debt. Never mix lease-inclusive and debt-only components, add an aggregate to its component facts, or treat a missing component as zero. A lease-only fallback requires both current and non-current lease obligations and is allowed only when no borrowing facts are reported. If disclosures are incomplete, Enterprise Value and both Magic Formula ratios remain unavailable.

A missing standard Company Facts observation is not interpreted as a reported zero or proof that the issuer omitted the item from its filing. Company Facts aggregates standard taxonomy facts applicable to the filing entity as a whole; custom-tagged or dimension-specific disclosures may require filing-level review. The API exposes separate `fundamentals_missing_fields` and `fundamentals_zero_fields` arrays so the UI can distinguish absent observations from explicit zero values.

The SEC data is not a pre-calculated Magic Formula ranking. The Worker calculates each ratio from reported facts. A combined rank (rank by Earnings Yield plus rank by Return on Capital) is published only after every active MFI candidate in the selected universe has usable fundamentals. Until then the rank remains blank, avoiding misleading partial-universe rankings.

## Endpoint

`GET /api/fundamentals/sync?limit=10`

- `limit`: number of companies to process in a request, capped at 10. This endpoint remains available for controlled/manual diagnostics, but the UI does not call it during normal page loads.
- `GET /api/fundamentals/status` reports total MFI candidates, calculated companies, unmapped tickers, incomplete facts, provider errors, and the latest update time.
- The scheduled job processes up to 10 companies every 30 minutes. A 30-company universe normally takes about one hour and a 50-company universe about two and a half hours to work through, assuming successful SEC responses. No repeated page refresh is required.
- A company with missing required XBRL facts or a provider error is retried after seven days; successful calculations are refreshed after 30 days.


## Gemini-assisted fact discovery (diagnostic only)

When SEC Company Facts does not expose a recognised XBRL concept, a protected diagnostic endpoint can ask Gemini to map alternative tags from the same filing:

`POST /api/ai/fundamentals/extract`

Request body:

```json
{"symbol":"HRB"}
```

Required headers:

```http
Authorization: Bearer <UNIVERSE_SYNC_TOKEN>
Content-Type: application/json
```

Configuration:
- Set `GEMINI_API_KEY` as a Cloudflare Worker secret. Never put it in frontend code, GitHub files, or chat.
- The endpoint also requires the existing `UNIVERSE_SYNC_TOKEN` secret. The token is sent only as a bearer header.
- The Worker tries `gemini-2.5-flash-lite` first, followed only by Flash-Lite fallback models. The API key is sent in the `x-goog-api-key` header. Review Google's API data-use terms for the applicable account tier before sending sensitive material.

Safety rules:
- Gemini receives only a bounded list of SEC Company Facts entries explicitly reported in USD under the selected annual filing accession and period end.
- A returned selection is accepted only when its tag, exact numeric value, and fact type match an item supplied from SEC. The model cannot create a new numeric value.
- The response is always marked `AI_EXTRACTED_REVIEW_REQUIRED` and `eligible_for_magic_formula: false`. A tag match does not establish accounting equivalence or formula suitability.
- This diagnostic does not write to D1, update `stock_fundamentals`, calculate ratios, or publish ranks. It is manually invoked and does not run on page loads or cron.
- Missing or ambiguous concepts remain unavailable. Do not treat the AI output as verified financial data.

Example response fields include the symbol, SEC accession, fiscal period, filing URL, per-field validation status, and whether each selected value exactly matched a supplied SEC fact.

The AI fact diagnostic remains a protected, manually invoked Worker endpoint, but its frontend button and dialog are intentionally hidden while Gemini API access is on hold. The endpoint does not run during normal screener loads or cron. Do not invoke it until the user explicitly resumes Gemini work.

## Important limitations

- XBRL tagging differs across issuers. The first version supports standard US-GAAP and selected IFRS concepts, and deliberately leaves unsupported cases unranked.
- Financial companies and companies with unusual balance sheets may not have meaningful working-capital-based Return on Capital. Review sector suitability before interpreting their ratios.
- Market capitalization comes from the MFI screening result; SEC provides the reported financial statements.
- SEC facts can be amended or restated. The stored period and filing date should be checked when reviewing a company.
- This is a screening aid, not investment advice. Verify the latest 10-K/10-Q and company disclosures before making an investment decision.

## Official references

- SEC EDGAR API overview: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- SEC Company Facts endpoint pattern: https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
- SEC developer resources and fair-access guidance: https://www.sec.gov/about/developer-resources


## Cash availability guardrail

The pipeline accepts unrestricted cash and cash-equivalent facts only when calculating Enterprise Value. It does not deduct combined restricted and unrestricted cash from debt. If SEC Company Facts exposes only a combined restricted-cash concept, the cash input remains missing until a suitable unrestricted amount is available. This conservative rule avoids overstating cash available to repay debt.


## EBIT derivation guardrail

The automated pipeline currently accepts directly reported operating-income concepts only. It does not derive EBIT from pretax income plus interest expense, because other non-operating income or expense can make that shortcut materially wrong. A future derivation may be enabled only when revenue and a complete, non-overlapping set of operating-expense facts are present in the same filing accession, fiscal period, currency, and unit, with the resulting operating income reconciled to the filing. Until then, unsupported EBIT remains missing and the company is not formula-ranked.


The manual AI diagnostic response also exposes a bounded `related_operating_facts` list from the same annual filing accession. It includes relevant revenue, operating, expense, cost, and income concepts for human inspection. These are diagnostic candidates only: they are not combined, used to derive EBIT, written to the fundamentals table, or eligible for ranking.


The diagnostic candidate list is built from all qualifying facts returned by the current SEC Company Facts parser, independently of the smaller fact subset sent to Gemini. It is limited to standard `us-gaap` and `ifrs-full` taxonomies and USD facts. Company-specific XBRL extension concepts and non-USD facts are not included; a line item missing from this diagnostic is therefore not proof that it is absent from the filing. Inspect the filing's Inline XBRL or instance document before concluding that a concept is unavailable.


For HRB FY2026 only, accession `0000012659-26-000026` (period ending `2026-06-30`), the diagnostic additionally reports `derived_ebit_candidate`. It checks the exact annual USD instance facts for revenue, `CostsAndExpenses`, other non-operating income/expense, interest expense, and pretax income. It derives a candidate operating income as revenue minus costs and expenses, then requires the result plus other non-operating income/expense minus interest expense to reconcile to reported pretax income within USD 1, with every component in the same non-dimensional context and period. A successful result is labelled `reconciled_candidate`; it remains diagnostic-only and does not populate `stock_fundamentals`, calculate ratios, or publish ranks. Other issuers and other HRB filings return `out_of_scope` and are not subjected to this arithmetic. This is a narrowly guarded validation experiment, not a general assumption that any issuer's `CostsAndExpenses` tag represents operating expenses.

It also discovers the filing's label linkbase (`*_lab.xml`) and resolves labels attached specifically to the `CostsAndExpenses` concept, returning `label_document`, `label_status`, and `costs_and_expenses_labels`. This is a clue to the issuer's terminology, not proof that the fact represents a complete operating-expense total.\n\nThe HRB diagnostic also attempts to discover the filing's presentation linkbase (`*_pre.xml`). It reports `presentation_document`, `presentation_status`, and `costs_and_expenses_presentation`, including the presentation role and direct parent/child concept relationships when the `CostsAndExpenses` locator is found. Each relationship also retains its XBRL `order` value and optional `preferredLabel` role so reviewers can reconstruct the intended statement sequence and display label. These attributes remain diagnostic evidence only. The diagnostic also reads the filing's `.xsd` schema role definitions and returns `schema_document`, `schema_status`, and `role_definition` for matching presentation roles when available. This resolves opaque role URIs to filing-provided descriptions; it still does not establish accounting completeness. This is supporting evidence for human review only. A presentation role does not by itself prove that the concept is a complete, non-overlapping operating-expense total, and it does not enable the derivation in production.\n\nThe HRB diagnostic also attempts to discover the filing's extracted XBRL instance document from the SEC accession directory and expose same-period, non-dimensional USD annual operating/revenue/expense facts as `instance_operating_facts`, with `instance_operating_facts_count`, `instance_document`, and `instance_facts_status` to make lookup success and coverage explicit. This is diagnostic-only: instance facts are not sent to Gemini, stored, calculated, or ranked. If the SEC directory index or instance document is unavailable, the response reports `instance_facts_status` and continues with Company Facts results.

Gemini HTTP 403 responses are treated as non-retryable access denials. The diagnostic preserves the HTTP status, Google API status, and safe error detail fields such as reason and service, but never logs or returns the API key. It does not cycle through other models after a 403 because model changes cannot resolve project-level access restrictions. Check the Google AI Studio project status for verification requirements, free-tier eligibility, payment status, or a blocked/restricted API key before retrying. A newly created key in the same project does not resolve a project-level free-tier restriction.

A separate protected endpoint, `POST /api/fundamentals/diagnose-extensions`, accepts `{ "symbol": "TICKER" }` with `Authorization: Bearer <UNIVERSE_SYNC_TOKEN>`. It reads the selected annual filing's extracted XBRL instance and label linkbase, then returns up to 30 prioritized numeric issuer-extension facts matching financial-statement-related tag names. Consolidated facts are shown before dimensional breakdowns, and likely Magic Formula inputs (operating income, revenue, current assets/liabilities, PP&E, cash, debt/borrowings, interest and operating costs) are prioritized. This ordering is diagnostic only and does not approve accounting mappings. The response also includes independent `targeted_candidates` groups for operating income, PP&E (including gross/net and accumulated-depreciation clues), current assets, current liabilities, cash and debt. These groups are not constrained by the top-30 extension preview; each reports its total candidate count, returned count and truncation flag. Candidate facts include start/end period, context identifier and up to three presentation relationships. It includes labels when available, units, period, context, and whether the context is dimensional. Only instant facts and full-year duration facts ending on the selected fiscal period are included. This endpoint is read-only: it does not call Gemini, write D1, map facts to required inputs, calculate ratios, or publish ranks. The tag-name filter is a discovery aid, not a semantic mapping; all candidates require review against the filing's statement presentation and accounting definitions.


## SEC ticker directory storage boundary

- The SEC company ticker exchange directory is lookup data, not the US stock universe. Download it in memory to resolve CIKs only for active Magic Formula Investing symbols. Never bulk-insert its roughly 95,000 directory rows into stock_master.
- Persist only the small active MFI ticker-to-CIK mapping in sec_company_map. Each selected ticker is upserted once per mapping refresh, with its resolved CIK or the explicit UNMAPPED marker. Do not insert placeholders and then issue a second update for the same ticker.
- The MFI screen remains the sole source of active US screener candidates. SEC Company Facts is fetched only for those candidates.


## Presentation-role classification and denominator review states

The extension diagnostic now reads the filing schema's role definitions and attaches the matching role definition and a conservative classification to each returned presentation relationship: `consolidated_statement`, `statement_role`, `disclosure_or_segment`, or `unclassified`. Candidate groups prefer non-dimensional facts attached to statement roles, but the classification is review evidence only. It does not prove that a fact is consolidated, complete, or equivalent to a Magic Formula input. Confirm the role and line item in the filing itself, especially where segment disclosures or note tables are present.

When current assets minus current liabilities plus net PP&E is negative or zero, the production pipeline records `negative_invested_capital` or `zero_invested_capital`, leaves both ratios unavailable, and excludes the company from ranking. This is an intentional review state, not a missing-fact or zero-ratio fallback. The pipeline status endpoint reports these counts separately.


## EdgarTools read-only comparison

A GitHub Actions workflow that can be manually triggered and also runs when its test harness changes, `.github/workflows/edgartools-bakeoff.yml`, runs `scripts/edgartools_bakeoff.py` for HRB, PBI and ADBE using the open-source EdgarTools Python package. It selects the latest non-amended 10-K for each issuer and extracts income statement, balance sheet and cash-flow statement rows whose labels may identify operating income, PP&E, current assets/liabilities, cash, debt, leases and interest. It also attempts to include EdgarTools' financial metrics with their period metadata and filing metadata where exposed by the installed version.

**This is a review-only experiment.** It does not call the production Worker, write D1, update `stock_fundamentals`, calculate Magic Formula ratios, or publish ranks. Candidate rows are label-filtered; a missing candidate is not proof that the underlying filing has no equivalent fact. Confirm the exact filing accession and periods before comparing results with the existing SEC diagnostic. The workflow uploads `edgartools-bakeoff.json` as a seven-day GitHub Actions artifact.


## EdgarTools full-statement review output

The read-only EdgarTools bakeoff now emits both:
- `all_rows`: every detailed row returned by EdgarTools for the selected filing's statement.
- `rows`: the existing label-filtered subset, retained for convenient navigation.

This change addresses cases where an income statement contains an operating-income subtotal under an unexpected label, causing the previous filter to return only interest expense. The full rows are evidence for manual review, not automatic EBIT selection. The script also flags the need to inspect dimensions and statement presentation before combining multiple PP&E concepts. It does not calculate invested capital, debt, EV, Earnings Yield or ROC, and it does not change production data.


## EdgarTools bakeoff: compact output and EBIT review bridge

The read-only artifact stores each detailed statement row once. A boolean `candidate` marks rows matching the broad review filter, avoiding duplicated full and filtered arrays. The broad financial-metrics dump is omitted to keep the artifact compact; statement values and filing metadata remain available.

The script also emits an `ebit_bridge` review section. It lists same-statement, non-dimensional revenue and pretax anchors, operating-expense candidates, ambiguous classifications and alternative scenarios. Scenarios reconcile reconstructed pretax income against reported pretax income, but reconciliation alone does not establish whether a line belongs above or below operating income. Treat every scenario as `review_required`; it is never used by the production Worker or Magic Formula calculations.


### EBIT bridge matching safeguards

The diagnostic bridge uses suffix-aware XBRL concept matching to accommodate taxonomy prefixes. It constrains the separate interest-expense row by its statement label and excludes `FinancingInterestExpense` from that match. A concept can populate only one bridge category. These are extraction safeguards, not approved accounting mappings; scenarios remain review-required and are never consumed by production calculations.
