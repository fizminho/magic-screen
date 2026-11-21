# US MFI issuer review worksheet: HRB and OTEX

**Review date:** 21 November 2026  
**Scope:** selected FY2026 annual filings only  
**Purpose:** filing evidence reconciliation and human-review preparation  
**Status:** review-only; no accounting approval  
**Production writes / ranking changes:** none

All amounts are USD millions unless stated otherwise. Values are converted from the filings' USD thousands. Calculations reproduce current shadow candidate inputs; they do not assert that the chosen Magic Formula accounting policy is correct.

## HRB — H&R Block, Inc.

**Annual filing:** Form 10-K, year ended 30 June 2026  
**Accession:** 0000012659-26-000026  
**SEC filing:** https://www.sec.gov/Archives/edgar/data/12659/000001265926000026/hrb-20260630.htm

### EBIT candidate

The current shadow candidate is **$907.686m**, reconstructed as pretax income less other income plus interest expense:

- Income from continuing operations before income taxes: **$853.888m**
- Other income, net: **$26.813m**
- Interest expense on borrowings: **$80.611m**
- Reconstructed operating income / EBIT: **$907.686m**

Arithmetic cross-check: 853.888 - 26.813 + 80.611 = 907.686. This is not a direct generic-resolver selection. It remains a filing-specific reconstruction requiring accounting approval, including confirmation that no non-operating items are misclassified in the bridge.

### Invested capital candidate

| Component | FY2026 |
|---|---:|
| Current assets | 1,125.557 |
| Current liabilities | (993.425) |
| Net property and equipment | 141.456 |
| **Candidate invested capital** | **273.588** |

Calculation: 1,125.557 - 993.425 + 141.456 = 273.588.

The filing separately reports operating lease ROU assets of **$597.641m**. These are not included in the current formula's net-PP&E line. The policy question is whether invested capital should continue to use tangible PP&E only, or whether lease ROU assets and matching lease liabilities should be treated consistently. Do not add ROU assets alone.

### Cash and debt scope

| Item | FY2026 | Review disposition |
|---|---:|---|
| Cash and cash equivalents | 958.706 | Filing identifies as excluding restricted amounts; candidate unrestricted cash, still policy review |
| Restricted cash and cash equivalents | 19.195 | Separate; not deducted as unrestricted cash |
| Long-term debt carrying value | 1,491.493 | Conventional debt candidate; confirm all instruments and maturity presentation |
| Current portion of long-term debt | — | Face statement shows no current portion; verify facility note before treating as a universal zero |
| Operating lease liabilities, current | 228.760 | Separate lease scope |
| Operating lease liabilities, noncurrent | 382.100 | Separate lease scope |
| Total operating lease liabilities | 610.860 | Do not silently add to conventional debt |
| Operating lease ROU asset | 597.641 | Asset-side counterpart; do not include alone |

The filing says cash equivalents are high-quality, short-term investments, including money-market funds and U.S. Treasuries. Restricted cash consists primarily of cash held by the captive insurance subsidiary to pay claims. This supports separating the $958.706m unrestricted cash line from the $19.195m restricted line. The lease note reports total operating lease liabilities of $610.860m and annual operating lease costs of $255.672m (plus variable lease costs), so lease inclusion in EV would require consistent EBIT/lease-expense treatment.

### HRB reviewer decisions still open

1. Approve or reject the accession-specific $907.686m EBIT reconstruction and its bridge.
2. Confirm whether the current debt dash and credit-facility note establish a zero drawn current balance at the reporting date; do not infer from a missing generic tag alone.
3. Decide whether lease liabilities belong in EV and, if so, how to align the EBIT numerator and invested-capital treatment with the ROU asset.
4. Confirm the chosen invested-capital asset scope and unrestricted-cash definition across the whole cohort.

## OTEX — Open Text Corporation

**Annual filing:** Form 10-K, year ended 30 June 2026  
**Accession:** 0001002638-26-000068  
**SEC filing:** https://www.sec.gov/Archives/edgar/data/1002638/000100263826000068/otex-20260630.htm

### EBIT candidate

The filing directly reports **income from operations of $1,082.597m** for FY2026. This is a direct reported operating-income candidate, not a pretax reconstruction. The income statement separately presents other income (expense), net of $85.875m and interest and other related expense, net of $309.595m. Keep the reported operating subtotal as the candidate pending policy approval; do not substitute an adjusted/non-GAAP measure.

### Invested capital candidate and denominator risk

| Component | FY2026 |
|---|---:|
| Current assets | 2,117.873 |
| Current liabilities | (2,623.325) |
| Net property and equipment | 522.197 |
| **Candidate invested capital** | **16.745** |

Calculation: 2,117.873 - 2,623.325 + 522.197 = 16.745.

Negative working capital is **-$505.452m**. It offsets **96.79%** of the $522.197m net-PP&E balance, leaving a denominator of only $16.745m. The resulting **6,465.20% candidate ROC is mathematically reproducible but not economically robust without a denominator policy decision**. This is the primary blocker for OTEX's current rank. Do not cap ROC, switch to net-PP&E-only, or otherwise alter the formula ad hoc. Any alternative must be cohort-wide, documented and tested as a sensitivity before adoption.

Operating lease ROU assets of **$134.377m** are separately presented from PP&E. They are not included in the current net-PP&E candidate. If policy includes ROU assets in invested capital, it must specify corresponding lease-liability treatment and apply it consistently.

### Debt, cash, leases and NCI

| Item | FY2026 | Review disposition |
|---|---:|---|
| Total principal payments due | 5,836.525 | Principal schedule, before unamortized discounts/costs |
| Unamortized debt discount and issuance costs | (66.156) | Deduction to carrying value |
| **Total debt carrying value** | **5,770.369** | Reconciled candidate |
| Current portion of long-term debt | 35.850 | Current maturity candidate |
| Noncurrent portion of long-term debt | 5,734.519 | Noncurrent maturity candidate |
| Cash and cash equivalents | 956.024 | Filing defines cash equivalents as bank balances and deposits with original maturities of 90 days or less |
| Restricted cash | 1.230 | Separate; not deducted as unrestricted cash |
| Operating lease liabilities, current | 63.612 | Separate lease scope |
| Operating lease liabilities, noncurrent | 138.425 | Separate lease scope |
| Total operating lease liabilities | 202.037 | Not part of conventional-debt candidate |
| Finance lease liabilities | 0.457 | Separate lease scope |
| Noncontrolling interests | 1.962 | Quantified; EV treatment still requires policy decision |

Debt reconciliation is exact: 35.850 + 5,734.519 = 5,770.369. The debt note also reconciles principal payments due less unamortized debt discount and issuance costs: 5,836.525 - 66.156 = 5,770.369. Do not add total debt to its current/noncurrent components.

The filing reports restricted cash separately at $1.230m. Operating lease liabilities total $202.037m and finance lease liabilities total $0.457m. Noncontrolling interests are $1.962m. These are separate classifications, not automatic additions to conventional debt. Because the income statement is consolidated, EV treatment of NCI should be decided consistently rather than silently ignored or included.

### OTEX reviewer decisions still open

1. Approve or reject the current-assets-minus-current-liabilities-plus-net-PP&E denominator for companies with extreme negative working capital. OTEX is a high-severity test case.
2. Confirm the direct operating-income subtotal as the selected EBIT concept.
3. Confirm debt carrying value, current and noncurrent maturity buckets, and cash values are accession-matched; arithmetic reconciliation now passes.
4. Decide cohort-wide treatment of operating leases, finance leases and NCI.
5. Keep the 6,465.20% ROC and current shadow rank flagged as denominator-sensitive until the denominator policy is approved.

## Review outcome

| Gate | HRB | OTEX |
|---|---|---|
| Annual filing / accession matched | Yes | Yes |
| EBIT evidence | Reconstructed; manual approval | Direct reported operating income; policy approval |
| Invested capital arithmetic | Reconciles to 273.588 | Reconciles to 16.745; extreme denominator risk |
| Debt / cash evidence | Major lines identified; facility/maturity confirmation remains | Debt maturity and carrying value reconcile; cash separately identified |
| Lease / NCI policy | Lease treatment open | Lease and NCI treatment open |
| Production approved | **No** | **No** |

This review narrows evidence gaps but does not close accounting-policy decisions. Both rows remain shadow-only. The production Company Facts path, production fundamentals, EY/ROC, eligibility and rankings are unchanged.
