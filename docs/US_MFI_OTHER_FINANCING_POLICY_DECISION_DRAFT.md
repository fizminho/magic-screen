# US MFI other-financing obligations: cohort policy decision draft

**Prepared:** 22 November 2026  
**Scope:** royalty monetizations, failed sale-leasebacks, acquisition contingent consideration and tax receivable agreements  
**Status:** proposed accounting-owner decision support; not approved policy  
**Production writes / resolver changes / ranking changes:** none

## Executive recommendation

Keep every non-conventional financing obligation in a typed, accession-bound bucket. Do not flatten these balances into conventional debt or silently omit them from enterprise-value review.

For a future approved MFI policy, use a two-stage test:

1. **Accounting identification:** establish the legal/economic nature, carrying amount, counterparty claim, recourse, payment source, interest/accretion mechanics, maturity/settlement terms and any overlap with another reported liability.
2. **EV disposition:** decide under one cohort-wide rule whether that obligation is (a) included in debt-like EV at carrying value, (b) included in a separate EV adjustment, or (c) excluded from the baseline EV formula but retained as a disclosed review item.

A positive answer to stage 1 does not automatically determine stage 2. No issuer-specific inclusion should be made merely because it changes EY or rank.

## Evidence comparison

Amounts are USD millions and refer to the selected annual filing / accession shown.

| Issuer | Obligation type | FY carrying amount | Core evidence | Key unresolved policy issue |
|---|---|---:|---|---|
| BCRX | Royalty monetization financing | 465.688 | Current 38.455 + noncurrent 427.233; effective-interest accretion 53.163; royalty/principal reductions and release fees in roll-forward | Contract recourse/guarantees and uniform treatment of royalty monetizations |
| VXRT | Limited-recourse sale of future royalties | 4.060 | Current 1.381 + noncurrent 2.679; imputed interest 2.823; payments limited to specified royalty receipts | Whether limited-recourse claims are included at carrying value and how royalty revenue is treated in EBIT |
| PRDO | Failed sale-leaseback financing | 56.992 | Separate balance-sheet face row; retained/depreciated campus asset; payments split between interest and liability reduction; six note signals and distinct ordinary lease schedule | EV inclusion and matching asset/EBIT/invested-capital treatment |
| PLTK | Acquisition contingent consideration | 734.000 | Current 454.000 + noncurrent 280.000; SuperPlay acquisition-related; distinct from 2,389.100 conventional debt and 142.900 operating lease liabilities | Fair-value remeasurement, performance conditions, settlement form/timing and purchase-price vs debt-like EV treatment |
| GTM | Tax receivable agreement liability | 2,731.900 | Separately reported noncurrent contractual/tax obligation; not conventional borrowing | Payments depend on realized tax benefits; contractual scope, timing and whether a separate EV adjustment is appropriate |

### Filing references

- BCRX: FY2025, accession 0001628280-26-012240. Detailed roll-forward and royalty agreement mechanics are in [the P2 financing-obligation review](US_MFI_P2_FINANCING_OBLIGATION_REVIEW_2026-11-21.md).
- VXRT: FY2025, accession 0001437749-26-008023. The same worksheet records the royalty-stream limitation and imputed-interest mechanics.
- PRDO: FY2025, accession 0001193125-26-059331. The refreshed Gemini `full_scope` v10 review and six-signal deterministic reconciliation support separate presentation from ordinary operating/finance lease liabilities. See the PRDO section of the P2 financing-obligation review.
- PLTK: FY2025, accession 0001828016-26-000010. The P3 issuer review records contingent consideration and conventional debt separately.
- GTM: FY2025, accession 0001794515-26-000012. The P1 issuer review records the tax receivable agreement liability separately from conventional debt and lease liabilities.

## Proposed classification and EV decision framework

### A. Royalty monetization financing: BCRX and VXRT

**Accounting classification:** retain a separate `royalty_financing` category. Preserve current/noncurrent components, carrying amount, original proceeds where known, effective/imputed interest, cash/royalty remittances, recourse limitations and counterparty.

**Candidate EV rule for owner review:** include the outstanding carrying value in a separate debt-like EV adjustment when the issuer previously monetized a defined future operating cash-flow stream and a financing liability remains recognized. Apply the same rule to recourse and non-recourse arrangements, but preserve a `limited_recourse=true` attribute and report it separately. Do not classify it as conventional bank debt.

**Required safeguards:**
- Never add current + noncurrent components on top of an already-reported aggregate.
- Use the year-end carrying value, not gross future royalty projections or undiscounted contractual cash flows.
- Confirm whether payments are capped at royalties received, whether there are guarantees/recourse exceptions, and whether the claim is secured.
- Reconcile the royalty stream and liability roll-forward; do not count the same remittance as both debt repayment and a separate EV deduction.
- Do not remove royalty revenue or adjust EBIT issuer-by-issuer. Any EBIT normalization must be a separate cohort-wide policy.

**Open evidence:** BCRX executed contract recourse/guarantee provisions require legal confirmation. VXRT's no-payment-beyond-received-royalties clause is explicit in the filing, but legal confirmation of exceptions remains desirable.

### B. Failed sale-leaseback financing: PRDO

**Accounting classification:** retain `failed_sale_leaseback_financing`, separate from conventional debt and ordinary operating/finance lease liabilities.

**Evidence disposition:** overlap with ordinary lease liabilities is resolved for PRDO FY2025. The $56.992m financing balance is a distinct same-filing face row (row 52), separate from ordinary lease-liability rows 39, 40, 50 and 51. The six-signal note matcher supports financing treatment and separate schedules. The $154.067m future-payment schedule is undiscounted and must not replace or be added to the $56.992m carrying value.

**Candidate EV rule for owner review:** include the carrying value as a separate debt-like financing adjustment if the cohort policy includes financing obligations where the issuer retains the financed asset and records interest plus liability reduction. Do not put it in conventional borrowings or ordinary lease liabilities.

**Required symmetry decision:** because the asset remains recognized and depreciated, the owner must decide how the retained asset enters invested capital and how depreciation/interest presentation affects the operating-income numerator. A liability-only EV adjustment without checking the asset/EBIT perimeter risks inconsistent treatment.

### C. Acquisition contingent consideration: PLTK

**Accounting classification:** retain `contingent_consideration` as an acquisition-related obligation. Do not label it conventional debt based only on current/noncurrent balance-sheet presentation.

**Candidate baseline:** exclude from conventional debt and keep in a separate EV review bucket until the accounting owner defines whether recognized contingent consideration is treated as debt-like purchase consideration.

**Required evidence before any inclusion:**
- Reconcile the recognized fair-value carrying amount to the current/noncurrent balance-sheet amounts.
- Identify the performance/earn-out conditions, payment window and counterparty.
- Determine whether settlement is cash, equity, a choice of settlement, or otherwise conditional.
- Separate fair-value remeasurement from cash settlement and identify whether any portion is already included in another acquisition/debt balance.
- Apply the same rule to all cohort issuers with material acquisition earn-outs.

### D. Tax receivable agreement: GTM

**Accounting classification:** retain `tax_receivable_agreement` as a separate contractual/tax obligation, not conventional borrowing.

**Candidate baseline:** keep outside conventional debt until a cohort-wide policy specifies the treatment of contractual payments arising from realized tax benefits. Do not ignore the liability merely because it is not interest-bearing conventional debt.

**Required evidence before any inclusion:**
- Identify the beneficiaries and percentage of realized tax benefits payable.
- Determine whether payments arise only when tax savings are realized, whether there are acceleration/termination provisions, and whether tax-benefit estimates can be reversed.
- Reconcile the reported carrying amount and expected-payment disclosure; do not substitute undiscounted future payments for carrying value.
- Confirm whether the obligation is already reflected in deferred taxes, purchase accounting or another liability to avoid double counting.
- Apply the same rule to any other tax receivable agreements in the cohort.

## Proposed machine-readable taxonomy

Keep these classifications distinct in evidence and resolver outputs:

| Classification | Required attributes |
|---|---|
| `royalty_financing` | current, noncurrent, carrying amount, recourse/limited-recourse, royalty stream, accretion, remittance mechanics |
| `failed_sale_leaseback_financing` | carrying amount, current/noncurrent, retained asset link, interest/payment treatment, ordinary-lease overlap status |
| `contingent_consideration` | current/noncurrent, fair value, acquisition, performance conditions, settlement form, remeasurement |
| `tax_receivable_agreement` | carrying amount, beneficiaries, tax-benefit contingency, acceleration/termination, expected settlement |
| `other_ev_adjustment_review` | obligation type, evidence IDs, proposed disposition, reason and owner decision |

Each finding must preserve accession, fiscal period, primary evidence ID(s), all supporting evidence IDs, source concept/label, reported value, currency, and the source note excerpt. If evidence does not establish an amount or term, retain it as unknown. Do not infer zero.

## Required resolver and test behavior before any future policy implementation

1. A distinct obligation category must never be silently added to conventional gross debt.
2. A reported aggregate and its current/noncurrent components must not be double counted.
3. A separate face-statement line plus corroborating note evidence can resolve presentation overlap, but cannot approve EV inclusion.
4. Limited recourse must remain an explicit attribute; it must not be lost when normalized into a generic financing category.
5. Contingent consideration and tax receivable agreements must not be conflated with royalty financing or conventional borrowings.
6. Missing legal terms, payment schedules or carrying values remain review-required, not zero.
7. Policy changes require a version bump, issuer-wide regression tests, ranking sensitivity artifact and owner approval before any runtime resolver input changes.
8. All current behavior remains shadow-only: `production_write=false`, `production_approved=false`, `production_fundamentals_changed=false`, `rankings_changed=false`.

## Accounting-owner decisions requested

| Decision | Proposed default for review | Status |
|---|---|---|
| Recourse royalty monetizations | Include carrying amount as separate debt-like EV adjustment | Pending |
| Limited-recourse royalty monetizations | Same carrying-value rule, preserve limited-recourse flag | Pending |
| Failed sale-leaseback financing | Include carrying amount as separate debt-like EV adjustment, with retained-asset/EBIT/ROC symmetry review | Pending |
| Acquisition contingent consideration | Separate EV bucket; exclude from conventional debt pending uniform purchase-consideration rule | Pending |
| Tax receivable agreements | Separate EV bucket; exclude from conventional debt pending contractual cash-flow rule | Pending |
| Ordinary operating/finance leases | Continue separate from conventional debt until lease/ROU policy is approved | Pending |

**Conclusion:** the filing evidence supports distinct accounting categories for these obligations. It does not establish a final MFI EV policy. The recommended path is to approve a single cohort-wide classification and inclusion rule, then test it against every issuer before changing the resolver. No production fundamentals, EV, EY, ROC, eligibility or ranking values are changed by this document.
