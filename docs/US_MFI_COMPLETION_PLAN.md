# US Magic Formula Investing: completion and release plan

**Scope:** US equities only. Bursa work is deferred until US MFI is production-ready.

## Current architecture

1. **Universe:** the protected Magic Formula Investing universe endpoint refreshes the active US candidate list and market-cap snapshot. This is a screened candidate cohort, not every US-listed security.
2. **Extraction:** scheduled/manual GitHub Actions runs resolve the active universe and extract annual SEC filings with EdgarTools. Push-triggered runs are regression-only and use a fixed sample.
3. **Evidence ingestion:** the workflow posts the extraction artifact to the authenticated Worker endpoint. D1 stores raw filing evidence; ingestion is not accounting approval.
4. **Resolution:** the Worker creates deterministic, read-only candidate resolutions from accession-bound annual filing evidence.
5. **Review:** the accounting exception queue records missing, ambiguous and policy-sensitive inputs. Missing values remain unknown, not zero.
6. **Shadow ranking:** candidate EY and ROC are calculated only for rows passing current evidence gates. Ranking uses classic Greenblatt ordinal rank sums. Unsupported and unresolved issuers remain visible in coverage but are not ranked.
7. **Production:** the legacy Company Facts runtime lane and production stock table are not yet cut over. Shadow preview must not write production fundamentals, ratios, eligibility or rankings.

## Market-cap snapshot and quote-date policy

For scheduled, manual full-universe and explicit `[full-universe]` runs, market caps must come from the same refreshed Magic Formula Investing universe response as the active ticker list. The workflow converts the provider's USD market-cap values to USD millions and normalizes the provider's month/day quote and quarter dates using the snapshot's own `asOf` year. The extractor uses that exact quote date for USD-to-reporting-currency FX lookup and records the snapshot timestamp and source on every company, including SEC-unsupported issuers.

The pinned 18 November 2026 market-cap map is retained only for fixed regression samples. A custom market-cap map replaces the pinned map completely; missing tickers remain missing rather than silently inheriting stale values. A custom quote date without a matching custom map is rejected. Full-universe validation compares every active issuer's extracted market cap and quote date with the refreshed universe snapshot before the run is accepted.

## Ranking methodology

- Earnings Yield = EBIT / (market capitalisation + conventional gross debt - unrestricted cash).
- Return on Capital = EBIT / invested capital.
- Rank each metric independently; highest value gets ordinal rank 1.
- Exact metric ties share the average of occupied ordinal positions.
- Combined score = EY rank + ROC rank; lower is better.
- Exact combined-score ties share the same competition rank.
- A minimum eligible cohort of five is required before numeric ranks are exposed.
- This affects shadow preview only; production ranking rows remain unchanged.

## Provider coverage policy

EdgarTools is the primary provider. No automatic fallback is enabled. An unsupported issuer receives `excluded_provider_unsupported`, remains in the universe and coverage report, and is excluded from the ranked subset. This is a partial-coverage preview, never a claim that the whole universe has been ranked. Incomplete coverage must be visible and production remains blocked.

## Required completion gates

| Phase | Status | Evidence / remaining gate |
|---|---|---|
| A. Universe integrity | **Complete** | 30-symbol active US cohort, top 30 / $50m minimum, dynamic quote-date-aligned market caps and uniqueness checks |
| B. Extraction and ingestion | **Complete** | Full run accepted 31/31 records including ADBE regression control; 28 supported, 2 explicitly unsupported, 0 awaiting evidence |
| C. Accounting resolver | **Review pending** | Deterministic resolver and issuer evidence queue exist; 23 active-universe companies still need accounting/valuation review and the five ranked candidates remain unapproved |
| D. Shadow MFI | **Complete for shadow** | Classic ordinal rank sum, tie handling, minimum cohort, independent artifact validator and coverage accounting all pass |
| E. Runtime migration | **In progress** | Side-by-side legacy Company Facts vs EdgarTools EY/ROC is displayed; per-issuer differences and rollback/cutover still need approval |
| F. Production release | **Blocked** | Requires accounting policy sign-off, issuer review closure, legacy reconciliation and explicit release approval |

## Current known blockers

- Confirm active MFI cohort and configured minimum market-cap/top-N settings against the source screener. The 30-symbol artifact is a cohort snapshot, not proof of full market coverage.
- A successful scheduled/manual run is required to prove dynamic universe discovery and raw evidence ingestion; push CI is regression-only.
- The latest sample had 28 supported issuers requiring accounting review; five shadow candidates were rankable but none production-approved.
- Legacy Company Facts runtime remains alongside the EdgarTools evidence lane. Do not remove it or redirect production writes until side-by-side reconciliation is complete.
- Keep market-cap freshness and quote-date alignment under CI validation; the dynamic source handoff is implemented and must remain covered by scheduled runs.
- Keep unsupported-provider and accounting exclusions visible in coverage summaries.

## Reusable open-source code decision

- Continue using EdgarTools (MIT) as the primary SEC filing extraction library already integrated.
- Reuse only narrowly scoped, license-compatible ranking patterns. The MIT-licensed `bailewen/magicformula` repository is a reference for generic workflow ideas, not its FMP provider, TTM defaults or accounting heuristics.
- Do not copy code from repositories without an explicit compatible license. Do not add another fundamentals provider or broad finance dependency while the resolver is under review.


See [P1 issuer review register](US_MFI_P1_ISSUER_REVIEW_REGISTER.md) for accession-bound candidate values, the current nine P1 cases and the specific accounting questions to close. The register is evidence triage only; it does not approve any candidate or change production.

## Production decision packet

See [US MFI production policy decisions](US_MFI_PRODUCTION_DECISION_PACKET.md) for the recommended default accounting and ranking policies, quantified ranking sensitivities, issuer-specific review points and the decisions that must be signed off before production cutover.

## Safety boundary

All EdgarTools resolver and ranking outputs remain preview-only. `production_write=false`, `production_fundamentals_changed=false` and `rankings_changed=false` are required invariants. Extraction success is not accounting approval. A successful shadow ranking is not production approval.

## Latest full-universe run (21 November 2026)

The full-universe pipeline now completes end to end: active MFI universe refresh, annual filing extraction, raw D1 ingestion, resolver preview, classic MFI ranking preview, policy validation and accounting-review guardrails. The active D1 cohort contained 30 issuers; the extractor also included ADBE as a regression control. The resolver reported 28 EdgarTools-supported issuers, 2 provider-unsupported issuers and no issuers awaiting evidence.

A filing-specific HRB EBIT reconstruction is now accepted as a **shadow-only candidate** when the raw filing accession and fiscal period match exactly and both independent statement bridges reconcile within $1. HRB's FY2026 EBIT candidate is $907.686m: revenue less total operating expenses, cross-checked against pretax income less other non-operating income and signed interest expense. This adds HRB to the eligible shadow cohort without promoting the reconstruction to approved accounting.

The latest ranking preview reports 5 eligible and 5 ranked, with 25 not ranked: 23 held for accounting/valuation review and 2 provider-unsupported. Shadow order: HRB, OTEX, UPWK, IRWD and QTTB. IRWD and QTTB share the same combined rank because their rank sums tie. All five still have accounting review flags and remain `production_approved=false`; no production fundamentals or rankings were changed.

### Latest shadow cohort snapshot

| Rank | Ticker | Earnings Yield | Candidate ROC | Rank sum | Review note |
|---:|---|---:|---:|---:|---|
| 1 | HRB | 14.594% | 331.771% | 3 | Filing-specific EBIT reconstruction, manual approval required |
| 2 | OTEX | 10.712% | 6,465.196% | 4 | Near-zero positive invested-capital denominator; major ROC outlier |
| 3 | UPWK | 11.135% | 37.471% | 7 | Marketable-securities cash-scope sensitivity |
| 4 | IRWD | 8.573% | 278.506% | 8 | Lease/debt scope review |
| 4 | QTTB | 10.388% | 37.826% | 8 | Lease and restricted-cash scope review |

Metrics use the refreshed MFI snapshot (price date 19 November 2026, quarter date 30 September 2026). They are shadow candidates only. All five rows retain accounting review flags and `production_approved=false`. The rank-sum tie between IRWD and QTTB is intentional: they share competition rank 4.


The accounting queue still contains 9 P1, 11 P2 and 10 P3 reviews; 28 balance sheets reconcile and 2 are unavailable; 15 filing-specific debt-note reviews and 9 EV-scope note reviews remain review-only; 18 cash-policy questions remain unresolved. The main blockers are accounting policy approval and legacy-versus-EdgarTools reconciliation, not extraction availability.

The workflow now validates each handoff explicitly: unique active-universe symbols, extraction coverage for every requested issuer, accession/period completeness for supported filings, received-versus-ingested counts, unsupported-provider reconciliation, resolver coverage and production immutability. Universe and ingestion response reports are retained as CI artifacts for audit.


## Latest verified full-universe run (21 Nov 2026)

The full-universe path was exercised by a `[full-universe]` push run. Universe refresh, annual filing extraction, raw evidence ingestion, read-only resolver, shadow ranking, ranking-policy validation, accounting review queue and debt-note guardrail checks all succeeded.

- MFI selection: minimum market cap **US$50 million**, **top 30**.
- Active universe: **30**; extraction included those 30 plus **ADBE** as a regression control.
- EdgarTools coverage: **28 supported**, **2 unsupported**; no automatic fallback.
- Shadow ranking: **5 eligible/ranked**, **25 excluded** (2 provider unsupported, 23 accounting/valuation review).
- Top shadow order: HRB, OTEX, UPWK, IRWD and QTTB. IRWD and QTTB tie at combined score 8.
- Accounting queue: 30 issuers; 9 P1, 11 P2, 10 P3; 15 filing-specific debt-note reviews; 9 EV-scope reviews; 3 filing-specific EBIT reviews.
- Production fundamentals and rankings were not changed.

This is a verified pipeline milestone, not production approval. Next work is to reduce accounting review blockers and approve EBIT, invested-capital, debt and cash/EV policies. OTEX's near-zero positive invested-capital denominator and UPWK's cash/EV treatment remain material sensitivity items.


## Next accounting-review work

The next review batch should prioritize the five shadow-ranked issuers and any P1 items that can materially change EY or ROC. In particular, OTEX's working capital offsets 96.79% of net PP&E, leaving a small positive invested-capital candidate; UPWK's separately reported $378.425m fixed-income portfolio has mixed maturities and undisclosed instrument-level amounts. Neither a net-PP&E-only denominator nor treating the full UPWK portfolio as cash-like is approved. A generated sensitivity report compares those alternatives solely to quantify ranking impact before any policy decision.

## Accounting queue now carries shadow-rank context

The review queue now attaches each issuer's current shadow rank, combined score, EY, ROC and eligibility status when the ranking preview is available. This makes the accounting queue actionable by showing which unresolved issuers currently influence the candidate ranking. It does not change accounting priority, resolver outcomes or production approval. The queue summary separately counts preview-eligible, shadow-ranked and production-approved rows; production approval remains zero until policy review is complete.

## Current execution focus (21 November 2026)

- The full-universe pipeline and classic MFI shadow ranking are implemented and validated; do not spend further effort on another provider or ranking-engine rewrite.
- The accounting review queue now emits deterministic next actions per issuer. These are review instructions only; they do not approve EBIT, invested capital, debt or cash candidates.
- The frontend exposes an all-cohort legacy-versus-shadow reconciliation table for all 30 active MFI candidates. It includes missing legacy rows and unranked shadow rows instead of limiting comparison to the five ranked names.
- The next review pass should close evidence questions issuer by issuer, starting with P1 names and the five shadow-ranked issuers. Policy sign-off remains a human accounting decision.
- Production cutover remains blocked until accounting review, reconciliation and explicit release approval are complete.

The latest review-triage update adds deterministic issuer-specific next actions to both the JSON and CSV accounting queues, and the frontend now provides a full 30-name legacy-versus-shadow reconciliation view. The accounting regression tests, queue generation, shadow ranking validator and build passed on the updated code. A fresh full-universe run is being triggered to revalidate dynamic universe refresh and raw ingestion with these changes.


## Filing-level review pass: HRB and OTEX (21 November 2026)

The first two shadow-ranked issuers have now had their selected FY2026 annual filings checked against key face-statement and note-level amounts. The accession-bound calculations and unresolved decisions are recorded in [the HRB and OTEX review worksheet](US_MFI_HRB_OTEX_REVIEW_2026-11-21.md). This is a stronger evidence tie-out, not accounting approval.

- **HRB:** FY2026 current assets less current liabilities plus net PP&E reconciles to **$273.588m**. Unrestricted cash, restricted cash, conventional debt and operating-lease balances are separately identified. The $907.686m EBIT reconstruction remains subject to accounting-owner approval.
- **OTEX:** FY2026 debt carrying value reconciles exactly to the maturity buckets. The **$16.745m** invested-capital candidate is the principal blocker: negative working capital offsets **96.79%** of net PP&E. Lease liabilities and NCI are quantified but remain separate policy questions.
- No resolver, production fundamentals, EY/ROC, eligibility or ranking values were changed. Both issuers remain review-only and production_approved=false.


## Second P1 filing review: PBI and SGHC (21 November 2026)

The next P1 pass now has accession-matched FY2025 filing evidence for PBI and SGHC in [the PBI and SGHC review worksheet](US_MFI_PBI_SGHC_REVIEW_2026-11-21.md). This review confirms the presentation currency and clarifies major operating-model and debt-scope issues; it does not approve the candidates.

- **PBI:** invested-capital arithmetic reproduces **-$261.427m**, but Pitney Bowes has substantial finance receivables, customer deposit liabilities, rental equipment and lease assets. The standard operating-company denominator and EBIT reconstruction are not ready for promotion.
- **SGHC:** the FY2025 20-F explicitly presents USD millions. The $357m operating subtotal can be reconstructed from the operating lines, but a $17.3m noncurrent facility balance coexists with on-demand NGN loans of unspecified amount, leaving current borrowing unresolved. $6m of amounts segregated for users and $16m fixed deposits remain separate from the $513m cash-equivalent line.
- Both issuers remain review-only. No production fundamentals, ratios, eligibility or rankings were changed.


## Third P1 filing review: GTM, HPQ, HRMY, SSTK and XPOF (21 November 2026)

The remaining five P1 issuers now have a filing-level evidence worksheet: [GTM, HPQ, HRMY, SSTK and XPOF review](US_MFI_GTM_HPQ_HRMY_SSTK_XPOF_REVIEW_2026-11-21.md). This closes several evidence-location questions but leaves the negative or unresolved invested-capital candidates unranked.

- **GTM:** $225.7m is directly reported GAAP income from operations. The -$16.3m denominator reproduces from current assets, current liabilities and net PP&E; $175.9m cash, $4.0m short-term investments and $9.8m restricted cash are distinct. Large unearned revenue, lease liabilities and a $2,731.9m tax receivable agreement liability need scope review.
- **HPQ:** $3,174m is directly reported earnings from operations. The -$3,756m denominator reproduces. The filing separately reports $3,690m cash and $15m restricted cash, correcting the earlier register description that treated the cash line as combined.
- **HRMY:** $208.469m is directly reported operating income. The balance sheet reports $907.014m current assets and $252.132m current liabilities, but no separate PP&E line was located; invested capital stays unresolved rather than assuming PP&E is zero.
- **SSTK:** $75.059m is directly reported income from operations. Current debt of $158.110m includes a $155m revolver; the $116.639m noncurrent term loan and $25.582m lease liabilities are separate. Negative working capital is heavily influenced by deferred revenue and contributor royalties payable.
- **XPOF:** $19.848m is directly reported operating income. The filing note separates $33.7m cash from $12.2m restricted cash. The -$10.438m denominator reproduces; 28% noncontrolling ownership in XPO LLC and the debt carrying-value bridge remain review points.
- All five remain review-only. No production fundamentals, ratios, eligibility or rankings were changed.


## Ranked-cohort issuer review: UPWK, IRWD and QTTB (21 November 2026)

The remaining three current shadow-ranked issuers now have accession-matched filing reviews in [the UPWK, IRWD and QTTB worksheet](US_MFI_UPWK_IRWD_QTTB_REVIEW_2026-11-21.md). The review identified two material ranking-interpretation risks that must be kept visible without silently changing the formula.

- **UPWK:** FY2025 GAAP operating income is $129.307m. Its $378.425m marketable-securities portfolio contains multiple fixed-income instruments with contractual maturities up to 36 months; it is not automatically cash equivalents. $180.752m customer escrow and $3.8m restricted cash remain excluded from unrestricted cash. The $359.770m convertible-note carrying amount is current at FY2025 year-end.
- **IRWD:** FY2025 operating income is $98.502m. Current notes carrying value of $199.680m and $385m drawn revolver are separate borrowing instruments. The notes matured and were repaid in June 2026, but later repayment must not overwrite the FY2025 annual snapshot.
- **QTTB:** FY2025 reported operating income is $16.902m, but it includes $53.737m collaboration-arrangement revenue arising from settlement of a customer refund liability under the Amgen amendment. This makes its positive EBIT and tied shadow rank unusually sensitive to a nonrecurring operating item. The $9.708m venture-debt carrying value reconciles to $6.235m current and $3.473m noncurrent; $0.647m restricted cash is collateral.
- All three remain review-only and production-unapproved. No production fundamentals, ratios, eligibility or rankings were changed.


The accounting review queue now also carries accession-bound operating-income quality notes for material nonrecurring items. QTTB's FY2025 reported EBIT of $16.902m includes $53.737m of collaboration-arrangement settlement revenue. The queue surfaces this as manual review context only; it does not adjust EBIT, eligibility or rank.


## P1 entity-perimeter exception: VSNT

A further P1 comparability blocker has been identified for VSNT. Its FY2025 10-K contains combined historical statements for operations previously run within Comcast, and explicitly warns that those statements may not represent a standalone company. VSNT began regular-way trading on 5 January 2026, after the 2 January separation. The FY2025 balance sheet includes $983m long-term debt and $1,034m restricted cash from senior-note proceeds held in escrow; the major term loans funded on the separation date. The accounting queue now raises an accession-bound P1 entity-perimeter warning and keeps VSNT out of ranked output until comparable standalone annual statements or an approved pro forma bridge exist. No production or ranking inputs are changed.
