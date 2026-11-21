# US MFI implementation status (2026-11-22)

Status against `US_MFI_AI_AGENT_HANDOVER.md`. This document distinguishes offline implementation, live read-only validation, human policy decisions, and production cutover.

## Implemented in code

| Priority | Delivered | Evidence |
|---|---|---|
| 1. Source-aware universe | `stock_universe_membership`, MFI refresh limited to MFI membership, authenticated `POST/DELETE /api/universe/us/stocks`, frontend add/remove | `worker/universe-membership.test.mjs` |
| 2. Gemini batch | Bounded resumable batch endpoint, status/model-check endpoint, Actions orchestrator, retry-after surfaced, existing cache/locks/quota handling reused | `worker/gemini-batch.test.mjs`, `worker/gemini-accounting-review*.test.mjs` |
| 4. Ranking verification | Pure rank assignment extracted and tested: tie handling, negative values, determinism, minimum cohort, completeness gate | `worker/mfi-ranking.test.mjs` |

## Verified CI and live validation

### Build and deploy

- Current main: `62a8c0676648c6781ef5cf43a8a10bbcf6cd0574`.
- Build run [#44938236891](https://github.com/fizminho/magic-screen/actions/runs/44938236891): passed on the current main SHA.
- Verified steps include `npm run build`, Node test suites, Python sensitivity tests, Python syntax validation, and `wrangler deploy --dry-run`.
- The Worker was deployed successfully in run [#44937456945](https://github.com/fizminho/magic-screen/actions/runs/44937456945) at code SHA `335200eb78259b25ee3e75d034f5d8c28af4b681`. The later main commits only changed the bakeoff workflow comment; no Worker source changed after that deployment.

### Full-universe EdgarTools run

Run [#44938236912](https://github.com/fizminho/magic-screen/actions/runs/44938236912) completed successfully, including universe discovery, extraction, raw evidence ingestion, read-only resolver/ranking/reconciliation previews, full-universe coverage validation, lease/ROU audit, accounting queue, policy cohort assessment, ranking sensitivity, and debt-note guardrail validation.

| Measure | Result |
|---|---:|
| Active US MFI universe | 30 |
| EdgarTools-supported active issuers | 28 |
| Unsupported provider | 2 |
| Extraction and ingestion records | 31 (30 active issuers plus ADBE regression control) |
| Raw evidence ingested | 31 |
| Resolver review required | 28 |
| Shadow eligible | 2 |
| Shadow ranked | 0 |
| Production-approved | 0 |

The ingestion response explicitly reported `production_fundamentals_changed=false` and `rankings_changed=false`. The run was evidence-only; it did not approve or write fundamentals, ratios, eligibility, or rankings.

### Current legacy reconciliation result

The latest live D1 snapshot reports:

- 27 of 28 supported issuers have matching fiscal periods.
- 27 issuers have at least one same-period input available on both sides.
- No differences were found in the overlapping inputs.
- Zero issuers have fully comparable legacy and EdgarTools metrics.
- Legacy field coverage among supported issuers: EBIT 25/28, invested capital 23/28, gross debt 0/28, cash 24/28.
- EdgarTools candidate coverage: EBIT 26/28, invested capital 27/28, conventional gross debt 17/28, unrestricted cash 25/28.

The dominant blocker is legacy debt coverage, not a missing join in the reconciliation query. The query reads `stock_fundamentals.total_debt`; the current live snapshot has that field null for all 28 supported issuers, so their legacy status is `missing_required_facts`. The legacy Company Facts resolver intentionally requires sufficiently complete, accession-matched current/noncurrent debt components (or a recognised complete aggregate) and does not infer a total from an incomplete debt line. Missing debt remains unknown, not zero.

**Historical discrepancy to investigate:** the earlier 2026-11-21 reconciliation note reported BMBL as fully comparable with legacy debt of USD 588.465m. The latest live snapshot reports BMBL legacy debt as null and no fully comparable issuers. The current reconciliation query selects `f.total_debt` directly, but it does not expose the legacy row's `updated_at`/CIK, so the exact cause and timing of this state change are not established. Treat the latest live artifact as the current snapshot; do not rely on the older BMBL comparison until the historical row change is explained.

See [US MFI live validation findings (2026-11-22)](US_MFI_LIVE_VALIDATION_2026-11-22.md).

## Still open: live review and owner decisions

| Item | Current state / next action |
|---|---|
| Gemini batch dry run | Not yet run. Manually dispatch **Gemini accounting review batch** with `dry_run=true`, `include_full_scope=false`; inspect the planned tasks, cursor, and deduplication without making Gemini calls. |
| Gemini live review | After dry-run inspection, explicitly run with `dry_run=false`. The deterministic resolver runs first; only unresolved tasks should reach Gemini. Quota waits and cached evidence must be respected. |
| EBIT policy | Proposed only. Confirm consolidated annual operating-income treatment and the narrowly scoped HRB reconstruction policy. |
| Debt policy | Proposed only. Approve conventional borrowing scope and treatment of lease/royalty/sale-leaseback financing separately. |
| Lease policy | Proposed only. Approve US GAAP operating/finance lease and IFRS 16 treatment, including ROU and current-liability symmetry. |
| Cash policy | Proposed only. Approve unrestricted cash baseline and security-level cash-equivalent criteria. |
| Invested capital | Proposed only. Approve working-capital, PP&E, ROU and negative-working-capital treatment. |
| Ranking tie rule | Owner decision required. Recommended migration choice: preserve legacy SQL `RANK()` semantics to avoid changing methodology during provider cutover. |
| New-stock market cap | Use the dated active MFI universe snapshot automatically. If no reliable market cap is available, withhold ranking until one is supplied. |
| Legacy reconciliation | Explain the historical BMBL debt discrepancy and add legacy row audit metadata before treating the historical comparison as settled. |
| Scheduled ingestion and recovery | Observe scheduled runs, retry/recovery behaviour, and provider coverage over time. |
| Rollback and production-write safeguard drill | Requires staging D1 and an approved cutover/rollback plan. |
| Production cutover | Not approved. Production fundamentals, ratios, eligibility and rankings remain unchanged by the EdgarTools evidence path. |

## Non-negotiable safeguards

1. Annual 10-K/20-F/40-F only for annual Magic Formula metrics.
2. Missing inputs are unknown, never zero.
3. Do not add dimensional XBRL breakdowns to consolidated totals.
4. Unsupported providers remain visible in coverage and excluded from ranking; no silent fallback.
5. Gemini is for genuinely ambiguous filing interpretation, not routine arithmetic or deterministic checks.
6. Do not write EdgarTools candidates into production `stock_fundamentals` until accounting policies, full-universe validation, reconciliation, and rollback are approved.
