# US MFI cohort-wide accounting policy matrix

**Prepared:** 21 November 2026  
**Purpose:** consolidate issuer-level evidence into a consistent policy proposal for accounting-owner review  
**Status:** proposed defaults only; no policy approval  
**Production writes / ranking changes:** none

## 1. Cohort status and guardrails

| Measure | Latest documented state |
|---|---:|
| Active US MFI universe | 30 |
| EdgarTools-supported issuers | 28 |
| Unsupported-provider exclusions | 2 |
| Current shadow eligible / ranked | 5 |
| Accounting / valuation review exclusions | 23 |
| P1 / P2 / P3 review lanes | 10 / 10 / 10 |
| Shadow production-approved | 0 |

The current ranked set is HRB, OTEX, UPWK, IRWD and QTTB. All five remain review-only. AFMJF and EGHSF remain visible coverage exclusions with no fallback. The two unsupported issuers must not be silently dropped or assigned zero values.

## 2. Proposed policy matrix

| Policy area | Proposed default | Evidence and examples | Unresolved approval decision |
|---|---|---|---|
| Universe | Active MFI top-30 cohort with minimum $50m market cap; refresh from the configured universe source | 30 active names, 28 provider-supported | Confirm cohort size, market-cap threshold and refresh cadence |
| Provider | EdgarTools primary; no fallback | 28 supported, 2 unsupported; extraction evidence is accession-bound | Approve unsupported coverage/exclusion presentation and supported-universe completeness |
| Filing period | Latest annual 10-K, 20-F or 40-F only | FY2025/FY2026 issuer periods; CRNC FY ends 30 Sep, NRIX 30 Nov, PXED 31 Aug | Approve annual period-selection and stale filing rules; never mix interim figures into an annual snapshot |
| EBIT concept | Direct reported consolidated operating income; no pretax fallback or generic non-GAAP substitution | OTEX, UPWK, IRWD, QTTB, ALEC and others have direct operating subtotals | Confirm treatment of exceptional items and discontinued/non-operating classifications |
| Filing-specific EBIT reconstruction | Allowed only as issuer-specific review evidence, never automatic production input | HRB $907.686m, PBI $341.680m and SGHC $357m reconstructions are separately documented | Accounting owner must approve each bridge or reject it; generic resolver remains unresolved |
| Exceptional/nonrecurring items | Keep GAAP reported operating income unless a cohort-wide adjustment policy is approved | QTTB $53.737m customer-refund settlement collaboration revenue; VXRT $1.929m noncash royalty revenue from a sold royalty stream; BMBL $1,039.027m impairment line; other filing-specific one-offs | Decide whether and how exceptional items are adjusted consistently; do not selectively add back |
| Invested capital | Current assets - current liabilities + net PP&E | Current candidate denominator across the cohort | Confirm whether rental equipment or other operating assets belong in net PP&E |
| ROU assets and leases in ROC | Do not add ROU assets alone; if ROU is included, pair with matching lease-liability treatment | ROU assets and lease liabilities appear across multiple issuers | Approve whether operating/finance lease ROU enters invested capital and how EBIT is aligned |
| Negative / near-zero denominator | Do not cap, floor or switch formula issuer by issuer; flag nonpositive or unstable denominator and withhold ROC ranking | OTEX candidate invested capital $16.745m; six high negative-working-capital offset risks | Approve exclusion/flag threshold and minimum denominator materiality rule |
| Conventional debt | Current + noncurrent borrowing-instrument carrying values; no double count | OTEX $5,770.369m; BMBL $588.465m; PLTK $2,389.1m; SBC $42.833484m; ZVRA $61.928m | Approve carrying-value convention, treatment of unamortized costs and instrument scope |
| Revolvers and undrawn facilities | Include only drawn borrowings; do not count availability or undrawn commitment as debt | MNTN, PXED, STRA named facilities report zero drawn; BMBL and PLTK revolving facilities separately identified | Confirm letter-of-credit treatment and facility-specific zero evidence requirements |
| Other financing obligations | Keep in a separate bucket; include in debt-like EV only if the policy is approved cohort-wide | BCRX royalty financing $465.688m; PRDO failed sale-leaseback $56.992m; VXRT future-royalty liability $4.060m; PLTK contingent consideration $734m | Decide which obligations are debt-like, whether carrying value is used, and how limited recourse is flagged |
| Operating and finance leases in EV | Exclude from conventional debt baseline; retain separate disclosure | 50 lease-liability classification rows in review queue | Approve if leases enter EV and require consistent EBIT/ROU treatment |
| Noncontrolling interests | Keep separate; if consolidated EBIT is used, consider adding NCI to EV for perimeter symmetry | NCI evidence across 7 issuer rows; OTEX $1.962m; BMBL/PLTK also have ownership-perimeter considerations | Approve NCI valuation and treatment, including partnership structures |
| Cash deduction | Unrestricted cash and cash equivalents only | Cash lines are separately reported for most supported issuers | Confirm that cash is accessible and not pledged, earmarked or customer-owned |
| Restricted cash and customer funds | Exclude from unrestricted cash | HRB $19.195m restricted; UPWK $3.8m restricted and $180.752m escrow/in-transit; QTTB $0.647m collateral | Confirm restriction and customer-fund detection; missing value remains unknown |
| Marketable securities | Keep separate from cash equivalents by default | UPWK $378.425m; ALEC $190.222m; PXED $167.852m; PLTK $136.0m; NRIX $345.981m | Decide a uniform maturity, credit-quality, liquidity, settlement and encumbrance test |
| Notes receivable | Do not subtract from EV cash or treat as debt | MNTN $0.181m employee partial-recourse note is a receivable asset | Confirm when a receivable is operating vs financing and whether any is cash-like |
| Customer escrow and transit | Exclude customer-owned funds from unrestricted cash; consider matching payable perimeter | UPWK $180.752m customer escrow/in-transit matched by escrow funds payable | Approve the paired asset/liability exclusion logic |
| Ranking | Classic Greenblatt ordinal EY and ROC ranks; lower combined rank sum is better; average ties | Current methodology version classic_mfi_ordinal_rank_sum_v1 | Confirm minimum eligible cohort and tie rules |
| Minimum eligible cohort | At least five approved issuers before publishing a ranking | Current preview has exactly five eligible names | If fewer than five pass accounting approval, withhold final ranks |
| Price and filing date alignment | Use one documented price date and the latest available annual filing period per issuer | Current price snapshot 19 Nov 2026; filing periods differ by fiscal year | Approve staleness window and how to display different fiscal year-ends |
| Production cutover | Shadow-only until owner approval, reconciliation, monitoring and rollback gates pass | Legacy Company Facts production path remains in place | Explicit written approval required before any production write or legacy retirement |

## 3. Specific decisions that must be made before production

### A. EBIT and exceptional items

Recommended starting point: direct consolidated GAAP operating income, with no issuer-specific adjustments. The accounting owner must decide whether impairment, restructuring, settlement revenue, gains, collaboration milestones and other exceptional items remain in EBIT. BMBL and QTTB show why this cannot be left implicit. HRB, PBI and SGHC filing-specific reconstructions require individual sign-off.

### B. Invested capital and leases

Recommended starting point: current assets less current liabilities plus net PP&E. Do not add ROU assets without matching lease-liability treatment. Define how rental equipment, finance leases and operating leases are handled. Define what happens when the denominator is negative, near zero or dominated by negative working capital. OTEX must not be allowed to dominate ROC because of a mathematically tiny denominator.

### C. Enterprise value

Recommended starting point: market capitalization plus conventional gross debt less unrestricted cash equivalents. Keep the following separate until a consistent policy is approved:
- Operating and finance lease liabilities.
- Royalty monetization financing.
- Failed sale-leaseback financing.
- Contingent acquisition consideration.
- Noncontrolling interests.
- Restricted cash, customer escrow and marketable securities.

If consolidated EBIT is used, NCI should be considered for EV perimeter symmetry. Any add-on must be applied consistently and avoid double counting.

### D. Cash and investments

Recommended starting point: only issuer-defined cash equivalents with original maturities of three months or less, provided they are unrestricted and available to the company. Exclude restricted cash and customer funds. Keep securities with maturities beyond the cash-equivalent threshold separate until a common cash-like rule is approved. Do not use an issuer's phrase “available for current operations” as the only qualification.

## 4. Ranking sensitivity and risk priorities

| Risk | Evidence | Required control |
|---|---|---|
| Cash policy can change EY materially | UPWK EY rises from 11.13% to 16.52% if its $378.425m marketable-securities portfolio is treated cash-like | Keep securities separate until cohort-wide rule approval |
| Denominator policy can reorder the top five | OTEX ROC moves from 6,465.20% to 207.32% under net-PP&E-only sensitivity; IRWD and QTTB also move sharply | Do not adopt net-PP&E-only as an ad hoc fix; approve one denominator policy |
| Exceptional EBIT can change eligibility | QTTB reported EBIT $16.902m includes $53.737m settlement revenue; VXRT reported EBIT includes $1.929m noncash revenue tied to sold royalties; BMBL reports $1,039.027m impairment loss | No selective adjustment; document and apply one policy |
| Debt-like obligations can change EV | BCRX, PRDO, VXRT and PLTK have financing/contingent obligations separate from conventional debt | Separate classification bucket; approve inclusion rules |
| Current ranked set is small | Five preview-eligible names out of 30 | Require five fully approved names or withhold final ranking |

## 5. Implementation order after approval

1. Record accounting-owner decisions for EBIT, invested capital, debt, leases, NCI, cash and other financing obligations.
2. Translate each approved decision into typed resolver policy, preserving raw evidence and source accession.
3. Add regression tests for every policy rule and every issuer-specific exception approved by the owner.
4. Re-run full-universe extraction, ingestion, resolver preview and ranking preview.
5. Compare all 30 issuers with legacy Company Facts; explain every material difference and confirm no interim/annual period mixing.
6. Re-run ranking sensitivity and verify no silent fallback, missing-as-zero or aggregate/component double count.
7. Obtain explicit production cutover approval, test rollback and only then enable production writes.
8. Retire the legacy path only after the new path is stable and the rollback window has passed.

## 6. Current approval state

| Approval gate | Status |
|---|---|
| Provider coverage and unsupported policy | Documented; no-fallback behavior implemented |
| Annual filing period policy | Recommended; owner approval pending |
| EBIT and exceptional-item policy | Pending |
| Filing-specific EBIT reconstructions | Review-only; individual approval pending |
| Invested capital and denominator policy | Pending |
| Conventional debt scope | Evidence reviewed; owner approval pending |
| Lease and ROU treatment | Pending |
| NCI treatment | Pending |
| Restricted cash / customer funds | Recommended exclusions; owner approval pending |
| Marketable-securities cash-like policy | Pending |
| Royalty / sale-leaseback / contingent consideration | Pending |
| Legacy-vs-EdgarTools reconciliation | Pending |
| Production cutover and rollback | Not approved |

**Conclusion:** the research and evidence-triage phase is substantially complete across the 30-name cohort. The project is not production-ready until accounting policy choices are approved, encoded, regression-tested and reconciled against the legacy path. No production fundamentals, ratios, eligibility or rankings have been changed.


## Legacy reconciliation output

The authenticated read-only reconciliation preview compares legacy and EdgarTools metrics using the same current market-cap snapshot. It emits input and EY/ROC deltas only when fiscal periods match and both sides have complete inputs. Legacy accession is not stored in the old table and is disclosed as unavailable. This report is required before any cutover decision and does not change production values.
