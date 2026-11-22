# US Magic Formula Investing masterplan

**Owner:** repository owner  
**Last updated:** 22 November 2026 (fresh cohort and OTEX/GTM targeted AI cache check)  
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
| Current main baseline | `191564f18324ffed0c803e157a9809143c06b7f2` | PR #70 merged; [main build #44993883526](https://github.com/fizminho/magic-screen/actions/runs/44993883526) passed |
| Build | Passing on current main after PR #70; complete Node suite, Python policy tests, TypeScript build and Wrangler dry-run | [Main Build #44993883526](https://github.com/fizminho/magic-screen/actions/runs/44993883526) |
| Debt taxonomy discovery | Merged and deployed | [PR #55](https://github.com/fizminho/magic-screen/pull/55), [deploy #44986755869](https://github.com/fizminho/magic-screen/actions/runs/44986755869) |
| Review ledger export | Merged; read-only manual workflow | [PR #53](https://github.com/fizminho/magic-screen/pull/53) |
| Legacy reconciliation provenance | Merged and deployed; exposes row presence, stored CIK, updated_at, filed date and explicit missing accession state | [PR #57](https://github.com/fizminho/magic-screen/pull/57), [Build #44987271482](https://github.com/fizminho/magic-screen/actions/runs/44987271482), [Deploy #44987320724](https://github.com/fizminho/magic-screen/actions/runs/44987320724) |
| CI Node regression coverage | Build workflow runs all worker *.test.mjs files and lease/ROU audit test; PR #60 adds debt discovery category, filing alignment, dimensional rejection and cap tests | [PR #57](https://github.com/fizminho/magic-screen/pull/57), [PR #60](https://github.com/fizminho/magic-screen/pull/60), [Build #44988077191](https://github.com/fizminho/magic-screen/actions/runs/44988077191) |
| Lease/ROU active-universe scope | Already present on main; stale duplicate PR closed unmerged | scripts/build_lease_rou_coverage_report.mjs, .github/workflows/edgartools-bakeoff.yml; [PR #28](https://github.com/fizminho/magic-screen/pull/28) |
| Latest full-universe cohort | 30 active; 28 supported; 2 unsupported (AFMJF, EGHSF); 26 accounting/valuation review; 2 shadow eligible (IRWD, SNDK); 0 ranked (minimum eligible cohort is 5); 0 production approved | [Fresh bakeoff #44993883641](https://github.com/fizminho/magic-screen/actions/runs/44993883641), [artifact](https://github.com/fizminho/magic-screen/actions/runs/44993883641/artifacts/14742851802) |
| Latest full-universe bakeoff | 30 unique active symbols; 29 extracted records including 2 unsupported and 1 ADBE regression control; 31 evidence records ingested; all resolver, ranking, reconciliation, lease/ROU, exception queue, policy cohort and sensitivity validations passed | [Bakeoff #44993883641](https://github.com/fizminho/magic-screen/actions/runs/44993883641) |
| Prior push bakeoff | [#44993168825](https://github.com/fizminho/magic-screen/actions/runs/44993168825) passed in regression-only mode; it did not refresh the live universe | Workflow log explicitly reports `Regression-only run: skipping dynamic-universe coverage assertions` |
| Production migration | Not approved; legacy Company Facts sync still runs on the 30-minute cron | worker/index.ts, wrangler.toml |

**Fresh cohort verification:** Run [#44993883641](https://github.com/fizminho/magic-screen/actions/runs/44993883641) completed all stages successfully. The live universe contained 30 symbols; 28 providers supported, 2 unsupported; 31 raw evidence records ingested including the ADBE control. Market-cap quote date was 2026-11-20. Resolver: 25 direct EBIT candidates, 17 conventional debt candidates, 15 net-debt candidates, 11 ambiguous debt inputs and 28 review-required. Ranking preview: 2 eligible, 0 ranked, 30 excluded. Reconciliation: 27 period-matched, 0 period-mismatched, 27 partial input comparisons with zero differences, but 0 fully comparable EV/EY/ROC rows because legacy debt is missing for all 28 supported issuers. All production immutability flags were false for writes/changes.

## Priority plan

### P0. Establish a clean, auditable project baseline

- [x] Review main branch, latest commits, open PRs, workflows and implementation docs.
- [x] Merge PR #55 after its build check passed; issuer-specific taxonomies now participate in read-only debt/financing discovery.
- [x] Verify PR #55 deployment succeeded; production fundamentals and rankings remain outside the shadow route.
- [x] Merge PR #53 after its build check passed; read-only audit-ledger export workflow is available.
- [x] Verify lease/ROU audit active-universe filtering and regression test already exist on main.
- [x] Close stale PR #28 unmerged because its intended change is already present on main.
- [x] Create this masterplan as the authoritative execution checklist.
- [x] Run the read-only ledger export after the ALEC/BCRX targeted batch and inspect the artifact: 149 history rows, 28 issuers, 143 rows with evidence IDs (379 occurrences), 6 without IDs, zero decisions; [Export #44993168923](https://github.com/fizminho/magic-screen/actions/runs/44993168923), [artifact](https://github.com/fizminho/magic-screen/actions/runs/44993168923/artifacts/14741769525).
- [x] Reconcile stale or conflicting docs against this plan and the current code (README, legacy SEC note, EdgarTools provider note, completion plan, implementation status and agent handover now point to this masterplan).

### P1. Refresh evidence for the current active cohort

- [x] Run EdgarTools fundamentals bakeoff with blank ticker override so it resolves the live active US MFI universe via the documented `[full-universe]` main-push trigger; [PR #62](https://github.com/fizminho/magic-screen/pull/62), [run #44989926114](https://github.com/fizminho/magic-screen/actions/runs/44989926114).
- [x] Confirm live active-universe discovery, matching market-cap snapshot/quote date, annual filing extraction and raw evidence ingestion; 30 active issuers, 31 ingested records including ADBE regression control; [Bakeoff #44989926114](https://github.com/fizminho/magic-screen/actions/runs/44989926114).
- [x] Confirm full-universe extraction/ingestion validators, lease/ROU coverage audit, accounting exception queue, policy cohort assessment and ranking sensitivity report all complete; all stages passed in [run #44989926114](https://github.com/fizminho/magic-screen/actions/runs/44989926114).
- [x] Confirm the run explicitly reports production_fundamentals_changed=false, rankings_changed=false and production_write=false.
- [x] Record run ID, active symbols, supported/unsupported counts and artifact links in implementation status.
- [x] Distinguish regression-only push runs from full-universe validation in README and masterplan; the run stages are explicitly checked before acceptance.

### P1. Build one issuer-level human review queue

- [x] Run the read-only Gemini review ledger export using the controlled `[ledger-export]` main-push trigger and inspect its artifact; [PR #63](https://github.com/fizminho/magic-screen/pull/63), [run #44990205149](https://github.com/fizminho/magic-screen/actions/runs/44990205149).
- [x] Reconcile exported history by issuer, task, accession, evidence IDs, cache key and input hash. All 139 accessions match the current extracted filing for that issuer; 139 unique history IDs/cache keys/input hashes; no duplicate keys.
- [x] Deduplicate completed/cached reviews; the export contains no duplicate cache keys or input hashes. Do not resend unchanged evidence.
- [x] Separate deterministic missing facts, conflicting evidence, policy decisions and unsupported-provider cases in the full-universe accounting exception queue; 9 P1, 10 P2, 11 P3.
- [x] Rank the first human-review tranche by impact on denominator distortion, debt/EV scope, EBIT reconstruction and cash/NCI/lease policy; see the current P1 order below.
- [ ] Record each human decision with rationale, source evidence and reviewer; do not convert a Gemini candidate into an approval automatically.

### P1. Close deterministic accounting and issuer evidence gaps

- [x] Add automated regression coverage for issuer-specific royalty, other financing, lease and convertible categories, accession/period/dimension rejection, and deterministic 120-concept cap; [PR #60](https://github.com/fizminho/magic-screen/pull/60), [CI #44988077191](https://github.com/fizminho/magic-screen/actions/runs/44988077191).
- [x] Validate live issuer evidence: BCRX has USD 465.688m separate royalty financing, USD 2.753m finance leases and a zero secured term-loan line; current conventional debt remains unknown. IRWD has USD 199.680m current convertible notes plus USD 385m revolver (USD 584.680m total) supported by its filing note. The legacy Company Facts shadow categorizes convertibles separately, so reconcile that category with the filing-based conventional-debt treatment under the owner-approved policy.
- [x] Inspect OTEX filing evidence: USD 5,770.369m current/noncurrent carrying value reconciles to the debt note after USD 66.156m unamortized discounts and issuance costs; leases, restricted cash, investments and NCI remain separate policy questions.
- [x] Explain UPWK debt: USD 360.998m principal less USD 1.228m unamortized issuance costs equals USD 359.770m current carrying value; noncurrent debt is explicitly zero. Keep USD 378.425m marketable securities separate and exclude restricted/customer escrow from unrestricted cash.
- [x] Extend the debt shadow endpoint with legacy row presence, status, source, updated_at, fiscal period, filed date and CIK mapping update time; [PR #61](https://github.com/fizminho/magic-screen/pull/61).
- [x] Explain BMBL legacy debt discrepancy: legacy row exists but status is missing_required_facts, with total_debt=null; it matches FY2025 period/filed date and its EBIT, invested capital and cash match the EdgarTools preview. The accession is not stored on the legacy row; the current EdgarTools accession 0001830043-26-000027 supports USD 588.465m conventional debt. This is an unpopulated legacy field, not a difference in the newly extracted debt candidate.
- [ ] Review remaining issuer-specific debt, financing, lease, NCI, cash and EBIT exceptions using the prioritised queue.
- [ ] Keep royalty financing, convertibles, sale-leaseback, securitisation, customer financing, tax receivable agreements and contingent consideration separately classified pending policy.
- [ ] Keep unsupported issuers visible; do not silently drop or replace them.

### Current P1 human-review order (from full-universe run #44989926114)

These are review priorities, not accounting approvals or ranking recommendations. The ordering reflects potential distortion to EY/ROC and unresolved EV scope.

| Order | Issuer | Main blocker to resolve first |
|---:|---|---|
| 1 | OTEX | Candidate invested capital is only USD 16.745m against USD 1,082.597m EBIT, producing an extreme 64.65x ROC candidate; investigate near-zero/negative-working-capital offset before any ranking use. Debt carrying value reconciles. |
| 2 | GTM | Non-positive invested capital and a separately identified USD 2.7319bn tax receivable agreement liability; resolve denominator and financing scope. |
| 3 | SGHC | IFRS operating-profit reconstruction plus incomplete/ambiguous current debt and on-demand loans; resolve filing presentation and debt maturity buckets. |
| 4 | PBI | USD 341.680m filing-specific EBIT bridge includes finance interest allocated to cost of financing; invested capital unresolved. |
| 5 | HPQ | USD 9.666bn debt candidate but unrestricted cash unresolved; non-positive/negative-working-capital invested-capital risk. |
| 6 | SSTK | Non-positive/near-zero invested-capital risk and USD 94.163m contributor royalties payable separately classified from conventional debt. |
| 7 | XPOF | Invested-capital denominator and unrestricted cash unresolved; NCI and lease scope also require review. |
| 8 | HRMY | Invested-capital denominator unresolved despite direct EBIT and debt candidates. |
| 9 | HRB | USD 907.686m EBIT reconstructed from reported revenue less operating expenses and independently reconciled to pretax; manual approval and lease/IC scope remain. |

The two currently shadow-eligible issuers are IRWD and SNDK, but no ranks are produced because the eligible cohort is below the minimum of five. Do not lower the minimum to force a ranking.

### P1 ledger evidence gap

- [x] Export and inspect the latest ledger: 149 history rows across 28 issuers; 98 ACCEPTED_CANDIDATE, 34 REVIEW_REQUIRED, 10 CONFLICTING_EVIDENCE, 5 INSUFFICIENT_EVIDENCE and 2 NOT_APPLICABLE; zero human decisions are recorded. [Export #44993168923](https://github.com/fizminho/magic-screen/actions/runs/44993168923).
- [x] Include evidence IDs in review history API metadata without exposing raw response JSON; [PR #64](https://github.com/fizminho/magic-screen/pull/64), [CI #44990410412](https://github.com/fizminho/magic-screen/actions/runs/44990410412).
- [x] After PR #64 deployment and the targeted ALEC/BCRX review, rerun the ledger export and reconcile evidence IDs; [PR #64](https://github.com/fizminho/magic-screen/pull/64), [targeted batch #44991281916](https://github.com/fizminho/magic-screen/actions/runs/44991281916), [export #44993168923](https://github.com/fizminho/magic-screen/actions/runs/44993168923). 143/149 rows contain one or more evidence IDs (379 ID occurrences); six rows have none (3 INSUFFICIENT_EVIDENCE, 2 NOT_APPLICABLE, 1 ACCEPTED_CANDIDATE).

### Evidence-linked review coverage gaps

- [x] All 139 exported history rows carry a filing accession that matches the current EdgarTools extraction for that issuer.
- [x] Evidence IDs are exposed for 133 rows (347 ID occurrences); six rows have no IDs: STRA debt_scope, SBC financing_scope, QTTB nci_scope, IRWD financing_scope, HRMY financing_scope and GTM financing_scope. The latter three are ACCEPTED_CANDIDATE/NOT_APPLICABLE records with no supporting evidence IDs in the normalized response; do not infer approval from the status.
- [x] Run the guarded targeted review batch for ALEC and BCRX after [PR #67](https://github.com/fizminho/magic-screen/pull/67); [run #44991281916](https://github.com/fizminho/magic-screen/actions/runs/44991281916). The run processed exactly two symbols, excluded full_scope, capped each Worker page at two new calls and stopped within 15 minutes; cached evidence was reused. Both issuers now have five task-history rows each under their current filing accessions. ADBE remains only the regression control; AFMJF and EGHSF remain provider-unsupported.
- [ ] Record human decisions only after an analyst reviews the cited filing evidence; the latest ledger still has zero decisions. ALEC has four ACCEPTED_CANDIDATE tasks and EBIT REVIEW_REQUIRED. BCRX has cash/lease ACCEPTED_CANDIDATE, debt INSUFFICIENT_EVIDENCE, and financing/invested-capital REVIEW_REQUIRED. AI statuses are not human approvals.

### P1 Gemini task-status overlay (AI status is not approval)

| Issuer | Tasks still flagged by Gemini |
|---|---|
| SGHC | debt, EBIT, invested capital, lease |
| GTM | EBIT review; invested capital conflicting evidence |
| OTEX | EBIT, NCI |
| HPQ | cash, lease |
| HRB | EBIT, financing |
| XPOF | cash, EBIT |
| PBI | No Gemini task flagged, but filing-specific EBIT and invested-capital policy review remain open |
| SSTK | No Gemini task flagged, but negative/near-zero invested-capital and contributor-royalty scope remain open |
| HRMY | No Gemini task flagged, but invested-capital denominator remains unresolved |

Gemini ACCEPTED_CANDIDATE only means the task's evidence was accepted as a candidate. It is not human approval, policy approval or production eligibility.

Targeted post-refresh check [#44994448916](https://github.com/fizminho/magic-screen/actions/runs/44994448916) processed exactly OTEX and GTM and completed successfully: 10 cached task completions, 5 review-required statuses, 4 deterministic skips, 0 failures and 0 pending. Every task was served from existing cache; no new Gemini calls or history rows were created. OTEX still has EBIT and NCI REVIEW_REQUIRED. GTM still has EBIT REVIEW_REQUIRED and invested-capital CONFLICTING_EVIDENCE. This confirms the blockers are unchanged and must not be represented as new sign-off.
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
- [x] Add read-only legacy row provenance to reconciliation diagnostics. The preview now exposes row presence, stored CIK, updated_at, filed date and explicitly unavailable accession; [PR #57](https://github.com/fizminho/magic-screen/pull/57).
- [ ] Reconcile each overlapping issuer/input on same period, currency, scope and unit.
- [ ] Explain mismatches and non-comparable rows; do not equate missing legacy debt with zero.
- [ ] Define an approved shadow-to-production mapping and migration compatibility contract.
- [ ] Preserve legacy path until the replacement is validated and rollback is tested.

### P2. Engineering quality and documentation

- [x] Add a complete Node test sweep to CI (all worker *.test.mjs files plus the lease/ROU audit test); [PR #57](https://github.com/fizminho/magic-screen/pull/57), latest [Build #44990205110](https://github.com/fizminho/magic-screen/actions/runs/44990205110).
- [x] Keep Python syntax/unit checks, TypeScript build and Wrangler dry-run in required CI; verified in latest [Build #44990205110](https://github.com/fizminho/magic-screen/actions/runs/44990205110).
- [x] Add tests for debt taxonomy discovery categories, dimension rejection, filing alignment and deterministic 120-concept discovery cap; [PR #60](https://github.com/fizminho/magic-screen/pull/60), [CI #44988077191](https://github.com/fizminho/magic-screen/actions/runs/44988077191).
- [ ] Ensure workflow outputs distinguish regression-only, targeted and full-universe modes.
- [x] Consolidate agent handovers and implementation status around this masterplan.
- [x] Correct README cron cadence and clearly distinguish the legacy Company Facts runtime from the EdgarTools evidence lane; [PR #56](https://github.com/fizminho/magic-screen/pull/56).
- [x] Remove stale branch-specific agent instructions and point handovers to this plan. The ranking tie-method difference remains explicitly documented as an unresolved owner decision, not silently changed.
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

1. **Owner policy gate:** obtain explicit decisions on EBIT/exceptional items, invested capital and negative-denominator handling, conventional debt and other financing obligations, lease/ROU symmetry, unrestricted cash and marketable securities, NCI, ranking ties/minimum cohort and quote staleness. Evidence-backed proposals are in the [cohort policy matrix](US_MFI_COHORT_ACCOUNTING_POLICY_MATRIX_2026-11-21.md) and [lease/cash recommendation](US_MFI_LEASE_CASH_POLICY_RECOMMENDATION_2026-11-22.md); neither is an approval.
2. **P1 issuer sign-off:** continue in priority order OTEX, GTM, SGHC, PBI, HPQ, SSTK, XPOF, HRMY and HRB. Preserve the accession-bound worksheets; record decisions only against exact accession, task, cache key/input hash and evidence IDs. Current ledger still has zero human decisions.
3. **Deterministic financing validation:** complete BCRX, IRWD, OTEX and UPWK debt/financing classification, including BCRX's unknown conventional debt and separate royalty financing.
4. **Legacy reconciliation:** explain the legacy gap before any migration. Fresh run #44993883641 found 27 period-matched partial input comparisons with zero differences, but no full EV/EY/ROC comparisons because legacy total debt is absent for all 28 supported issuers.
5. Complete staging/rollback only after policy approval and complete same-period reconciliation. Production cutover remains blocked until explicit owner approval.

## Change-control rules for future agents

- Read this masterplan first, then inspect current main; do not assume old handover SHAs or branch state are current.
- Update checkboxes only when supported by a merged commit, successful CI/run, verified artifact or explicit owner decision.
- Every completed item must retain a link to its PR, commit, workflow run or approved decision.
- Work in focused branches and PRs. Do not push directly to main.
- Before a new implementation, check whether the functionality already exists on main or in an open PR.
- Do not merge on a build badge alone if live data validation or policy approval is the actual gate.
- Do not perform production accounting writes, ranking changes or cutover without explicit owner approval.
