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

1. A scheduled or manually dispatched GitHub Actions job installs a pinned EdgarTools version.
2. The job resolves the active MFI tickers and extracts each issuer's latest eligible annual filing (10-K, 20-F or 40-F).
3. The job emits a versioned, normalized JSON payload with ticker, CIK, accession, filing date, fiscal period, reporting currency, statement facts, extraction status, and source provenance.
4. A protected Worker ingestion endpoint validates the payload and persists provider evidence to D1.
5. The Worker applies deterministic, independently tested accounting rules before writing calculated fundamentals.
6. Existing all-candidate completeness gates remain in force. No partial-universe ranking is published.

The existing review-only bakeoff is the extraction regression harness. It must not be mistaken for the production ingestion endpoint or an approved accounting resolver.

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

As of this decision, the existing production Worker still calculates US fundamentals directly from SEC Company Facts. The EdgarTools bakeoff remains research-only and does not write D1 or change production rankings. The provider decision is made; the runtime cutover is not yet complete. Do not describe the production pipeline as EdgarTools-backed until the ingestion and shadow-validation stages have passed.
