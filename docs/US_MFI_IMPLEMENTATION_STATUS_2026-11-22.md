# US MFI implementation status (22 November 2026)

**Execution checklist:** [US MFI masterplan](US_MFI_MASTERPLAN.md)  
**Main code baseline for this status snapshot:** `191564f18324ffed0c803e157a9809143c06b7f2` (PR #70)  
**Status:** Evidence and shadow implementation progressing; accounting approval and production migration remain blocked.

This document is a concise status snapshot. The masterplan is authoritative for task order and completion checkboxes.

## Recently completed

| Item | Result | Evidence |
|---|---|---|
| Issuer-specific debt discovery | Merged and deployed; scans all SEC Company Facts taxonomies and separates royalty financing, other financing, leases and convertible debt | [PR #55](https://github.com/fizminho/magic-screen/pull/55), [deploy #44986755869](https://github.com/fizminho/magic-screen/actions/runs/44986755869) |
| Gemini audit-ledger export | Latest read-only export after ALEC/BCRX targeted review: 149 rows, 28 issuers, 143 rows with evidence IDs, zero human decisions; [Export #44993168923](https://github.com/fizminho/magic-screen/actions/runs/44993168923) | [PR #64](https://github.com/fizminho/magic-screen/pull/64), [PR #68](https://github.com/fizminho/magic-screen/pull/68), [Artifact](https://github.com/fizminho/magic-screen/actions/runs/44993168923/artifacts/14741769525) |
| Lease/ROU active-universe audit | Active-universe filtering and ADBE control exclusion test are already on main; duplicate stale PR closed unmerged | [PR #28](https://github.com/fizminho/magic-screen/pull/28) |
| Main build and regression | Full Node suite, Python policy tests, TypeScript build and Wrangler dry-run passed | [Build #44990799577](https://github.com/fizminho/magic-screen/actions/runs/44990799577) |
| Legacy reconciliation provenance | Merged; read-only response now includes legacy row presence, stored CIK, updated_at and filed date, and states accession is unavailable rather than inventing one | [PR #57](https://github.com/fizminho/magic-screen/pull/57), [Deploy #44987320724](https://github.com/fizminho/magic-screen/actions/runs/44987320724) |
| Complete Node regression suite | All worker *.test.mjs files and lease/ROU audit test passed; debt-discovery category, accession/period/dimension and discovery-cap tests included | [PR #60](https://github.com/fizminho/magic-screen/pull/60), [Build #44988077191](https://github.com/fizminho/magic-screen/actions/runs/44988077191) |

## Latest full-universe evidence snapshot

Fresh dynamic active-universe run [#44993883641](https://github.com/fizminho/magic-screen/actions/runs/44993883641) completed successfully on 22 November 2026. [Downloadable run artifact](https://github.com/fizminho/magic-screen/actions/runs/44993883641/artifacts/14742851802).

| Measure | Result |
|---|---:|
| Active US MFI universe | 30 |
| EdgarTools-supported issuers | 28 |
| Unsupported provider | 2 (AFMJF, EGHSF) |
| Raw evidence received/ingested | 31 (30 active + ADBE regression control) |
| Accounting/valuation review required | 26 |
| P1 / P2 / P3 review queue | 9 / 10 / 11 |
| Shadow eligible | 2 (IRWD, SNDK) |
| Shadow ranked | 0 (minimum cohort is 5) |
| Production approved | 0 |

All stages passed: dynamic universe discovery (30 unique symbols), matching market-cap snapshot (price date 2026-11-20), annual extraction (29 company records: 27 supported plus 2 provider-unsupported), raw evidence ingestion (31 records including ADBE regression control), resolver/reconciliation previews, lease/ROU coverage, exception queue, policy cohort and ranking sensitivity. The run explicitly reports production fundamentals, rankings and production writes unchanged.

## Fresh run diagnostics (run #44993883641)

- Resolver: 30 active, 28 supported, 2 unsupported, 0 awaiting evidence; 25 direct EBIT candidates, 17 conventional debt candidates, 15 net-debt candidates, 11 ambiguous debt inputs and 28 review-required.
- Ranking: 2 shadow eligible (IRWD, SNDK), 0 ranked, 30 excluded; minimum eligible cohort remains five; 26 are accounting/valuation review and 2 are provider-unsupported.
- Policy queue: P1/P2/P3 remains 9/10/11; all 30 are blocked or review-required; production-approved remains zero.
- Reconciliation: 27/28 supported issuers have period-matched partial comparisons, zero period mismatches and zero field-level differences in the available comparisons. No full EV/EY/ROC comparison is possible because legacy total debt is missing for all 28 supported issuers.
- The nine P1 filing accessions match the current extracted annual filings. The fresh run preserves the same accession set for OTEX, GTM, SGHC, PBI, HPQ, SSTK, XPOF, HRMY and HRB.

## Current pipeline architecture

- EdgarTools is the designated primary extraction provider for the target US fundamentals workflow.
- GitHub Actions extracts annual SEC filings, and the Worker stores raw evidence for deterministic read-only resolution, accounting review and shadow ranking.
- The legacy Company Facts sync remains active on the Worker 30-minute cron and continues to populate the existing production fundamentals path during migration.
- EdgarTools ingestion and shadow previews do not write production fundamentals, ratios, eligibility or rankings.
- No production cutover has been approved.

## Review ledger snapshot

Latest read-only export [#44993168923](https://github.com/fizminho/magic-screen/actions/runs/44993168923), [artifact](https://github.com/fizminho/magic-screen/actions/runs/44993168923/artifacts/14741769525), exported 22 November 2026 at 06:19:15Z:

- 149 history rows across 28 issuers; 149 unique history IDs, cache keys and input hashes, with no duplicate keys.
- Statuses: 98 ACCEPTED_CANDIDATE, 34 REVIEW_REQUIRED, 10 CONFLICTING_EVIDENCE, 5 INSUFFICIENT_EVIDENCE, 2 NOT_APPLICABLE.
- Tasks: cash 28, debt 26, EBIT 21, financing 12, invested capital 28, lease 27, NCI 7.
- 143/149 rows contain evidence IDs (379 occurrences); six rows have none: STRA debt_scope, SBC financing_scope, QTTB nci_scope, IRWD financing_scope, HRMY financing_scope and GTM financing_scope.
- ALEC and BCRX now each have five task-history rows under their current filing accession. ALEC: four ACCEPTED_CANDIDATE and EBIT REVIEW_REQUIRED. BCRX: cash/lease ACCEPTED_CANDIDATE, debt INSUFFICIENT_EVIDENCE, financing/invested capital REVIEW_REQUIRED.
- Zero human decisions recorded. Production writes, fundamentals changes and ranking changes are all false.
- ADBE remains a regression control, not an active issuer; AFMJF and EGHSF remain provider-unsupported.

## Resolved issuer evidence from the fresh run

- **BMBL:** legacy row exists but status is `missing_required_facts`; legacy total_debt is null. FY2025 EBIT, invested capital and cash match the new preview; accession `0001830043-26-000027` supports USD 588.465m conventional debt. The discrepancy is a missing legacy debt field, not a mismatch in the new candidate.
- **BCRX:** USD 465.688m royalty financing is separate; USD 2.753m finance leases; secured term loan is explicitly zero; current conventional debt remains unknown.
- **IRWD:** USD 199.680m current convertible notes plus USD 385m revolver = USD 584.680m, supported by the filing note. The legacy shadow's separate convertible category must be reconciled with filing-based debt policy.
- **OTEX:** USD 5,770.369m carrying value reconciles to current/noncurrent debt; USD 66.156m unamortized discounts/issuance costs explain the gross-to-net gap.
- **UPWK:** USD 360.998m principal less USD 1.228m issuance costs = USD 359.770m current carrying value; noncurrent debt explicitly zero. Marketable securities and matched customer escrow remain separate from unrestricted cash.

## Latest workflow distinction

- Fresh full dynamic-universe bakeoff [#44993883641](https://github.com/fizminho/magic-screen/actions/runs/44993883641) passed all 20 workflow steps; artifact [14742851802](https://github.com/fizminho/magic-screen/actions/runs/44993883641/artifacts/14742851802) was inspected. This is the current cohort snapshot.
- The earlier [#44993168825](https://github.com/fizminho/magic-screen/actions/runs/44993168825) was regression-only and is superseded by #44993883641.
- Latest ledger [#44993168923](https://github.com/fizminho/magic-screen/actions/runs/44993168923) remains the current history export; no new Gemini reviews or human decisions were added by the bakeoff.
- PR #70 documentation CI [#44993832392](https://github.com/fizminho/magic-screen/actions/runs/44993832392) and main build [#44993883526](https://github.com/fizminho/magic-screen/actions/runs/44993883526) passed all Node, Python, TypeScript and Wrangler dry-run checks. No production cutover occurred.

## Open critical gates

1. Obtain owner decisions on shared EBIT, debt, lease/ROU, cash, invested-capital, NCI, ranking and quote-staleness policies; all remain pending.
2. Complete evidence-linked P1 issuer sign-off in the masterplan order; the ledger currently has zero human decisions.
3. Resolve the legacy reconciliation gap: all 28 supported issuers currently lack a legacy total-debt value, so no full EV/EY/ROC comparison is available.
4. Resolve P2/P3 filing exceptions and unsupported-provider handling without silently dropping active issuers.
5. Complete legacy-versus-EdgarTools reconciliation, staging write rehearsal and rollback.
6. Explicit owner approval before production cutover.

See the masterplan for the full prioritised implementation sequence and checkboxes.
