# US Magic Formula Investing: AI Agent Handover

**Repository:** `fizminho/magic-screen`  
**Primary scope:** US equities only. Bursa Malaysia is explicitly deferred.  
**Worker:** `https://magic-screen.96muhdhafiz.workers.dev`  
**Primary SEC extraction provider:** EdgarTools  
**Accounting interpretation:** Gemini API, only for unresolved judgement tasks  
**Runtime:** Cloudflare Workers (TypeScript), D1, GitHub Actions

> **Mission:** Continue the existing implementation and bring the US Magic Formula Investing (MFI) engine to production readiness. Work in the current repository, preserve existing safeguards, and implement rather than merely recommend. Do not rebuild working integrations.

---

## 1. Start here: repository orientation

Before editing, inspect the current `main` branch, recent commits, open PRs, CI workflows, D1 migrations, Worker routes, frontend stock-management flows and the current completion/policy documents.

Important existing documents:

- [US MFI completion and release plan](US_MFI_COMPLETION_PLAN.md)
- [Intentional design decisions](INTENTIONAL_DESIGN_DECISIONS.md)
- [Stock universe](STOCK_UNIVERSE.md)
- [EdgarTools provider](EDGARTOOLS_PROVIDER.md)
- [US MFI production decision packet](US_MFI_PRODUCTION_DECISION_PACKET.md)
- [Lease and cash policy recommendation](US_MFI_LEASE_CASH_POLICY_RECOMMENDATION_2026-11-22.md)
- [P1 issuer review register](US_MFI_P1_ISSUER_REVIEW_REGISTER.md)

These documents may contain historical counts and statuses. Recompute current figures from the repository, D1-backed endpoints and latest successful workflow artifacts before relying on them.

### Existing architecture

1. **Universe:** authenticated integration with the existing Magic Formula Investing screener.
2. **Extraction:** GitHub Actions runs EdgarTools against annual SEC filings.
3. **Ingestion:** authenticated Worker endpoint stores raw filing evidence in D1.
4. **Resolution:** deterministic, read-only accounting resolver evaluates accession-bound evidence.
5. **Review:** unresolved accounting cases are surfaced for review.
6. **Shadow ranking:** calculates candidate Earnings Yield and Return on Capital only after evidence gates.
7. **Production:** legacy Company Facts runtime remains in place; the EdgarTools path is not yet approved for production writes.

The existing MFI.com source is exactly:

`https://www.magicformulainvesting.com/Screening/StockScreening`

Do not build a second MFI connector or a second SEC extraction engine.

### Existing endpoints (verify against current code)

- `GET /api/mfi/screen`
- `GET /api/stocks?market=US`
- `GET /api/fundamentals/edgartools/universe`
- `POST /api/fundamentals/edgartools/ingest`
- `GET /api/fundamentals/edgartools/status`
- `GET /api/fundamentals/edgartools/resolve-preview`
- `GET /api/fundamentals/edgartools/ranking-preview`
- `GET /api/fundamentals/edgartools/ranking-preview/public`
- `GET /api/fundamentals/edgartools/ai-review`
- `POST /api/fundamentals/edgartools/ai-review`

The legacy `POST /api/ai/fundamentals/extract` endpoint returns HTTP 410. Do not revive it.

---

## 2. Priority 1: make the US stock universe expandable and source-aware

**User requirement:** the stock list must keep expanding when stocks are added through the frontend or when new stocks are returned by the existing MFI.com integration.

### Existing behaviour to inspect

The existing `syncMagicFormulaUniverse(...)` function fetches MFI.com’s selected 30/50 stocks and imports the result. Inspect its current deactivation logic carefully. Historically, the refresh logic could mark US stocks inactive when they were absent from the latest MFI.com response. That would incorrectly remove a manually added stock.

Also inspect the frontend: determine whether a US add-stock flow already exists, what API it calls, and how authentication and symbol validation work. Do not assume a UI or endpoint exists without verifying it.

### Required target behaviour

- MFI.com remains the existing discovery integration.
- Frontend additions become another supported source of US-universe membership.
- The combined active universe can grow beyond 30 or 50 stocks.
- A stock remains active while at least one source membership remains active.
- MFI.com refresh may deactivate only the MFI.com membership for stocks no longer returned by that source.
- MFI.com refresh must never deactivate a frontend/manual membership.
- Removing a stock from one source must not remove it from another source.
- Repeated additions/imports must be idempotent.
- Maintain one canonical stock record per market and symbol.
- Newly added stocks must become eligible for the same fundamentals/extraction/review pipeline, subject to normal provider and evidence gates.

A possible design is a source-membership table with a unique key on `(market, symbol, source)`, active state, first/last-seen timestamps and optional source metadata. Inspect existing schema and migration conventions before choosing the final design. Backfill existing records safely and preserve existing data.

### Important repository design conflict to resolve

The current `docs/INTENTIONAL_DESIGN_DECISIONS.md` says US universe ownership is exclusive to MFI and the frontend must not add US stocks. The new user requirement changes that product decision.

The implementation agent must:
1. Treat this handover requirement as the new requested direction.
2. Inspect all dependent code and ranking assumptions before changing ownership.
3. Update the intentional design decision and stock-universe documentation in the same implementation PR.
4. Preserve Bursa/Malaysia behaviour.
5. Do not merge SEC’s entire company directory into the displayed universe. SEC ticker data remains a CIK mapping source, not a universe source.
6. Do not treat the MFI.com screen order as a Magic Formula ranking.

### Ranking impact

The existing design documents specify an all-candidate completeness gate: no combined ranks are published while any active candidate lacks current complete fundamentals. Preserve this unless a deliberate product/policy decision is made and documented. Expanding the universe can therefore temporarily invalidate rankings while new candidates are processed. Never display stale rankings as if they apply to the new universe.

### Tests required

- A manually added stock survives an MFI.com refresh that omits it.
- A stock in both sources remains active when one source removes it.
- Removing a manual membership does not remove an active MFI.com membership.
- New MFI.com symbols are imported.
- Duplicate additions are idempotent.
- Inactive memberships do not appear as active stocks.
- Other markets, especially Bursa, are unaffected.
- Universe changes invalidate/rebuild rankings according to the existing all-candidate gate.

---

## 3. Priority 2: implement resumable Gemini batch accounting review

The current AI review implementation is issuer/task-oriented. Build a batch orchestration layer so the whole supported US universe can be processed incrementally.

### Deterministic-first responsibility split

Our code should handle:

- normalization and period alignment;
- duplicate detection and dimensional/consolidated fact checks;
- known XBRL concept mapping;
- direct EBIT candidate identification;
- invested-capital arithmetic;
- debt aggregation and reconciliation;
- known cash classification;
- missing-input and evidence validation;
- all formula calculations and ranking.

Use Gemini only for genuinely ambiguous filing interpretation, such as:

- unusual financing arrangements;
- restricted cash and cash-like instrument ambiguity;
- non-controlling interest and consolidation context;
- unusual lease / ROU arrangements;
- failed sale-leaseback interpretation;
- filing-note semantic ambiguity.

Do not use Gemini for routine arithmetic or classifications already resolved by deterministic rules.

### Required batch flow

1. Load the current active US universe.
2. Identify supported issuers and current annual filing evidence.
3. Run deterministic resolver and validation first.
4. Enumerate only unresolved review tasks.
5. Skip deterministic-resolved tasks.
6. Skip valid cached results.
7. Build a minimal evidence package containing the exact unresolved question and existing validation outcomes.
8. Submit the task to Gemini.
9. Validate returned structured JSON against allowed schema, evidence IDs and resolver rules.
10. Persist results, model/prompt/policy versions, timestamps, status and audit metadata.
11. Re-run deterministic resolution.
12. Refresh the issuer review queue and shadow ranking.

Prefer a GitHub Actions orchestrator calling authenticated Worker endpoints over a single long-running Worker request. Make the process resumable and report progress per issuer and task.

### Deduplication and retries

Cache key must include:
- evidence hash;
- prompt version;
- accounting policy version;
- model;
- task type.

If evidence is unchanged, do not resend the same request. If only cash evidence changes, rerun cash review only. A new filing/amendment or relevant evidence change must invalidate only affected tasks.

Support in-flight duplicate coalescing, safe concurrency and transient retries. Quota exhaustion is not a completed review and must not be permanently cached. Respect provider Retry-After information where available. Do not introduce an arbitrary daily cap; do implement sensible concurrency/rate controls and idempotency.

Suggested statuses (reuse existing equivalents if present): `PENDING`, `PROCESSING`, `COMPLETED`, `PENDING_RETRY`, `QUOTA_EXHAUSTED`, `REVIEW_REQUIRED`, `FAILED`.

Verify the deployed Gemini secret and model configuration without exposing credentials. Never ask the user to paste API keys into chat. Check current model availability rather than assuming a historical model name remains valid.

---

## 4. Priority 3: complete full-universe accounting validation

Process every supported issuer in the expanded universe. Keep unsupported tickers visible in coverage reports and do not silently drop them or add an unapproved fallback provider.

### EBIT

- Use annual operating income from the selected annual filing.
- Keep values tied to the selected filing accession and fiscal period.
- Do not annualize partial quarters or backfill older periods.
- Do not add dimensional breakdowns to consolidated totals.
- Keep missing values unknown, not zero.
- A direct operating-income fact is still a candidate until its scope and filing context pass the resolver.

### Debt and financing

Review short-term borrowings, current and noncurrent debt, finance lease liabilities, IFRS 16 liabilities, failed sale-leaseback financing and other debt-like obligations.

Reconcile reported totals and components without double counting. Do not classify every liability as debt. Missing debt is not automatically zero.

### Lease policy (proposed, not approved)

- **US GAAP operating leases:** proposed baseline keeps operating rent in EBIT and excludes operating lease liabilities from EV and ROU assets from invested capital.
- **US GAAP finance leases:** potential debt-like EV inclusion and corresponding ROU inclusion in invested capital, with symmetrical treatment of current liabilities in working capital.
- **IFRS 16:** recognized lessee lease liabilities are debt-like candidates and ROU assets are included once, subject to current-liability reclassification.
- **Failed sale-leaseback:** separate from ordinary leases and requires explicit treatment.
- Embedded ROU inside PP&E must not be added again.

### Cash policy (proposed, not approved)

- Baseline: unrestricted cash and cash equivalents only.
- Exclude restricted cash and customer-owned funds / matched escrow.
- Do not automatically classify marketable securities as cash-like.
- Exclude equity securities.
- Cash-like securities require instrument-level support for original maturity, convertibility, value risk, restrictions, ownership and reconciliation.

Policy recommendations are not approval. Keep policy-sensitive classifications review-required until signed off.

### Evidence provenance

Preserve filing accession, period, source concept/note, original amount, unit/currency, normalized value, evidence ID and rationale. Gemini cannot invent evidence IDs or numerical balances.

---

## 5. Priority 4: verify Magic Formula calculations and rankings

The intended methodology is classic Greenblatt Magic Formula, not percentile scoring.

- Earnings Yield = EBIT / Enterprise Value.
- Return on Capital = EBIT / Invested Capital.
- Rank each metric independently, highest value first.
- Combined score = EY ordinal rank + ROC ordinal rank; lower is better.
- Preserve the repository’s documented tie methodology.
- Enforce the existing minimum eligible cohort and all-candidate completeness gate.
- Missing inputs, unsupported filings and invalid denominators must not be filled with zero or guesses.
- Never show stale ranks after a universe or market-cap change.

Test negative EBIT, zero/negative denominators, missing debt/cash, duplicate facts, fiscal-year differences, IFRS/US GAAP, ties, newly added stocks, source-specific removals and partial coverage.

---

## 6. Priority 5: production readiness and cutover

The EdgarTools path is currently a separate raw-evidence and shadow-validation lane. Extraction success is not accounting approval.

Before production cutover:

1. Complete extraction for the active universe.
2. Complete supported issuer reviews or explicitly exclude unresolved cases.
3. Resolve material evidence conflicts.
4. Approve EBIT, debt, lease, cash and invested-capital policies.
5. Verify calculations and rankings independently.
6. Complete side-by-side legacy Company Facts reconciliation.
7. Verify scheduled ingestion, retry, idempotency and recovery.
8. Test rollback and production-write safeguards.
9. Obtain explicit approval before changing production fundamentals or rankings.

**Production writes must remain disabled until explicit approval.** Do not write exploratory resolver, Gemini or shadow-ranking outputs into production `stock_fundamentals`, ratios, eligibility or ranking tables.

---

## 7. Engineering rules

1. Inspect current code and schema before editing.
2. Reuse existing MFI.com and EdgarTools integrations.
3. Do not create duplicate providers or pipelines.
4. Deterministic code owns arithmetic and known accounting rules.
5. Gemini handles only unresolved judgement tasks.
6. Do not repeat identical Gemini requests when evidence and versions are unchanged.
7. Missing data is unknown, never zero.
8. Unsupported issuers remain visible in coverage.
9. Preserve accession and period integrity.
10. Preserve Bursa/Malaysia behaviour.
11. Add tests for material changes.
12. Run TypeScript build, tests and relevant workflow checks.
13. Prefer consolidated commits/PRs for related work.
14. Do not claim tests, merge, deployment or production readiness without verifying.
15. Check licences before reusing external code; do not copy unlicensed repositories.
16. Do not expose secrets in code, logs, artifacts or documentation.

---

## 8. Suggested execution order and estimates

Estimates are engineering effort, not guaranteed calendar dates.

| Order | Workstream | Indicative effort | Exit criteria |
|---|---|---:|---|
| 1 | Repository audit and baseline refresh | 0.5 day | Current code, schema, workflows, coverage and blockers documented |
| 2 | Source-aware US universe + frontend flow | 1–2 days | Add/remove, MFI refresh and cross-source membership tests pass |
| 3 | Gemini batch orchestration | 2–3 days | Incremental, resumable, deduplicated batch works |
| 4 | Full-universe accounting review | 2–3 days | All supported issuers processed or blockers explicitly recorded |
| 5 | Formula/ranking verification | 1–2 days | Metric, tie, completeness and invalidation tests pass |
| 6 | Production readiness | 2–3 days | Reconciliation, rollback, policy approvals and cutover checklist ready |

Indicative total: **8–13 working days**, subject to actual codebase findings, provider coverage, Gemini quota and accounting policy decisions. Do not treat this estimate as a promise or enable production writes to meet a date.

---

## 9. Required progress reports

After each major stage, report:

**Implementation**
- Files changed and behaviour added.
- Commit/PR links.
- Build/test/workflow outcomes.

**Coverage**
- Total active US universe.
- Supported and unsupported issuers.
- Awaiting evidence.
- Completed and outstanding accounting reviews.
- Gemini tasks completed, skipped from cache, retryable and quota-exhausted.
- Shadow-eligible and ranked counts.

**Safety**
- Whether production data changed.
- Whether production writes remain disabled.
- Whether a deployment occurred and how it was verified.

**Remaining**
- Concrete blockers and next actions.

---

## 10. Definition of done

The US MFI engine is ready for production consideration when:

- The stock universe expands from MFI.com and frontend additions without source collisions.
- Source-specific removals do not deactivate other memberships.
- New stocks flow through extraction, review and ranking gates.
- Annual SEC evidence is traceable to the correct accession and period.
- Deterministic accounting resolution handles known cases.
- Gemini reviews only unresolved interpretation tasks and is resumable/deduplicated.
- Material accounting conflicts are resolved or explicitly excluded.
- EBIT, EV, invested capital, EY and ROC pass independent validation.
- Classic ordinal ranking and tie handling are correct.
- Incomplete and unsupported stocks are transparently reported.
- Scheduled processing and recovery are reliable.
- Accounting policy approvals and production cutover safeguards are complete.

**Final instruction to the coding agent:** Start with a repository audit, then implement the highest-priority work. Do not stop after producing another plan. Make changes, test them, create consolidated PRs, verify the merged result and keep production writes disabled until approval.
