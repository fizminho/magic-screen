# US MFI lease and cash policy recommendation

**Prepared:** 22 November 2026  
**Status:** proposed for accounting-owner review; not approved  
**Evidence:** accepted full-universe run [44926317787](https://github.com/fizminho/magic-screen/actions/runs/44926317787), artifact `14716380518`

## 1. Recommended lease policy

Use accounting-framework-aware treatment. A single include/exclude switch is not sufficiently consistent because the lease cost presented in operating income differs between US GAAP and IFRS.

| Lease accounting | EBIT basis | EV | Invested capital |
|---|---|---|---|
| US GAAP operating lease | Keep single operating lease cost in EBIT | Exclude operating lease liability | Exclude separate operating ROU asset |
| US GAAP finance lease | Keep ROU amortization in EBIT; interest remains below EBIT | Include finance lease liability once in a separate debt-like bucket | Include finance ROU asset once |
| IFRS 16 recognized lease | Keep ROU depreciation in reported operating profit; lease interest is below operating profit | Include recognized lease liability once in a separate debt-like bucket | Include ROU asset once |

FASB ASC 842 presents operating lease cost as a single expense in income from continuing operations, while finance leases present ROU amortization and interest separately. IFRS 16 uses a capitalized lessee model for recognized leases. The MFI numerator and capital base should follow that presentation rather than forcing IFRS issuers into US GAAP operating/finance categories.

Sources: [FASB ASU 2016-02, Topic 842](https://storage.fasb.org/ASU_2016-02_Section_C.pdf); [Grant Thornton ASC 842 guide](https://www.grantthornton.com/content/dam/grantthornton/website/assets/content-page-files/audit/pdfs/2022/leases-navigating-the-guidance-in-asc-842-february-2022.pdf); [ACRA valuation guidance on IFRS 16](https://www.acra.gov.sg/docs/default-source/default-document-library/accountancy/chartered-valuer-and-appraiser-programme/gn-001-1apr2023.pdf).

**Important invested-capital gate:** current lease liabilities may already be included in current liabilities. Before adding finance/IFRS ROU assets, approve how current financing liabilities are removed from operating working capital. Apply the same current-financing-liability convention to conventional debt, not only leases. Until that denominator convention is approved, do not add ROU assets to the existing `current assets - current liabilities + net PP&E` formula.

### Evidence examples from the active cohort

| Issuer | FY evidence | Interpretation |
|---|---|---|
| MGTX | Operating ROU $12.852m; finance ROU $23.616m; operating liabilities $2.851m + $11.351m; finance liabilities $0.038m + $0.109m | US GAAP operating and finance categories are separately identifiable |
| PRDO | Operating ROU $43.290m; finance ROU $10.259m; operating liabilities $6.032m + $43.752m; finance liabilities $5.458m + $6.097m | Both pairs are separately reported; failed sale-leaseback $56.992m remains separate |
| BCRX | ROU assets $10.203m, type unspecified; operating liabilities $0.317m + $8.571m; finance liabilities $1.312m + $1.441m | Do not assign aggregate ROU to a lease type without note evidence |
| FHTX | Operating ROU $30.949m; operating liabilities $0.923m + $40.347m; $1.915m finance ROU embedded in combined net PP&E | Do not add embedded ROU again; missing separate finance-liability row is not proof of zero |
| PBI | Operating ROU $106.996m; operating liabilities $28.396m + $99.757m; $185.913m finance ROU embedded in combined net PP&E | Keep embedded asset inside net PP&E |
| SGHC | IFRS 16 ROU $58m; current lease liabilities $5m + noncurrent $59m | Treat as IFRS 16 recognized leases; do not invent US GAAP lease type |

The full-universe audit counted 30 active issuers, 28 supported issuers, 24 with separate ROU rows, 23 with lease-liability rows, 28 ROU rows, 50 lease-liability rows, 3 embedded ROU issuers (CRNC, FHTX, PBI), 1 missing selected-period ROU amount and 2 lease-liability rows whose type is not identified. The two SGHC rows are IFRS 16 evidence; framework tagging is more useful than guessing an operating/finance label.

## 2. Calculation and data guardrails

- Keep conventional borrowings and lease liabilities in separate buckets. A finance/IFRS lease row mapped to a generic short-/long-term debt concept must not be counted in both.
- Keep current and noncurrent lease maturities separate; explicit zero is distinct from missing.
- Add separately reported ROU only if the approved policy admits it and it is not already in PP&E or another included aggregate.
- If the ROU amount is embedded in PP&E and not separately quantified, do not estimate or add it.
- Preserve original XBRL concept, label, dimension, row index, accession, period and accounting framework.
- Classify evidence as US GAAP operating, US GAAP finance, IFRS 16 recognized lease, failed sale-leaseback financing, or unknown.
- Short-term, variable and other payments not recognized as lease liabilities remain in operating expense; do not create synthetic debt.
- Failed sale-leaseback financing remains separate from ordinary lease liabilities and conventional borrowings pending its own policy decision.

## 3. Cash and marketable-securities recommendation

**Baseline:** deduct only unrestricted cash and cash equivalents available to the consolidated issuer at the filing date. Exclude restricted/pledged cash, customer-owned funds, escrow/in-transit balances and notes receivable. If a combined cash-plus-restricted figure cannot be reconciled to unrestricted cash, treat cash as unknown rather than using the combined number.

Keep marketable securities outside the baseline cash deduction unless each included instrument meets all of these conditions:

1. Original maturity **when acquired** is three months or less, or it is a genuinely redeemable-on-demand cash-management instrument meeting the cash-equivalent definition.
2. Readily convertible to a known amount of cash, with insignificant risk of value changes from interest rates.
3. Unrestricted, unpledged and available to the consolidated issuer, not held for customers or another beneficiary.
4. Instrument-level carrying values and maturity/settlement evidence reconcile to the face portfolio.
5. Components are reconciled to aggregates and no dimensional/component double count occurs.
6. The same test is applied across every issuer and security type.

Original maturity is not remaining maturity: a long-dated instrument does not become a cash equivalent merely because it is now within three months of maturity. Equity securities are not cash equivalents. “Available for current operations” alone is insufficient.

Sources: [FASB ASC 305](https://fasb.org/page/Document?pdf=ASC+305+Cash+and+Cash+Equivalents.pdf&title=ASC+305%3A+Cash+and+Cash+Equivalents); [SEC XBRL cash-equivalent definition](https://www.sec.gov/Archives/edgar/data/1606909/000160690923000063/R33.htm).

### Cohort examples

| Issuer | FY evidence | Provisional treatment |
|---|---|---|
| UPWK | $378.425m marketable securities; $294.356m cash; $3.8m restricted; $180.752m customer escrow/in-transit | Deduct only cash; exclude restricted/customer funds; do not include entire portfolio |
| PXED | $137.094m current + $30.758m noncurrent securities; $159.363m cash; $4.516m restricted | Keep both securities buckets separate |
| NRIX | $345.981m current AFS debt securities; $246.960m cash; $0.968m restricted | Securities remain separate pending instrument detail |
| ZVRA | $128.605m current + $47.879m noncurrent AFS securities; $62.406m cash | Keep securities separate |
| PRDO | $511.211m short-term AFS debt securities; $110.970m unrestricted cash; $21.310m restricted | Deduct unrestricted cash only |
| SNDK | $1.777bn noncurrent marketable equity securities | Exclude from cash-like assets |

For matched customer escrow, exclude both the customer-owned asset and corresponding payable from operating working capital only where the filing establishes the matching relationship and amount.

## 4. Owner decisions required

| Decision | Recommended default | Approval |
|---|---|---|
| US GAAP operating leases | Exclude liability from EV and separate ROU from IC; retain single lease cost in EBIT | Pending |
| US GAAP finance leases | Include liability in separate debt-like EV; include ROU once in IC | Pending |
| IFRS 16 | Include recognized liability in EV and ROU once in IC | Pending |
| Current lease liabilities in IC | Reclassify financing liabilities out of operating current liabilities consistently with other current debt | Pending |
| Embedded ROU | Do not add again when included in PP&E | Pending |
| Failed sale-leaseback | Keep separate; decide debt-like EV inclusion independently | Pending |
| Restricted/customer funds | Exclude from unrestricted cash; matched custodial asset/liability excluded from operating working capital where supported | Pending |
| Marketable securities | Exclude by default; allow security-level cash-equivalent test only | Pending |

## 5. Release boundary

This is a recommendation only. It does not modify policy v1, the resolver, invested-capital formula, EV, EBIT, eligibility, production fundamentals or rankings. `production_write=false`; no production change is authorized.
