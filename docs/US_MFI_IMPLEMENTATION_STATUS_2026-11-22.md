# US MFI implementation status (22 November 2026)

**Execution checklist:** [US MFI masterplan](US_MFI_MASTERPLAN.md)  
**Main code baseline for this status snapshot:** a0e52ba194a8b3b0a69f57027a3150222da16d1d  
**Status:** Evidence and shadow implementation progressing; accounting approval and production migration remain blocked.

This document is a concise status snapshot. The masterplan is authoritative for task order and completion checkboxes.

## Recently completed

| Item | Result | Evidence |
|---|---|---|
| Issuer-specific debt discovery | Merged and deployed; scans all SEC Company Facts taxonomies and separates royalty financing, other financing, leases and convertible debt | [PR #55](https://github.com/fizminho/magic-screen/pull/55), [deploy #44986755869](https://github.com/fizminho/magic-screen/actions/runs/44986755869) |
| Gemini audit-ledger export | Merged; manual and controlled [ledger-export] trigger; inspected 139 history rows and zero decisions | [PR #53](https://github.com/fizminho/magic-screen/pull/53), [PR #63](https://github.com/fizminho/magic-screen/pull/63), [Export #44990205149](https://github.com/fizminho/magic-screen/actions/runs/44990205149) |
| Lease/ROU active-universe audit | Active-universe filtering and ADBE control exclusion test are already on main; duplicate stale PR closed unmerged | [PR #28](https://github.com/fizminho/magic-screen/pull/28) |
| Main build and regression | Full Node suite, Python policy tests, TypeScript build and Wrangler dry-run passed | [Build #44990205110](https://github.com/fizminho/magic-screen/actions/runs/44990205110) |
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

Read-only export [#44990205149](https://github.com/fizminho/magic-screen/actions/runs/44990205149), [artifact](https://github.com/fizminho/magic-screen/actions/runs/44990205149/artifacts/14741890230):

- 139 history rows across 26 issuers; 139 unique cache keys and input hashes, no duplicate rows by those keys.
- Statuses: 92 ACCEPTED_CANDIDATE, 31 REVIEW_REQUIRED, 10 CONFLICTING_EVIDENCE, 4 INSUFFICIENT_EVIDENCE, 2 NOT_APPLICABLE.
- Tasks: cash 26, debt 24, EBIT 20, financing 11, invested capital 26, lease 25, NCI 7.
- Zero human decisions recorded.
- Current export omits evidence IDs. [PR #64](https://github.com/fizminho/magic-screen/pull/64) adds evidence-ID-only metadata to history without exposing raw response JSON; rerun the export after it is merged/deployed.

## Resolved issuer evidence from the fresh run

- **BMBL:** legacy row exists but status is `missing_required_facts`; legacy total_debt is null. FY2025 EBIT, invested capital and cash match the new preview; accession `0001830043-26-000027` supports USD 588.465m conventional debt. The discrepancy is a missing legacy debt field, not a mismatch in the new candidate.
- **BCRX:** USD 465.688m royalty financing is separate; USD 2.753m finance leases; secured term loan is explicitly zero; current conventional debt remains unknown.
- **IRWD:** USD 199.680m current convertible notes plus USD 385m revolver = USD 584.680m, supported by the filing note. The legacy shadow's separate convertible category must be reconciled with filing-based debt policy.
- **OTEX:** USD 5,770.369m carrying value reconciles to current/noncurrent debt; USD 66.156m unamortized discounts/issuance costs explain the gross-to-net gap.
- **UPWK:** USD 360.998m principal less USD 1.228m issuance costs = USD 359.770m current carrying value; noncurrent debt explicitly zero. Marketable securities and matched customer escrow remain separate from unrestricted cash.

## Latest workflow distinction

- Full dynamic-universe bakeoff [#44989926114](https://github.com/fizminho/magic-screen/actions/runs/44989926114) passed every stage. Do not confuse the earlier regression-only run [#44989800356](https://github.com/fizminho/magic-screen/actions/runs/44989800356) with full-universe validation.
- Read-only ledger export [#44990205149](https://github.com/fizminho/magic-screen/actions/runs/44990205149) passed and artifact was inspected.
- Main Build [#44990205110](https://github.com/fizminho/magic-screen/actions/runs/44990205110) passed. No production cutover occurred.

## Open critical gates

1. Merge/deploy PR #64, rerun the ledger export with evidence IDs, and reconcile every review item to exact evidence.
2. Human review of the P1 issuer queue in the order recorded in the masterplan; no decisions have yet been recorded.
3. Resolve P2/P3 filing exceptions and unsupported-provider handling without silently dropping active issuers.
4. Obtain cohort-wide owner approval for EBIT, debt, lease, cash, invested capital, NCI and ranking methodology.
5. Complete legacy-versus-EdgarTools reconciliation, staging write rehearsal and rollback.
6. Explicit owner approval before production cutover.

See the masterplan for the full prioritised implementation sequence and checkboxes.
