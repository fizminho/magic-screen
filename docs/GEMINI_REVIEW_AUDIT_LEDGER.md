# Gemini Accounting Review: D1 Audit Ledger

This feature separates three different concepts:

1. **Cache** (`gemini_accounting_review_cache`): deduplicates identical evidence/task/prompt/policy/model-pool requests. Successful normalized results remain reusable indefinitely unless the hash inputs change.
2. **Review history** (`gemini_accounting_review_history`): append-only record of each newly completed Gemini review, including its evidence hash, prompt/policy versions, model, status and response. Cache hits do not create duplicate history rows.
3. **Human decisions** (`gemini_accounting_review_decisions`): append-only decisions linked to the exact cached review and evidence hash. A later decision is a new row, never an overwrite.

## Authenticated endpoints

All endpoints require `Authorization: Bearer <UNIVERSE_SYNC_TOKEN>`.

- `GET /api/fundamentals/edgartools/ai-review/history?symbol=IRWD&limit=50`
  - Returns the latest review history, optionally filtered by ticker. Limit is 1–100.
- `GET /api/fundamentals/edgartools/ai-review/decisions?symbol=IRWD&limit=50`
  - Returns the latest human decisions, optionally filtered by ticker. Limit is 1–100.
- `POST /api/fundamentals/edgartools/ai-review/decisions`
  - Body:

```json
{
  "symbol": "IRWD",
  "task": "debt_scope",
  "cache_key": "<64-character cache key>",
  "input_hash": "<64-character evidence hash>",
  "decision": "ACCEPT",
  "classification": "conventional_debt",
  "rationale": "The filing note and balance-sheet presentation support this classification.",
  "reviewer": "reviewer label"
}
```

Decision values are `ACCEPT`, `REJECT`, and `OVERRIDE`. `OVERRIDE` requires a classification. Every decision must reference an existing cache row with matching symbol, task and evidence hash. The reviewer label is self-reported because the current shared bearer-token authentication does not identify individual people.

## Safety boundaries

- These tables are audit/review records only.
- Writing a decision does not approve production accounting policy, update fundamentals, change eligibility, or alter MFI rankings.
- No API in this feature writes to `stock_fundamentals` or production ranking tables.
- Gemini cache records are reusable; review history and human decisions are retained separately.
