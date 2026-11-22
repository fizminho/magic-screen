# US MFI Legacy Debt Shadow Candidate

**Status:** implemented in code; pending CI and deployment verification. Shadow only.

## Endpoint
`POST /api/fundamentals/legacy-debt-shadow-preview` (Bearer `UNIVERSE_SYNC_TOKEN`, 1-10 active US tickers).
Read-only: D1 SELECTs and SEC Company Facts fetches only. Always returns `production_write:false`, `rankings_changed:false`.
The existing `/legacy-debt-diagnostic` endpoint and the legacy resolver are unchanged.

## Rule
For one accession, fiscal period, USD, consolidated (non-dimensional) instant facts:

`candidate_conventional_debt = LongTermDebtCurrent + LongTermDebtNoncurrent`

- Both components required. Absent is unknown, never zero; a reported 0 is preserved.
- Competing different values for one component => `unresolved_ambiguous`.
- `ShortTermBorrowings`/`ShortTermDebtCurrent` are added only when `DebtCurrent` or `BorrowingsCurrent` equals current + short (proves non-overlap), or the short fact is a reported 0. Otherwise `short_term_borrowings_overlap_unproven`.
- A current aggregate equal to the current component is not double counted; a conflicting aggregate leaves the issuer unresolved.
- Debt-and-lease aggregate tags are surfaced, never used as conventional debt.
- Debt/lease/financing discovery scans both standard and issuer-specific SEC taxonomies. Royalty financing, convertible debt, sale-leaseback, securitisation and lease concepts are surfaced separately, listed with `included_in_candidate:false`, and flag scope review. Convertible debt is not silently added to conventional debt.
- No recognised debt evidence at all => `insufficient_evidence` (not proof of no debt).
- Short-term borrowing status is `not_separately_identified_unknown` when absent.
- `LongTermDebt` is a cross-check only; a mismatch is flagged, not blocking.

Statuses: `candidate`, `candidate_scope_review_required`, `unresolved_insufficient_inputs`, `unresolved_ambiguous`, `insufficient_evidence`.

## Files
`worker/legacy-debt-shadow.mjs`, `worker/legacy-debt-shadow.test.mjs` (18 tests), `worker/index.ts` (authenticated read-only route).

## Verification
- Handover agent reported 111 Node tests passing locally. Follow-up coverage adds issuer-specific taxonomy royalty discovery and separate convertible-debt review.
- CI build, TypeScript build and Wrangler dry-run are required before merge.
- No production fundamentals, ratios, eligibility or rankings are changed.
- Do not use this shadow candidate to backfill production debt without separate approval.
