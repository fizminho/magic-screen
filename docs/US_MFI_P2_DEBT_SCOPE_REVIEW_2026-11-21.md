# US MFI P2 debt and EV review plan

**Review date:** 21 November 2026  
**Scope:** remaining P2 issuers after VSNT was separately promoted to P1 for company-perimeter comparability  
**Status:** evidence triage only; no accounting approval  
**Production writes / ranking changes:** none

P2 means the issuer currently has direct EBIT and a positive invested-capital candidate in the resolver, but debt, cash, leases, financing obligations or another EV input remains unresolved. The entries below are not approvals and must not be interpreted as proof of debt-free status.

## Priority 1 within this batch: debt-like financing classification

| Issuer | FY filing / accession | Evidence already identified | Required decision |
|---|---|---|---|
| BCRX | FY2025 / 0001628280-26-012240 | Secured term loan face line is explicitly $0. Royalty financing obligations are $38.455m current and $427.233m noncurrent, total **$465.688m**. Finance leases are $1.312m current and $1.441m noncurrent; operating leases are $0.317m current and $8.571m noncurrent. | Determine whether the royalty-rights financing obligation is debt-like for EV under a consistent policy. Do not reclassify it as conventional debt by keyword alone or ignore it because the secured term loan is zero. |
| PRDO | FY2025 / 0001193125-26-059331 | Sale-leaseback financing is **$56.992m**. Finance lease liabilities: $5.458m current and $6.097m noncurrent. Operating lease liabilities: $6.032m current and $43.752m noncurrent. | Review the failed sale-leaseback accounting and decide if the $56.992m obligation belongs in debt-like EV. Keep finance and operating leases separately classified pending lease policy. |
| VXRT | FY2025 / 0001437749-26-008023 | Liability from sale of future royalties: $1.381m current and $2.679m noncurrent, total **$4.060m**. Operating lease liabilities: $2.978m current and $6.007m noncurrent. | Review the royalty-sale contract and accreting imputed-interest mechanics. Decide debt-like EV treatment separately from conventional debt and ordinary leases. Unrestricted cash remains unknown, not zero. |

These three cases should be reviewed together because the same policy question recurs: when an issuer monetizes future operating cash flows or property through a financing transaction, what evidence makes the resulting liability debt-like for EV? The policy should address repayment mechanics, imputed interest, recourse, security, and whether the financing is already reflected in operating cash flows.

## Priority 2: reconcile explicit debt instruments and maturity buckets

| Issuer | FY filing / accession | Evidence already identified | Required decision |
|---|---|---|---|
| SBC | FY2025 / 0001193125-26-127557 | Bank and other borrowings: **$9.099046m current** and **$33.734438m noncurrent**, total **$42.833484m**. Related-party notes payable are explicitly $0 in both maturity buckets. Note 15's principal schedule totals exactly $42.833484m. | Confirm that the bank-borrowing buckets are additive and do not overlap the aggregate or related-party-note concepts. Preserve exact zero rows. Resolve secondary currency-unit observations before approval. Do not let the resolver sum ambiguous candidates automatically. |
| ZVRA | FY2025 / 0001434647-26-000011 | Term-loan principal $63.608m less $1.680m unamortized discount, issuance costs and PIK interest equals **$61.928m** long-term carrying value. No scheduled principal in 2026–2028; $63.608m scheduled in 2029. Current debt is not established by that schedule alone. | Confirm the maturity note, carrying-value bridge and any acceleration/on-demand clauses. Keep current debt unknown unless filing evidence and policy explicitly support a zero current maturity. Subsequent March 2026 repayment must not rewrite FY2025 annual inputs. |

## Priority 3: named zero/undrawn facilities and incomplete face-statement debt evidence

| Issuer | FY filing / accession | Evidence already identified | Required decision |
|---|---|---|---|
| MNTN | FY2025 / 0001891027-26-000019 | Convertible notes were settled at the 23 May 2025 IPO; the named revolver had no year-end borrowings; the 2024 short-term holdback was settled in Q1 2025. The remaining partial-recourse promissory note is owed by an employee to MNTN, not borrowing by MNTN. | Accept these as evidence for the named instruments only. Complete the noncurrent debt-note review; do not infer that every possible debt category is zero. |
| PXED | FY2026 / 0001193125-26-445323 | $100m senior secured revolver; explicitly no outstanding borrowings at 31 August 2026. A $28.4m letter of credit supports a sublease and reduces availability but is not drawn debt. Operating lease liabilities are $10.136m current and $52.872m noncurrent. Marketable securities total $167.852m ($137.094m current, $30.758m noncurrent); cash is $159.363m and restricted cash $4.516m. | Confirm the complete debt-note scope beyond the named revolver. Keep the letter of credit separate from drawn debt. Apply the marketable-securities maturity and Department of Education liquidity-constraint policy before treating any portion as cash-like. |
| STRA | FY2025 / 0001013934-26-000006 | $250m senior secured revolver; explicitly no borrowings at 31 December 2025. Operating lease liabilities are $15.905m current and $93.216m noncurrent. Marketable securities are $12.297m held-to-maturity: $7.297m within one year and $5.000m from one to five years. | Treat the zero as facility-specific. Complete note coverage for other borrowing instruments. Keep held-to-maturity investments outside unrestricted cash by default; review lease policy separately. |
| FHTX | FY2025 / 0001628280-26-016814 | No separate conventional-debt face row identified; operating lease liabilities are $0.923m current and $40.347m noncurrent. Marketable debt securities total **$78.018m**: $1.500m U.S. government agency securities, $35.287m commercial paper and $41.231m corporate notes and bonds. Restricted cash totals **$3.250m** ($1.250m current and $2.000m noncurrent; the latter secures a letter of credit for the New Lease). | Complete debt-note coverage before concluding no borrowing. Keep marketable securities separate from cash equivalents; assess security maturities and pledged restricted cash. |
| NRIX | FY2025 / 0001549595-26-000016 | No separate conventional-debt face row identified; operating lease liabilities are $2.824m current and $52.906m noncurrent. Marketable securities are **$345.981m U.S. Treasury securities**; cash-equivalent money-market funds are separately reported at $241.364m. | Complete debt-note coverage before concluding no borrowing. Keep Treasury securities separate from cash equivalents until a uniform maturity/liquidity rule is approved. Confirm no pledge or encumbrance. |

## Separate P1 exception: VSNT

VSNT is no longer treated as an ordinary P2 debt-gap case. Its FY2025 10-K is a pre-separation combined report for operations previously run within Comcast, while the public ticker began regular-way trading on 5 January 2026. The filing explicitly cautions that the combined financials may not represent the standalone company. The queue now raises VSNT to P1 for this company-perimeter mismatch. See [P1 issuer review register](US_MFI_P1_ISSUER_REVIEW_REGISTER.md).

## Batch exit criteria

A P2 issuer can leave the debt/EV review queue only when all of the following are supported by the exact selected annual filing:

1. Conventional debt is reconciled by instrument and current/noncurrent maturity bucket; explicit zero is distinguished from missing.
2. Royalty, sale-leaseback and other financing obligations have an explicit separate disposition under the approved EV policy.
3. Lease liabilities and ROU assets are consistently classified.
4. Unrestricted cash, restricted cash, customer funds and marketable securities are separate; missing amounts remain unknown.
5. Any marketable-security cash-like treatment follows one cohort-wide maturity, credit-quality, liquidity and availability rule.
6. The reviewer confirms the accession and reporting period match the resolver input.
7. The queue remains review-only until human accounting approval; no automated candidate is promoted to production.

No item in this document changes the resolver, production fundamentals, enterprise value, EY, ROC, ranking eligibility or shadow rank.

## SBC / ZVRA evidence status after latest full-universe run (22 November 2026)

Run **44926317787** re-extracted both FY2025 annual filings and confirmed the accession/period pairs in the issuer worksheet. SBC's bank borrowing rows remain $9.099046m current and $33.734438m noncurrent, totaling $42.833484m and matching its Note 15 principal schedule. The two related-party note-payable rows are explicit zeros, not additional borrowing. The resolver intentionally retains a manual ambiguity flag because it sees multiple distinct instrument lines; no automatic sum or production promotion is allowed. ZVRA's long-term debt carrying value remains $61.928m against $63.608m principal; no current borrowing line is selected, and the 2026-2028 maturity schedule is not silently converted into a zero current-debt fact. See the updated SBC / ZVRA evidence worksheet (US_MFI_P2_SBC_ZVRA_REVIEW_2026-11-21.md).

The refreshed cohort queue remains review-only: 17 conventional-debt candidates, 15 net-debt candidates and 11 ambiguous debt inputs. These aggregate counts are evidence coverage, not issuer approvals. The next targeted debt-note review remains MNTN, PXED, STRA, FHTX and NRIX, with facility-specific zeros kept distinct from proof of no other debt.
