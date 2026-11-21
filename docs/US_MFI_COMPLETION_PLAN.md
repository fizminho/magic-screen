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


## P2 debt and EV review batch (21 November 2026)

The next review queue contains ten P2 issuers after the newly identified VSNT perimeter mismatch was raised to P1. The accession-bound debt and EV evidence already available, plus the remaining reviewer actions, are summarized in [the P2 debt-scope review plan](US_MFI_P2_DEBT_SCOPE_REVIEW_2026-11-21.md).

- **Financing obligations needing policy:** BCRX royalty financing ($465.688m), PRDO sale-leaseback financing ($56.992m), and VXRT future-royalty sale liabilities ($4.060m). Keep these separate from conventional borrowings pending a debt-like EV policy.
- **Debt candidates with maturity evidence:** SBC bank borrowings ($42.833484m total across current/noncurrent buckets) and ZVRA long-term debt ($61.928m carrying value). Resolver must not auto-sum ambiguous rows or infer current debt zero.
- **Named facility zero/undrawn evidence:** MNTN's named notes/revolver and PXED/STRA revolvers have filing-specific zero-drawn evidence, but this does not prove every debt category is zero.
- **No face debt row / incomplete note review:** FHTX and NRIX remain unknown, not debt-free. Their marketable securities portfolios also remain separate from cash equivalents.
- **Full-universe verification is triggered by this commit.** The expected triage shift is VSNT P1 and ten remaining P2 cases; accept only the generated artifact's actual counts.


## Latest verified full-universe run after issuer-quality and perimeter triage (21 November 2026)

Full-universe workflow run **44887816976** completed successfully on commit 0d7d89583ee7717a2aa76c2223f149aab942e58d. Its artifact confirms:

- Active MFI cohort: **30**; EdgarTools-supported: **28**; explicitly unsupported: **2**; awaiting evidence: **0**.
- Shadow ranking: **5 eligible / 5 ranked**; **25 excluded** (23 accounting/valuation review, 2 provider-unsupported).
- Accounting queue: **30** rows, **10 P1 / 10 P2 / 10 P3**. VSNT is now a P1 company-perimeter mismatch; QTTB has one accession-bound nonrecurring-EBIT quality review.
- Balance-sheet reconciliation: **28 reconciled / 2 unavailable**; 15 debt-note reviews; 9 EV-scope note reviews; 18 unresolved cash-policy questions.
- Production-approved rows: **0**. Production fundamentals and rankings were not changed.

The subsequent code commit 54c209ba690bec9b54f70d0a7b768f13b6598ec6 makes curated filing-quality and company-perimeter warnings attach directly from the resolver's exact accession, even when the current extraction artifact does not contain that issuer. This avoids losing a valid curated warning simply because a regression sample omitted the raw issuer record. The new regression test passes; a fresh full-universe run is triggered by the current commit to validate the same behavior across the complete cohort.


## P2 financing-obligation filing review: BCRX, PRDO and VXRT (21 November 2026)

The first three debt-like financing cases now have a filing-level worksheet: [BCRX, PRDO and VXRT financing-obligation review](US_MFI_P2_FINANCING_OBLIGATION_REVIEW_2026-11-21.md). The filings show three distinct structures, all of which create an identifiable claim on future cash flows but should remain separate from conventional bank/term borrowings until a uniform EV policy is approved.

- **BCRX:** $465.688m royalty financing obligations ($38.455m current and $427.233m noncurrent) accrete effective interest, are repaid from ORLADEYO sales-based royalties, and generated $53.163m non-cash interest expense plus $22.883m principal payments in FY2025. This is strongly financing-like even though the Pharmakon secured term loan was paid off.
- **PRDO:** $56.992m failed sale-leaseback financing is the remaining liability from a 25-year USAHS campus arrangement. The company retains and depreciates the asset; monthly payments are interest and liability reduction, not rent. Future contractual payments total $154.067m, including $5.043m in 2026. Treat it as a financing claim, not an ordinary operating lease line.
- **VXRT:** $4.060m sale-of-future-royalties liability ($1.381m current, $2.679m noncurrent) accretes imputed interest. HCRP receives specified Inavir royalty streams through 24 December 2029, and the company states it is not obligated to pay beyond royalties received from Daiichi Sankyo. This is a royalty-limited financing claim, distinct from conventional recourse debt.

A consistent **candidate** EV policy is to surface these balances in a separate financing-obligations bucket and include them in debt-like EV only after accounting-owner approval. Keep conventional borrowings, royalty financing, failed sale-leaseback financing, finance leases and operating leases separately identifiable. Do not add the same amount twice, and do not adjust EBIT selectively issuer by issuer. The candidate policy is not implemented in the resolver or ranking.

The full-universe workflow triggered by commit 260e2c3 is still running at the time of this note; accept its artifact only after it completes successfully. Production fundamentals, ratios, eligibility and rankings remain unchanged.


## P2 conventional-debt filing review: SBC and ZVRA (21 November 2026)

The next two P2 debt cases now have accession-bound tie-outs in [the SBC and ZVRA review worksheet](US_MFI_P2_SBC_ZVRA_REVIEW_2026-11-21.md).

- **SBC:** FY2025 bank and other borrowings total **$42.833484m**, split into $9.099046m current and $33.734438m noncurrent. The maturity schedule sums exactly to the carrying amount. The revolving facility has $1.915158m available and $1.212934m drawn; only the drawn amount is debt. A separate $2.692673m due-to-related-party balance is not automatically a borrowing.
- **ZVRA:** FY2025 term-loan principal of $63.608m less $0.755m original issue discount and $0.925m debt issuance costs equals **$61.928m** carrying value. The annual filing schedules all principal in 2029 and none in 2026–2028; the balance sheet presents the balance as long-term debt. The $40m of optional additional tranches expired undrawn. Later repayment activity must not overwrite the FY2025 annual snapshot.

Both debt carrying-value bridges are reconciled. They remain review-only pending the cohort-wide treatment of leases, other financing obligations and cash. Production fundamentals, ratios, eligibility and rankings remain unchanged.


## Final P2 named-facility and debt-note review: MNTN, PXED, STRA, FHTX and NRIX (21 November 2026)

The remaining five P2 issuers now have an accession-bound worksheet: [MNTN, PXED, STRA, FHTX and NRIX review](US_MFI_P2_NAMED_FACILITY_REVIEW_2026-11-21.md). This completes filing-level evidence worksheets for all ten issuers in the P2 queue, but does not close the human accounting and policy gates.

- **MNTN:** FY2025 convertible notes were fully settled at the May 2025 IPO; the QuickFrame holdback note was settled in Q1 2025; and the $50m asset-based revolver had zero drawn at year-end, with $49.4m available. The remaining $181k partial-recourse employee note is a receivable asset, not company borrowing.
- **PXED:** FY2026 $100m revolving facility had zero drawn; the $28.4m letter of credit is not a funded borrowing. Cash is $159.363m, restricted cash $4.516m and marketable securities $167.852m. The Department of Education composite-score requirement constrains liquidity deployment; do not treat all securities as unrestricted cash by default.
- **STRA:** FY2025 $250m revolver had zero borrowings. Cash and cash equivalents were $140.757m; restricted cash was $8.754m; held-to-maturity securities were $12.297m, of which $7.297m mature within one year and $5.000m after one through five years.
- **FHTX:** no separate conventional-debt face row was identified; debt-note coverage remains an explicit unknown rather than a debt-free conclusion. The filing reports $80.876m cash, $1.250m restricted cash and $78.018m marketable securities, all disclosed as due within one year. Operating lease liabilities remain separate.
- **NRIX:** FY2025 ended 30 November 2025. The filing reports $246.960m cash and cash equivalents, $345.981m current U.S. Treasury marketable securities and $0.968m restricted cash. No conventional borrowing row was identified in the reviewed balance sheet; retain unknown status until note coverage is independently closed. Operating lease liabilities remain separate.

**P2 evidence milestone:** all ten P2 issuer worksheets are now documented: BCRX, PRDO, VXRT, SBC, ZVRA, MNTN, PXED, STRA, FHTX and NRIX. They remain in review until conventional debt, debt-like financing, leases, cash and marketable-security policy are approved consistently. No issuer has been promoted to production and no production fundamentals, ratios, eligibility or rankings were changed.


## P3 ranked-issuer review: UPWK, IRWD and QTTB (21 November 2026)

The three P3 issuers that currently pass the shadow eligibility gates now have a consolidated review worksheet: [UPWK, IRWD and QTTB ranked-issuer review](US_MFI_P3_RANKED_REVIEW_2026-11-21.md). These are the lower three names in the five-stock shadow cohort, and each has a material policy sensitivity.

- **UPWK:** FY2025 cash $294.356m, marketable securities $378.425m, restricted cash $3.8m and customer escrow/in-transit $180.752m. The marketable-securities cash-like sensitivity raises EY from 11.13% to 16.52% (+5.38 percentage points). Keep securities separate until a uniform maturity/credit/liquidity policy is approved.
- **IRWD:** FY2025 debt consists of $199.680m convertible-note carrying value and $385.0m revolver borrowings; cash and equivalents are $215.456m. Later June 2026 repayment does not replace the annual FY2025 snapshot. Net-PP&E-only sensitivity increases ROC from 278.51% to 2,890.32%, demonstrating denominator sensitivity rather than a reason to change the formula.
- **QTTB:** FY2025 direct operating income of $16.902m includes $53.737m collaboration-arrangement revenue from settlement of a customer refund liability. Removing that revenue mechanically would produce a -$36.835m operating result, but this is a sensitivity only, not an approved normalized EBIT. The exceptional-item policy must be consistent across the cohort.

Current shadow rank order remains HRB 1, OTEX 2, UPWK 3, IRWD 4, QTTB 4. All five remain review-only; no rank is approved for production.

**P3 next:** review the other supported P3 names (ALEC, BMBL, CRNC, MGTX and PLTK) for EBIT quality, invested-capital and debt/cash scope; retain unsupported AFMJF and EGHSF in coverage as provider exclusions. Then consolidate P1/P2/P3 findings into one cohort-wide accounting policy matrix and obtain explicit owner approval before any resolver cutover.


## P3 ranked-issuer review and accession cross-check (21 November 2026)

The three P3 issuers currently passing shadow ranking eligibility (UPWK, IRWD and QTTB) have a dedicated issuer/sensitivity worksheet: [P3 ranked-issuer review](US_MFI_P3_RANKED_REVIEW_2026-11-21.md). An independent accession cross-check corrected three document-reference errors in that worksheet: UPWK is 0001627475-26-000012, IRWD is 0001104659-26-020489, and QTTB is 0001193125-26-099339. These were documentation cross-reference corrections; the resolver's accession-matched data and ranking inputs were not changed.

The current review set now covers all five shadow-ranked issuers, all ten P1 cases (including VSNT's company-perimeter exception), and all ten P2 debt/EV cases. Remaining work is the P3 unranked cohort, cohort-wide accounting-policy sign-off, and legacy-versus-EdgarTools reconciliation. The latest VXRT EBIT-quality flag is included in the queue code; a full-universe run is triggered by this commit to validate the current 30-issuer state.


## P3 supported-but-unranked review: ALEC, BMBL, CRNC, MGTX and PLTK (21 November 2026)

The five supported P3 names that are not currently ranked now have a consolidated filing worksheet: [ALEC, BMBL, CRNC, MGTX and PLTK review](US_MFI_P3_UNRANKED_REVIEW_2026-11-21.md). All five have negative reported operating income in their selected annual filing, so their negative candidate ROC is not a reason to alter the ranking formula. BMBL has a large impairment line that could change the sign of EBIT if adjusted; that is a separate accounting-quality decision, not an automatic add-back.

- **ALEC:** EBIT -$156.007m; invested capital $207.790m; conventional debt $9.689m. Cash $65.802m, marketable securities $190.222m and restricted cash $1.846m remain separate. Term-loan maturity note reconciles to approximately $9.7m carrying value.
- **BMBL:** EBIT -$805.778m; invested capital $174.170m; debt $588.465m; cash $175.760m. The operating statement includes $1,039.027m impairment loss, including $396.3m and $258.1m goodwill charges disclosed for separate 2025 triggering events. A mechanical impairment add-back would yield $233.249m operating income, but is sensitivity-only and requires a common exceptional-item policy.
- **CRNC:** FY2025 ended 30 September 2025; EBIT -$2.291m; debt $199.693m entirely long-term; cash $84.017m and marketable securities $3.433m. The current debt portion is explicitly nil in the debt note.
- **MGTX:** EBIT -$105.968m; debt $74.337m; cash $65.931m; restricted cash $2.262m. Lease liabilities total $14.349m across operating and finance leases.
- **PLTK:** EBIT -$5.1m; debt $2,389.1m; cash $684.2m; restricted cash $1.5m; short-term investments $136.0m. Acquisition contingent consideration is $734.0m and must remain a separate EV-scope question; operating lease liabilities total $142.9m.

**P3 evidence milestone:** all eight supported P3 issuers now have filing review worksheets (three ranked plus five unranked). AFMJF and EGHSF remain unsupported-provider exclusions, visible in coverage with no fallback. Next, consolidate the complete 30-name cohort into a single accounting policy matrix and close policy approval gates before resolver implementation or cutover.


## Cohort-wide accounting policy matrix prepared for owner approval (21 November 2026)

All 30 issuer review lanes are now documented: 10 P1, 10 P2 and 10 P3. The P3 set includes eight supported issuers with accession-bound reviews and two unsupported-provider exclusions. The next deliverable is the [cohort-wide accounting policy matrix](US_MFI_COHORT_ACCOUNTING_POLICY_MATRIX_2026-11-21.md), which consolidates the proposed defaults, evidence examples, unresolved choices and required approval gates.

The matrix preserves the current candidate rules: annual consolidated operating income; invested capital = current assets - current liabilities + net PP&E; gross conventional debt at carrying value; unrestricted cash equivalents only; marketable securities, restricted cash, leases, NCI and other financing obligations kept separately visible. Exceptional items, lease/ROU treatment, NCI, marketable-securities cash-like treatment and debt-like financing inclusion require explicit cohort-wide decisions.

No policy is marked approved. The matrix is a decision aid, not a production instruction. Implementation should begin only after the accounting owner signs off the policy and the full-universe shadow results are re-run against it.


## Current issuer-review and policy-preparation status (21 November 2026)

The filing-review work now covers the complete 30-symbol triage set:

- **P1:** 10 cases, including nine issuer accounting reviews plus VSNT's pre-separation company-perimeter mismatch.
- **P2:** 10 cases, with conventional debt reconciliations, named-facility evidence, and separate royalty / failed sale-leaseback financing reviews.
- **P3:** 10 cases, including the five supported-but-unranked issuers with negative EBIT, the three ranked-but-unapproved issuers, and two unsupported-provider exclusions.

Review worksheets: [P1 register](US_MFI_P1_ISSUER_REVIEW_REGISTER.md), [P2 debt-scope plan](US_MFI_P2_DEBT_SCOPE_REVIEW_2026-11-21.md), [P2 financing obligations](US_MFI_P2_FINANCING_OBLIGATION_REVIEW_2026-11-21.md), [P2 conventional debt](US_MFI_P2_SBC_ZVRA_REVIEW_2026-11-21.md), [P2 named facilities](US_MFI_P2_NAMED_FACILITY_REVIEW_2026-11-21.md), [P3 ranked review](US_MFI_P3_RANKED_REVIEW_2026-11-21.md), and [P3 supported-but-unranked review](US_MFI_P3_UNRANKED_REVIEW_2026-11-21.md).

The cohort-wide [accounting policy matrix](US_MFI_COHORT_ACCOUNTING_POLICY_MATRIX_2026-11-21.md) consolidates proposed defaults and quantified sensitivities. It is a proposal for accounting-owner approval, not an approved policy. No issuer has been production-approved.

The latest verified full-universe run before the VXRT EBIT-quality flag was added is run **44888647649**, artifact **14701466369**. It passed with 30 active issuers, 28 supported, 2 unsupported, 5 shadow-ranked, 10/10/10 P1/P2/P3, 0 production-approved, and one QTTB operating-income quality review plus one VSNT company-perimeter review. Commit **895c206e8fed48675a614f439fbe644b93523699** adds the second accession-bound operating-income quality review for VXRT; its regression tests passed. A new full-universe run is triggered by the current commit to verify both QTTB and VXRT warnings in the complete cohort.

### Remaining release gates

1. Accounting-owner sign-off on the policy matrix: EBIT and exceptional items, invested capital and negative denominator handling, conventional debt, other financing obligations, leases, NCI, cash equivalents and marketable securities.
2. Close the all-30 legacy-versus-EdgarTools reconciliation and document material differences, period mismatches and rollback criteria.
3. Re-run full-universe extraction, ingestion, resolver and ranking after every approved policy implementation.
4. Obtain explicit production cutover approval. Until then, keep production writes disabled and the legacy Company Facts path intact.


## Legacy-versus-EdgarTools reconciliation preview

An authenticated, read-only endpoint is being added at GET /api/fundamentals/edgartools/reconciliation-preview. It compares the legacy stock_fundamentals record against the accession-bound EdgarTools resolver candidate for every active US MFI issuer, using one current market-cap snapshot for both calculations. It exposes source periods, legacy filed date, EdgarTools accession, input deltas and EY/ROC percentage-point deltas only when fiscal periods match. The legacy table does not store accession numbers, so the report marks that limitation explicitly.

The endpoint and workflow validator never write production fundamentals, ratios, eligibility or rankings. Period-mismatched rows are retained for triage but are not marked comparable. The next bakeoff must verify the full 30-row output and identify how many issuers have period-aligned, fully comparable legacy and EdgarTools metrics.


## Latest full-universe validation with QTTB, VXRT and VSNT review flags (21 November 2026)

Full-universe workflow run **44889130534** completed successfully on commit 91b6568b31a5d7202e76885b0ac2607bbe7ae3a1. Artifact **14700922346** confirms:

- Active cohort **30**; EdgarTools-supported **28**; unsupported **2**; filing evidence unavailable **0**.
- Shadow ranking **5 eligible / 5 ranked**; **25 excluded** (23 accounting/valuation review, 2 unsupported-provider).
- Accounting queue **30** rows: **10 P1 / 10 P2 / 10 P3**.
- Accession-bound operating-income quality reviews: **2** (QTTB and VXRT).
- Accession-bound company-perimeter reviews: **1** (VSNT).
- Balance sheets: **28 reconciled / 2 unavailable**; 15 debt-note reviews; 9 EV-scope note reviews; 18 cash-policy questions remain unresolved.
- Production-approved rows **0**. Resolver and ranking artifacts confirm production writes, production fundamentals changes and ranking changes are all **false**.

The full-universe run passed extraction, raw evidence ingestion, resolver preview, ranking preview, coverage validation, queue generation, sensitivity report and debt-note guardrails. This verifies the current review flags and 30-name coverage; it does not approve accounting policies or production cutover.


## Legacy-versus-EdgarTools reconciliation findings (run 44889267826)

The first full 30-name read-only reconciliation artifact is available from successful bakeoff run 44889267826 (artifact 14700518715). Results:
- 30 active issuers included; 28 EdgarTools-supported and 2 unsupported.
- 27 of 28 supported issuers have matching annual fiscal periods between legacy and EdgarTools.
- Only 1 of 28 supported issuers has a fully calculated legacy fundamentals record (BMBL); it is not in the current ranked cohort.
- 27 of 28 supported issuers have no legacy total-debt value. Legacy field coverage is EBIT 25/28, invested capital 23/28, debt 1/28 and cash 24/28.
- Only one full EY/ROC comparison is possible. None of the five current shadow-ranked issuers has a complete legacy comparison.

This is a legacy data-completeness blocker, not evidence of an EdgarTools metric error. The enhanced endpoint now reports partial same-period input deltas even when legacy debt is missing, while keeping full EV/EY/ROC deltas blocked. Successful bakeoff run 44889673041 produced 27 period-aligned partial issuer comparisons and 72 field-level comparisons with zero differences. Legacy field coverage is EBIT 25/28, invested capital 23/28, debt 1/28 and cash 24/28. Twenty-seven supported issuers still lack legacy debt, and none of the five shadow-ranked names has a full legacy comparison. Production cutover remains blocked until legacy-vs-new differences are explainable or the owner explicitly approves a controlled replacement of the legacy path.


## Partial legacy comparison results verified (run 44889673041)

The enhanced reconciliation artifact contains 30 issuer rows, 27 period-aligned partial comparisons and 72 field-level comparisons. All 72 available fields match exactly between legacy and EdgarTools. The single full metric comparison is BMBL: EV $1,208.625m, EY -66.67% and ROC -462.64%, identical on both sides; BMBL is not in the ranked cohort because EBIT is negative.

The five shadow-ranked issuers have 14 available field comparisons with zero differences. HRB's legacy EBIT is missing because the EdgarTools value is a filing-specific reconstruction; OTEX, UPWK, IRWD and QTTB match on available EBIT, invested capital and cash. All five lack legacy debt, so none has a full legacy EV/EY/ROC comparison. This confirms strong agreement on available fundamentals but leaves a clear legacy debt-coverage gap.
