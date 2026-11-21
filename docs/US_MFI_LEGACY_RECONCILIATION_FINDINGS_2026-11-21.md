# US MFI legacy versus EdgarTools reconciliation findings

**Bakeoff run:** 44889673041  
**Artifact:** 14701457043  
**Review date:** 21 November 2026  
**Mode:** read-only; no production fundamentals, ratios, eligibility or rankings changed

## 1. Reconciliation result

| Measure | Result |
|---|---:|
| Active issuer rows | 30 |
| EdgarTools-supported | 28 |
| Unsupported provider | 2 |
| Fiscal periods matched | 27 |
| Period-aligned partial issuer comparisons | 27 |
| Available field-level comparisons | 72 |
| Field-level differences greater than $0.01 | 0 |
| Fully comparable legacy/EdgarTools metric rows | 1 |
| Supported issuers with legacy debt missing | 27 / 28 |
| Production-approved rows | 0 |

The 72 available field-level comparisons are exact matches. A zero-difference result applies only to fields available on both sides; it does not imply that all four inputs or complete EV/EY/ROC metrics were available for every issuer.

## 2. Legacy field coverage

| Input | Legacy coverage | EdgarTools candidate coverage |
|---|---:|---:|
| EBIT | 25 / 28 | 26 / 28 |
| Invested capital | 23 / 28 | 27 / 28 |
| Conventional gross debt | 1 / 28 | 16 / 28 |
| Unrestricted cash | 24 / 28 | 25 / 28 |

The old stock_fundamentals table does not store filing accession numbers. It does store fiscal period and filed date, which are used for alignment. The report explicitly marks legacy accession as unavailable.

**Main finding:** 27 of 28 EdgarTools-supported issuers have no legacy total-debt value. This prevents a complete legacy enterprise-value, Earnings Yield and Return on Capital comparison for those names. Missing debt is not interpreted as zero.

## 3. Five shadow-ranked issuers

| Issuer | Fiscal period | Available overlapping fields | Result | Why full comparison is blocked |
|---|---|---|---|---|
| HRB | 2026-06-30 | Invested capital, cash | Exact matches | Legacy EBIT missing; current debt missing |
| OTEX | 2026-06-30 | EBIT, invested capital, cash | Exact matches | Legacy debt missing |
| UPWK | 2025-12-31 | EBIT, invested capital, cash | Exact matches | Legacy debt missing |
| IRWD | 2025-12-31 | EBIT, invested capital, cash | Exact matches | Legacy debt missing |
| QTTB | 2025-12-31 | EBIT, invested capital, cash | Exact matches | Legacy debt missing |

The five ranked names have 14 available field-level comparisons and zero differences. HRB's EBIT is a filing-specific reconstruction that is not present in the legacy record. The other four match on the available EBIT, invested-capital and cash inputs. None has a legacy debt value, so none has a full legacy EV/EY/ROC comparison.

## 4. Only fully comparable issuer: BMBL

BMBL is the only supported issuer with a fully calculated legacy record and complete same-period EdgarTools inputs.

| Metric | Legacy | EdgarTools | Difference |
|---|---:|---:|---:|
| EBIT | -$805.778m | -$805.778m | $0 |
| Invested capital | $174.170m | $174.170m | $0 |
| Conventional debt | $588.465m | $588.465m | $0 |
| Unrestricted cash | $175.760m | $175.760m | $0 |
| Enterprise value | $1,208.625m | $1,208.625m | $0 |
| Earnings Yield | -66.67% | -66.67% | 0.00 pp |
| Return on Capital | -462.64% | -462.64% | 0.00 pp |

BMBL is not eligible for the current MFI ranking because its reported EBIT is negative. The matching result is useful validation of the overlapping data, but it does not validate the five-name ranked cohort's full EV calculations.

## 5. All 30 issuers: field availability

Legend: E = EBIT, I = invested capital, D = conventional debt, C = unrestricted cash. The field list shows which same-period fields had values on both sides and could therefore be compared. A blank/missing field is unknown, not zero.

| Symbol | Provider | Legacy status | Legacy fiscal period | EdgarTools period | Comparable fields |
|---|---|---|---|---|---|
| AFMJF | Unsupported | Missing | — | — | None |
| ALEC | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, I, C |
| BCRX | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, I, C |
| BMBL | Supported | Calculated | 2025-12-31 | 2025-12-31 | E, I, D, C |
| CRNC | Supported | Missing required facts | 2025-09-30 | 2025-09-30 | E |
| EGHSF | Unsupported | Missing | — | — | None |
| FHTX | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, C |
| GTM | Supported | Negative invested capital | 2025-12-31 | 2025-12-31 | E, I, C |
| HPQ | Supported | Negative invested capital | 2025-10-31 | 2025-10-31 | E, I |
| HRB | Supported | Missing required facts | 2026-06-30 | 2026-06-30 | I, C |
| HRMY | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, C |
| IRWD | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, I, C |
| MGTX | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, I, C |
| MNTN | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, I, C |
| NRIX | Supported | Missing required facts | 2025-11-30 | 2025-11-30 | E, I, C |
| OTEX | Supported | Missing required facts | 2026-06-30 | 2026-06-30 | E, I, C |
| PBI | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | C |
| PLTK | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, I, C |
| PRDO | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, I, C |
| PXED | Supported | Missing required facts | 2026-08-31 | 2026-08-31 | E, I, C |
| QTTB | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, I, C |
| SBC | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, I, C |
| SGHC | Supported | Missing required facts | Missing | 2025-12-31 | None |
| SSTK | Supported | Negative invested capital | 2025-12-31 | 2025-12-31 | E, I, C |
| STRA | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, I, C |
| UPWK | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, I, C |
| VSNT | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, I, C |
| VXRT | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, I |
| XPOF | Supported | Negative invested capital | 2025-12-31 | 2025-12-31 | E, I |
| ZVRA | Supported | Missing required facts | 2025-12-31 | 2025-12-31 | E, I, C |

## 6. Interpretation and cutover decision

1. Available overlapping EBIT, invested-capital and cash fields agree exactly across the 27 partial rows.
2. Legacy total-debt coverage is the dominant gap. The old Company Facts pipeline cannot provide a complete debt input for 27 supported issuers.
3. The legacy table does not persist accession identifiers, limiting source-to-source auditability even when fiscal periods match.
4. The current shadow ranking is not invalidated by this result, but it cannot be fully reconciled against the legacy calculation.
5. Do not fill missing legacy debt with zero or infer a debt-free issuer.
6. Do not write EdgarTools values into production solely because partial inputs match.
7. The product/accounting owner must explicitly approve replacing the legacy path, after reviewing the raw debt evidence, policy matrix, all issuer exceptions and the full-universe ranking sensitivity.

**Conclusion:** the new provider has strong agreement with legacy on the overlapping fields, but legacy debt coverage is insufficient for a complete ranking reconciliation. Production cutover remains blocked pending an explicit owner decision and a controlled migration plan.
