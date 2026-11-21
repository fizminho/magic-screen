# US MFI P1 issuer review register

**As of:** 21 November 2026  
**Source:** EdgarTools bakeoff run 44900789031, commit `4a5447c29db81b1794aeecfe127391dd0fe71e66`, and accession-matched accounting review queue  
**Purpose:** prioritise human review; not accounting approval  
**Production writes:** none

## Current gate summary

| Measure | Current result |
|---|---:|
| Active US MFI cohort | 30 |
| EdgarTools supported | 28 |
| Provider unsupported | 2 |
| Shadow eligible / ranked | 1 / 0 |
| Accounting / valuation review exclusions | 27 |
| P1 / P2 / P3 queue | 10 / 10 / 10 |
| Balance sheets reconciled / unavailable | 28 / 2 |
| Production-approved shadow rows | 0 |

## P1 cases requiring first review

Amounts below are the candidate values selected from the stated annual filing period. They are not approved accounting values. USD millions are used where the filing and resolver currency are confirmed. A missing value remains unknown, not zero.

| Symbol | Filing accession / period | EBIT candidate | Invested capital candidate | Main blocker | Required decision |
|---|---|---:|---:|---|---|
| GTM | 0001794515-26-000012 / 2025-12-31 | $225.7m | **-$16.3m** | Negative invested capital; large unearned-revenue and tax-receivable-agreement liabilities; lease and cash/investment scope | Inspect working-capital components and lease / tax-receivable-agreement treatment. Filing separates $175.9m cash, $4.0m short-term investments and $9.8m restricted cash. Confirm conventional debt bridge. Keep ROC unranked until denominator is meaningful. |
| HPQ | 0000047217-25-000071 / 2025-10-31 | $3,174.0m | **-$3,756.0m** | Negative invested capital; negative working capital is driven by large payables and current liabilities | Filing separately reports $3,690m cash and cash equivalents and $15m restricted cash. Confirm cash treatment and debt scope; review the negative working-capital denominator. Do not deduct restricted cash as unrestricted cash. |
| HRB | 0000012659-26-000026 / 2026-06-30 | $907.686m reconstructed | $273.588m | Filing-specific EBIT reconstruction; ROU/rental equipment, lease liabilities and cash/investment scope | Review the two independent EBIT bridges and approve or reject the reconstruction. Review invested-capital asset scope and debt/cash treatment before promotion. |
| HRMY | 0001104659-26-018859 / 2025-12-31 | $208.469m | **Unresolved** | No separate PP&E line appears on the balance sheet; investments and restricted cash need distinct treatment | Reconcile the full denominator and confirm whether any PP&E is included in other noncurrent assets. Filing separately reports $752.502m cash, $22.838m short-term investments, $107.127m long-term investments and $0.270m restricted cash. |
| OTEX | 0001002638-26-000068 / 2026-06-30 | $1,082.597m | $16.745m | Near-zero positive denominator caused by negative working-capital offset; NCI and lease scope | Reconcile the $5,770.369m debt carrying value to $35.850m current plus $5,734.519m noncurrent. Review the $16.745m denominator and do not rely on the 6,465% candidate ROC without explicit denominator approval. |
| PBI | 0001628280-26-009650 / 2025-12-31 | **Unresolved in generic resolver** | **-$261.427m** | Direct operating-income concept not found; negative invested capital; rental equipment and financing scope | Review the filing-specific EBIT bridge already documented separately. Determine whether rental equipment belongs in invested capital. Keep ROC unranked pending a meaningful denominator. |
| SGHC | 0001628280-26-025609 / 2025-12-31 | **Unresolved in generic resolver** | 418m reported units | IFRS operating subtotal reconstruction, reporting currency confirmation and current debt unknown | Confirm reporting currency from the filing. Review the $357m reconstructed EBIT bridge. Tie the $17m noncurrent borrowing to the named facilities and resolve on-demand current borrowings separately. |
| SSTK | 0001549346-26-000008 / 2025-12-31 | $75.059m | **-$227.210m** | Negative invested capital; deferred revenue and contributor royalties payable are large current liabilities | Reconcile the $158.110m current debt (including a $155m revolver) and $116.639m noncurrent term loan. Filing separately reports $178.244m cash and $25.582m operating lease liabilities; review negative working capital before any ROC ranking. |
| XPOF | 0001802156-26-000016 / 2025-12-31 | $19.848m | **-$10.438m** | Negative invested capital; current assets include restricted cash; debt carrying-value bridge and NCI scope remain open | Filing note identifies $33.7m cash and cash equivalents excluding $12.2m restricted cash. Review negative working capital, 28% noncontrolling interest in XPO LLC, lease scope and debt carrying-value reconciliation. |

## Current shadow ranking status

The latest successful full-universe run (21 November 2026, bakeoff run `44900789031`, commit `4a5447c`) produced **one shadow-eligible issuer (IRWD) and zero ranked issuers**. The ranking remains withheld because the proposed policy requires at least five eligible issuers. Twenty-seven supported issuers remain in accounting / valuation review; two issuers are explicitly excluded because provider evidence is unsupported. This is a shadow-only result, not a production ranking or approval.

IRWD passes the current mechanical shadow gates: direct-reported EBIT, a positive invested-capital candidate, uniquely identified current and noncurrent conventional debt components, and a separately identified unrestricted-cash candidate. The filing has no aggregate-debt candidate, so there is no aggregate figure to reconcile against the component sum. This absence is not a mismatch. IRWD still requires owner policy approval and issuer-level sign-off before production use.

The earlier five-name preview (HRB, OTEX, UPWK, IRWD and QTTB) remains superseded. Only IRWD is currently shadow-eligible; the other four are still excluded by their specific EBIT, denominator or scope blockers.

### Priority evidence requiring sign-off

- **HRB:** FY2026 EBIT candidate $907.686m is reconstructed as revenue less operating expenses and cross-checked against the pretax bridge. It remains manual-review-only. The generic resolver does not select it as a direct reported EBIT.
- **OTEX:** Note 11 current and noncurrent debt components reconcile exactly to total debt carrying value. Invested capital is only $16.745m because negative working capital offsets most of net PP&E. The candidate ROC is highly denominator-sensitive and must remain withheld.
- **UPWK:** annual convertible-note carrying value is $359.770m, current; cash/equivalents $294.356m; marketable securities $378.425m remain separate. Restricted cash and customer escrow are excluded from unrestricted cash.
- **IRWD:** the FY2025 direct EBIT, positive invested-capital candidate and unique debt components currently pass shadow eligibility. No aggregate-debt fact is present to reconcile; this is not a debt mismatch. Later interim repayments must not overwrite the FY2025 snapshot. Remains shadow-only pending policy-owner and issuer review.
- **QTTB:** FY2025 term-loan carrying value is $9.708m, with $6.235m current and $3.473m noncurrent. Restricted cash of $0.647m collateralises venture debt and lease LOCs and is not unrestricted cash.

## Review order

1. **First:** close cohort-wide policy decisions for lease / ROU symmetry, unrestricted cash classification, NCI perimeter and other financing obligations. These are now the common blockers across much of the supported cohort.
2. **In parallel:** HRB and OTEX require issuer-specific EBIT / denominator review; PBI and SGHC require EBIT, currency and debt resolution.
3. **Then:** GTM, HPQ, HRMY, SSTK and XPOF require negative or unresolved invested-capital and cash/debt review.
4. After the shared policy is approved, re-run all 30 issuers and then sequence remaining P2/P3 issuer-level debt, cash and filing reviews.

## Guardrails

- A unique fact is not automatically an approved accounting classification.
- A reported zero applies only to the exact instrument line and period.
- Missing current/noncurrent debt or cash remains unknown, not zero.
- Do not add aggregate debt to its current/noncurrent components.
- Do not substitute later interim figures into annual Magic Formula calculations.
- Do not switch to a more favourable invested-capital or cash policy because it improves rank.
- No queue classification or issuer note in this document authorises a production write.



## Additional P1 exception: VSNT company-perimeter mismatch

| Ticker | FY2025 accession | Evidence | Review disposition | Next action |
|---|---|---|---|---|
| VSNT | 0002067876-26-000010 | FY2025 Form 10-K reports combined historical financial statements for the pre-separation Comcast-operated business; separation completed 2 Jan 2026 and regular-way trading began 5 Jan 2026. Year-end balance sheet includes $983m long-term debt and $1,034m restricted cash from senior-note proceeds in escrow; $1bn Term Loan A and $1bn Term Loan B funded on separation. | **P1 entity-perimeter mismatch** | Do not rank against post-spin-off market cap using pre-spin-off combined financials. Wait for comparable standalone annual statements or an approved pro forma bridge. Keep in coverage and explicitly excluded. |

This is a comparability/period-perimeter blocker, not simply a missing debt tag. The 2025 statements themselves caution that they may not represent results as an independent company.


**Current queue priority count:** 10 P1 / 10 P2 / 10 P3 across the 30-symbol active cohort. The P1 count comprises the nine issuer accounting cases above plus the VSNT company-perimeter mismatch documented in the separate exception row. This count is from the latest verified full-universe artifact; it is not an approval count.
