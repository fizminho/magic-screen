# US MFI P1 issuer review register

**As of:** 21 November 2026  
**Source:** latest successful full-universe EdgarTools run and accession-matched accounting review queue  
**Purpose:** prioritise human review; not accounting approval  
**Production writes:** none

## Current gate summary

| Measure | Current result |
|---|---:|
| Active US MFI cohort | 30 |
| EdgarTools supported | 28 |
| Provider unsupported | 2 |
| Shadow eligible / ranked | 5 |
| Accounting / valuation review exclusions | 23 |
| P1 / P2 / P3 queue | 9 / 11 / 10 |
| Balance sheets reconciled / unavailable | 28 / 2 |
| Production-approved shadow rows | 0 |

## P1 cases requiring first review

Amounts below are the candidate values selected from the stated annual filing period. They are not approved accounting values. USD millions are used where the filing and resolver currency are confirmed. A missing value remains unknown, not zero.

| Symbol | Filing accession / period | EBIT candidate | Invested capital candidate | Main blocker | Required decision |
|---|---|---:|---:|---|---|
| GTM | 0001794515-26-000012 / 2025-12-31 | $225.7m | **-$16.3m** | Negative invested capital; leases, restricted cash, short-term investments, rental equipment and NCI | Inspect working-capital components and rental-equipment/ROU treatment. Confirm conventional debt bridge and EV cash scope. Keep ROC unranked until denominator is meaningful. |
| HPQ | 0000047217-25-000071 / 2025-10-31 | $3,174.0m | **-$3,756.0m** | Negative invested capital; cash line combines cash, equivalents and restricted cash; unrestricted cash not uniquely resolved | Reconcile cash and restricted cash from filing notes. Review the negative working-capital model and asset scope. Do not deduct the combined cash figure as unrestricted cash. |
| HRB | 0000012659-26-000026 / 2026-06-30 | $907.686m reconstructed | $273.588m | Filing-specific EBIT reconstruction; ROU/rental equipment, lease liabilities and cash/investment scope | Review the two independent EBIT bridges and approve or reject the reconstruction. Review invested-capital asset scope and debt/cash treatment before promotion. |
| HRMY | 0001104659-26-018859 / 2025-12-31 | $208.469m | **Unresolved** | Invested-capital denominator not resolved; restricted/combined cash and PP&E scope | Resolve net PP&E and the full denominator from the same period. Reconcile restricted cash and short-term investments separately. |
| OTEX | 0001002638-26-000068 / 2026-06-30 | $1,082.597m | $16.745m | Near-zero positive denominator caused by negative working-capital offset; NCI and lease scope | Reconcile the $5,770.369m debt carrying value to $35.850m current plus $5,734.519m noncurrent. Review the $16.745m denominator and do not rely on the 6,465% candidate ROC without explicit denominator approval. |
| PBI | 0001628280-26-009650 / 2025-12-31 | **Unresolved in generic resolver** | **-$261.427m** | Direct operating-income concept not found; negative invested capital; rental equipment and financing scope | Review the filing-specific EBIT bridge already documented separately. Determine whether rental equipment belongs in invested capital. Keep ROC unranked pending a meaningful denominator. |
| SGHC | 0001628280-26-025609 / 2025-12-31 | **Unresolved in generic resolver** | 418m reported units | IFRS operating subtotal reconstruction, reporting currency confirmation and current debt unknown | Confirm reporting currency from the filing. Review the $357m reconstructed EBIT bridge. Tie the $17m noncurrent borrowing to the named facilities and resolve on-demand current borrowings separately. |
| SSTK | 0001549346-26-000008 / 2025-12-31 | $75.059m | **-$227.210m** | Negative invested capital; lease, cash and financing scope | Review negative working capital and rental-equipment/ROU treatment. Reconcile the $158.110m current and $116.639m noncurrent debt candidates to the filing note. |
| XPOF | 0001802156-26-000016 / 2025-12-31 | $19.848m | **-$10.438m** | Negative invested capital; unrestricted cash not uniquely resolved; NCI and lease scope | Resolve the combined cash/restricted-cash disclosure and identify unrestricted cash. Review negative working capital, NCI and the debt carrying-value bridge. |

## Five current shadow-ranked issuers

These five are the only names currently passing the preview eligibility gates. All remain accounting-review items and `production_approved=false`.

| Rank | Symbol | Earnings Yield | Candidate ROC | Rank sum | Current priority |
|---:|---|---:|---:|---:|---|
| 1 | HRB | 14.59% | 331.77% | 3 | P1 |
| 2 | OTEX | 10.71% | 6,465.20% | 4 | P1 |
| 3 | UPWK | 11.13% | 37.47% | 7 | P3 |
| 4 | IRWD | 8.57% | 278.51% | 8 | P3 |
| 4 | QTTB | 10.39% | 37.83% | 8 | P3 |

### Ranked-name evidence requiring sign-off

- **HRB:** FY2026 EBIT candidate $907.686m is reconstructed as revenue less operating expenses and cross-checked against the pretax bridge. It remains manual-review-only. The generic resolver does not select it as a direct reported EBIT.
- **OTEX:** Note 11 current and noncurrent debt components reconcile exactly to total debt carrying value. Invested capital is only $16.745m because negative working capital offsets most of net PP&E. The candidate ROC is therefore highly denominator-sensitive.
- **UPWK:** annual convertible-note carrying value is $359.770m, current; cash/equivalents $294.356m; marketable securities $378.425m remain separate. Restricted cash and customer escrow are excluded from unrestricted cash.
- **IRWD:** FY2025 convertible notes and revolver balances are annual-period inputs. Later interim repayments must not overwrite the FY2025 snapshot.
- **QTTB:** FY2025 term-loan carrying value is $9.708m, with $6.235m current and $3.473m noncurrent. Restricted cash of $0.647m collateralises venture debt and lease LOCs and is not unrestricted cash.

## Review order

1. **First:** HRB and OTEX because they are currently ranked and their accounting decisions directly affect the visible top two.
2. **Next:** PBI and SGHC because EBIT reconstruction / currency and debt scope are unresolved.
3. **Then:** GTM, HPQ, HRMY, SSTK and XPOF because invested capital is negative or unresolved and must remain unranked until resolved.
4. After P1 closure, review P2 debt/cash cases and P3 ranked candidates UPWK, IRWD and QTTB.

## Guardrails

- A unique fact is not automatically an approved accounting classification.
- A reported zero applies only to the exact instrument line and period.
- Missing current/noncurrent debt or cash remains unknown, not zero.
- Do not add aggregate debt to its current/noncurrent components.
- Do not substitute later interim figures into annual Magic Formula calculations.
- Do not switch to a more favourable invested-capital or cash policy because it improves rank.
- No queue classification or issuer note in this document authorises a production write.

