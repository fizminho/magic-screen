# US MFI implementation status (22 November 2026)

**Execution checklist:** [US MFI masterplan](US_MFI_MASTERPLAN.md)  
**Main code baseline for this status snapshot:** bf7df3ad91467fc494b1ab01b3eb1057706d7363  
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

Fresh dynamic active-universe run [#44989926114](https://github.com/fizminho/magic-screen/actions/runs/44989926114) completed successfully on 22 November 2026. [Downloadable run artifact](https://github.com/fizminho/magic-screen/actions/runs/44989926114/artifacts/14741293084).

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

All stages passed: dynamic universe discovery, matching market-cap snapshot (price date 2026-11-20), annual extraction, raw ingestion, resolver/reconciliation previews, lease/ROU coverage, exception queue, policy cohort and ranking sensitivity. The run explicitly reports production fundamentals, rankings and production writes unchanged.

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

- Full dynamic-universe bakeoff [#44989926114](https://github.com/fizminho/magic-screen/actions/runs/44989926114) passed every stage. A post-documentation push bakeoff [#44993168825](https://github.com/fizminho/magic-screen/actions/runs/44993168825) was also triggered and is pending inspection; do not treat it as accepted full-universe validation until its mode and artifact are checked.
- Read-only ledger export [#44993168923](https://github.com/fizminho/magic-screen/actions/runs/44993168923) passed and artifact was inspected.
- PR #68 documentation build [#44993118191](https://github.com/fizminho/magic-screen/actions/runs/44993118191) passed all Node, Python, TypeScript and Wrangler dry-run checks. Main post-merge build [#44993168886](https://github.com/fizminho/magic-screen/actions/runs/44993168886) is pending inspection. No production cutover occurred.

## Open critical gates

1. Merge/deploy PR #64, rerun the ledger export with evidence IDs, and reconcile every review item to exact evidence.
2. Human review of the P1 issuer queue in the order recorded in the masterplan; no decisions have yet been recorded.
3. Resolve P2/P3 filing exceptions and unsupported-provider handling without silently dropping active issuers.
4. Obtain cohort-wide owner approval for EBIT, debt, lease, cash, invested capital, NCI and ranking methodology.
5. Complete legacy-versus-EdgarTools reconciliation, staging write rehearsal and rollback.
6. Explicit owner approval before production cutover.

See the masterplan for the full prioritised implementation sequence and checkboxes.
