# US Magic Formula Investing masterplan

**Owner:** repository owner  
**Last updated:** 22 November 2026  
**Repository:** fizminho/magic-screen  
**Status:** Active execution plan  
**Source of truth:** This document governs implementation order, completion tracking and release gates. Older handovers and status snapshots are historical unless explicitly linked here.

## Executive objective

Deliver a reproducible US MFI screener whose annual EBIT, enterprise value, invested capital, earnings yield, return on capital and ranking are supported by filing-period-bound evidence and one approved accounting policy. Keep existing production fundamentals and rankings unchanged until the shadow cohort is complete, reconciled, approved and safely migrated.

## Non-negotiable guardrails

- [ ] No production accounting policy or numeric ranking changes without explicit owner approval.
- [x] Missing inputs remain unknown, never zero.
- [x] SEC facts/evidence must match filing accession, fiscal period, unit, currency and consolidated scope.
- [x] Dimensional breakdowns are not added to consolidated totals.
- [x] EdgarTools evidence ingestion and preview are read-only with respect to production fundamentals and rankings.
- [x] Gemini is reserved for genuinely ambiguous interpretation; deterministic arithmetic and known fact mapping stay in code.
- [x] Bursa/Malaysia behaviour remains outside this US migration.
- [ ] Production cutover requires a tested rollback and explicit owner approval.

## Current verified baseline

| Area | Verified state | Evidence |
|---|---|---|
| Main branch | e1754654d8ff98b0222e5bc2c60016a6f4023cad at start of this plan branch | GitHub main ref |
| Build | Passing | [Build #44986762008](https://github.com/fizminho/magic-screen/actions/runs/44986762008) |
| Debt taxonomy discovery | Merged and deployed | [PR #55](https://github.com/fizminho/magic-screen/pull/55), [deploy #44986755869](https://github.com/fizminho/magic-screen/actions/runs/44986755869) |
| Review ledger export | Merged; read-only manual workflow | [PR #53](https://github.com/fizminho/magic-screen/pull/53) |
| Lease/ROU active-universe scope | Already present on main; stale duplicate PR closed unmerged | scripts/build_lease_rou_coverage_report.mjs, .github/workflows/edgartools-bakeoff.yml; [PR #28](https://github.com/fizminho/magic-screen/pull/28) |
| Latest documented full cohort | 30 active; 28 supported; 2 unsupported; 26 review-required; 2 shadow eligible; 0 shadow ranked; 0 production approved | [Implementation status snapshot](US_MFI_IMPLEMENTATION_STATUS_2026-11-22.md), [live validation](US_MFI_LIVE_VALIDATION_2026-11-22.md) |
| Latest main push bakeoff | Regression-only stages passed; dynamic universe, ingestion and full-universe stages skipped | [Bakeoff #44985667878](https://github.com/fizminho/magic-screen/actions/runs/44985667878) |
| Production migration | Not approved; legacy Company Facts sync still runs on the 30-minute cron | worker/index.ts, wrangler.toml |

**Important:** The 30-issuer coverage figures above are the latest documented accepted full-universe snapshot, not proof that the current cohort has just been refreshed. A fresh dynamic run is still required.

## Priority plan

### P0. Establish a clean, auditable project baseline

- [x] Review main branch, latest commits, open PRs, workflows and implementation docs.
- [x] Merge PR #55 after its build check passed; issuer-specific taxonomies now participate in read-only debt/financing discovery.
- [x] Verify PR #55 deployment succeeded; production fundamentals and rankings remain outside the shadow route.
- [x] Merge PR #53 after its build check passed; read-only audit-ledger export workflow is available.
- [x] Verify lease/ROU audit active-universe filtering and regression test already exist on main.
- [x] Close stale PR #28 unmerged because its intended change is already present on main.
- [x] Create this masterplan as the authoritative execution checklist.
- [ ] Run the ledger export workflow manually and inspect the generated artifact; no workflow-dispatch connector action is available in this session, so an owner/manual GitHub Actions dispatch is required.
- [ ] Reconcile stale or conflicting docs against this plan and the current code.

### P1. Refresh evidence for the current active cohort

- [ ] Manually dispatch EdgarTools fundamentals bakeoff with blank ticker override so it resolves the live active US MFI universe.
- [ ] Confirm the workflow discovers the active universe, uses the matching market-cap snapshot and quote date, extracts annual filings, and ingests raw evidence.
- [ ] Confirm the full-universe validators, lease/ROU coverage audit, accounting exception queue, policy cohort assessment and ranking sensitivity report all complete.
- [ ] Confirm the run explicitly reports no production fundamentals or ranking changes.
- [ ] Record the run ID, active symbols, supported/unsupported counts and artifact links in the implementation status document.
- [ ] Do not treat a push-triggered regression-only run as full-universe validation.

### P1. Build one issuer-level human review queue

- [ ] Run the newly merged read-only Gemini review ledger export workflow manually.
- [ ] Reconcile history and decisions by issuer, task, filing accession and evidence IDs.
- [ ] Deduplicate completed/cached reviews; do not resend unchanged evidence.
- [ ] Separate deterministic missing facts, conflicting evidence, policy decisions and unsupported-provider cases.
- [ ] Rank the queue by impact on EBIT, debt/EV, invested capital/ROC and top-cohort ranking sensitivity.
- [ ] Record each human decision with rationale, source evidence and reviewer; do not convert a Gemini candidate into an approval automatically.

### P1. Close deterministic accounting and issuer evidence gaps

- [ ] Validate PR #55 live discovery against BCRX custom royalty financing and IRWD convertible debt; confirm both stay outside conventional debt candidates unless policy explicitly says otherwise.
- [ ] Inspect filing evidence for OTEX gross/net debt carrying-value and issuance-cost reconciliation.
- [ ] Explain UPWK gross debt versus net carrying value and preserve issuance costs separately.
- [ ] Resolve BMBL legacy debt discrepancy: earlier note says USD 588.465m while latest live D1 row showed total_debt=null. Add legacy row provenance (CIK, accession/period, filed date, updated_at, status and source) before drawing conclusions.
- [ ] Review remaining issuer-specific debt, financing, lease, NCI, cash and EBIT exceptions using the prioritised queue.
- [ ] Keep royalty financing, convertibles, sale-leaseback, securitisation, customer financing, tax receivable agreements and contingent consideration separately classified pending policy.
- [ ] Keep unsupported issuers visible; do not silently drop or replace them.

### P1. Approve a single cohort-wide accounting policy

Owner approval required before implementation can change shadow assumptions or production values.

- [ ] EBIT: consolidated operating income, discontinued operations, exceptional items and any narrow reconstruction rules.
- [ ] Debt: conventional borrowings, short-term borrowing overlap, gross/net carrying value and financing obligations.
- [ ] Leases: US GAAP operating/finance and IFRS 16 treatment; align EBIT, EV, invested capital and current-liability treatment symmetrically.
- [ ] Cash: unrestricted cash baseline and security-level cash-equivalent criteria; exclude restricted/customer/escrow cash unless policy proves otherwise.
- [ ] Invested capital: working capital, PP&E, embedded ROU, separately reported ROU, negative working capital and denominator edge cases.
- [ ] NCI and other claims: enterprise-value perimeter and non-controlling interests.
- [ ] Ranking: component ties, combined ties, negative values, denominator sign and minimum cohort.
- [ ] Sector suitability: define exclusions or review treatment for financial and other structurally non-comparable issuers.
- [ ] Version and approve the policy; update regression fixtures and policy validation tests.

### P1. Reconcile legacy Company Facts against EdgarTools

- [ ] Confirm current legacy sync behaviour, cron cadence, production write fields and retry semantics.
- [ ] Add read-only legacy row provenance to reconciliation diagnostics.
- [ ] Reconcile each overlapping issuer/input on same period, currency, scope and unit.
- [ ] Explain mismatches and non-comparable rows; do not equate missing legacy debt with zero.
- [ ] Define an approved shadow-to-production mapping and migration compatibility contract.
- [ ] Preserve legacy path until the replacement is validated and rollback is tested.

### P2. Engineering quality and documentation

- [ ] Add a complete Node test sweep to CI (including all worker and script .test.mjs suites) or document intentional exclusions.
- [ ] Keep Python syntax/unit checks, TypeScript build and Wrangler dry-run in required CI.
- [ ] Add tests for all debt taxonomy discovery categories, dimension rejection, filing alignment and discovery-cap behaviour.
- [ ] Ensure workflow outputs distinguish regression-only, targeted and full-universe modes.
- [ ] Consolidate agent handovers and implementation status around this masterplan.
- [ ] Correct README cron cadence and clearly distinguish the legacy Company Facts runtime from the EdgarTools evidence lane.
- [ ] Remove stale branch-specific instructions and duplicate/contradictory policy statements.
- [ ] Keep dated issuer research notes as evidence records; do not duplicate their full content into this plan.

### P3. Controlled release

- [ ] All active issuers have current evidence or an explicitly approved exclusion.
- [ ] Policy-sensitive issuer reviews are closed or explicitly excluded with rationale.
- [ ] The approved cohort meets the minimum eligible ranking size.
- [ ] Shadow EY, ROC, EV and ranking outputs pass independent validation and sensitivity checks.
- [ ] Staging write rehearsal, rollback rehearsal and audit trail verification pass.
- [ ] Owner explicitly approves production cutover.
- [ ] Deploy in a controlled window and verify production fundamentals, ratios, eligibility and rankings.
- [ ] Retain rollback capability and post-deployment reconciliation.

## Next implementation sequence

1. Run the full dynamic EdgarTools workflow and review its artifacts.
2. Export and consolidate the Gemini audit ledger; build the prioritised issuer queue.
3. Add legacy row provenance and resolve the BMBL discrepancy.
4. Complete deterministic debt/financing classification validation for BCRX, IRWD, OTEX and UPWK.
5. Work through shared policy decisions, then apply the approved policy cohort-wide.
6. Reconcile legacy and EdgarTools, complete staging/rollback, and only then request cutover approval.

## Change-control rules for future agents

- Read this masterplan first, then inspect current main; do not assume old handover SHAs or branch state are current.
- Update checkboxes only when supported by a merged commit, successful CI/run, verified artifact or explicit owner decision.
- Every completed item must retain a link to its PR, commit, workflow run or approved decision.
- Work in focused branches and PRs. Do not push directly to main.
- Before a new implementation, check whether the functionality already exists on main or in an open PR.
- Do not merge on a build badge alone if live data validation or policy approval is the actual gate.
- Do not perform production accounting writes, ranking changes or cutover without explicit owner approval.
