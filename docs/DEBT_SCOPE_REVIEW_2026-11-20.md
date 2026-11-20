# Debt-scope review queue (2026-11-20)

## Purpose and boundary

This note records issuer-level evidence from the EdgarTools annual-filing extraction artifact generated on 2026-11-20. It is a manual-review worklist, not an accounting-policy approval or a change to the MFI resolver.

- All amounts below are in the filing's reported currency (USD unless the filing says otherwise).
- Evidence is limited to selected annual-filing balance-sheet face rows and the selected accession.
- A missing conventional-debt row is **unknown**, not zero and not proof that the issuer is debt-free.
- Explicit zero applies only to the exact reported instrument row.
- Lease liabilities and separately presented financing obligations remain outside the conventional-debt candidate bridge until policy is approved.
- Multiple distinct instruments in the same maturity bucket are not automatically added.
- No production fundamentals, EV, EY, ROC, eligibility or ranking is changed by this review.

## Issuer-level exception worklist

| Ticker | Filing period / accession | Face-row evidence | Why still blocked |
|---|---|---|---|
| SGHC | FY2025 / 20-F / 0001628280-26-025609 | IFRS noncurrent borrowings candidate: $17m; current lease liabilities $5m; noncurrent lease liabilities $59m | The borrowing row is maturity-specific through its IFRS taxonomy concept, but there is no separately identified current conventional-debt row. Keep the $17m as a review-only noncurrent candidate; do not assume current debt is zero. |
| SPRO | FY2025 / 10-K / 0001193125-26-126192 | Operating lease liabilities: current $1.956m, noncurrent $0.939m. `OtherLongTermDebtNoncurrent` labelled “Other long-term liabilities”: $0.091m | The generic other-liability row is not accepted as conventional debt. No conventional debt candidate is identified; this is not evidence of no debt. |
| BCRX | FY2025 / 10-K / 0001628280-26-012240 | Secured term loan, noncurrent: explicitly reported $0. Finance lease liabilities: current $1.312m, noncurrent $1.441m. Operating lease liabilities: current $0.317m, noncurrent $8.571m. Royalty financing obligations: current $38.455m, noncurrent $427.233m | The exact secured-term-loan row is zero, but royalty financing is a separate financing obligation and substantial. It must not be silently treated as conventional debt or ignored. Review the contract/accounting presentation and decide policy explicitly. |
| FHTX | FY2025 / 10-K / 0001628280-26-016814 | Operating lease liabilities: current $0.923m, noncurrent $40.347m | Lease rows are identified; no conventional-debt face row was selected. Do not infer debt-free status from absence. |
| MNTN | FY2025 / 10-K / 0001891027-26-000019 | Current notes payable $0 and current convertible debt $0, two distinct concepts | The two current instruments remain ambiguous under the no-auto-sum rule even though both displayed values are zero. No noncurrent candidate identified. Preserve both exact zeros; do not turn missing noncurrent debt into zero. |
| NRIX | FY2025 / 10-K / 0001549595-26-000016 | Operating lease liabilities: current $2.824m, noncurrent $52.906m | Lease rows are identified; no conventional-debt face row was selected. Do not infer debt-free status from absence. |
| PRDO | FY2025 / 10-K / 0001193125-26-059331 | Finance lease liabilities: current $5.458m, noncurrent $6.097m. Operating lease liabilities: current $6.032m, noncurrent $43.752m. Sale lease-back financing: $56.992m | Sale lease-back financing is separately classified, not ordinary lease liability or conventional debt by default. Review the contract and filing note before deciding EV treatment. |
| PXED | FY2026 / 10-K / 0001193125-26-445323 | Operating lease liabilities: current $10.136m, noncurrent $52.872m | Lease rows are identified; no conventional-debt face row was selected. Do not infer debt-free status from absence. |
| SBC | FY2025 / 10-K / 0001193125-26-127557 | Bank and other borrowings: current $9.099m, noncurrent $33.734m. Related-party notes payable: current $0 and noncurrent $0 | Distinct bank-borrowing and related-party-note instruments share maturity buckets. The nonzero bank borrowings are strong conventional-debt candidates, but the buckets remain ambiguous until additive scope and overlap are confirmed. Do not automatically sum. |
| STRA | FY2025 / 10-K / 0001013934-26-000006 | Operating lease liabilities: current $15.905m, noncurrent $93.216m | Lease rows are identified; no conventional-debt face row was selected. Do not infer debt-free status from absence. |
| VXRT | FY2025 / 10-K / 0001437749-26-008023 | Operating lease liabilities: current $2.978m, noncurrent $6.007m. Liability from sale of future royalties: current $1.381m, noncurrent $2.679m | Future-royalty sale liabilities are separately classified financing obligations. Review the financing arrangement; do not silently add to conventional debt or treat as ordinary lease liability. |
| ZVRA | FY2025 / 10-K / 0001434647-26-000011 | Long-term debt: noncurrent $61.928m. Operating lease liabilities: current $0.419m, noncurrent $0.859m | Unique noncurrent conventional-debt candidate exists, but no current conventional-debt row was identified. Keep current debt unknown, not zero. |

## Suggested policy decisions, in order

1. **Conventional borrowings:** approve a maturity-specific mapping for explicit debt/loan/borrowing instruments. Keep current and noncurrent buckets independent. If multiple distinct instruments occur in a bucket, require explicit evidence that they are additive and not subtotals before summing.
2. **Lease liabilities:** decide whether the chosen Magic Formula EV definition includes operating and finance lease liabilities. If included, align EBIT treatment with lease expense/capitalisation consistently. Do not add lease liabilities to EV while leaving EBIT treatment conceptually inconsistent.
3. **Sale lease-back and royalty financing:** maintain a separate financing-obligation category. Decide case by case whether the obligation is debt-like for EV; do not classify it by keyword alone.
4. **Explicit zero versus missing:** accept a zero only for the exact instrument and period shown. A zero in one row does not prove no other debt exists.
5. **Current/noncurrent completeness:** require both maturity buckets to be resolved or explicitly documented as not applicable by filing evidence before a net-debt candidate can be approved.
6. **Cash scope:** continue to deduct only uniquely identified unrestricted cash. Restricted cash and short-term investments require separate policy decisions.
7. **No automatic production promotion:** even a uniquely classified candidate remains review-only until the overall EBIT, invested-capital, debt, lease and cash policies pass regression and shadow validation.

## Next review targets

- Inspect the full filing notes for BCRX royalty financing, PRDO sale lease-back financing and VXRT future-royalty sale liabilities.
- Confirm the face-statement hierarchy and note reconciliations for SBC's bank borrowings versus related-party notes.
- Confirm SGHC's borrowing maturity disclosure and whether any current borrowing is included in a broader note.
- For FHTX, NRIX, PXED and STRA, review debt/credit-facility notes before concluding that conventional debt is absent.
- For ZVRA, inspect current-maturity disclosures before treating the current bucket as not applicable.

## Source and reproducibility

Source artifact: `edgartools-bakeoff.json` and `accounting-review-queue.json` from EdgarTools bakeoff run 44792239005 (commit `9c8353c9dd4177b282151a641acbc42bb321e2c0`). The queue is accession-matched to the extraction artifact. Rebuild it using `scripts/build_accounting_review_queue.py --raw-evidence edgartools-bakeoff.json`.

This is a dated evidence snapshot. Regenerate it when the selected annual filing/accession changes.
