# EdgarTools primary fundamentals provider

## Decision

EdgarTools is the primary extraction provider for the US Magic Formula Investing (MFI) candidate universe.

SEC EDGAR remains the underlying filing source. EdgarTools is the Python extraction layer used to locate the latest annual filing and extract structured statements. SEC Company Facts is not a silent fallback when EdgarTools does not cover an issuer.

This decision changes provider priority, not the accounting approval standard. Extracted rows are evidence and candidates; they are not automatically approved financial inputs.

## Provider coverage status

For each active MFI ticker, retain an explicit provider coverage state:

- `supported`: EdgarTools can resolve the issuer and extract the selected annual filing's statements.
- `unsupported_provider`: EdgarTools cannot resolve the issuer through its SEC company index / filing workflow. Keep the ticker in the MFI universe, but do not attempt another provider yet.
- `extraction_error`: EdgarTools should support the issuer, but the current run failed due to a transient or unexpected error. Retry EdgarTools only.
- `review_required`: statements were extracted, but one or more accounting inputs are ambiguous, missing, stale, or have unresolved scope flags.

Current 2026-11-20 cohort evidence:

- 29 of 31 tickers extracted through EdgarTools.
- `AFMJF` and `EGHSF` are tagged `unsupported_provider` for the EdgarTools SEC-company-index path.
- These two tickers remain visible in the MFI candidate universe. They are not silently removed, replaced, or passed to another data provider.
- Historical control `ADBE` is included for regression testing and is not part of the 30-stock MFI cohort.

The coverage count is extraction coverage, not the percentage of stocks with approved Magic Formula metrics.

## Runtime architecture

The current application backend is a Cloudflare Worker (TypeScript) with D1. EdgarTools is a Python package and cannot be imported into the Worker runtime.

The production integration therefore uses a Python execution lane:

1. A daily scheduled or manually dispatched GitHub Actions job installs a pinned EdgarTools version.
2. The job fetches the current active US MFI ticker list from the protected Worker `/api/fundamentals/edgartools/universe` endpoint. That endpoint refreshes the existing MFI screen using its six-hour cache, so newly screened stocks are picked up without someone first opening the screener. A manual ticker override remains available for focused tests; push-triggered regression runs retain a fixed control cohort.
3. The job extracts each issuer's latest eligible annual filing (10-K, 20-F or 40-F).
4. The job emits a versioned JSON report with ticker, filing metadata, reporting currency, statement facts, provider status, and source provenance.
5. Scheduled and manually dispatched runs POST the report to the protected Worker ingestion endpoint when `EDGARTOOLS_INGEST_URL` and `UNIVERSE_SYNC_TOKEN` are configured.
6. The endpoint stores each ticker/accession payload in `edgartools_filing_evidence`. This is raw evidence storage only; it does not write `stock_fundamentals`, ratios, eligibility, or ranks. The `/api/fundamentals/edgartools/status` route reports stored provider coverage.
7. The Worker will apply deterministic, independently tested accounting rules before writing calculated fundamentals.
7. Existing all-candidate completeness gates remain in force. No partial-universe ranking is published.

The existing bakeoff is both the extraction regression harness and the scheduled raw-evidence refresh. Push-based runs only test and upload an artifact. Scheduled and manually dispatched runs discover the active US MFI universe and ingest raw evidence; a manual symbol override is available for focused tests. The endpoint is size-bounded, authenticated, and idempotent by ticker/accession. It must not be mistaken for an approved accounting resolver.

## Accounting and ranking guardrails

- Use the latest eligible annual filing only. Keep all selected values tied to the same accession and fiscal period.
- Preserve original concept, label, amount, unit, period, accession, and source context.
- Do not add dimensional breakdowns to consolidated totals.
- Do not treat missing values as zero.
- Do not assume standard PP&E, rental equipment, right-of-use assets, lease liabilities, restricted cash, short-term investments, noncontrolling interests, or separate financing obligations are interchangeable.
- Direct reported operating income is preferred. Filing-specific reconstructions remain review-required until an explicit resolver and regression suite approve them.
- Ambiguous EBIT, debt, cash, currency, or invested-capital inputs must remain unresolved.
- A successful EdgarTools extraction alone never makes a stock eligible for ranking.
- Preserve the current rule that the complete active MFI universe must have valid, current fundamentals before any combined ranking is published.

## Rollout sequence

1. **Provider decision and coverage labels:** establish EdgarTools as primary and mark unsupported tickers explicitly. No fallback.
2. **Normalized ingestion contract:** define and validate the Python-to-Worker payload, including provenance and idempotency.
3. **Protected D1 ingestion:** store raw EdgarTools evidence separately from calculated fundamentals.
4. **Deterministic resolver:** approve only unambiguous inputs; retain review-required states for HRB/PBI-style cases.
5. **Shadow comparison:** run EdgarTools beside the existing production provider and compare every field, period, and ratio without changing displayed ranks.
6. **Cutover:** make EdgarTools the sole primary source after the shadow comparison and regression suite pass. Disable the old automatic Company Facts calculation path; do not retain it as a fallback.
7. **Later decision:** evaluate a separate fallback provider for `unsupported_provider` tickers only after the EdgarTools cutover is stable.

## Current safety boundary

The existing production Worker still calculates US fundamentals directly from SEC Company Facts. The EdgarTools extraction workflow now discovers the active US MFI universe through a protected Worker endpoint and schedules a daily raw-evidence refresh. The Worker code change must be deployed before the new universe-discovery endpoint is available in production. Raw evidence ingestion does not change production fundamentals or rankings. The accounting resolver, shadow validation, and runtime cutover are not yet complete. Do not describe production fundamentals or rankings as EdgarTools-backed until those later stages have passed.
