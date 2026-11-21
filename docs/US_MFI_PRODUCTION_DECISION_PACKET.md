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
