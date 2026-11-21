# US Magic Formula Investing: completion and release plan

**Scope:** US equities only. Bursa work is deferred until US MFI is production-ready.

## Current architecture

1. **Universe:** the protected Magic Formula Investing universe endpoint refreshes the active US candidate list and market-cap snapshot. This is a screened candidate cohort, not every US-listed security.
2. **Extraction:** scheduled/manual GitHub Actions runs resolve the active universe and extract annual SEC filings with EdgarTools. Push-triggered runs are regression-only and use a fixed sample.
3. **Evidence ingestion:** the workflow posts the extraction artifact to the authenticated Worker endpoint. D1 stores raw filing evidence; ingestion is not accounting approval.
4. **Resolution:** the Worker creates deterministic, read-only candidate resolutions from accession-bound annual filing evidence.
5. **Review:** the accounting exception queue records missing, ambiguous and policy-sensitive inputs. Missing values remain unknown, not zero.
6. **Shadow ranking:** candidate EY and ROC are calculated only for rows passing current evidence gates. Ranking uses classic Greenblatt ordinal rank sums. Unsupported and unresolved issuers remain visible in coverage but are not ranked.
7. **Production:** the legacy Company Facts runtime lane and production stock table are not yet cut over. Shadow preview must not write production fundamentals, ratios, eligibility or rankings.

## Market-cap snapshot and quote-date policy

For scheduled, manual full-universe and explicit `[full-universe]` runs, market caps must come from the same refreshed Magic Formula Investing universe response as the active ticker list. The workflow converts the provider's USD market-cap values to USD millions and normalizes the provider's month/day quote and quarter dates using the snapshot's own `asOf` year. The extractor uses that exact quote date for USD-to-reporting-currency FX lookup and records the snapshot timestamp and source on every company, including SEC-unsupported issuers.

The pinned 18 November 2026 market-cap map is retained only for fixed regression samples. A custom market-cap map replaces the pinned map completely; missing tickers remain missing rather than silently inheriting stale values. A custom quote date without a matching custom map is rejected. Full-universe validation compares every active issuer's extracted market cap and quote date with the refreshed universe snapshot before the run is accepted.

## Ranking methodology

- Earnings Yield = EBIT / (market capitalisation + conventional gross debt - unrestricted cash).
- Return on Capital = EBIT / invested capital.
- Rank each metric independently; highest value gets ordinal rank 1.
- Exact metric ties share the average of occupied ordinal positions.
- Combined score = EY rank + ROC rank; lower is better.
- Exact combined-score ties share the same competition rank.
- A minimum eligible cohort of five is required before numeric ranks are exposed.
- This affects shadow preview only; production ranking rows remain unchanged.

## Provider coverage policy

EdgarTools is the primary provider. No automatic fallback is enabled. An unsupported issuer receives `excluded_provider_unsupported`, remains in the universe and coverage report, and is excluded from the ranked subset. This is a partial-coverage preview, never a claim that the whole universe has been ranked. Incomplete coverage must be visible and production remains blocked.

## Required completion gates

| Phase | Required evidence | Release gate |
|---|---|---|
| A. Universe integrity | Active universe, selection settings, market-cap date, unique symbols | No silent cohort truncation or stale market caps |
| B. Extraction and ingestion | Full scheduled/manual run; every requested symbol represented; raw evidence accepted | Supported filings accession-bound; unsupported tracked |
| C. Accounting resolver | EBIT, invested capital, debt, cash and currency policies; issuer exceptions | Human-approved accounting rules and regression tests |
| D. Shadow MFI | Classic ordinal rank sum; deterministic ties; coverage report | Reconciled against independently calculated sample |
| E. Runtime migration | Compare EdgarTools shadow output with legacy Company Facts; deliberate cutover | Reconciliation and rollback plan pass |
| F. Production release | Monitoring, stale-data controls, scheduled refresh, runbook and rollback | Explicit approval; no silent partial-universe ranking |

## Current known blockers

- Confirm active MFI cohort and configured minimum market-cap/top-N settings against the source screener. The 30-symbol artifact is a cohort snapshot, not proof of full market coverage.
- A successful scheduled/manual run is required to prove dynamic universe discovery and raw evidence ingestion; push CI is regression-only.
- The latest sample had 28 supported issuers requiring accounting review; five shadow candidates were rankable but none production-approved.
- Legacy Company Facts runtime remains alongside the EdgarTools evidence lane. Do not remove it or redirect production writes until side-by-side reconciliation is complete.
- Keep market-cap freshness and quote-date alignment under CI validation; the dynamic source handoff is implemented and must remain covered by scheduled runs.
- Keep unsupported-provider and accounting exclusions visible in coverage summaries.

## Reusable open-source code decision

- Continue using EdgarTools (MIT) as the primary SEC filing extraction library already integrated.
- Reuse only narrowly scoped, license-compatible ranking patterns. The MIT-licensed `bailewen/magicformula` repository is a reference for generic workflow ideas, not its FMP provider, TTM defaults or accounting heuristics.
- Do not copy code from repositories without an explicit compatible license. Do not add another fundamentals provider or broad finance dependency while the resolver is under review.

## Safety boundary

All EdgarTools resolver and ranking outputs remain preview-only. `production_write=false`, `production_fundamentals_changed=false` and `rankings_changed=false` are required invariants. Extraction success is not accounting approval. A successful shadow ranking is not production approval.

## Latest full-universe run (21 November 2026)

The full-universe pipeline now completes end to end: active MFI universe refresh, annual filing extraction, raw D1 ingestion, resolver preview, classic MFI ranking preview, policy validation and accounting-review guardrails. The active D1 cohort contained 30 issuers; the extractor also included ADBE as a regression control. The resolver reported 28 EdgarTools-supported issuers, 2 provider-unsupported issuers and no issuers awaiting evidence.

A filing-specific HRB EBIT reconstruction is now accepted as a **shadow-only candidate** when the raw filing accession and fiscal period match exactly and both independent statement bridges reconcile within $1. HRB's FY2026 EBIT candidate is $907.686m: revenue less total operating expenses, cross-checked against pretax income less other non-operating income and signed interest expense. This adds HRB to the eligible shadow cohort without promoting the reconstruction to approved accounting.

The latest ranking preview reports 5 eligible and 5 ranked, with 25 not ranked: 23 held for accounting/valuation review and 2 provider-unsupported. Shadow order: HRB, OTEX, UPWK, IRWD and QTTB. IRWD and QTTB share the same combined rank because their rank sums tie. All five still have accounting review flags and remain `production_approved=false`; no production fundamentals or rankings were changed.

### Latest shadow cohort snapshot

| Rank | Ticker | Earnings Yield | Candidate ROC | Rank sum | Review note |
|---:|---|---:|---:|---:|---|
| 1 | HRB | 14.594% | 331.771% | 3 | Filing-specific EBIT reconstruction, manual approval required |
| 2 | OTEX | 10.712% | 6,465.196% | 4 | Near-zero positive invested-capital denominator; major ROC outlier |
| 3 | UPWK | 11.135% | 37.471% | 7 | Marketable-securities cash-scope sensitivity |
| 4 | IRWD | 8.573% | 278.506% | 8 | Lease/debt scope review |
| 4 | QTTB | 10.388% | 37.826% | 8 | Lease and restricted-cash scope review |

Metrics use the refreshed MFI snapshot (price date 19 November 2026, quarter date 30 September 2026). They are shadow candidates only. All five rows retain accounting review flags and `production_approved=false`. The rank-sum tie between IRWD and QTTB is intentional: they share competition rank 4.


The accounting queue still contains 9 P1, 11 P2 and 10 P3 reviews; 28 balance sheets reconcile and 2 are unavailable; 15 filing-specific debt-note reviews and 9 EV-scope note reviews remain review-only; 18 cash-policy questions remain unresolved. The main blockers are accounting policy approval and legacy-versus-EdgarTools reconciliation, not extraction availability.

The workflow now validates each handoff explicitly: unique active-universe symbols, extraction coverage for every requested issuer, accession/period completeness for supported filings, received-versus-ingested counts, unsupported-provider reconciliation, resolver coverage and production immutability. Universe and ingestion response reports are retained as CI artifacts for audit.


## Latest verified full-universe run (21 Nov 2026)

The full-universe path was exercised by a `[full-universe]` push run. Universe refresh, annual filing extraction, raw evidence ingestion, read-only resolver, shadow ranking, ranking-policy validation, accounting review queue and debt-note guardrail checks all succeeded.

- MFI selection: minimum market cap **US$50 million**, **top 30**.
- Active universe: **30**; extraction included those 30 plus **ADBE** as a regression control.
- EdgarTools coverage: **28 supported**, **2 unsupported**; no automatic fallback.
- Shadow ranking: **5 eligible/ranked**, **25 excluded** (2 provider unsupported, 23 accounting/valuation review).
- Top shadow order: HRB, OTEX, UPWK, IRWD and QTTB. IRWD and QTTB tie at combined score 8.
- Accounting queue: 30 issuers; 9 P1, 11 P2, 10 P3; 15 filing-specific debt-note reviews; 9 EV-scope reviews; 3 filing-specific EBIT reviews.
- Production fundamentals and rankings were not changed.

This is a verified pipeline milestone, not production approval. Next work is to reduce accounting review blockers and approve EBIT, invested-capital, debt and cash/EV policies. OTEX's near-zero positive invested-capital denominator and UPWK's cash/EV treatment remain material sensitivity items.


## Next accounting-review work

The next review batch should prioritize the five shadow-ranked issuers and any P1 items that can materially change EY or ROC. In particular, OTEX's working capital offsets 96.79% of net PP&E, leaving a small positive invested-capital candidate; UPWK's separately reported $378.425m fixed-income portfolio has mixed maturities and undisclosed instrument-level amounts. Neither a net-PP&E-only denominator nor treating the full UPWK portfolio as cash-like is approved. A generated sensitivity report compares those alternatives solely to quantify ranking impact before any policy decision.
