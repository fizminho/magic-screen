# US MFI issuer review worksheet: PBI and SGHC

**Review date:** 21 November 2026  
**Scope:** selected FY2025 annual filings only  
**Purpose:** filing evidence reconciliation and human-review preparation  
**Status:** review-only; no accounting approval  
**Production writes / ranking changes:** none

All amounts are USD millions unless stated otherwise. Values are converted from USD thousands where applicable. SGHC's 20-F explicitly presents FY2025 in USD millions. This worksheet records evidence and policy blockers; it does not approve an EBIT or invested-capital definition.

## PBI — Pitney Bowes Inc.

**Annual filing:** Form 10-K, year ended 31 December 2025  
**Accession:** 0001628280-26-009650  
**SEC filing:** https://www.sec.gov/Archives/edgar/data/78814/000162828026009650/pbi-20251231.htm

### Invested capital candidate and business-model issue

| Component | FY2025 |
|---|---:|
| Current assets | 1,100.499 |
| Current liabilities | (1,547.839) |
| Property, plant and equipment, net | 185.913 |
| **Current resolver candidate** | **(261.427)** |

Calculation: 1,100.499 - 1,547.839 + 185.913 = -261.427.

The filing separately reports **$24.054m rental property and equipment, net** and **$106.996m operating lease assets**. Including rental property and equipment in the PP&E scope would change the denominator candidate to **-$237.373m**, still negative. Including operating lease assets as well would change it again, but adding ROU assets without matching lease-liability treatment is not appropriate. These amounts should remain separate until the cohort-wide denominator policy defines which productive assets qualify.

PBI's current assets also include **$496.446m short-term finance receivables** and **$605.129m long-term finance receivables**. Current liabilities include **$582.630m customer deposits at Pitney Bowes Bank**, with another **$71.000m noncurrent customer-deposit liability**. The issuer therefore has a material financing/banking component. Its current assets and liabilities are not directly comparable to a conventional industrial operating-company working-capital structure without a specific policy decision.

### EBIT candidate

The generic resolver does not identify a clean direct operating-income subtotal. The current filing-specific candidate of **$341.680m** remains unresolved in the generic resolver and must remain manual-review-only.

The filing reports pretax income of **$192.524m**, net interest expense of **$101.460m**, and explicitly states that a portion of total interest expense is allocated into “Cost of financing and other”. That embedded finance interest must be identified and added back only once if the chosen EBIT definition excludes financing costs. Do not use the segment's adjusted EBIT as a substitute: it is non-GAAP, segment-specific and does not represent consolidated operating income. The current $341.680m bridge must be independently reproduced from the exact financing-interest disclosure before it can be considered for approval.

### Debt, cash, leases and deposits

| Item | FY2025 | Review disposition |
|---|---:|---|
| Total debt principal | 2,026.212 | Debt-note instrument schedule |
| Unamortized debt costs | (33.174) | Deduction to carrying value |
| Total debt carrying value | 1,993.038 | Candidate |
| Current debt | 17.150 | Current maturity |
| Noncurrent debt | 1,975.888 | Noncurrent maturity |
| Cash and cash equivalents | 284.887 | Separate from short-term investments |
| Short-term investments | 12.232 | Do not automatically treat as cash equivalent |
| Current customer deposits at bank | 582.630 | Deposit liability; classify consistently with financing model |
| Noncurrent customer deposits at bank | 71.000 | Deposit liability; classification requires policy |
| Operating lease liabilities | 128.153 | 28.396 current + 99.757 noncurrent |
| Finance lease liabilities | 36.941 | 10.585 current + 26.356 noncurrent |
| Rental property and equipment, net | 24.054 | Distinct productive-asset category |
| Operating lease assets | 106.996 | ROU asset; do not include alone |

Debt reconciliation: 17.150 + 1,975.888 = 1,993.038. The debt note reports principal of 2,026.212 less unamortized costs of 33.174, yielding the same carrying value. The debt note lists multiple instruments, including notes, term loans and convertible notes; keep the maturity buckets tied to that schedule.

The financing model matters for both sides of the MFI formula: finance receivables generate financing revenue, while customer deposits are a funding source and liability. The current standard formula may be inappropriate unless the company is treated consistently with financial businesses or excluded under an explicit cohort rule. Do not silently classify customer deposits as ordinary operating liabilities or conventional borrowing.

### PBI reviewer decisions still open

1. Reproduce and approve/reject the $341.680m EBIT bridge from the filing's embedded financing-interest disclosure; keep it unresolved until the exact amount and no-double-count logic are independently tied out.
2. Decide whether PBI's financing/bank deposit and finance-receivable model is eligible for the standard Magic Formula denominator and EV definition.
3. Decide whether rental property and equipment belongs in net PP&E for invested capital; do not merge it into PP&E without a documented mapping.
4. Keep the negative denominator unranked. No denominator override or arbitrary ROC cap.
5. Confirm the conventional-debt carrying-value bridge and keep leases and customer deposits as separate classifications pending policy.

## SGHC — Super Group (SGHC) Limited

**Annual filing:** Form 20-F, year ended 31 December 2025  
**Accession:** 0001628280-26-025609  
**SEC filing:** https://www.sec.gov/Archives/edgar/data/1878057/000162828026025609/sghc-20251231.htm

### Presentation currency and EBIT candidate

The FY2025 20-F explicitly states that the Group changed its presentation currency from EUR to **USD effective 1 January 2025**. The consolidated statement of profit or loss is presented in USD millions.

The current review-only EBIT candidate is **$357m**, reconstructed from operating statement lines:

- Revenue: $2,231m
- Direct and marketing expenses: ($1,565m)
- General and administrative expenses: ($176m)
- Depreciation and amortization: ($74m)
- Impairment of assets: ($68m)
- Other operating income: $9m
- **Operating subtotal candidate: $357m**

Calculation: 2,231 - 1,565 - 176 - 74 - 68 + 9 = 357.

The statement then separately presents finance income of $11m, finance expense of ($11m), change in fair value of options of zero and share of post-tax profit of equity-accounted investments of ($1m) before pretax income of $356m. The $357m operating subtotal is therefore distinguishable from finance and equity-accounted items. The filing does not label this line “operating profit”; retain it as a filing-specific reconstruction requiring accounting approval, not a generic direct reported EBIT.

### Invested capital candidate

| Component | FY2025 |
|---|---:|
| Current assets | 742 |
| Current liabilities | (382) |
| Property, plant and equipment | 58 |
| **Candidate invested capital** | **418** |

Calculation: 742 - 382 + 58 = 418.

The filing separately reports **$58m right-of-use assets**, **$3m investment property**, **$17m regulatory deposits**, **$120m advance for sportsbook software**, and other noncurrent assets. These are not included in the current PP&E-only candidate. ROU assets should not be added without corresponding lease-liability policy. Regulatory deposits and sportsbook software advances are distinct assets and require a consistent working-capital / invested-capital mapping.

### Debt, cash, restrictions and leases

| Item | FY2025 | Review disposition |
|---|---:|---|
| Noncurrent interest-bearing loans and borrowings | 17 | Candidate; Note 24 carrying amount $17.3m |
| Current interest-bearing loans and borrowings | Not resolved | On-demand “Other loans” disclosed in NGN with unspecified amount |
| Waterview Properties Facility A | ZAR 250m facility | Matures 7 March 2030 |
| Waterview Properties Facility B | ZAR 40m facility | Matures 7 March 2030 |
| Cash and cash equivalents | 513 | Cash note: $468m bank balances + $45m cash-in-transit |
| Amounts segregated for users | 6 | Restricted/user funds; separate from cash equivalents |
| Fixed term deposits | 16 | Separate from cash equivalents pending maturity/liquidity policy |
| Current lease liabilities | 5 | Separate lease scope |
| Noncurrent lease liabilities | 59 | Separate lease scope |
| Current liabilities total | 382 | Includes payables, customer liabilities, provisions and tax |

Note 24 says Facilities A and B have a combined carrying amount of **$17.3m** and mature on 7 March 2030. It also lists “Other loans” payable on demand, denominated in NGN, with the facility amount unspecified. This prevents a conclusion that current conventional debt is zero. Keep the $17m noncurrent borrowing candidate review-only and the current borrowing bucket unresolved.

The filing says the Group negotiated a **$100m revolving credit facility in early 2026**, after the 31 December 2025 reporting date. Do not include that post-year-end facility as FY2025 debt or assume it was drawn at year-end.

The $513m cash-equivalent line is supported by Note 17: $45m cash-in-transit and $468m bank balances. The $6m “Amounts segregated for users” line is separately disclosed; the filing notes that this line was renamed from restricted cash. Fixed term deposits of $16m are also separate. Do not add these categories together or deduct restricted/user funds as unrestricted cash without policy approval.

### SGHC reviewer decisions still open

1. Approve or reject the $357m operating subtotal reconstruction and ensure finance income/expense and equity-accounted results are excluded consistently.
2. Confirm the $17.3m noncurrent facility carrying value against the balance sheet and Note 24.
3. Resolve the on-demand NGN “Other loans” amount. Current borrowing remains unknown, not zero.
4. Decide whether the $16m fixed term deposits qualify as cash-like using maturity, liquidity and credit evidence; keep the $6m user-segregated amount excluded from unrestricted cash.
5. Confirm whether regulatory deposits, sportsbook software advances and ROU assets belong in invested capital, and align lease treatment across EV and the denominator.

## Review outcome

| Gate | PBI | SGHC |
|---|---|---|
| Annual filing / accession matched | Yes | Yes |
| Currency confirmed | USD | USD |
| EBIT evidence | $341.680m bridge still unresolved | $357m operating subtotal reconstruction; manual approval |
| Invested capital arithmetic | -$261.427m; negative | $418m; scope review |
| Debt evidence | $1,993.038m carrying value; maturity buckets identified | $17.3m noncurrent supported; current on-demand loan amount unresolved |
| Cash scope | Cash $284.887m; short-term investments separate | Cash equivalents $513m; user funds and fixed deposits separate |
| Business-model / lease scope | Finance receivables and customer deposits materially affect formula | ROU, regulatory deposits, software advances and leases require policy |
| Production approved | **No** | **No** |

Both issuers remain shadow-only and production_approved=false. This evidence pass does not change production fundamentals, ratios, eligibility or rankings.
