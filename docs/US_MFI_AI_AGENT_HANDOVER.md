# US Magic Formula Investing: Agent Handover (Current)

**Last refreshed:** 22 November 2026  
**Repository:** `fizminho/magic-screen`  
**Scope:** US equities only. Bursa Malaysia is explicitly deferred.  
**Worker:** `https://magic-screen.96muhdhafiz.workers.dev`  
**Runtime:** Cloudflare Workers (TypeScript), D1, GitHub Actions  
**Extraction:** EdgarTools 6.3.0, annual SEC filings only  
**Accounting judgement:** Gemini, only for genuinely ambiguous filing interpretation  
**Production status:** NOT APPROVED. Production fundamentals, ratios, eligibility and rankings must remain unchanged.

> This file supersedes older agent-handover instructions where they conflict. It is the current execution brief. Do not restart completed work or rebuild existing integrations.

---

## 1. Mission and operating rules

Complete the US Magic Formula Investing pipeline to production-readiness, with auditable annual filing evidence, deterministic accounting resolution, controlled AI-assisted review, independently validated shadow rankings and a safe eventual cutover.

The user wants an autonomous implementation agent to continue from the current repository state, make tested changes, and report concrete results. Do not return another generic plan instead of doing the work.

Non-negotiable:
1. **No production writes or cutover** without explicit user approval.
2. Missing inputs are unknown, never zero.
3. Extraction success, Gemini completion, resolver acceptance and shadow eligibility are different states. None alone means accounting approval.
4. Keep unsupported issuers visible. No silent drops and no unapproved provider fallback.
5. Annual 10-K / 20-F / 40-F only for annual MFI metrics. Do not mix interim filings or periods.
6. Preserve accession, fiscal-period, unit, currency, dimension and evidence provenance.
7. Never add dimensional facts to consolidated totals.
8. Deterministic code owns arithmetic and known mappings. Gemini is only for unresolved semantic/accounting judgement.
9. Do not resend unchanged evidence/task/prompt/policy/model requests. Reuse the D1 cache and in-flight locks.
10. Keep Bursa/Malaysia behaviour out of US MFI changes.
11. Check external repository licences before reuse.
12. Use consolidated, reviewable PRs. Run tests, build and Wrangler dry-run. Verify results rather than claiming them.

## 2. Current architecture (already implemented)

- Existing MFI.com screener integration remains the US candidate-universe source. It selects the configured top 30 / minimum market cap $50m cohort; it is not the entire US-listed market and its row order is not a Magic Formula ranking.
- Source-aware US universe membership is implemented (PR #41). MFI membership and frontend/manual membership are independent. One source must not deactivate another source's membership. Do not redo this work without finding a regression.
- GitHub Actions refreshes the universe, extracts annual SEC filings with EdgarTools and posts raw evidence to the authenticated Worker.
- Worker D1 stores raw evidence; deterministic resolver creates accession-bound candidate inputs.
- Gemini review queue handles only unresolved accounting questions.
- Resolver and ranking previews are read-only shadow paths.
- Legacy Company Facts production path remains active. Do not remove or redirect it yet.

Key routes (verify current code before changing):
- `GET /api/mfi/screen`
- `GET /api/stocks?market=US`
- `GET /api/fundamentals/edgartools/universe`
- `POST /api/fundamentals/edgartools/ingest`
- `GET /api/fundamentals/edgartools/status`
- `GET /api/fundamentals/edgartools/resolve-preview`
- `GET /api/fundamentals/edgartools/ranking-preview`
- `GET /api/fundamentals/edgartools/ranking-preview/public`
- `GET|POST /api/fundamentals/edgartools/ai-review`
- `GET|POST /api/fundamentals/edgartools/ai-review/batch`
- `GET /api/fundamentals/edgartools/ai-review/history`
- `GET|POST /api/fundamentals/edgartools/ai-review/decisions` (proposed in open PR #47; not yet confirmed merged/deployed)
- Legacy `POST /api/ai/fundamentals/extract` returns 410. Do not revive it.

## 3. Verified implementation and latest baseline

### Merged work
- PR #41: source-aware US universe, Gemini batch foundation, classic shadow ranking and related tests/docs.
- PR #42: Node 22 in Worker deploy workflow.
- PR #43: remove duplicate evidence candidate fields.
- PR #44: initialize D1 schema in preview routes.
- PR #45: full-universe live validation documentation.
- PR #46: optional ticker targeting for Gemini batch and correct dry-run issuer PENDING status.
- PR #40: initial agent handover.
- Latest known successful Worker deploy after PR #46: workflow run https://github.com/fizminho/magic-screen/actions/runs/44939924187
- Latest known successful build after PR #46: https://github.com/fizminho/magic-screen/actions/runs/44939924206

### Full-universe extraction / resolver bakeoff
Run: https://github.com/fizminho/magic-screen/actions/runs/44938236912  
Artifact ID: `14720492526` (the user/agent may need to download it again; do not assume a local file exists in a different agent session).

Verified results:
- Active universe: 30 issuers. ADBE was an additional regression control, not an active-universe member.
- Extraction/ingest: 31 received, 31 ingested; 28 supported active issuers, 2 explicitly unsupported (AFMJF, EGHSF), 0 awaiting evidence.
- Ingestion changed raw evidence only: `production_fundamentals_changed=false`, `rankings_changed=false`.
- Resolver: 30 active; 28 supported; 2 unsupported; 0 awaiting evidence; 25 direct EBIT candidates; 17 conventional-debt candidates; 15 net-debt candidates; 11 ambiguous debt inputs; 28 issuers require review.
- The accounting queue contained 30 issuers, 0 production-approved; 2 preview-eligible, with the rest blocked/review. Cash policy unresolved for 18. Balance-sheet reconciliation available for 28.
- Shadow ranking preview in this later bakeoff: 2 eligible, 0 ranked because the minimum eligible cohort is 5. This is the more recent baseline than older completion-plan snapshots claiming 5 ranked. Recompute from the latest artifact/live endpoint before relying on it.
- No production fundamentals, ratios, eligibility or rankings changed.

### Gemini full-universe batch
Latest inspected run: https://github.com/fizminho/magic-screen/actions/runs/44975519608  
Job: https://github.com/fizminho/magic-screen/actions/runs/44975519608/job/137064431168

The job processed all 30 active issuers (cursor reached ZVRA). Stock-level roll-up:
- 9 COMPLETED
- 18 REVIEW_REQUIRED
- 1 FAILED (BCRX)
- 2 UNSUPPORTED (AFMJF, EGHSF)
- 0 PENDING

Task-level totals from that run (not stock counts):
- COMPLETED 169
- REVIEW_REQUIRED 63
- FAILED 2
- SKIPPED_DETERMINISTIC 85
- UNSUPPORTED 2
- PENDING / PROCESSING / PENDING_RETRY / QUOTA_EXHAUSTED / AWAITING_EVIDENCE all 0

BCRX remains failed at `debt_scope`. Do not confuse two failed task records with two failed stocks. The runner exits non-zero if any task is FAILED, even when the universe is fully processed. This is an exit-status/reporting distinction, not proof the batch stopped early.

The user is rerunning the batch while another agent works. Check the latest run link before treating the above counts as current.

### Current Gemini batch behaviour
Files:
- `worker/gemini-batch.mjs`
- `scripts/run_gemini_review_batch.mjs`
- `.github/workflows/gemini-accounting-review-batch.yml`

The batch already catches an individual task exception, records FAILED or PENDING_RETRY and continues to later tasks/stocks. It pauses for quota exhaustion and respects per-page new-call/task budgets and runtime deadline. Successful results are reused from D1 cache. Failed results are not treated as completed cache hits and are retried on a later run. The workflow may still finish with exit code 1 when any FAILED task remains.

Workflow dispatch settings for a normal full-universe pass:
- symbols: blank
- dry_run: false
- include_full_scope: false
- max_new_calls: 2

Do not turn on full_scope by default; it repeats broad evidence already represented by task-specific reviews. Do not increase concurrency/call budgets without checking provider behaviour and Worker limits.

### Gemini cache semantics
Cache is stored in Cloudflare D1, not only process memory. The key incorporates evidence hash, prompt version, accounting policy version, model-pool key and task. Current observed versions at last inspection:
- prompt: `gemini-accounting-review-v10`
- policy: `us-mfi-accounting-policy-v1-proposed`

No TTL was found; entries effectively persist until a relevant cache-key input changes or data is deliberately managed. Successful validated responses, including REVIEW_REQUIRED, are reusable. Provider failures/quota exhaustion are not completed cached reviews.

## 4. Immediate work queue (do these in order)

### A. Finish and verify PR #47: persistent review audit ledger
Open PR: https://github.com/fizminho/magic-screen/pull/47  
Branch: `feat/gemini-review-audit-ledger`  
Title: Add persistent Gemini accounting review audit ledger

Intent:
- Keep existing hash-keyed cache for deduplication.
- Add append-only `gemini_accounting_review_history` for each newly completed Gemini review, once per cache key.
- Add append-only `gemini_accounting_review_decisions` for explicit human ACCEPT / REJECT / OVERRIDE decisions linked to exact evidence/cache hash.
- Authenticated read endpoints for history and decisions; validated decision-write endpoint.
- No production fundamentals or ranking writes.

Next agent must:
1. Inspect the actual PR diff and latest CI. Do not assume PR is green or merged.
2. Check D1 schema initialization is idempotent on fresh and existing databases.
3. Check cache + history write atomicity, duplicate/in-flight behaviour and unique constraints.
4. Verify history is appended only on a newly completed review, not on a cache hit.
5. Verify decision writes require an exact matching cached review (symbol, task, input hash/cache key); OVERRIDE requires classification; validate lengths/enums and prevent cross-symbol/task references.
6. Verify endpoints are authenticated and pagination/limits are bounded.
7. Verify no endpoint can modify production tables or ranking outputs.
8. Run targeted tests, full Node tests, TypeScript build and Wrangler dry-run. Fix failures and update PR.
9. Merge only after checks pass; deploy only if required by the existing workflow and verify live status.
10. Update this handover with final PR/commit/deploy status.

Reviewer label in this design is self-reported under the shared bearer token. Do not describe it as cryptographically verified identity. A future identity-aware auth layer may be needed if multiple reviewers need non-repudiation.

### B. Diagnose the BCRX debt_scope failure
Use the latest batch run logs and D1-backed AI-review/history endpoints to identify the exact error and evidence package. Do not guess.
- Determine whether it is a provider/network error, malformed response, evidence-ID validation failure, or an application bug.
- Check the relevant task input and returned error safely; never expose API keys.
- Fix the root cause, not just the runner exit code.
- Add a regression test for the failure mode.
- Keep failed tasks retryable and successful task cache entries untouched.
- Rerun BCRX debt_scope only after a code fix or evidence/version change. Do not re-send other unchanged reviews.

### C. Close the remaining issuer/accounting review queue
Use latest live queue and latest full-universe artifact, not historical markdown counts.
Prioritise material cases that can change EV, invested capital, EY or ROC:
- P1 filing worksheets: HRB, OTEX, PBI, SGHC, GTM, HPQ, HRMY, SSTK, XPOF.
- Shadow-candidate sensitivity cases: OTEX near-zero positive invested-capital denominator; UPWK marketable-securities cash treatment; IRWD lease/debt scope; QTTB lease and restricted-cash scope. Confirm latest shadow candidate set before using it.
- Other issuer-specific unusual financing, tax receivable agreements, NCI, customer funds/escrow, leases and borrowing aggregates.
- Unsupported AFMJF and EGHSF remain disclosed/excluded; do not invent fallback coverage.

Use deterministic resolver first. Gemini is not the approver. Where Gemini returns REVIEW_REQUIRED or conflicting evidence, create a human decision only after examining filing evidence. Do not auto-accept Gemini suggestions. Decisions must be linked to exact accession/evidence hash and rationale.

### D. Resolve accounting-policy conflicts and obtain human sign-off
Current lease/cash policies are proposals, not approved accounting policy:
- US GAAP operating leases: proposed exclude liability from EV and ROU from invested capital while rent remains in EBIT.
- US GAAP finance leases: proposed debt-like EV inclusion and ROU inclusion in invested capital, with consistent current-liability treatment.
- IFRS 16: proposed recognized lessee lease liabilities debt-like in EV and ROU asset included once; current liability treatment needs explicit approval.
- Failed sale-leaseback: separately identify financing obligation; do not blend with ordinary leases.
- Cash baseline: unrestricted cash and cash equivalents only.
- Securities are not automatically cash-like. Require instrument-level evidence for original maturity, convertibility, insignificant risk, restrictions/pledges, ownership and no double counting.
- Exclude restricted cash and matched customer escrow symmetrically.
- Debt scope must avoid double-counting current aggregates and their components. Missing debt is unknown, not zero.
- NCI and other financing-like obligations need consistent policy.

Produce a concise decision register with proposed rule, evidence, sensitivity impact, unresolved trade-offs and explicit owner decision. Do not convert proposals into production rules without approval.

### E. Repair and complete legacy-versus-EdgarTools reconciliation
A recent reconciliation preview showed no fully comparable rows:
- legacy_calculated 0
- EdgarTools supported 28
- period_matched 27
- period_mismatched 0
- metrics_comparable 0
- partial comparisons 27 with no observed differences in overlapping fields
- legacy debt missing for all 28 supported issuers
- legacy EBIT coverage 25, invested capital 23, gross debt 0, cash 24
- EdgarTools EBIT 26, invested capital 27, debt 17, cash 25

Root cause found: reconciliation joins current `stock_fundamentals` by symbol/US market and only trusts legacy debt when the legacy record is `calculated` and all required metric inputs are complete. Current live legacy `total_debt` was null for all 28 supported issuers, so full metric comparison could not run. Missing debt is not zero.

BMBL historical note: an older report described a comparable legacy debt value of USD 588.465m, while the latest snapshot showed `total_debt=null`. Do not claim ingestion caused this. Exact timing/cause was not established. Add read-only diagnostics for legacy CIK, accession/period and `updated_at` if needed to trace the discrepancy.

Goal:
- Compare same issuer, same fiscal period, same accession basis and same market-cap snapshot.
- Distinguish absent legacy data from calculated zero.
- Explain why each metric is or is not comparable.
- Do not fabricate a comparable total-debt value or backfill production data.
- Provide per-issuer diffs and coverage summary, then independent review.

### F. Validate shadow MFI and ranking gates
- EY = EBIT / EV.
- ROC = EBIT / invested capital.
- EV policy must be consistent and approved.
- Rank EY and ROC independently, highest first; combined ordinal-rank sum, lower is better.
- Check current code and intentional design docs for tie semantics. There is a historical policy conflict between average occupied positions and legacy SQL RANK() competition semantics. Do not silently change tie behaviour; document and get an explicit decision.
- Minimum eligible cohort is 5.
- No numeric ranking when the active cohort is incomplete or below the minimum.
- New membership or changed market-cap snapshot invalidates stale ranks.
- Test negative EBIT, zero/negative denominator, missing debt/cash, exact ties, extreme ROC, period mismatch, IFRS/US GAAP, unsupported issuer and partial coverage.
- OTEX's very small positive denominator is a material outlier; flag and disclose, do not silently substitute another formula.

### G. Production-readiness and eventual cutover
Only after A-F:
1. Full universe extraction and evidence coverage validated.
2. Unsupported issuers and unresolved cases explicitly excluded/disclosed.
3. Accounting policies approved.
4. Legacy comparison independently reconciled.
5. Ranking calculations and tie handling approved.
6. Scheduled processing, retry, idempotency, alerting and recovery tested.
7. Rollback plan documented and tested.
8. Explicit user approval obtained.
9. Only then consider a separate, reviewed production cutover PR.

Until then, production Company Facts path remains intact and all EdgarTools/Gemini outputs remain preview-only.

## 5. Important source files and docs

Inspect current main before assuming paths or behaviour:
- `worker/index.ts`: routes, D1 schema and resolver/ranking endpoints.
- `worker/gemini-accounting-review.mjs`: per-task Gemini, cache, locks, model fallback and validation.
- `worker/gemini-batch.mjs`: page and orchestrator control flow.
- `worker/gemini-batch.test.mjs`: batch continuation, retry, quota and cursor tests.
- `scripts/run_gemini_review_batch.mjs`: GitHub Actions runner.
- `.github/workflows/gemini-accounting-review-batch.yml`: manual batch workflow.
- Full-universe workflow and scripts under `.github/workflows/` and `scripts/`.
- `docs/US_MFI_COMPLETION_PLAN.md`
- `docs/US_MFI_PRODUCTION_DECISION_PACKET.md`
- `docs/US_MFI_LEASE_CASH_POLICY_RECOMMENDATION_2026-11-22.md`
- `docs/US_MFI_P1_ISSUER_REVIEW_REGISTER.md`
- `docs/INTENTIONAL_DESIGN_DECISIONS.md`
- `docs/EDGARTOOLS_PROVIDER.md`
- `docs/STOCK_UNIVERSE.md`

Some existing docs contain older, contradictory snapshots. Treat dated workflow artifacts and current code as the source of truth. Update stale docs when a substantive policy or implementation decision is actually made; do not bulk-edit historical evidence records to make them appear current.

## 6. API and safety notes

- Worker base: `https://magic-screen.96muhdhafiz.workers.dev`
- `UNIVERSE_SYNC_TOKEN` is a GitHub Actions secret and Worker-side bearer secret. Never print it, commit it or request it in chat.
- Gemini API key is a Worker secret. Never print or expose it.
- Gemini batch endpoint uses bearer auth; optional `symbols` is validated against the active US universe.
- `GET .../ai-review/batch?check_models=1` can inspect model IDs visible to the configured key without returning the key.
- Cache key includes evidence hash, prompt/policy versions, model-pool key and task. Unchanged successful reviews should be cache hits.
- Quota exhaustion is not a completed result. Respect provider retry-after.
- Do not invent live endpoint output; fetch and record it.
- Never place raw filing text, credentials or sensitive request payloads in public logs.

## 7. How to work and report

Start by:
1. Read this handover.
2. Inspect current main, latest commits, open PRs and CI.
3. Verify PR #47 and latest Gemini batch run.
4. Recompute live queue/ranking/reconciliation counts.
5. Select the highest-priority concrete task above and implement it.

For each workstream:
- Create one focused branch/PR with related code, tests and docs.
- Add regression tests before or with the fix.
- Run Node tests, TypeScript build, Wrangler dry-run and relevant workflow tests.
- Inspect CI logs for the exact result.
- Merge only when checks pass and the change is safe.
- Verify deployment only when a deploy actually occurs.
- Update this handover after material milestones so the next agent starts from reality.

Every progress report must state:
- What changed and why.
- Files/PR/commit links.
- Tests/build/workflow results.
- Latest universe and issuer/task counts, with stock-level and task-level counts clearly separated.
- Whether production fundamentals/rankings changed (expected: no).
- Remaining blockers and next exact action.

## 8. Definition of done

US MFI is ready for production consideration only when:
- Source-aware candidate universe is stable and source removals are safe.
- Annual filing evidence is accession/period/unit/currency correct and traceable.
- Deterministic resolver handles known mappings and arithmetic.
- Gemini is limited to unresolved interpretation, with dedupe, retries and an auditable human decision trail.
- Material debt, lease, cash, NCI and financing classifications are resolved or explicitly excluded.
- Legacy-vs-shadow comparisons are genuinely comparable and explained.
- EY, ROC, EV, invested capital, rank sum, tie handling and completeness gates pass independent validation.
- Unsupported and incomplete coverage is visible.
- Scheduling, idempotency, retries, alerting and rollback are proven.
- Accounting policy and release decisions are explicitly approved.
- A separate production cutover is reviewed and approved.

**Final instruction:** Do not rebuild the universe, extraction provider, Gemini batch or ranking engine. Continue from the working implementation. Finish the audit ledger, diagnose the remaining task failure, close accounting review and reconciliation blockers, and keep production writes disabled until explicit approval.


## Status update: workstream A (audit ledger) implemented offline, 22 Nov 2026

Implemented against the uploaded `main` snapshot (which did not contain PR #47). NOT yet committed, pushed, merged or deployed; no CI run exists for it.

- `worker/gemini-review-ledger.mjs`: idempotent DDL, append-only history and decisions (DB triggers block UPDATE/DELETE), cache+history written in one `DB.batch`, decision validation against the exact cached review (cache_key, symbol, task, input_hash, optional accession), bounded pagination (default 25, max 100).
- `worker/gemini-accounting-review.mjs`: cache insert replaced by `persistCompletedReview`; cache hits and in-flight duplicates never append history.
- `worker/index.ts`: `GET .../ai-review/history`, `GET|POST .../ai-review/decisions`; bearer-authenticated; responses carry `production_write=false`, `rankings_changed=false`, `reviewer_identity_verified=false`.
- Tests: `worker/gemini-review-ledger.test.mjs` (real SQLite), plus history assertions in the dedup test. Full `node --test worker/*.test.mjs`: 84 pass, 0 fail.
- Not run: `npm run build` (tsc) and `wrangler deploy --dry-run` (no network/node_modules in this session). Run both before merging.
- Known gap: reviews cached before this change have no history row. A one-off, explicit backfill from the cache table is possible but was not added.
- Items B-G untouched (need live logs, endpoints and filing evidence).
