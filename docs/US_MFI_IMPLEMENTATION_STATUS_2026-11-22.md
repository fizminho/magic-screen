# US MFI implementation status (2026-11-22)

Status against `US_MFI_AI_AGENT_HANDOVER.md`. Nothing here was deployed, merged or run against live D1, SEC or Gemini. Production writes remain disabled.

## Implemented in code (tested offline)

| Priority | Delivered | Evidence |
|---|---|---|
| 1. Source-aware universe | `stock_universe_membership`, MFI refresh limited to MFI membership, `POST/DELETE /api/universe/us/stocks`, frontend add/remove, docs updated | `worker/universe-membership.test.mjs` (14 tests) |
| 2. Gemini batch | Bounded resumable batch endpoint, status/model-check endpoint, Actions orchestrator, `retry_after_ms` surfaced | `worker/gemini-batch.test.mjs` (10 tests) |
| 4. Ranking verification | Pure rank assignment extracted and tested (ties, negatives, determinism, minimum cohort, completeness gate) | `worker/mfi-ranking.test.mjs` (7 tests) |

## Requires live execution or a human decision (not done)

| Item | Why it is open |
|---|---|
| 3. Full-universe accounting validation | Needs EdgarTools ingestion for newly added/changed stocks and a real batch run with `GEMINI_API_KEY` and quota. Run the `Gemini accounting review batch` workflow (dry run first), then re-check `GET .../ai-review/batch` coverage |
| Policy approvals (EBIT, debt, lease, cash, invested capital) | Proposed policies are not approved. Policy-sensitive cases stay `REVIEW_REQUIRED` until signed off |
| Tie-methodology decision | Legacy SQL `RANK()` vs shadow average ranks (see design decisions) |
| Market caps for frontend additions | No dated market-cap source exists for non-MFI stocks, so ranks stay withheld until one is supplied |
| Side-by-side legacy reconciliation | Use `reconciliation-preview` on the live deployment once the universe is fully ingested |
| Scheduled ingestion, retry and recovery verification | Needs observation of real cron runs |
| Rollback and production-write safeguard drill | Needs a staging D1 database and an approved cutover plan |
| 5. Production cutover | Requires explicit approval. Do not enable production writes until every row above is closed |

## Pre-merge checklist

1. CI: `npm run build`, all `node --test` suites, `wrangler deploy --dry-run` (not run in this environment, the sandbox had no network).
2. Note the new Node 22 requirement for `node:sqlite` in the membership tests.
3. After deploy, call `GET /api/fundamentals/edgartools/ai-review/batch?check_models=1` to confirm the Gemini secret and model pool without exposing the key.
