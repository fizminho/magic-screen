# US MFI implementation status (22 November 2026)

**Execution checklist:** [US MFI masterplan](US_MFI_MASTERPLAN.md)  
**Main code baseline for this status snapshot:** 98f9dc7c12d5691f1fbbe088fef9597a47855d56  
**Status:** Evidence and shadow implementation progressing; accounting approval and production migration remain blocked.

This document is a concise status snapshot. The masterplan is authoritative for task order and completion checkboxes.

## Recently completed

| Item | Result | Evidence |
|---|---|---|
| Issuer-specific debt discovery | Merged and deployed; scans all SEC Company Facts taxonomies and separates royalty financing, other financing, leases and convertible debt | [PR #55](https://github.com/fizminho/magic-screen/pull/55), [deploy #44986755869](https://github.com/fizminho/magic-screen/actions/runs/44986755869) |
| Gemini audit-ledger export | Merged; manual workflow exports read-only history and decisions without invoking Gemini or writing application data | [PR #53](https://github.com/fizminho/magic-screen/pull/53) |
| Lease/ROU active-universe audit | Active-universe filtering and ADBE control exclusion test are already on main; duplicate stale PR closed unmerged | [PR #28](https://github.com/fizminho/magic-screen/pull/28) |
| Main build | Passed after PR #53 merge | [Build #44986762008](https://github.com/fizminho/magic-screen/actions/runs/44986762008) |
| Legacy reconciliation provenance | Merged; read-only response now includes legacy row presence, stored CIK, updated_at and filed date, and states accession is unavailable rather than inventing one | [PR #57](https://github.com/fizminho/magic-screen/pull/57) |
| Complete Node regression suite | Build workflow now runs every worker *.test.mjs file plus the lease/ROU audit test; Python tests, TypeScript build and Wrangler dry-run remain | [Build #44987271482](https://github.com/fizminho/magic-screen/actions/runs/44987271482) |

## Latest documented cohort baseline

The latest accepted full-universe evidence snapshot documented before this audit reported:

| Measure | Result |
|---|---:|
| Active US MFI universe | 30 |
| EdgarTools-supported issuers | 28 |
| Unsupported provider | 2 |
| Accounting/valuation review required | 26 |
| Shadow eligible | 2 |
| Shadow ranked | 0 |
| Production approved | 0 |

These figures are a historical accepted snapshot, not proof of a fresh full-universe refresh on the latest main commit.

## Current pipeline architecture

- EdgarTools is the designated primary extraction provider for the target US fundamentals workflow.
- GitHub Actions extracts annual SEC filings, and the Worker stores raw evidence for deterministic read-only resolution, accounting review and shadow ranking.
- The legacy Company Facts sync remains active on the Worker 30-minute cron and continues to populate the existing production fundamentals path during migration.
- EdgarTools ingestion and shadow previews do not write production fundamentals, ratios, eligibility or rankings.
- No production cutover has been approved.

## Latest workflow distinction

- [Main push bakeoff #44985667878](https://github.com/fizminho/magic-screen/actions/runs/44987320672) passed its regression stages.
- That run skipped dynamic universe discovery, raw evidence ingestion and full-universe validation. It must not be reported as a fresh full-universe acceptance.
- The main Build and deployment after PR #55 succeeded in [deploy #44986755869](https://github.com/fizminho/magic-screen/actions/runs/44986755869); the subsequent PR #53 documentation/workflow merge passed [Build #44986762008](https://github.com/fizminho/magic-screen/actions/runs/44986762008).

## Open critical gates

1. Fresh dynamic universe extraction and raw evidence ingestion.
2. Read-only Gemini ledger export and a deduplicated issuer-level human review queue.
3. Live validation of BCRX custom royalty financing, IRWD convertible debt, OTEX gross/net carrying value and UPWK issuance costs.
4. Legacy BMBL discrepancy investigation: prior note recorded USD 588.465m while latest live D1 reconciliation showed total_debt null. Add legacy row provenance before concluding.
5. Cohort-wide owner approval for EBIT, debt, lease, cash, invested capital, NCI and ranking methodology.
6. Legacy-versus-EdgarTools reconciliation, staging write rehearsal and rollback.
7. Explicit owner approval before production cutover.

See the masterplan for the full prioritised implementation sequence and checkboxes.
