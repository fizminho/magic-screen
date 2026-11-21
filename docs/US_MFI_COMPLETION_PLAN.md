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
- Keep market-cap freshness and quote-date alignment current.
- Keep unsupported-provider and accounting exclusions visible in coverage summaries.

## Reusable open-source code decision

- Continue using EdgarTools (MIT) as the primary SEC filing extraction library already integrated.
- Reuse only narrowly scoped, license-compatible ranking patterns. The MIT-licensed `bailewen/magicformula` repository is a reference for generic workflow ideas, not its FMP provider, TTM defaults or accounting heuristics.
- Do not copy code from repositories without an explicit compatible license. Do not add another fundamentals provider or broad finance dependency while the resolver is under review.

## Safety boundary

All EdgarTools resolver and ranking outputs remain preview-only. `production_write=false`, `production_fundamentals_changed=false` and `rankings_changed=false` are required invariants. Extraction success is not accounting approval. A successful shadow ranking is not production approval.

## Latest full-universe run (21 November 2026)

The explicit `[full-universe]` push run successfully refreshed the active US MFI universe, extracted filings, ingested raw EdgarTools evidence, and completed the read-only resolver and ranking previews. The active D1 cohort contained 30 issuers; the extractor also included ADBE as a regression control. The resolver reported 28 EdgarTools-supported issuers, 2 provider-unsupported issuers and no issuers awaiting evidence. The shadow preview had 4 eligible companies, below the configured minimum cohort of 5, so it correctly withheld all numeric ranks: 0 ranked and 30 not ranked. Of those, 24 were held for accounting/valuation review and 2 were provider-unsupported.

The full-universe workflow's only failed step was the new validation script's interpretation of the `excluded` summary. The Worker defines `excluded` as universe rows not present in the final ranked output, including otherwise-eligible rows when the minimum cohort is not met. The validator incorrectly compared it with the count of rows failing accounting eligibility. This is a validation semantics bug, not an extraction, ingestion or Worker ranking failure. The next commit corrects that distinction and updates the preview UI to show ordinal ranks and the minimum-cohort gate accurately.

All outputs remain review-only. The full-universe run does not approve accounting inputs or alter production fundamentals/rankings.
