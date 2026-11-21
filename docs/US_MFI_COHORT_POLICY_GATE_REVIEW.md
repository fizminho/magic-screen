# US MFI cohort policy gate review

**As of:** 21 November 2026  
**Source run:** EdgarTools bakeoff run 44894196880, commit `ca685fa809c731e9601df75b33f7f96d4dbf04ad`  
**Policy:** `us_mfi_accounting_policy_v1_proposed`  
**Status:** review-only; owner approval required  
**Production writes / fundamentals / rankings changed:** no / no / no

## Latest cohort result

| Measure | Result |
|---|---:|
| Universe | 30 |
| EdgarTools supported | 28 |
| Provider unsupported | 2 |
| Shadow eligible | 0 |
| Shadow ranked | 0 |
| Accounting / valuation review | 28 |
| Production approved | 0 |
| Assessment validation errors | 0 |

The ranking preview now fails closed. No candidate from this cohort is currently eligible for a published or production MFI ranking. The earlier five-name shadow preview (HRB, OTEX, UPWK, IRWD, QTTB) is superseded by the stricter policy-scope gates.

## Most common evidence flags

Counts are issuer occurrences, not mutually exclusive categories. Generic `balance_sheet:*_candidates` flags are evidence-discovery signals; they are not themselves proof that an item belongs in debt, cash, invested capital or NCI.

| Flag | Issuers | Interpretation |
|---|---:|---|
| Aggregate debt candidates | 28 | Candidate taxonomy needs instrument-level tie-out; do not add aggregate and component values |
| Nondebt financing obligation candidates | 27 | Review royalty / other financing obligations under one cohort-wide EV policy |
| Rental equipment net candidates | 27 | Determine whether these assets belong in invested capital under a uniform rule |
| ROU assets explicit review | 24 | Lease / ROU symmetry decision required before including ROU assets |
| Cash combined or investment candidates | 23 | Separate unrestricted cash from restricted cash and investments |
| Lease liabilities explicit review | 23 | Decide lease treatment consistently; no one-sided ROU inclusion |
| Lease liabilities policy decision | 23 | Cohort-wide EV / invested-capital treatment remains open |
| NCI candidates | 21 | Candidate bucket only; inspect explicit issuer-level NCI flags before EV adjustment |
| Restricted cash / short-term investments review | 21 | Cash-scope decision required |
| Restricted or combined cash explicit review | 21 | Unrestricted cash not yet sufficiently isolated |
| Restricted cash candidates | 15 | Do not automatically deduct as unrestricted cash |
| Current lease liability candidates | 13 | Note-level lease evidence |
| Short-term investment candidates | 13 | Keep separate until uniform cash-like test approved |
| Current debt candidates | 12 | Tie to borrowing instrument carrying values and maturities |
| Current debt not uniquely identified | 12 | Missing / ambiguous current debt remains unknown, not zero |
| Noncurrent lease liability candidates | 9 | Note-level lease evidence |
| Noncurrent debt candidates | 8 | Tie to borrowing instrument carrying values and maturities |
| Noncurrent debt not uniquely identified | 8 | Missing / ambiguous noncurrent debt remains unknown, not zero |
| NCI explicit review | 7 | Issuer-level perimeter / EV review |
| Negative working-capital offset high risk | 6 | Withhold ROC pending denominator materiality review |
| Non-positive invested capital | 5 | Withhold ROC and ranking |

## What this means

1. The immediate bottleneck is no longer data extraction. The latest pipeline successfully generated the 30-company cohort assessment and ranking preview.
2. Most supported issuers have one or more accounting classification questions. These should be resolved through shared cohort-wide policy decisions, not by inventing issuer-specific formula overrides.
3. Generic candidate flags must not be treated as confirmed debt, cash, lease, NCI or rental-equipment balances. The filing note and exact period remain the source of classification.
4. Explicit unresolved scope flags currently block ranking. This is intentionally conservative while the policy is proposed and unapproved.
5. A direct-reported EBIT candidate is not the same as an approved EBIT input. Filing-specific EBIT reconstruction remains manual-review-only.
6. Unsupported providers remain visible exclusions. No fallback provider is silently substituted.

## Recommended closure sequence

### Gate 1: owner policy decisions

- Lease liabilities and ROU assets: baseline invested-capital and EV symmetry.
- Cash: unrestricted cash and cash equivalents only; restricted cash, escrow, customer funds and in-transit funds excluded.
- Marketable securities: separate from cash until a uniform eligibility test is approved.
- NCI: decide whether and how to adjust EV for non-wholly-owned operating perimeters.
- Other financing obligations: define consistent treatment for royalty financing, failed sale-leasebacks and similar obligations.
- EBIT: direct consolidated GAAP operating income only; define the process for any exceptional-item treatment without issuer-specific switching.
- Quote staleness: approve a single maximum age for the market-cap snapshot.

### Gate 2: issuer-specific review

- HRB: independently validate or reject the FY2026 $907.686m EBIT reconstruction.
- OTEX: validate $16.745m invested capital and withhold its highly denominator-sensitive candidate ROC.
- PBI / SGHC: resolve operating-income bridge, currency and debt evidence.
- GTM / HPQ / HRMY / SSTK / XPOF: resolve negative or incomplete invested-capital and cash/debt inputs.
- UPWK / IRWD / QTTB: complete note-level cash and debt sign-off; do not use later interim repayments to overwrite annual filing values.
- Remaining P2/P3 names: complete the same period-aligned note-level review after the shared policy is approved.

### Gate 3: rerun and compare

1. Re-run the resolver and cohort assessment under the approved policy version.
2. Confirm at least five approved eligible issuers before producing a final MFI ranking.
3. Reconcile candidate values to filing notes and legacy data, documenting missing legacy coverage separately from provider errors.
4. Run ranking sensitivity under approved alternative policy cases only as analysis, never as silent production overrides.
5. Require explicit production approval, monitoring and rollback before any production cutover.

## Guardrails

- No production writes or ranking changes.
- Missing values remain unknown, never zero.
- Do not double-count aggregate debt with current/noncurrent components.
- Do not deduct restricted cash, escrow or customer funds as unrestricted cash.
- Do not add ROU assets without the matching approved lease-liability treatment.
- Do not rank a negative or high-risk near-zero invested-capital denominator.
- Do not use pre-separation financials against a post-separation market capitalization without an approved comparable bridge.
