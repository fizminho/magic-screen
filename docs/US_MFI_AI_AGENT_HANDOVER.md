# Agent Handover: Legacy SEC Debt Resolver Shadow Improvement

**Last refreshed:** 22 November 2026  
**Repository:** `fizminho/magic-screen`  
**Branch for this handover:** `docs/legacy-debt-shadow-agent-handover`  
**Worker:** `https://magic-screen.96muhdhafiz.workers.dev`  
**Scope:** US Magic Formula Investing legacy debt diagnostics and a new read-only shadow candidate.  
**Status:** Investigation completed; implementation is the next agent's task. No production accounting or ranking changes are authorised.

> This is a focused handover for the legacy-debt issue. It replaces the previous broad, stale agent handover. Do not restart completed platform work. Work only on the scope below unless a concrete dependency requires otherwise.

---

## 1. Objective

Implement and validate a **read-only shadow debt-composition candidate** that can recognise conventional debt presented as current and noncurrent portions of long-term debt, without requiring a separate short-term borrowing fact to exist.

The existing legacy resolver is too restrictive for common issuer presentations. The known condition currently requires all three values:

```js
const splitDebtKnown =
  debtCurrent.value != null &&
  shortDebt.value != null &&
  debtLong.value != null;
```

This incorrectly leaves some filing-supported debt unresolved when the issuer reports current and noncurrent portions of long-term debt but does not separately report short-term borrowings.

The new work must not change the production fundamentals path, rankings, eligibility, or existing Bursa/Malaysia behaviour. It must produce a separately labelled candidate with explicit provenance and uncertainty.

## 2. Guardrails

1. **Shadow only.** No writes to production fundamentals, ratios, invested capital, EV, eligibility, or rankings.
2. Do not change the active legacy Company Facts resolver or its production sync behaviour.
3. Missing is unknown, never zero. Absence of a short-term borrowing fact does not prove short-term borrowings are zero.
4. Do not silently mix conventional borrowings, royalty financing, lease liabilities, failed sale-leaseback financing, or other financing obligations.
5. Use facts from the same SEC accession, fiscal period, unit and currency. Do not combine periods or filings.
6. Preserve source tags, accession, period, filed date, unit, currency and calculation method for every candidate component.
7. Respect SEC fact dimensions. Never add dimensional facts to consolidated totals.
8. Do not resend unchanged Gemini tasks/evidence. This task should be deterministic; Gemini is not needed to add two uniquely identified debt facts.
9. Do not change Bursa/Malaysia logic.
10. Add tests and documentation. Do not claim deployment until a live read-only endpoint is verified.

## 3. Verified investigation findings

The read-only diagnostic endpoint was added in PR #51 and merged:

- PR: https://github.com/fizminho/magic-screen/pull/51
- Merge commit: `6c6979158fd1b6485dddd12ea6bda1354c7c6017`
- Endpoint: `POST /api/fundamentals/legacy-debt-diagnostic`
- Requires `Authorization: Bearer $UNIVERSE_SYNC_TOKEN`.
- Diagnostic response explicitly reports `production_write:false` and `rankings_changed:false`.
- The user successfully called the deployed endpoint for BMBL, BCRX, OTEX, UPWK and IRWD.

The diagnostic showed legacy `total_debt` null for all five queried issuers. The following SEC filing values were independently checked:

| Issuer | Filing presentation | Carrying value / observation |
|---|---|---:|
| BMBL | Current portion of long-term debt, net + long-term debt, net | USD 5.750m + USD 582.715m = **USD 588.465m** |
| OTEX | Current portion of long-term debt + long-term debt | USD 35.850m + USD 5,734.519m = **USD 5,770.369m** |
| UPWK | Current debt + noncurrent debt | USD 359.770m + USD 0m = **USD 359.770m** |
| BCRX | Secured term loan is zero; separate royalty financing and finance lease liabilities exist | Royalty financing USD 38.455m current + USD 427.233m noncurrent = USD 465.688m; finance leases USD 1.312m + USD 1.441m = USD 2.753m |
| IRWD | Fixed diagnostic tag list found no recognised borrowing/lease facts | **Not proof of no debt.** Broaden concept discovery and inspect the actual filing before concluding. |

Filing sources checked during investigation:

- BMBL 2025 10-K: https://www.sec.gov/Archives/edgar/data/1830043/000183004326000027/bmbl-20251231.htm
- OTEX 2026 10-K: SEC filing balance sheet showed current portion USD 35.850m and noncurrent debt USD 5,734.519m.
- UPWK 2025 10-K: SEC filing reported current debt carrying value USD 359.770m and no noncurrent debt; note disclosed gross debt USD 360.998m less USD 1.228m unamortized issuance costs.
- BCRX 2025 filing: royalty financing and finance leases are separately presented from its secured term loan.

Interpretation:
- BMBL, OTEX and UPWK are strong regression cases for a current-plus-noncurrent long-term-debt composition.
- BCRX is a negative/control case: do not classify royalty financing or lease liabilities as conventional debt merely to make debt coverage look complete. Preserve them as separate financing/lease evidence and leave policy treatment for a separate approved decision.
- IRWD is an incomplete-diagnostics case. Do not conclude debt or leases are zero from the current fixed tag list.

## 4. Existing code and likely change points

Inspect current `main` before editing; paths or code may have changed since this handover.

Relevant files:
- `worker/index.ts`: routes and legacy resolver integration.
- `worker/legacy-debt-diagnostic.mjs`: diagnostic fact selection and response construction.
- `worker/legacy-debt-diagnostic.test.mjs`: diagnostic tests.
- `worker/debt-reconciliation.mjs` and related tests: reconciliation semantics.
- Existing SEC fact helper/resolver modules: find the current `secFactValue` implementation and the exact split-debt requirement before proposing code.

Known current tag families from the investigation include:
- Current aggregate: `DebtCurrent`
- Current borrowings aggregate: `BorrowingsCurrent`
- Current long-term debt: `LongTermDebtCurrent`
- Short-term borrowing/debt: `ShortTermBorrowings`, `ShortTermDebtCurrent`
- Noncurrent long-term debt: `LongTermDebtNoncurrent`
- Long-term debt fallback: `LongTermDebt`
- Noncurrent borrowings: `BorrowingsNoncurrent`
- Noncurrent debt and finance/capital lease aggregate tags: `LongTermDebtAndFinanceLeaseObligationsNoncurrent`, `LongTermDebtAndCapitalLeaseObligationsNoncurrent`
- Current debt and finance/capital lease aggregate tags: `LongTermDebtAndFinanceLeaseObligationsCurrent`, `LongTermDebtAndCapitalLeaseObligationsCurrent`

Do not assume this list is exhaustive. Verify actual code and filing facts.

## 5. Required implementation

Create a **separate shadow preview**, preferably a distinct authenticated endpoint such as:

`POST /api/fundamentals/legacy-debt-shadow-preview`

A separate endpoint is preferred to keep the existing diagnostic contract stable. Reuse the existing diagnostic selection helpers where safe, but do not mutate production data.

For each requested active US ticker, return:

- ticker and CIK;
- selected filing accession, form, fiscal period, filed date;
- each component's exact SEC concept/tag, value, unit and currency;
- candidate total and calculation method;
- candidate classification/status;
- whether a distinct short-term borrowing fact was positively identified;
- other relevant debt/borrowing/loan/lease/royalty/financing concepts discovered;
- explicit unresolved reasons;
- `production_write:false` and `rankings_changed:false`.

### Candidate rule to evaluate

Where the same accession and period contain unique, consolidated, compatible facts for:
- `LongTermDebtCurrent`, and
- `LongTermDebtNoncurrent`,

the shadow preview may calculate:

`candidate_conventional_debt = current_long_term_debt + noncurrent_long_term_debt`

This is a candidate carrying-value composition, not a claim that every issuer's total debt has been fully captured.

Important edge conditions:
- If current and noncurrent values are both present and zero, preserve the reported zero.
- If one component is missing, do not substitute zero. Return unresolved / insufficient inputs.
- If a separate short-term borrowing concept is reported, determine whether it is incremental or overlaps with an aggregate. Do not add it without proving non-overlap.
- If a broad aggregate such as `DebtCurrent` or `BorrowingsCurrent` overlaps with the selected current-debt component, do not double count.
- If a debt-and-lease aggregate tag is used, do not treat it as conventional debt without decomposing its lease component.
- If the issuer reports royalty financing, customer financing, securitisation, sale-leaseback financing or other unusual obligations, surface them separately and mark scope review required unless an explicit, already-approved classification applies.
- If only one side of a split is present, or there are multiple competing facts, remain unresolved.
- A missing separate short-term borrowing fact must be labelled **not separately identified / unknown**, not zero.

Do not hardcode the five sample amounts as resolver logic. They belong in regression fixtures and expected-result assertions only.

## 6. Required regression coverage

At minimum add fixtures/tests for:

1. **BMBL:** current USD 5.750m + noncurrent USD 582.715m => shadow candidate USD 588.465m.
2. **OTEX:** current USD 35.850m + noncurrent USD 5,734.519m => shadow candidate USD 5,770.369m.
3. **UPWK:** current USD 359.770m + explicitly reported noncurrent USD 0 => candidate USD 359.770m. Confirm that the zero is filing-supported, not manufactured from a missing fact.
4. **BCRX:** do not include royalty financing USD 465.688m or finance lease liabilities USD 2.753m in conventional-debt total. Keep them separately surfaced and review-required as appropriate.
5. **IRWD:** fixed-tag absence does not become zero or a clean-debt conclusion. Add broader tag discovery and/or filing review evidence; otherwise return insufficient evidence.
6. Missing current component.
7. Missing noncurrent component.
8. Separate short-term borrowings present and demonstrably incremental.
9. Aggregate/component overlap, ensuring no double count.
10. Mixed accession, period, unit, currency or dimension facts, ensuring they are rejected or separately classified.
11. Duplicate facts / competing tags with precedence ambiguity.
12. Explicit reported zero versus absent fact.

Test both the pure resolver and endpoint authentication/response shape. Add a regression assertion that no production table or ranking mutation is invoked.

## 7. Validation and delivery

1. Inspect latest `main`, open PRs and recent commits before coding. PR #51 is already merged; do not recreate it.
2. Implement on a focused branch.
3. Run all relevant Node tests, full `node --test worker/*.test.mjs`, TypeScript build and Wrangler dry-run using the repository's current documented commands.
4. If a check cannot run locally, add/inspect CI and report that limitation accurately.
5. Open a PR with the rule, assumptions, examples, risks and test results.
6. Merge only when required CI checks are green.
7. Verify deployment only if the workflow deploys it. Call the new endpoint with the five diagnostic tickers and verify the returned candidates.
8. Confirm production fundamentals, ratios, eligibility and rankings are unchanged.
9. Update this handover with PR, commit, CI and deployment results.

## 8. Out of scope

- No production debt backfill.
- No change to legacy Company Facts production resolver.
- No change to `stock_fundamentals`, ratios, EV, invested capital, eligibility or rankings.
- No approval of lease, royalty-financing, failed-sale-leaseback, cash-like securities or other EV policy.
- No broad resolver rewrite or provider migration.
- No Gemini review call unless a genuinely semantic filing classification cannot be resolved deterministically; if needed, use existing cache/dedupe and do not resend unchanged tasks.
- No Bursa/Malaysia changes.

## 9. Related completed work and repository context

- PR #51 merged: read-only legacy SEC debt diagnostic. Merge commit `6c6979158fd1b6485dddd12ea6bda1354c7c6017`.
- PR #50 merged: BCRX Gemini evidence-ID normalization fix. Main commit `529fc3f3ed7424067ce33091a8777acea7d71a6e`. Do not rerun BCRX review unless the deployed fix or evidence/version changed.
- PR #49 merged: append-only review audit ledger, atomic cache/history, authenticated history/decision endpoints and validation. Do not reapply.
- PR #48 merged: batch exit semantics. Completed batches with review backlog are distinguished from orchestration failures.
- PR #47 was superseded/closed; its audit-ledger work was delivered in PR #49.

The app's broader US MFI architecture remains:
- Cloudflare Worker + D1 + GitHub Actions.
- EdgarTools annual SEC filing extraction is a raw-evidence/shadow path.
- Legacy Company Facts path remains the active production fundamentals source.
- Gemini is reserved for ambiguous accounting interpretation.
- The MFI.com screener cohort is configured top 30 / minimum market cap USD 50m, not the entire US market and not Magic Formula rank order.
- Unsupported issuers remain visible; do not fabricate coverage.
- No production cutover without explicit user approval.

## 10. Expected agent report

Report only verified facts:
- Exact code/rule changed and why.
- Files, PR and commit links.
- Test/build/Wrangler dry-run results.
- Example output for BMBL, OTEX, UPWK, BCRX and IRWD.
- How missing values, overlap, leases and royalty financing are treated.
- Whether the endpoint is deployed and verified.
- Explicit confirmation that production fundamentals/rankings did not change.
- Remaining blockers and the next action.

**Priority:** implement the shadow-only candidate safely. Do not broaden scope into production accounting or ranking changes.
