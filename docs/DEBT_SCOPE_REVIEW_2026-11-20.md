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


## Filing-note verification update

The following note-level checks were completed against the primary annual filings after the face-row queue was generated:

- **BCRX:** Note 9 states that cash received under the royalty purchase agreements is recorded as “Royalty financing obligations”, carries deferred financing costs and is subsequently measured using the effective-interest method. The FY2025 roll-forward ends at **$465.688m**. The cash-flow discussion separately identifies non-cash interest expense and principal payments on these obligations. Note 10 says the Pharmakon term loan was paid off in full during 2025, explaining why the selected year-end secured-term-loan row is explicitly zero while the royalty financing remains outstanding. This is strong evidence of a financing liability that deserves its own debt-like EV policy decision, not evidence that the royalty financing should be merged into ordinary borrowings automatically. See the [SEC 10-K](https://www.sec.gov/Archives/edgar/data/882796/000162828026012240/bcrx-20251231.htm), especially Notes 9–10.
- **PRDO:** The annual report explains that the $56.992m sale lease-back financing balance arose from the **recategorization of construction financing upon lease commencement because the transaction failed sale-leaseback accounting**. It is shown separately from operating and finance lease liabilities. Treat it as a separate financing obligation pending policy review, not as an ordinary lease liability or an automatically selected conventional-debt tag. See the [2025 annual report](https://www.sec.gov/Archives/edgar/data/1046568/000119312526149817/prdo-ars-april_2026.pdf).
- **VXRT:** Note 6 describes a royalty-rights acquisition in which HCRP paid cash for specified future royalty rights. The remaining liability accretes imputed interest and is reduced as pass-through royalties are paid. The statement of operations separately reports non-cash interest expense related to the sale of future royalties. This confirms the face rows are a financing-related obligation, not a conventional bank borrowing or lease. It should remain a separate financing category for EV policy review. See the [FY2025 Form 10-K](https://investors.vaxart.com/static-files/4f2a1a16-8cbd-4bc9-8bf3-8978df723980).

These note checks strengthen the **classification evidence**, but do not themselves approve inclusion in enterprise value. In particular, BCRX's $465.688m and PRDO's $56.992m must not be silently ignored simply because they are not conventional debt rows, nor automatically added without a consistent policy.


## Additional filing-note verification: SBC, SGHC and ZVRA

### SBC — current and noncurrent bank borrowings reconcile to the maturity schedule

The FY2025 balance sheet reports bank and other borrowings of **$9.099046m current** and **$33.734438m noncurrent**. The separately presented related-party notes payable are explicitly nil in both maturity buckets. Note 15's future principal repayment schedule reports $9.099046m in 2026, $13.954055m in 2027, $7.437818m in 2028, $6.906623m in 2029 and $5.435942m in 2030, totaling **$42.833484m**. The schedule total exactly equals current plus noncurrent bank and other borrowings. Note 15 also describes revolving credit facilities and bank/financial-institution borrowings. This is strong filing-specific evidence that the two bank-borrowing maturity buckets are distinct and reconcile, while the two zero related-party-note rows are separate instruments. It supports manual review of the conventional-debt candidate, but the automated resolver still withholds aggregation pending policy approval. The accession-matched review queue now exposes the bucket-level evidence disposition separately: one non-zero instrument plus explicit-zero co-instruments, the non-zero amount, and an explicit no-aggregation/no-resolver-input guard. The bucket remains `ambiguous_manual_review`; this is reviewer triage, not an automatic debt selection. See [SBC FY2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1930313/000119312526127557/sbc-20251231.htm), balance sheet and Notes 15–16.

### SGHC — noncurrent borrowing is supported by facility maturity disclosure; current bucket remains unproven

The FY2025 20-F presents $17m of interest-bearing loans and borrowings under noncurrent liabilities and no corresponding borrowing line under current liabilities. Note 24 identifies Waterview Properties Facilities A and B, both maturing March 7, 2030, and states their combined carrying amount is $17.3m. The financing cash-flow narrative says $16.2m was received during 2025 and $0.9m repaid. However, the same facility table also lists “Other loans” as payable on demand with an unspecified facility amount. Therefore, the $17m noncurrent candidate has strong support, but do not infer that the current debt bucket is zero from the missing face-statement line alone until the on-demand loan disclosure is reconciled. Keep SGHC's current debt unresolved. See [SGHC FY2025 Form 20-F](https://s205.q4cdn.com/195659402/files/doc_financials/2025/ar/Super-Group-SGHC-Limited-20-F-Annual-and-Transition-Report-foreign-private-issuer.pdf), Note 24 and the consolidated statement of financial position.

### ZVRA — long-term term-loan maturity schedule supports no scheduled current principal

The FY2025 10-K's debt note describes term loans maturing on the fifth anniversary of the closing date. The debt table reconciles $63.608m principal less $1.680m of unamortized discount, issuance costs and paid-in-kind interest to **$61.928m long-term debt**. The future principal schedule shows no scheduled principal in 2026, 2027 or 2028, with $63.608m due in 2029. This supports the noncurrent classification of the year-end carrying amount and indicates no scheduled principal maturity within the next 12 months. Retain the $61.928m noncurrent candidate as review-only; do not convert the current bucket to zero in the generic resolver without an explicit rule for maturity-note evidence and any acceleration/on-demand provisions. See [ZVRA FY2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1434647/000143464726000011/zvra-20251231.htm), Debt Disclosure and Term Loan note.

These filing-note checks improve evidence quality, but all three cases remain review-only. They do not change production calculations or ranking eligibility.


## Further credit-facility note checks

### PXED — revolving facility exists, but no borrowings were drawn

The selected FY2026 10-K discloses a $100m senior secured revolving facility entered into on November 13, 2025, maturing November 13, 2030. At August 31, 2026, the issuer explicitly reports **no outstanding borrowings**. It did have a **$28.4m letter of credit** supporting a sublease; this reduces facility availability but is not a drawn borrowing. The letter of credit replaced a cash-collateralized letter of credit and released the related restricted cash. For conventional-debt review, this supports no drawn balance under this specific facility at the selected date, but the letter of credit remains a contingent commitment and should not be added to gross debt automatically. The restricted-cash movement must also not be confused with unrestricted cash. See [PXED FY2026 Form 10-K](https://www.sec.gov/Archives/edgar/data/1600222/000119312526445323/pxed-20260831.htm), Note 10 and Note 15.

### STRA — $250m revolver, no outstanding borrowings at FY2025 year-end

The FY2025 10-K describes a $250m senior secured revolving credit facility, but explicitly states that no borrowings were outstanding at December 31, 2025. The face balance sheet separately reports operating lease liabilities. This is useful negative evidence for the named revolver only; it does not justify setting every possible conventional-debt category to zero without checking other financing arrangements and the complete debt note. See [STRA FY2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1013934/000101393426000006/stra-20251231.htm).

### FHTX and NRIX — no conventional debt row surfaced in the selected face statements

FHTX's FY2025 balance sheet reports operating lease liabilities and other operating liabilities but no separate conventional-debt line; its filing also states it had no off-balance-sheet arrangements. NRIX's FY2025 balance sheet similarly reports operating lease liabilities and deferred revenue, without a separately presented conventional-debt line. These are useful face-statement observations, not sufficient proof that no borrowing exists. Keep the debt bucket unresolved unless a complete filing-note review confirms that no outstanding conventional borrowing or debt-like financing arrangement is disclosed. See [FHTX FY2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1822462/000162828026016814/fhtx-20251231.htm) and [NRIX FY2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1549595/000154959526000016/nrix-20251130.htm).


## MNTN and SPRO note-level debt checks

- **MNTN** (FY2025 accession `0001891027-26-000019`): the 10-K says convertible notes were fully settled at the May 23, 2025 IPO and had no balance at year-end; the revolver had no borrowings at year-end; and the 2024 short-term holdback payable was settled in Q1 2025. The remaining partial-recourse promissory note is owed by an employee to MNTN, so it is not MNTN borrowing. The review record is limited to these named instruments and does not make an unrestricted company-wide debt assertion. [SEC filing](https://www.sec.gov/Archives/edgar/data/1891027/000189102726000019/mntn-20251231.htm)
- **SPRO** (FY2025 accession `0001193125-26-126192`): the 10-K explicitly says the company has no debt in its lease accounting discussion. It separately reports operating lease liabilities of $2.895m and other long-term liabilities of $91k. The lease balances remain outside conventional debt pending policy; the $91k other liability is not classified as debt without further evidence. [SEC filing](https://www.sec.gov/Archives/edgar/data/1701108/000119312526126192/spro-20251231.htm)

Both records are accession-bound and review-only. They do not promote debt candidates, change EV, or alter production rankings.


## Structured debt-note review classifications

The queue now exposes a controlled `review_classification` for each accession-matched curated debt-note review, and a summary count by classification. This is a navigation aid for policy work, not a new accounting conclusion.

| Classification | Issuers | Meaning |
|---|---|---|
| `conventional_borrowing_maturity_reconciliation` | SBC | Filing note reconciles face-statement current and noncurrent borrowing buckets. |
| `conventional_borrowing_with_current_bucket_unresolved` | SGHC | Noncurrent borrowing has facility support, but a separate on-demand loan leaves current debt unresolved. |
| `conventional_term_loan_maturity_schedule` | ZVRA | Term-loan maturity schedule supports noncurrent classification; current bucket is not automatically zero. |
| `named_instrument_zero_or_undrawn_facility` | MNTN, PXED, STRA | Negative evidence applies only to the named instruments or facilities, not all possible debt. |
| `issuer_explicit_no_conventional_debt_statement` | SPRO | Filing states no debt; separately reported leases and other liabilities retain their own scope. |
| `separate_royalty_financing_obligation` | BCRX | Royalty financing remains distinct from ordinary bank borrowing. |
| `separate_sale_leaseback_financing_obligation` | PRDO | Failed sale-leaseback construction financing remains a separate financing category. |
| `separate_future_royalty_financing_obligation` | VXRT | Future-royalty financing remains separate from bank borrowing and leases. |

The classification is attached only when the extracted filing accession exactly matches the resolver preview. Every record remains `review_only`, with `production_approved=false`, `resolver_input=false`, and `debt_candidate_promoted=false`. The classification does not fill missing maturity buckets, aggregate distinct instruments, or change EV.

## Top-five shadow-ranking issuer note checks (21 Nov 2026)

The five current shadow-ranked companies were checked against the exact annual filing accessions used by the resolver preview. The observations below are filing evidence, not approvals or changes to the EV formula.

| Issuer | Filing period / accession | Debt evidence | Cash and other scope |
|---|---|---|---|
| OTEX | FY2026 / 0001002638-26-000068 | Note 11 total carrying debt 5,770.369m; current 35.850m + noncurrent 5,734.519m reconciles exactly. | Cash equivalents 956.024m; restricted cash 1.230m. Separate deposits/restricted cash 4.824m current + 16.334m noncurrent, investments 112.022m equity method and 45.142m AFS, operating leases 202.037m and NCI 1.962m. |
| SNDK | FY2026 / 0001628280-26-057406 | Current and noncurrent debt are explicit zero; Note 8 says the remaining term loan was repaid 4 Mar 2026 and the 1.5bn revolver was undrawn at 3 Jul 2026. | Cash equivalents 4,762m. Marketable equity securities 1,777m and Flash Ventures notes/investments 678m remain separate; operating lease liabilities 201m. |
| IRWD | FY2025 / 0001104659-26-020489 | 199.680m net carrying convertible notes + 385m revolver principal = 584.680m debt candidates. | Cash equivalents 215.456m. Operating lease liabilities 3.252m current + 9.870m noncurrent; 0.6m letters of credit support leases. |
| QTTB | FY2025 / 0001193125-26-099339 | 9.375m principal less 0.333m discount/issuance costs = 9.708m carrying value; 6.235m current + 3.473m noncurrent. | Cash equivalents 48.297m; 0.647m restricted cash collateralizes venture debt and lease letters of credit; noncurrent operating lease liability 4.943m. |
| UPWK | FY2025 / 0001627475-26-000012 | 360.998m convertible-note principal less 1.228m issuance costs = 359.770m carrying value, all current; maturity 15 Aug 2026. | Cash equivalents 294.356m; marketable securities 378.425m separately classified; restricted cash 3.8m; customer escrow funds 180.752m matched by escrow payable. Operating lease liability 9.707m noncurrent. |

### Review disposition

- OTEX, IRWD and QTTB have note-to-face-statement carrying-value reconciliations for conventional debt.
- SNDK's zero debt is supported by explicit zero balance-sheet rows and note-level settlement/undrawn-facility disclosures for FY2026.
- UPWK's current debt and maturity are supported by the note; the 2026 maturity creates a point-in-time policy question if a later balance-sheet snapshot is ever mixed with annual EBIT.
- Do not fold restricted cash, customer escrow, leases, equity-method investments, marketable equity securities, or noncontrolling interests into EV inputs without an explicit and consistently applied policy.
- Marketable debt securities at UPWK are a separate liquid-investment category. Their possible cash-like treatment must be decided consistently across the universe, not issuer-by-issuer.
- These five checks are attached to the queue only for the exact accession. They remain `review_only`, are not resolver inputs, do not promote debt candidates, and do not alter production fundamentals or rankings.


### EV sensitivity, not a policy decision

Using the current shadow preview's market-cap snapshot and the same annual EBIT/debt/cash inputs, the following isolates the size of selected unresolved scope items. Amounts are USD; yields are EBIT divided by EV. The lease sensitivity simply adds reported operating lease liabilities to EV without adjusting EBIT, so it is deliberately a diagnostic only, not a consistent lease-capitalization methodology.

| Stock | Current candidate EV | Candidate EY | EV with reported operating leases added | EY with leases added |
|---|---:|---:|---:|---:|
| OTEX | 10,260.305m | 10.551% | 10,462.342m | 10.348% |
| SNDK | 107,013.700m | 11.577% | 107,214.700m | 11.555% |
| IRWD | 1,159.074m | 8.498% | 1,172.196m | 8.403% |
| QTTB | 163.891m | 10.313% | 168.834m | 10.011% |
| UPWK | 1,226.374m | 10.544% | 1,236.081m | 10.461% |

Additional isolated scope checks:

- OTEX noncontrolling interests of 1.962m would add 1.962m to EV under a conventional consolidated-EV treatment, moving EY from 10.551% to approximately 10.549% before any lease adjustment.
- UPWK's 378.425m marketable securities are separately presented and described as available for current operations. If a future, universe-wide policy explicitly treats these as cash-like, the illustrative EV would fall from 1,226.374m to 847.949m and EY would rise from 10.544% to approximately 15.249%. This is the most ranking-sensitive unresolved cash-scope item among the five.
- Restricted cash and customer escrow are excluded from all these scenarios. No restricted balance is treated as freely available cash.
- SNDK's 1,777m marketable equity securities and 678m Flash Ventures notes/investments are not equivalent to cash equivalents; they are not included in the cash-like scenario.
- OTEX's near-zero invested-capital denominator remains the largest ROC sensitivity. The existing denominator diagnostics and P1 escalation remain in force.

These figures are scenario arithmetic only. They do not change the five-stock shadow ranking, accounting approval state, or production data.
## Debt candidate instrument-level evidence (review-only)

The queue now carries an accession-matched, fiscal-period-matched instrument ledger for current and noncurrent debt candidates. Each line preserves its XBRL concept, label, amount, fiscal period and source row index.

The ledger distinguishes one nonzero candidate plus separately reported zero-valued instrument lines, multiple nonzero or unknown-valued instruments requiring manual review, all reported instrument lines explicitly valued at zero, and no candidate (unknown, not zero).

Examples from the latest FY2025 extraction:
- MNTN has two current-debt concepts, both explicitly reported at zero. Its noncurrent bucket has no candidate and remains unknown.
- SBC has one nonzero bank-borrowing candidate and one separately reported related-party notes-payable line at zero in both current and noncurrent buckets. Positive borrowing lines are preserved without automatic aggregation.

These are evidence-quality dispositions only. The resolver's ambiguity status, EV candidate, ranking eligibility and production data remain unchanged. Zero is asserted only for the exact reported line and fiscal period.

## Structured issuer portfolio composition evidence (review-only)

The cash-policy review now carries a structured `portfolio_composition` object for the nine issuer-note reviews. Amounts are in USD millions and are attached only to the exact reviewed annual-filing accession.

- FHTX and PLTK have instrument-level amounts that reconcile to their reported marketable/short-term investment totals.
- PXED, STRA and ZVRA have disclosed maturity-bucket amounts that reconcile to the portfolio total, while instrument-level allocations remain unknown.
- NRIX identifies its marketable portfolio as U.S. Treasury securities and keeps the separately reported money-market cash equivalents outside that portfolio.
- ALEC's maturity schedule is explicitly labelled as combined cash equivalents plus marketable securities; it is not allocated to marketable securities alone.
- UPWK's instrument mix is known only at portfolio level. Instrument amounts remain null; separately reported cash, restricted cash and customer escrow are kept outside the marketable-securities total.
- SGHC's 513m cash-equivalent components are represented as 45m cash-in-transit plus 468m bank balances. Processor wallets, regulatory balances and CSR earmarks are nested subsets of bank balances, not additive components; the separate 6m user-segregated balance remains outside the reported total.

Unknown instrument amounts remain null, not zero. These details do not reclassify balance-sheet face rows, promote securities to cash equivalents, alter EV, change rankings, or enter the resolver. All remain review-only pending a uniform cash-like policy.

## Universe-wide EV scope evidence framework (review-only)

The accounting review queue now classifies selected annual balance-sheet face rows into a separate EV-scope evidence layer. This is an evidence inventory, not a policy decision and not an input to the resolver or ranking preview. It is attached only when the raw extraction accession exactly matches the resolver preview accession.

| Evidence category | Current review treatment | Guardrail |
|---|---|---|
| Conventional borrowings | Candidate gross debt | Require unique, complete current/noncurrent buckets and an approved carrying-value/overlap rule |
| Unrestricted cash and cash equivalents | Candidate cash deduction | Require evidence that the balance is available to the consolidated group |
| Restricted cash | Exclude from unrestricted cash | Do not net collateral, deposits or restricted balances against debt |
| Marketable debt securities / short-term investments | Separate liquidity category | Decide cash-like treatment using common maturity, credit-risk, liquidity and availability criteria |
| Generic marketable securities with unknown composition | Composition unknown; not cash by assumption | Inspect issuer note to determine debt/equity mix, maturity, restrictions and liquidity |
| Marketable equity securities | Not cash equivalents | Do not treat strategic/equity investments as cash without explicit policy |
| Equity-method investments | Separate investment asset | Do not net against EV automatically |
| Notes receivable / loans receivable | Separate financial asset | Do not treat strategic or affiliate notes as cash equivalents |
| Lease liabilities | Separate lease category | If included in EV, align EBIT/operating-lease expense treatment consistently |
| Noncontrolling interests | Separate EV adjustment | Decide consistently whether consolidated EBIT requires NCI in EV |
| Total shareholders equity including NCI | Not an NCI amount | Never substitute the entire equity subtotal for the separately reported NCI balance |
| Customer escrow assets and related payables | Exclude matched customer funds from company cash and debt | Reconcile asset/payable pairing; never count customer funds as unrestricted corporate cash |
| Royalty, sale-leaseback and other financing obligations | Separate financing category | Require instrument-level debt-like assessment; do not classify by keyword alone |

### Candidate policy sequence (not yet approved)

1. Define conventional debt using explicit borrowing instruments and carrying values, with independent current and noncurrent maturity buckets. Do not sum overlapping subtotals or principal plus carrying values.
2. Define cash deduction as unrestricted cash and cash equivalents available to the consolidated group. Restricted cash, collateral, customer escrow and deposits stay outside.
3. Decide whether highly liquid marketable debt securities qualify as cash-like. Criteria should be uniform across issuers and include instrument type, maturity, credit risk, settlement liquidity, restrictions and operational availability. UPWK's separately reported $378.425m portfolio is a material sensitivity, not a reason for an issuer-specific exception.
4. Keep marketable equity securities, equity-method investments and notes receivable separate from cash equivalents unless a separately approved policy establishes otherwise.
5. Decide on NCI treatment as part of a consolidated enterprise-value definition and apply it consistently.
6. Decide on lease and other financing obligations together with the corresponding EBIT treatment. Do not add lease liabilities to EV in isolation and call the result a final Magic Formula yield.
7. Require a complete, accession-bound evidence trail. Missing categories remain unknown, not zero.

### Implementation guardrails

- The queue's ev_scope_evidence is derived from non-dimensional, non-abstract annual balance-sheet face rows only.
- Each row carries its exact filing accession, fiscal period, amount, classification, policy status and production_approved=false / resolver_input=false.
- The queue does not infer an absent asset or liability, aggregate rows, net restricted cash, pair escrow balances, approve a policy, or change candidate EV.
- NCI evidence requires a separately identified noncontrolling/minority-interest line; a total shareholders-equity subtotal that merely includes NCI is not classified as NCI.
- Classification is a triage hint. For example, a generic marketable securities label is not proof of debt-security composition or cash equivalence; inspect the issuer note before any policy decision.
- The category inventory is intentionally broader than conventional debt so the review does not lose sight of leases, investments, customer funds, NCI and financing-like obligations.

No production fundamentals, ratios, eligibility decisions or rankings are changed by this evidence layer.
## Latest EV scope inventory snapshot (21 Nov 2026)

The successful read-only queue build covered 30 universe members. Raw annual balance-sheet EV-scope evidence was accession-matched for 28 companies; two EdgarTools-unsupported issuers remain deferred. The following are **row counts, not issuer counts or approved EV adjustments**:

| Category | Face-row count |
|---|---:|
| Conventional debt | 41 |
| Lease liabilities | 51 |
| Restricted cash | 15 |
| Unrestricted cash and cash equivalents | 25 |
| Noncontrolling interests | 5 |
| Marketable debt securities identified by label/concept | 4 |
| Generic marketable securities, composition unknown | 7 |
| Marketable equity securities | 1 |
| Equity-method investments | 1 |
| Notes receivable / related-party notes and investments | 5 |
| Other financing obligations | 6 |
| Customer escrow assets and payables | 2 |

Additional review coverage: 17 accession-bound issuer debt-note reviews, three filing-specific EBIT manual reviews and six high negative-working-capital-offset cases. All remain review-only.

### Important issuer-level classification checks

- **OTEX:** the separately reported noncontrolling-interest line is $1.962m. The $4,016.066m total shareholders' equity subtotal is not NCI and is excluded from the NCI evidence category.
- **NRIX:** $345.981m is tagged as marketable debt securities because the XBRL concept is `DebtSecuritiesAvailableForSaleExcludingAccruedInterestCurrent`, even though the face label is generic. This is a debt-security classification, not a conclusion that it is cash-equivalent.
- **UPWK:** $378.425m remains generic marketable securities because its face XBRL concept does not establish a cash-equivalent category. Its note describes money-market funds, commercial paper, Treasury bills, corporate bonds and other fixed-income securities available for current operations. Composition, maturities, restrictions and liquidity still require a consistent policy review.
- **SNDK:** $1.777bn of marketable equity securities and $678m of Flash Ventures notes/investments remain separate from cash and cash equivalents.

The latest queue confirms `production_fundamentals_changed=false`, `rankings_changed=false` and `production_write=false`. The evidence inventory does not aggregate or net these rows.
## Issuer-level cash and investment note reviews (21 Nov 2026)

Nine exact-accession annual-filing reviews are now attached separately from the debt-note review layer. These records explain portfolio composition, maturity, liquidity and restrictions; they do not approve any cash deduction or promote any balance into the resolver.

| Issuer | Reporting date | Investment evidence | Review implication |
|---|---|---|---|
| SGHC | 31 Dec 2025 | $513m cash equivalents: $45m cash-in-transit, $468m bank balances, including $129m processor wallets accessible on demand. | $19m regulatory balances and $12m CSR-earmarked balances require availability review; separate $6m user-segregated cash must not be added to corporate cash. |
| FHTX | 31 Dec 2025 | $78.018m available-for-sale: $1.500m U.S. government agencies, $35.287m commercial paper, $41.231m corporate notes/bonds. | Available for current operations, but some maturities may exceed one year; keep separate from cash equivalents. [10-K](https://www.sec.gov/Archives/edgar/data/1822462/000162828026016814/fhtx-20251231.htm) |
| NRIX | 30 Nov 2025 | $345.981m U.S. Treasury securities, separately from $241.364m money-market cash equivalents. | Debt securities with current classification; do not automatically merge with cash equivalents. [10-K](https://www.sec.gov/Archives/edgar/data/1549595/000154959526000016/nrix-20251130.htm) |
| PXED | 31 Aug 2026 | $167.852m marketable debt securities: $137.094m current, $30.758m noncurrent. Includes U.S. Treasury/agency, commercial paper and investment-grade corporate debt. | Maturity extends up to three years; liquidity deployability is constrained by Department of Education composite-score requirements. [10-K](https://www.sec.gov/Archives/edgar/data/1600222/000119312526445323/pxed-20260831.htm) |
| STRA | 31 Dec 2025 | $12.297m held-to-maturity investments: $7.297m due within one year and $5.000m due within one to five years. | Includes term deposits, U.S. Treasuries and corporate debt; held-to-maturity intent argues against automatic cash-equivalent treatment. [10-K](https://www.sec.gov/Archives/edgar/data/1013934/000101393426000006/stra-20251231.htm) |
| ALEC | 31 Dec 2025 | $190.222m marketable securities, available-for-sale; money market funds, Treasuries, corporate bonds, CDs and commercial paper. | Available for current operations; combined cash-equivalent and marketable-security maturities include $214.4m within one year and $41.0m in one to two years. [10-K](https://www.sec.gov/Archives/edgar/data/1653087/000119312526071593/alec-20251231.htm) |
| PLTK | 31 Dec 2025 | $136.0m short-term investments: $71.8m term deposits and $64.2m commercial paper. | Explicitly more than three months and less than one year, outside the issuer's cash-equivalent definition. [10-K](https://www.sec.gov/Archives/edgar/data/1828016/000182801626000010/playtika-20251231.htm) |
| ZVRA | 31 Dec 2025 | $176.484m available-for-sale debt securities: $128.605m due within one year and $47.879m due in one to three years. | U.S. Treasuries and corporate bonds invested to fund future operations; apply a common maturity cutoff. [10-K](https://www.sec.gov/Archives/edgar/data/1434647/000143464726000011/zvra-20251231.htm) |
| UPWK | 31 Dec 2025 | $378.425m marketable securities: money-market funds, commercial paper, Treasury bills, corporate bonds and other fixed income. | Available for current operations, but face row does not identify the exact maturity mix. Keep separate until instrument-level eligibility is established. [10-K](https://www.sec.gov/Archives/edgar/data/1627475/000162747526000012/upwk-20251231.htm) |

### Cross-issuer conclusion

The issuers use materially different labels and classifications: cash equivalents, available-for-sale securities, held-to-maturity securities, current marketable securities and noncurrent marketable securities. Several portfolios are explicitly available for current operations, but this is not equivalent to the issuer's cash-equivalent definition. The future policy should define a consistent maturity ceiling, eligible instrument types, credit-quality standard, market-liquidity test, encumbrance test and operational-availability test. No issuer-specific exception should be used to improve a particular ranking.

All nine reviews are exact-accession-bound and carry `status=review_only`, `production_approved=false`, `resolver_input=false` and `cash_candidate_promoted=false`. They are surfaced separately from conventional-debt note reviews.
## Additional issuer-specific debt and cash follow-up (21 Nov 2026)

### SGHC: on-demand loan ambiguity and cash availability

The FY2025 20-F reports $17m of interest-bearing borrowings as noncurrent. Note 24 identifies Waterview Facilities A and B, maturing March 7, 2030, with combined carrying amount $17.3m. The same table lists separate NGN-denominated other loans payable on demand at 0% interest, but the facility amount is shown as unspecified and the filing does not quantify a year-end drawn balance for that row. SGHC says it complied with the Waterview financial covenants throughout FY2025 and reported no indication of difficulty at the next test. This supports the named Waterview facility assessment, but it does not resolve the separate on-demand loan. Keep current debt unresolved; do not infer zero. [FY2025 20-F, Note 24](https://s205.q4cdn.com/195659402/files/doc_financials/2025/ar/Super-Group-SGHC-Limited-20-F-Annual-and-Transition-Report-foreign-issuer.pdf)

Cash-scope observations from the same filing:
- Cash and cash equivalents total $513m, comprising $45m cash-in-transit and $468m bank balances.
- $129m of processor bank balances are held in wallets the Group says it can access on demand.
- The bank-balance disclosure includes $19m in regulatory-designated accounts, typically subject to minimum balances, and $12m earmarked for corporate social-responsibility programs.
- A separate $6m cash-segregated-for-users disclosure is reported under licensing requirements. Do not add it to corporate cash; verify balance-sheet presentation before considering any offset.
- Regulatory cash is described as available for corporate use, but minimum balances typically must be maintained. Do not mechanically deduct or ignore the regulatory and CSR components; apply a consistent availability policy.

These debt and cash observations are attached only to SGHC's exact FY2025 accession and remain review-only. They do not resolve current debt or adjust the cash candidate.

### ZVRA: 2026 payoff is subsequent to FY2025

The FY2025 10-K supports $61.928m long-term debt carrying value from $63.608m principal less $1.680m of discount, issuance costs and PIK interest. Contractual maturity was April 5, 2029, with no scheduled principal payments in 2026-2028 and $63.608m due in 2029. The credit agreement permits acceleration on customary events of default, including non-payment, covenant defaults, insolvency, material judgments and inaccurate representations. This is a contractual remedy, not evidence that a default existed at FY2025 year-end. [FY2025 10-K](https://www.sec.gov/Archives/edgar/data/1434647/000143464726000011/zvra-20251231.htm)

The subsequent Q1 2026 10-Q reports that all obligations were repaid in full on March 12, 2026: approximately $63.1m principal including PIK interest, plus $1.4m accrued cash interest, together with final premiums and fees. The credit agreement was terminated and liens released. This is later-period context only. It must not overwrite the FY2025 debt snapshot or be mixed into annual EBIT without an explicit point-in-time policy. [Q1 2026 Form 10-Q, Note E](https://www.sec.gov/Archives/edgar/data/1434647/000143464726000031/zvra-20260331.htm)

The generic resolver still does not infer a zero current-debt bucket from the maturity schedule. The evidence remains review-only and no EV or ranking inputs were promoted.

No production fundamentals, ratios, eligibility decisions or rankings are changed by these issuer-note additions.


## Cash-scope gap diagnostics (21 Nov 2026)

The queue now reports the evidence state of three separate balance-sheet categories for each issuer: unrestricted cash and cash equivalents, restricted cash, and short-term investments. This is a visibility improvement only; it does not change the cash candidate used by the shadow EV preview.

| Category | Queue treatment | Guardrail |
|---|---|---|
| Unrestricted cash and cash equivalents | Unique candidate, ambiguous candidates, or unknown | A missing candidate is unknown, not zero. An explicit zero applies only to that exact reported line. |
| Restricted cash | Tracked separately | Never deduct it from EV as if it were unrestricted cash; do not infer it is available because it is current. |
| Short-term / marketable investments | Tracked separately | Do not merge into cash equivalents until a uniform instrument, maturity, credit, liquidity, encumbrance and availability policy is approved. |

Each category includes candidate status, candidate count, reported candidate values where available, and a review-only disposition. The JSON and CSV queue exports carry the same diagnostics, and the summary counts each category's disposition across the universe.

This is particularly important for issuers such as UPWK, where the $378.425m marketable-securities portfolio is distinct from $294.356m cash and cash equivalents, and SGHC, where reported cash-equivalent balances include processor and earmarked balances requiring availability review. The tool must not treat a marketable-securities balance as cash simply because it is liquid or available for current operations.

The diagnostics are not resolver inputs, do not promote cash candidates, do not approve EV policy, and do not change production fundamentals, ratios or rankings.


## Structured cash-policy evidence matrix (21 Nov 2026)

The nine issuer-specific cash and investment reviews now carry a common structured schema alongside their source observations:

- **Instrument types:** money-market funds, Treasury bills, government agency securities, commercial paper, corporate bonds, term deposits and other identified instruments.
- **Issuer definition:** the issuer's own cash-equivalent maturity convention and presentation.
- **Maturity profile:** current/noncurrent or stated contractual maturity bands, without treating balance-sheet current classification as proof of cash equivalence.
- **Liquidity evidence:** marketability, settlement access and issuer statements about availability for current operations.
- **Restrictions / encumbrances:** regulatory minimums, earmarking, pledges, customer escrow and other limitations.
- **Provisional MFI treatment:** keep separately presented marketable investments outside unrestricted cash until a common policy is approved.
- **Unresolved questions:** the remaining evidence needed before any future policy decision.

Coverage includes SGHC, FHTX, NRIX, PXED, STRA, ALEC, PLTK, ZVRA and UPWK. The queue summary counts complete structured reviews and outstanding questions. Evidence is attached only when the extracted accession exactly matches the resolver preview accession.

This is a research and triage layer, not a policy engine. It does not change EV cash deductions, candidate earnings yield, MFI ranking eligibility, resolver inputs or production data. No investment is promoted to cash-like status by this change.


### Controlled comparison tags

The structured review now also exposes controlled, multi-value tags for maturity bands, credit-quality evidence and liquidity/availability constraints. Tags preserve uncertainty rather than filling gaps: for example, UPWK's instrument-level maturity and credit-quality details remain explicitly undisclosed in this review, while ALEC's combined cash-and-investment maturity schedule is tagged as combined rather than misattributed to marketable securities alone.

The queue summary reports tag distributions across accession-matched issuer reviews. These distributions are descriptive coverage metrics only; they do not imply that current securities are cash-equivalent, that investment-grade assets are unrestricted, or that any issuer's candidate cash deduction is approved.


## Instrument-level debt evidence snapshot (21 Nov 2026)

The successful EdgarTools bakeoff artifact from run **44859999814** (commit `876753029e7e4031ef3e2951f8e8e914e14961bd`) now exports the candidate-instrument review to both JSON and CSV. The queue covers 30 universe members; the debt candidate evidence is accession- and fiscal-period-matched. It is a separate review layer and is not fed into the resolver.

### Universe coverage

| Maturity bucket | Unique nonzero candidate | All selected instrument lines explicit zero | One nonzero plus separate explicit-zero line | Unknown / no selected line | Not available |
|---|---:|---:|---:|---:|---:|
| Current | 14 | 3 | 1 | 10 | 2 |
| Noncurrent | 16 | 3 | 1 | 8 | 2 |

These are candidate-evidence dispositions, not approved debt classifications. The underlying resolver still reports 12 current buckets as unknown and 9 noncurrent buckets as unknown, with 2 current and 1 noncurrent ambiguous buckets. The review layer does not override those dispositions.

### Six issuers with explicit-zero or mixed instrument evidence

| Issuer | Exact selected face-row evidence | Resolver implication |
|---|---|---|
| HRB | Current portion of long-term debt: $0; noncurrent long-term debt: $1,491.493m | Resolver already identifies both maturity components. The zero applies only to the selected current-debt row. |
| BCRX | Secured term loan, noncurrent: $0 | Current debt remains unknown. The separately disclosed royalty-financing obligation remains a distinct financing category and is not erased by the zero term-loan row. |
| MNTN | Short-term note payable: $0; convertible debt: $0, both current | Current bucket remains a manual-review case because two separate instrument concepts are selected. Noncurrent debt remains unknown. |
| SBC | Bank and other borrowings: $9.099046m current and $33.734438m noncurrent; related-party notes payable: $0 in both buckets | The positive borrowings and separate zero notes are preserved individually. The resolver still requires review of instrument scope and reconciliation before aggregation. |
| SNDK | Current long-term debt: $0; noncurrent long-term debt: $0 | Resolver identifies both buckets. The annual filing note separately supports repayment of the term loan and an undrawn revolver at year-end. |
| UPWK | Current debt: $359.770m; noncurrent debt: $0 | Resolver identifies both buckets. The zero is limited to the selected noncurrent debt line and does not offset the current convertible-note carrying value. |

### Interpretation and guardrails

- An explicit zero is evidence about one reported instrument, concept, fiscal period and accession. It is not a company-wide assertion that no debt exists.
- A missing maturity bucket remains unknown, even when the filing note describes an undrawn facility or no scheduled principal maturity.
- Multiple instruments are retained separately. A nonzero borrowing plus a zero related-party note is not automatically aggregated by this evidence layer.
- Lease liabilities, royalty financing, sale-leaseback financing and other separate financing obligations remain outside the conventional-debt total pending a consistent policy.
- Every record remains `automatic_aggregation=false`, `production_approved=false`, `resolver_input=false` and `debt_candidate_promoted=false`.

The CSV export was verified in the same successful workflow artifact and contains the `debt_candidate_evidence_review` and source columns. No production fundamentals, EV, earnings yield, return on capital, eligibility or ranking changed.


## Invested-capital denominator sensitivity diagnostics (21 Nov 2026)

The deterministic review now adds two stricter negative-working-capital offset thresholds (95% and 99%), the calculated invested-capital denominator as a percentage of net PP&E, and the net-PP&E-only reference denominator. These are sensitivity indicators, not a replacement formula or an alternative policy.

For example, the existing regression fixture with working capital of **-$505.452m** and net PP&E of **$522.197m** produces invested capital of **$16.745m**, only **3.2064% of net PP&E**. Negative working capital offsets **96.7936%** of net PP&E. The 95% flag is therefore true, while the 99% flag is false.

The net-PP&E-only amount is explicitly labelled a reference denominator. It is not used to calculate candidate ROC, eligibility or ranking. No working-capital floor, denominator adjustment or automatic exclusion is introduced. The existing formula remains current assets minus current liabilities plus net PP&E, and all outputs remain review-only.

Regression coverage verifies the 95%/99% thresholds, denominator-to-PP&E ratio and sensitivity-only guardrail. Production fundamentals, ratios and rankings remain unchanged.

## Top-five invested-capital composition review (21 Nov 2026)

The successful read-only EdgarTools bakeoff artifact from run **44861336228** (commit `0941ee27d8179c83cb0e393f0b09b4f334a7dd58`) was used to compare the current invested-capital denominator with net PP&E for the five shadow-ranked issuers. Values below use the exact annual-filing snapshot attached to that run. Percentages are descriptive; the net-PP&E-only ROC is a sensitivity calculation and is not an alternative Magic Formula policy.

| Issuer | Candidate ROC | Working capital / net PP&E | Invested capital / net PP&E | Net-PP&E-only ROC sensitivity | Interpretation |
|---|---:|---:|---:|---:|---|
| OTEX | 6,465.20% | -96.79% | 3.21% | 207.32% | Near-cancellation: negative working capital offsets almost all net PP&E. Highest denominator-risk case in the current top five. |
| SNDK | 157.36% | 1,068.10% | 1,168.10% | 1,838.13% | Positive working capital is the dominant component; not a negative-working-capital near-zero denominator case. |
| IRWD | 278.51% | 937.79% | 1,037.79% | 2,890.32% | Positive working capital is much larger than net PP&E; investigate working-capital composition and operating context. |
| QTTB | 37.83% | 4,464.15% | 4,564.15% | 1,726.46% | Extremely small net PP&E relative to positive working capital; PP&E-only sensitivity is especially unrepresentative. |
| UPWK | 37.47% | 676.85% | 776.85% | 291.09% | Positive working capital dominates net PP&E; denominator is not near-zero from negative working capital. |

### Review disposition

- **OTEX:** retain the high-severity denominator flag. Its $16.745m invested-capital candidate is only 3.21% of $522.197m net PP&E because $505.452m negative working capital offsets 96.79% of PP&E. The 6,465% ROC should not be interpreted without this warning.
- **SNDK, IRWD, QTTB and UPWK:** their positive working-capital balances exceed net PP&E by approximately 6.8x to 44.6x. This is a working-capital-dominated capital structure, not the same failure mode as OTEX. Do not replace the denominator with net PP&E; doing so would materially increase the sensitivity ROC for each of these issuers.
- The six universe members triggering the existing 90% negative-working-capital offset diagnostic are GTM, HPQ, OTEX, PBI, RGS and SSTK. The 95%/99% thresholds further distinguish severity but do not create exclusions.
- Working-capital composition, seasonality, deferred revenue/customer funding, operating liabilities and business-model context should be reviewed before interpreting extreme ROC. A high ratio alone is not proof of an extraction defect or an economically invalid business.
- No denominator floor, net-PP&E substitution, issuer exclusion, production approval or ranking adjustment is introduced. The candidate formula remains current assets minus current liabilities plus net PP&E.

The queue reports six high negative-working-capital-offset cases. All top-five composition figures and sensitivities are review-only; production fundamentals, ratios, eligibility and rankings remain unchanged.

## Shadow-cohort readiness and next debt-review priorities (21 Nov 2026)

The read-only ranking preview from bakeoff run **44861336228** (commit `0941ee27d8179c83cb0e393f0b09b4f334a7dd58`) covered 30 issuers: 5 passed the current positive-EBIT, positive-invested-capital and EV-input gates; 25 were excluded. These are overlapping exclusion-reason counts, not mutually exclusive issuer groups:

| Exclusion reason | Issuer count |
|---|---:|
| Enterprise-value candidate unavailable or non-positive | 13 |
| Conventional debt inputs incomplete or ambiguous | 12 |
| EBIT candidate missing or non-positive | 10 |
| Invested-capital denominator unresolved or non-positive | 7 |
| Direct operating-income candidate unavailable or ambiguous | 3 |
| EdgarTools provider unsupported | 2 |

Seven excluded issuers have positive EBIT and positive invested-capital candidates, but their conventional-debt / EV inputs remain incomplete: **BCRX, MNTN, PRDO, PXED, SBC, STRA and VXRT**. These are the most direct debt-policy review opportunities for expanding the shadow cohort. They are not approved ranking candidates until both maturity buckets and EV cash scope are resolved.

### Suggested review order

1. **SBC:** strongest near-term reconciliation candidate. The FY2025 face statement's $9.099046m current and $33.734438m noncurrent bank borrowings reconcile exactly to Note 15's $42.833484m principal schedule. The separate related-party notes are zero in both buckets. Review whether the current resolver can accept the two maturity-specific bank-borrowing rows without summing overlapping instruments.
2. **MNTN:** named current short-term note payable and convertible debt are both explicitly zero after settlement; revolver was undrawn at year-end. Noncurrent debt completeness still needs to be established. Preserve the exact instrument-level evidence and do not infer company-wide zero.
3. **PXED and STRA:** each has filing evidence of an undrawn revolving facility at the selected annual reporting date. This resolves only the named facility's drawn balance, not all possible debt categories or missing maturity buckets.
4. **BCRX and VXRT:** conventional borrowing evidence must remain separate from substantial royalty-financing obligations. Decide whether those obligations belong in a debt-like EV category under a uniform policy; do not silently include or exclude them.
5. **PRDO:** the $56.992m sale-leaseback financing arose from a failed sale-leaseback accounting treatment and recategorized construction financing. It requires a separate financing-obligation policy decision rather than a generic conventional-debt mapping.

### Interpretation

The five currently ranked issuers are not a production-ready cohort: every issuer still has accounting review flags and `production_approved=false`. The seven debt-blocked names above are research priorities only. No row is promoted to the resolver, no missing bucket is converted to zero, and no production fundamentals, EV, earnings yield, return on capital, eligibility or ranking is changed by this worklist.
