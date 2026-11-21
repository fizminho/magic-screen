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

The FY2025 balance sheet reports bank and other borrowings of **$9.099046m current** and **$33.734438m noncurrent**. The separately presented related-party notes payable are explicitly nil in both maturity buckets. Note 15's future principal repayment schedule reports $9.099046m in 2026, $13.954055m in 2027, $7.437818m in 2028, $6.906623m in 2029 and $5.435942m in 2030, totaling **$42.833484m**. The schedule total exactly equals current plus noncurrent bank and other borrowings. Note 15 also describes revolving credit facilities and bank/financial-institution borrowings. This is strong filing-specific evidence that the two bank-borrowing maturity buckets are distinct and reconcile, while the two zero related-party-note rows are separate instruments. It supports manual review of the conventional-debt candidate, but the automated resolver still withholds aggregation pending policy approval. See [SBC FY2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1930313/000119312526127557/sbc-20251231.htm), balance sheet and Notes 15–16.

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
