# US MFI production policy decision packet

**Status:** recommendations for review, not production approval  
**Current cohort:** 30 active US MFI candidates, top 30 with minimum market cap $50m  
**Latest shadow cohort:** HRB, OTEX, UPWK, IRWD and QTTB  
**Data snapshot:** MFI price date 19 November 2026; quarter date 30 September 2026

## Recommended defaults

| Policy area | Recommended default | Why |
|---|---|---|
| Market universe | MFI active top 30, minimum $50m market cap | Matches the current configured screener; refresh dynamically from the same source snapshot |
| Provider | EdgarTools primary; no fallback | Keep one auditable annual-filing extraction path |
| Unsupported issuers | Keep visible in coverage, exclude from ranked subset | Avoid silent omissions while allowing a clearly labelled partial-coverage shadow view |
| Filing period | Latest annual 10-K / 20-F / 40-F only | Avoid mixing annual and interim periods |
| EBIT | Direct reported operating income; allow accession-matched filing-specific reconstruction only as review-only evidence | No generic pretax-income fallback and no silent zero |
| Earnings Yield | EBIT / (market cap + conventional gross debt - unrestricted cash) | Keep the enterprise-value definition consistent across issuers |
| Return on Capital | EBIT / (current assets - current liabilities + net PP&E) | Use one common denominator; flag extreme/near-zero results rather than silently changing formulas |
| Debt in EV | Borrowing-instrument carrying values, current + noncurrent, with no double counting | Exclude lease liabilities and other financing categories until a consistent policy is approved |
| Cash deduction | Unrestricted cash and cash equivalents only | Exclude restricted cash, customer escrow and securities until a uniform liquidity policy is approved |
| Ranking | Classic Greenblatt ordinal ranks; highest EY/ROC gets rank 1; combined rank sum, lower is better | Matches the traditional Magic Formula ordering |
| Ties | Average occupied ordinal positions for metric ties; competition rank for equal combined scores | Deterministic and transparent |
| Minimum cohort | Five eligible companies | Withhold ranks if fewer than five pass the current evidence gates |

## Current shadow ranking

| Rank | Ticker | EY | ROC | EY rank | ROC rank | Combined |
|---:|---|---:|---:|---:|---:|---:|
| 1 | HRB | 14.59% | 331.77% | 1 | 2 | 3 |
| 2 | OTEX | 10.71% | 6,465.20% | 3 | 1 | 4 |
| 3 | UPWK | 11.13% | 37.47% | 2 | 5 | 7 |
| 4 | IRWD | 8.57% | 278.51% | 5 | 3 | 8 |
| 4 | QTTB | 10.39% | 37.83% | 4 | 4 | 8 |

All five are shadow-only and retain accounting review flags. None is production-approved.

## Ranking-sensitive policy questions

### Invested capital denominator

The current candidate formula includes working capital plus net PP&E. OTEX has a near-zero positive denominator because negative working capital offsets most of its PP&E. Its candidate ROC is 6,465.20%.

A net-PP&E-only sensitivity moves OTEX from rank 2 to rank 5 and causes IRWD, QTTB and UPWK to tie at rank 2. This is not a recommendation to switch formulas. It demonstrates why the invested-capital policy and OTEX denominator require explicit review.

### Marketable securities as cash-like

The current default deducts unrestricted cash equivalents only. Treating UPWK's marketable securities as cash-like increases its candidate EY from 11.13% to 16.52%. In the combined sensitivity with net-PP&E-only ROC, UPWK ties HRB for rank 1 while OTEX falls to rank 5.

Issuer descriptions such as "available for current operations" are not sufficient by themselves to establish a uniform cash-like policy. A consistent rule would need to address liquidity, maturity, credit risk, restrictions and accounting classification across every issuer.

### Leases and other financing obligations

Operating leases, royalty financing, sale-leaseback financing, NCI and other financing obligations remain separately surfaced. The recommended default excludes them from conventional debt until the EBIT numerator is adjusted consistently and the policy is applied uniformly.

## Issuer-specific review points

- **HRB:** FY2026 EBIT candidate of $907.686m is reconstructed from revenue less operating expenses and cross-checked against the pretax bridge. It is accession- and period-matched, but remains manual-review-only.
- **OTEX:** current debt components reconcile, but invested capital is near zero after negative working capital offset. ROC should not be relied on without denominator review.
- **UPWK:** $378.425m marketable-securities portfolio is the largest cash-scope sensitivity in the current cohort; restricted cash and customer escrow remain excluded.
- **IRWD:** current convertible notes and revolver borrowings require careful annual-period debt and maturity classification; later interim repayments must not overwrite the annual snapshot.
- **QTTB:** restricted cash collateralizes venture debt and lease LOCs; it is not unrestricted cash. Lease liabilities remain outside conventional debt.

## Production release checklist

- [ ] Accounting owner approves the EBIT and filing-specific reconstruction policy.
- [ ] Accounting owner approves invested capital and the treatment of negative-working-capital / near-zero denominators.
- [ ] Accounting owner approves conventional debt, leases, NCI and other financing scope.
- [ ] Accounting owner approves unrestricted cash and any marketable-securities treatment.
- [ ] Every ranked issuer has accession-matched evidence and closed high-priority reviews.
- [ ] Legacy Company Facts vs EdgarTools differences are reconciled or explicitly accepted per issuer.
- [ ] Full-universe coverage, market-cap date alignment, scheduled refresh and stale-data monitoring pass.
- [ ] Rollback procedure and production write controls are tested.
- [ ] Explicit production cutover approval is recorded.

Until these items are approved, the shadow panel remains diagnostic only. No production fundamentals, ratios, eligibility or rankings should be changed.


## Additional ranked-issuer filing review (21 November 2026)

### UPWK — cash-like securities and escrow must remain distinct

FY2025 operating income is $129.307m. The $378.425m marketable-securities portfolio is available for current operations but consists of multiple instrument types, including money-market funds, commercial paper, Treasury bills, corporate bonds, U.S. government securities, asset-backed securities and foreign-government/entity debt securities, with contractual maturities within 36 months of purchase. The filing does not provide a complete instrument-by-instrument amount/maturity breakdown in the reviewed disclosure. It should not be merged wholesale into unrestricted cash. Cash and cash equivalents are $294.356m; restricted cash is $3.8m; customer funds held in escrow and funds in transit are $180.752m and are matched by escrow funds payable. The $359.770m convertible-note carrying amount is current at 31 December 2025. These distinctions are material to EY and EV.

### IRWD — annual debt snapshot differs from later repayment status

FY2025 operating income is $98.502m. The filing reports $199.680m current convertible senior notes carrying value and $385.0m outstanding principal under the secured revolving credit facility. The $215.456m cash and cash-equivalents balance includes money-market funds, U.S. Treasury securities and commercial paper. The convertible notes matured and were repaid in June 2026, after the FY2025 reporting date. The annual MFI snapshot must retain FY2025 debt values unless the application explicitly adopts a newer annual filing; do not substitute an interim repayment into the FY2025 annual accounting inputs.

### QTTB — direct GAAP operating income contains a major nonrecurring item

FY2025 operating income is $16.902m, but the income statement reports $53.737m collaboration-arrangement revenue and $36.835m operating expenses. The filing explains that the collaboration revenue arose from settlement of the customer refund liability following the Amgen amendment. This is not ordinary product revenue: QTTB states it has not commercialized product candidates and does not expect product sales for several years, if at all. The $16.902m direct GAAP operating-income candidate is arithmetically valid, but its use as a recurring EBIT proxy is a significant accounting-quality and ranking-stability question. Do not silently remove the revenue or replace reported EBIT; require a documented, cohort-consistent decision on exceptional/nonrecurring operating items.

QTTB's $9.708m venture-debt carrying value reconciles to $6.235m current and $3.473m noncurrent. Cash and cash equivalents are $48.297m, while $0.647m restricted cash is held as collateral for venture debt and lease letters of credit. Operating lease liabilities total $5.636m. Keep all these categories separate pending policy approval.


## P3 ranked-issuer review and quantified sensitivities (21 November 2026)

The current candidate formula remains EBIT / (market capitalization + conventional debt - unrestricted cash equivalents). The following issuer evidence reinforces why marketable securities, leases and exceptional operating items must remain separate until a single cohort-wide policy is approved.

| Issuer | Baseline shadow EY | Baseline shadow ROC | Main sensitivity / blocker | Production status |
|---|---:|---:|---|---|
| UPWK | 11.13% | 37.47% | Treating $378.425m marketable securities as cash-like raises EY to 16.52% (+5.38 pp); restricted cash and $180.752m customer escrow/in-transit are separate | Review only |
| IRWD | 8.57% | 278.51% | Net-PP&E-only denominator sensitivity raises ROC to 2,890.32%; FY2025 debt remains $199.680m notes + $385.0m revolver even though repaid in June 2026 | Review only |
| QTTB | 10.39% | 37.83% | $16.902m reported operating income includes $53.737m collaboration-arrangement revenue from customer-refund-liability settlement; exceptional-item policy unresolved | Review only |

### Required guardrails

- Do not treat all UPWK marketable securities as cash equivalents merely because the issuer says they are available for current operations. The portfolio includes multiple credit and maturity classes; apply a common maturity, credit-quality, liquidity and restriction test.
- Do not replace IRWD's FY2025 annual debt with later interim repayment status. Annual ranking inputs must be period-aligned.
- Do not mechanically remove QTTB's $53.737m revenue from reported EBIT. The resulting -$36.835m operating result is a diagnostic sensitivity only; any exceptional-item adjustment needs an approved, cohort-wide rule.
- Net-PP&E-only ROC sensitivities are diagnostic only. They do not authorize a change from current assets minus current liabilities plus net PP&E.
- All three issuers remain shadow-only and accounting-review flagged.


### P3 supported-but-unranked issuer findings

The five remaining supported P3 names have negative reported operating income in their selected annual filings. They remain outside the ranked cohort under the current positive-EBIT gate.

| Issuer | Annual filing period | Reported operating income | Debt candidate | Cash candidate | Key review |
|---|---|---:|---:|---:|---|
| ALEC | FY2025 | -$156.007m | $9.689m | $65.802m | $190.222m marketable securities and $1.846m restricted cash; $9.7m term-loan carrying-value tie-out |
| BMBL | FY2025 | -$805.778m | $588.465m | $175.760m | $1,039.027m impairment line; possible +$233.249m mechanical add-back is sensitivity-only |
| CRNC | FY2025 ended 30 Sep 2025 | -$2.291m | $199.693m | $84.017m | Current debt portion explicitly nil; $3.433m marketable securities and $17.427m lease liabilities separate |
| MGTX | FY2025 | -$105.968m | $74.337m | $65.931m | $2.262m restricted cash and $14.349m combined operating/finance lease liabilities |
| PLTK | FY2025 | -$5.1m | $2,389.1m | $684.2m | $136.0m short-term investments, $734.0m acquisition contingent consideration and $142.9m lease liabilities |

No issuer-specific impairment or exceptional-item add-back is approved. BMBL's impairment adjustment must not be used to make it eligible without an explicit policy applied consistently to all issuers. PLTK contingent consideration remains a separate financing/EV-scope item, not conventional borrowing by default.


## Cohort-wide policy matrix: approval status

The detailed matrix is in [US_MFI_COHORT_ACCOUNTING_POLICY_MATRIX_2026-11-21.md](US_MFI_COHORT_ACCOUNTING_POLICY_MATRIX_2026-11-21.md). It consolidates the evidence gathered across all P1/P2/P3 issuers into explicit proposed defaults and unresolved approval decisions.

**Current state:** recommended defaults are documented, but none is accounting-owner approved. In particular, no production decision has been made on (1) exceptional/nonrecurring EBIT items, (2) operating/finance lease treatment and ROU asset symmetry, (3) NCI in EV, (4) marketable securities as cash-like, (5) royalty/failed-sale-leaseback/contingent consideration debt-like treatment, or (6) invested-capital handling for negative/near-zero denominators.

The current shadow ranking is a diagnostic, not a final investable ranking. The current five-name cohort is exactly at the minimum eligibility count; any issuer removed at approval must be replaced by another fully evidenced eligible name or the ranking must be withheld until five approved names are available.


## Cohort-wide policy matrix and remaining P3 review

The proposed cohort-wide accounting policy matrix and the P3 supported-but-unranked issuer review are now available in the completion plan. The matrix remains unsigned. In particular, QTTB's settlement revenue, VXRT's noncash sold-royalty revenue and BMBL's impairment charge are examples of why exceptional-item treatment must be consistent across the entire cohort.


## Legacy-vs-EdgarTools reconciliation result

The first full read-only reconciliation run (44889267826) included all 30 active issuers. EdgarTools supports 28. Only one supported issuer has a fully calculated legacy fundamentals record (BMBL), and 27/28 supported issuers have no legacy total-debt value. Legacy coverage is EBIT 25/28, invested capital 23/28, debt 1/28 and cash 24/28. Only BMBL has a full period-aligned EY/ROC comparison; none of the five shadow-ranked names has a complete legacy comparison.

This prevents a conventional like-for-like cohort reconciliation. The read-only endpoint is being enhanced to compare available same-period inputs without presenting incomplete rows as full metric comparisons. This finding does not invalidate the EdgarTools candidate data, but it means the legacy path cannot serve as a complete validation baseline. Production cutover remains blocked pending a documented owner decision on the replacement and reconciliation evidence.


## Partial legacy comparison outcome

The enhanced reconciliation passed in bakeoff run 44889673041: 27 period-aligned partial issuer comparisons, 72 field-level comparisons and zero differences. The five shadow-ranked issuers have 14 available field comparisons with zero differences. The only complete EV/EY/ROC comparison is BMBL, which matches exactly on both sides but has negative EBIT and is not ranked.

The blocker remains legacy debt coverage: 27/28 supported issuers have no legacy total-debt value. None of the five ranked issuers can be fully compared to legacy EV/EY/ROC. The legacy path is therefore a useful partial cross-check, but not a complete validation baseline for cutover.


## Versioned shadow policy specification v1

Added `config/us-mfi-accounting-policy-v1-proposed.json` as a machine-readable, versioned representation of the proposed defaults. It is deliberately marked `proposed_owner_approval_required`, shadow-only, and production-unapproved. A dedicated validator and regression tests enforce the critical guardrails: annual filings only, consolidated GAAP operating income, no selective exceptional-item adjustments, filing-specific EBIT reconstructions remain manual-review-only, no standalone ROU addition, negative denominators withhold ROC, undrawn facilities are not debt, restricted/customer funds are not unrestricted cash, missing values remain unknown, and fewer than five approved eligible names withholds final ranking.

The specification is an executable review contract, not an accounting approval. Lease/ROU symmetry, NCI, other financing obligations, marketable securities, near-zero denominator materiality, quote staleness and production rollback remain explicit owner-approval gates. The CI bakeoff validates the policy file and includes it in the workflow artifact. No resolver input, production fundamentals, ratios or rankings are changed by this commit.
