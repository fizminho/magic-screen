# US MFI live validation findings (2026-11-22)

## Run identity

- Repository: `fizminho/magic-screen`
- Main SHA: `62a8c0676648c6781ef5cf43a8a10bbcf6cd0574`
- Workflow: [EdgarTools fundamentals bakeoff #44938236912](https://github.com/fizminho/magic-screen/actions/runs/44938236912)
- Conclusion: success; all 20 workflow steps completed.
- Artifact: `edgartools-bakeoff` (artifact ID `14720492526`).

The run dynamically resolved the active US MFI universe, appended ADBE as a regression control, extracted annual filing evidence, ingested raw evidence, and ran read-only resolver, ranking, reconciliation, lease/ROU, exception-queue, policy and sensitivity validations.

## Universe and ingestion

| Measure | Result |
|---|---:|
| Active MFI issuers | 30 |
| Supported provider | 28 |
| Unsupported provider | 2 (AFMJF, EGHSF) |
| Extraction requests | 31 (active 30 + ADBE control) |
| Evidence records received | 31 |
| Evidence records ingested | 31 |

The ingest response explicitly states:
- `production_fundamentals_changed=false`
- `rankings_changed=false`

ADBE is a regression control and is not part of the active 30-issuer cohort. Unsupported issuers remain visible and are not silently dropped or assigned zero values.

## Resolver and ranking

Resolver summary:

| Measure | Result |
|---|---:|
| Active universe | 30 |
| Supported | 28 |
| Unsupported provider | 2 |
| Direct EBIT candidates | 25 |
| Conventional debt candidates | 17 |
| Net debt candidates | 15 |
| Ambiguous debt inputs | 11 |
| Review required | 28 |

Shadow ranking summary:

| Measure | Result |
|---|---:|
| Universe | 30 |
| Eligible | 2 |
| Ranked | 0 |
| Excluded | 30 |
| Unsupported provider | 2 |
| Filing evidence unavailable | 0 |
| Accounting/valuation review | 26 |
| Minimum eligible cohort | 5 |

No issuer is production-approved. The two eligible shadow candidates are insufficient to satisfy the minimum ranking cohort, and the ranking completeness gate remains in force.

## Legacy reconciliation

| Measure | Result |
|---|---:|
| Legacy-calculated issuers | 0 |
| EdgarTools-supported issuers | 28 |
| Fiscal periods matched | 27 |
| Fiscal periods mismatched | 0 |
| Partial input comparison rows | 27 |
| Partial input differences | 0 |
| Fully comparable metric rows | 0 |
| Supported issuers missing legacy debt | 28 |

Legacy field coverage among the 28 supported issuers:

| Field | Legacy | EdgarTools |
|---|---:|---:|
| EBIT | 25 | 26 |
| Invested capital | 23 | 27 |
| Gross debt | 0 | 17 |
| Unrestricted cash | 24 | 25 |

The 27 partial comparisons have no differences in fields available on both sides. This is useful evidence of agreement for overlapping EBIT, invested-capital and cash inputs, but it is not a full EV/Earnings Yield/Return on Capital reconciliation.

### Why the legacy metric count is zero

The live reconciliation route joins `stock_fundamentals` by symbol and US market and selects `f.total_debt AS legacy_total_debt`. The current artifact shows EBIT, current assets, current liabilities, net PP&E and cash for many issuers, but `legacy_total_debt` is null for all 28 supported issuers. Their legacy status is `missing_required_facts`.

The legacy Company Facts resolver only populates a complete debt amount when it can establish a complete matching current/noncurrent aggregate or a recognised split. It does not infer total debt from an incomplete long-term-debt observation. The current zero-comparable result is therefore consistent with the conservative missing-debt guardrail; it is not evidence that the reconciliation query forgot to select the debt column.

### Historical BMBL discrepancy

The earlier document `US_MFI_LEGACY_RECONCILIATION_FINDINGS_2026-11-21.md` reports BMBL as fully comparable and lists legacy gross debt of USD 588.465m. In the latest live D1 snapshot, BMBL's `stock_fundamentals.total_debt` is null, and its legacy status is `missing_required_facts`.

The current reconciliation route does not expose `stock_fundamentals.updated_at` or CIK, so the exact timing and cause of this state change are not yet established. The full-universe ingest route writes only raw EdgarTools filing evidence and explicitly reports no production fundamentals or ranking changes. Do not use the historical BMBL comparison as current validation until the legacy row history is traced.

## Accounting exception queue

| Priority | Issuers | Count |
|---|---|---:|
| P1 | GTM, HPQ, HRB, HRMY, OTEX, PBI, SGHC, SSTK, XPOF | 9 |
| P2 | BCRX, FHTX, MNTN, NRIX, PRDO, PXED, SBC, STRA, VXRT, ZVRA | 10 |
| P3 | AFMJF, ALEC, BMBL, CRNC, EGHSF, IRWD, MGTX, PLTK, QTTB, SNDK, UPWK | 11 |

Queue summary:
- 28 balance sheets reconciled; 2 not available.
- 16 issuers have filing debt-note manual-review evidence.
- 9 have filing EV-scope note-review evidence.
- 18 cash-policy questions remain unresolved.
- 0 shadow production-approved.

## Lease/ROU and policy

The lease/ROU audit is scoped to the active universe artifact. Regression-control issuers are not counted as active cohort members. The policy cohort assessment remains `proposed_owner_approval_required`; no accounting policy was approved by this workflow.

## Decisions and blockers

1. Approve EBIT, debt, cash, lease, and invested-capital policies.
2. Preserve legacy SQL `RANK()` tie semantics for the migration unless the owner explicitly chooses a methodology change.
3. Use the dated active MFI market-cap snapshot for new stocks; withhold ranks when no reliable market cap is available.
4. Run the Gemini accounting-review workflow manually with `dry_run=true` first. It is a separate workflow and was not part of this bakeoff.
5. Trace the historical BMBL legacy-debt discrepancy by exposing legacy row CIK and `updated_at` in a future read-only reconciliation diagnostic.
6. Complete scheduled-ingestion observation, staging rollback drill, and explicit cutover approval before any production write.

## Safety conclusion

This run proves that the full-universe EdgarTools extraction and raw evidence-ingestion pipeline completed successfully for the active 30-issuer universe plus its regression control. It does not prove that all accounting classifications are approved, that the full cohort can be ranked, or that production cutover is safe. Production fundamentals, ratios, eligibility and rankings remain unchanged.
