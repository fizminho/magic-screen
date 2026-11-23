# US Magic Formula Investing masterplan

**Owner:** repository owner  
**Last updated:** 24 November 2026 (personal-use Shariah-first workflow pivot)  
**Repository:** fizminho/magic-screen  
**Status:** Active plan; new screening direction approved, implementation gates remain  
**Source of truth:** This document governs implementation order, completion tracking and release gates. Older handovers and status snapshots are historical unless explicitly linked here.

## Strategic direction (24 November 2026)

The owner has chosen a lower-effort, personal-use workflow. The immediate objective is no longer to replace the MFI source or finish the full accounting-policy engine before producing a useful shortlist. Keep the existing MFI ticker universe as the starting point, apply a Shariah eligibility filter, then manually validate the remaining candidates against Investing Paths and display the verified results in InvestLah.

This is a workflow decision, not authorization to change production data or rankings. The current production screener remains unchanged until the implementation is separately reviewed and approved.

### Target workflow

1. **Ticker universe — Magic Formula Investing (MFI)**
   - Continue obtaining the US ticker universe from the existing MFI source/integration.
   - Preserve source URL, retrieval timestamp and source snapshot/version where available.
   - Do not substitute the EdgarTools/accounting shadow cohort for the MFI universe.

2. **Shariah eligibility — Musaffa and HalalScreener**
   - Check each MFI ticker against the selected Shariah sources.
   - Only confirmed **Halal** tickers proceed to the active candidate shortlist.
   - **Doubtful**, **Not Halal**, **No Data**, stale results and conflicting source results do not pass the filter. Keep them visible in a separate excluded/review state with source, checked date and reason.
   - Do not silently treat missing data or stale status as Halal.
   - Keep source-specific statuses; do not invent a combined ruling. If the two sources disagree, flag for manual review rather than auto-passing.
   - No API, bulk collection or automated access is assumed to be permitted. Use only access methods and data use allowed by each provider's current terms.

3. **Ranking validation — Investing Paths**
   - Manually open Investing Paths for each Shariah-passing ticker and verify the displayed ranking/details.
   - Record only the fields actually visible and checked, such as rank, Earnings Yield, Return on Capital, fiscal year/period and checked date.
   - Record a direct source reference and a manual verification marker. A missing ticker means **Not Found / Not Checked**, not an inferred rank or an assumption that it is unranked.
   - Do not scrape, crawl, bulk-download, automate browser access, bypass controls/rate limits, or use an intermediary AI to collect Investing Paths data. The prior ToS review found restrictions on automated collection and use of calculated outputs to build a competing product. Personal use does not itself waive those restrictions. Seek written permission before any automated or systematic reuse beyond what the site's terms allow.

4. **InvestLah screener**
   - Present the MFI universe, Shariah status by source, eligibility decision, manual Investing Paths validation and verification date.
   - Clearly distinguish source facts, manual observations, stale/missing data and unverified candidates.
   - Keep a visible audit trail so a user can tell why a ticker passed or was excluded.
   - This is a personal-use tool. Do not expose the resulting data as a public feed, paid service or competing commercial product without reviewing source licenses and obtaining required permissions.

### Gemini and Google policy guardrails

- Do **not** use Gemini API, URL Context, Google Search Grounding, browser automation or another AI agent to visit Investing Paths and collect rankings automatically under the current plan.
- Google Search Grounding is not to be used as a mechanism to collect URLs/content for a separate dataset or screening index. AI assistance does not remove the source website's restrictions.
- Gemini may be used only as a drafting/analysis assistant for content the owner manually provides (for example, text or screenshots already lawfully accessed), and only where the selected Gemini product/account terms permit that use.
- No Gemini API integration is approved in this phase. Do not send private credentials, API keys, account data or sensitive information to prompts.
- Before any future Gemini API use, re-check the then-current Gemini API terms, prohibited-use policy, data-use/retention terms, billing tier and account eligibility. Do not assume a free-tier key is suitable for every personal application or that compliance guarantees uninterrupted access. Never evade enforcement, quotas or access restrictions.
- Keep API keys server-side and out of source control if a future approved integration is considered.

### Scope reduction and treatment of the accounting engine

- Pause new expansion of the P1/P2/P3 accounting-policy and issuer-review work unless a specific task is needed to maintain existing functionality or the owner explicitly resumes it.
- Do not delete the existing EdgarTools evidence lane, policy research, review ledger, tests or historical artifacts. They remain useful research and a possible future independent validation path.
- Do not use the accounting shadow output to override the MFI ticker universe or the Shariah filter.
- Existing production fundamentals, rankings, cron jobs, database records and workflows remain unchanged until a separately approved implementation and release plan is completed.
- No production cutover, destructive cleanup, schema migration or source replacement is authorized by this strategy update.

### Gates for the new workflow

| Gate | Requirement | Current status |
|---|---|---|
| A. Source universe | Confirm current MFI ticker retrieval and provenance | Existing source retained; implementation review pending |
| B. Shariah filter | Define source status mapping, freshness and conflict handling | Design approved; implementation pending |
| C. Investing Paths validation | Manual-only validation with auditable observations | Approved approach; implementation pending |
| D. Screener presentation | Display eligible shortlist and validation provenance | Not started |
| E. Gemini | No automated Investing Paths collection; manual-input assistance only if terms allow | API integration not approved |
| F. Release | Tests, review, rollback and explicit owner approval | Not approved |

## Executive objective

Maintain the existing US MFI ticker source and build a transparent personal-use screening workflow that narrows the universe to Shariah-passing candidates, then records manual Investing Paths ranking validation. The prior filing-backed accounting/valuation engine remains a separate read-only research lane and is not a prerequisite for the new shortlist. Existing production fundamentals and rankings must remain unchanged until a separately approved release.

## Non-negotiable guardrails

- [x] No production accounting policy or numeric ranking changes without explicit owner approval.
- [x] Missing inputs remain unknown, never zero.
- [x] SEC facts/evidence must match filing accession, fiscal period, unit, currency and consolidated scope.
- [x] Dimensional breakdowns are not added to consolidated totals.
- [x] EdgarTools evidence ingestion and preview are read-only with respect to production fundamentals and rankings.
- [x] Gemini is not used to automate collection from Investing Paths; any future use must first pass current Google terms and source-site permission review.
- [x] Manual Investing Paths validation is the approved interim approach.
- [x] Only confirmed Halal candidates pass the Shariah filter; stale, missing, doubtful or conflicting results are not auto-approved.
- [x] Personal-use scope only; no public/commercial redistribution or competing service without required permissions.
- [x] Bursa/Malaysia behaviour remains outside this US workflow.
- [ ] Production cutover requires a tested rollback and explicit owner approval.

## Current verified baseline

| Area | Verified state | Evidence |
|---|---|---|
| Current main baseline | `191564f18324ffed0c803e157a9809143c06b7f2` | PR #70 merged; [main build #44993883526](https://github.com/fizminho/magic-screen/actions/runs/44993883526) passed |
| Build | Passing on current main after PR #70; complete Node suite, Python policy tests, TypeScript build and Wrangler dry-run | [Main Build #44993883526](https://github.com/fizminho/magic-screen/actions/runs/44993883526) |
| Debt taxonomy discovery | Merged and deployed | [PR #55](https://github.com/fizminho/magic-screen/pull/55), [deploy #44986755869](https://github.com/fizminho/magic-screen/actions/runs/44986755869) |
| Review ledger export | Merged; read-only manual workflow | [PR #53](https://github.com/fizminho/magic-screen/pull/53) |
| Legacy reconciliation provenance | Merged and deployed; exposes row presence, stored CIK, updated_at, filed date and explicit missing accession state | [PR #57](https://github.com/fizminho/magic-screen/pull/57), [Build #44987271482](https://github.com/fizminho/magic-screen/actions/runs/44987271482), [Deploy #44987320724](https://github.com/fizminho/magic-screen/actions/runs/44987320724) |
| CI Node regression coverage | Build workflow runs all worker *.test.mjs files and lease/ROU audit test; PR #60 adds debt discovery category, filing alignment, dimensional rejection and cap tests | [PR #57](https://github.com/fizminho/magic-screen/pull/57), [PR #60](https://github.com/fizminho/magic-screen/pull/60), [Build #44988077191](https://github.com/actions/runs/44988077191) |
| Lease/ROU active-universe scope | Already present on main; stale duplicate PR closed unmerged | scripts/build_lease_rou_coverage_report.mjs, .github/workflows/edgartools-bakeoff.yml; [PR #28](https://github.com/fizminho/magic-screen/pull/28) |
| Latest full-universe cohort | 30 active; 28 supported; 2 unsupported (AFMJF, EGHSF); 26 accounting/valuation review; 2 shadow eligible (IRWD, SNDK); 0 ranked (minimum eligible cohort is 5); 0 production approved | [Fresh bakeoff #44993883641](https://github.com/fizminho/magic-screen/actions/runs/44993883641), [artifact](https://github.com/fizminho/magic-screen/actions/runs/44993883641/artifacts/14742851802) |
| Latest full-universe bakeoff | 30 unique active symbols; 29 extracted records including 2 unsupported and 1 ADBE regression control; 31 evidence records ingested; all resolver, ranking, reconciliation, lease/ROU, exception queue, policy cohort and sensitivity validations passed | [Bakeoff #44993883641](https://github.com/fizminho/magic-screen/actions/runs/44993883641) |
| Prior push bakeoff | [#44993168825](https://github.com/fizminho/magic-screen/actions/runs/44993168825) passed in regression-only mode; it did not refresh the live universe | Workflow log explicitly reports `Regression-only run: skipping dynamic-universe coverage assertions` |
| Production migration | Not approved; legacy Company Facts sync still runs on the 30-minute cron | worker/index.ts, wrangler.toml |

**Fresh cohort verification:** Run [#44993883641](https://github.com/fizminho/magic-screen/actions/runs/44993883641) completed all stages successfully. The live universe contained 30 symbols; 28 providers supported, 2 unsupported; 31 raw evidence records ingested including the ADBE control. Market-cap quote date was 2026-11-20. Resolver: 25 direct EBIT candidates, 17 conventional debt candidates, 15 net-debt candidates, 11 ambiguous debt inputs and 28 review-required. Ranking preview: 2 eligible, 0 ranked, 30 excluded. Reconciliation: 27 period-matched, 0 period-mismatched, 27 partial input comparisons with zero differences, but 0 fully comparable EV/EY/ROC rows because legacy debt is missing for all 28 supported issuers. All production immutability flags were false for writes/changes.

## Priority plan

### P0. Preserve production and establish the new workflow boundary

- [x] Record the owner-approved personal-use, Shariah-first direction.
- [x] Retain MFI as the source of the ticker universe.
- [x] Make manual Investing Paths validation the interim approved approach.
- [x] Block Gemini/API/browser automation for Investing Paths collection unless both Google terms and source-site permissions are re-reviewed and allow it.
- [ ] Inspect the current MFI ingestion path and identify the smallest safe reuse point; do not alter its behaviour yet.
- [ ] Inspect existing Shariah status data/source integrations and document freshness, source provenance and missing/conflict behaviour.
- [ ] Confirm how manual Investing Paths observations can be stored without scraping or changing production ranking fields.

### P1. Implement Shariah-first shortlist (separate from production ranking)

- [ ] Define explicit status mapping for Musaffa and HalalScreener: Halal, Doubtful, Not Halal, No Data, stale and source conflict.
- [ ] Pass only confirmed Halal tickers to the active candidate shortlist; keep all other statuses visible in a separate excluded/review list.
- [ ] Preserve each provider's individual result, checked timestamp and source reference; do not collapse conflicting results into a false consensus.
- [ ] Add tests for missing, stale, conflicting and non-Halal statuses.
- [ ] Do not assume automated API or bulk access is permitted; verify current provider terms and available permissions before implementing integrations.

### P1. Manual Investing Paths validation

- [ ] Create a small manual validation record for each Shariah-passing ticker.
- [ ] Capture rank, EY, ROC, fiscal period and checked date only when actually observed.
- [ ] Support Not Checked, Not Found, Verified and Needs Recheck states; never infer ranking from absence in a partial page view.
- [ ] Keep a source URL/reference and an audit trail for who/when verified the observation.
- [ ] Do not implement scraping, crawling, automated browser access, proxy/rate-limit evasion or AI-mediated collection.

### P2. Screener UX and release

- [ ] Present MFI ticker, source provenance, Shariah statuses by provider, eligibility decision and manual Investing Paths validation.
- [ ] Make excluded/review states explainable; avoid silently hiding unknown or stale statuses.
- [ ] Keep the legacy accounting/valuation lane separate and label it as research/shadow only.
- [ ] Add tests for eligibility filtering, provenance, stale data and manual-validation states.
- [ ] Run CI and verify that production fundamentals, rankings, cron and database records are unchanged.
- [ ] Release only after explicit owner approval and a rollback plan.

### P2. Accounting research lane (paused)

The detailed P1/P2/P3 issuer and accounting work below is retained as historical research and a possible future validation lane. New work is paused unless required to preserve existing behaviour or explicitly resumed by the owner. The detailed checklists below are not prerequisites for the Shariah-first shortlist.

- [ ] Resume issuer-specific accounting review only with explicit owner direction.
- [ ] Resume cohort-wide accounting policy approval only if the owner chooses to reactivate the accounting ranking route.
- [ ] Do not migrate accounting shadow values into production under this plan.

## Historical accounting-engine work and evidence

The sections below preserve the prior work log and technical evidence. They remain useful context but do not supersede the strategic direction and priority sequence above.

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

### P1. Approve a single cohort-wide accounting policy (paused)

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

### P1. Reconcile legacy Company Facts against EdgarTools (paused)

- [ ] Confirm current legacy sync behaviour, cron cadence, production write fields and retry semantics.
- [x] Add read-only legacy row provenance to reconciliation diagnostics. The preview now exposes row presence, stored CIK, updated_at, filed date and explicitly unavailable accession; [PR #57](https://github.com/fizminho/magic-screen/pull/57).
- [ ] Reconcile each overlapping issuer/input on same period, currency, scope and unit.
- [ ] Explain mismatches and non-comparable rows; do not equate missing legacy debt with zero.
- [ ] Define an approved shadow-to-production mapping and migration compatibility contract.
- [ ] Preserve legacy path until the replacement is validated and rollback is tested.

## Historical engineering quality and release notes

- [x] Add a complete Node test sweep to CI (all worker *.test.mjs files plus the lease/ROU audit test); [PR #57](https://github.com/fizminho/magic-screen/pull/57), latest [Build #44990205110](https://github.com/fizminho/magic-screen/actions/runs/44990205110).
- [x] Keep Python syntax/unit checks, TypeScript build and Wrangler dry-run in required CI; verified in latest [Build #44990205110](https://github.com/fizminho/magic-screen/actions/runs/44990205110).
- [x] Add tests for debt taxonomy discovery categories, dimension rejection, filing alignment and deterministic 120-concept discovery cap; [PR #60](https://github.com/fizminho/magic-screen/pull/60), [CI #44988077191](https://github.com/fizminho/magic-screen/actions/runs/44988077191).
- [ ] Ensure workflow outputs distinguish regression-only, targeted and full-universe modes.
- [x] Consolidate agent handovers and implementation status around this masterplan.
- [x] Correct README cron cadence and clearly distinguish the legacy Company Facts runtime from the EdgarTools evidence lane; [PR #56](https://github.com/fizminho/magic-screen/pull/56).
- [x] Remove stale branch-specific agent instructions and point handovers to this plan. The ranking tie-method difference remains explicitly documented as an unresolved owner decision, not silently changed.
- [ ] Keep dated issuer research notes as evidence records; do not duplicate their full content into this plan.

## Next implementation sequence

1. Inspect the current MFI ticker ingestion and existing Shariah data paths; identify reuse points without changing production behaviour.
2. Implement and test the Shariah-first candidate filter with source-specific statuses, freshness and conflict handling.
3. Add a manual Investing Paths verification workflow and audit record. No automated collection.
4. Update the screener UI to show eligible candidates and excluded/review states with provenance.
5. Run CI and verify production fundamentals, rankings, scheduled jobs and database state are unchanged. Request explicit owner approval before release.
6. Keep the accounting-policy and EdgarTools production migration work paused unless the owner explicitly resumes it.

## Change-control rules for future agents

- Read this masterplan first, then inspect current main; do not assume old handover SHAs or branch state are current.
- Update checkboxes only when supported by a merged commit, successful CI/run, verified artifact or explicit owner decision.
- Every completed item must retain a link to its PR, commit, workflow run or approved decision.
- Work in focused branches and PRs. Do not push directly to main.
- Before a new implementation, check whether the functionality already exists on main or in an open PR.
- Do not merge on a build badge alone if live data validation or policy approval is the actual gate.
- Do not perform production accounting writes, ranking changes or cutover without explicit owner approval.
- Do not add automated access to third-party ranking sites without reviewing current terms and obtaining any required permission.
