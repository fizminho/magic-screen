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
7. The protected `/api/fundamentals/edgartools/resolve-preview` endpoint applies deterministic read-only checks to the latest stored evidence: it independently verifies a unique, non-dimensional direct operating-income row against the extraction review value, checks filing/accession/period alignment, and surfaces invested-capital, currency, lease, and balance-sheet scope flags. It also exposes balance-sheet candidate counts/statuses and review-only conventional debt, unrestricted cash and net-debt candidates, including debt-selection and reconciliation statuses. It does not write calculated fundamentals.
8. A later approved resolver will apply independently tested accounting rules before any calculated fundamentals can be written.
9. Existing all-candidate completeness gates remain in force. No partial-universe ranking is published.

The existing bakeoff is both the extraction regression harness and the scheduled raw-evidence refresh. Push-based runs only test and upload an artifact. Scheduled and manually dispatched runs discover the active US MFI universe and ingest raw evidence; a manual symbol override is available for focused tests. The endpoint is size-bounded, authenticated, and idempotent by ticker/accession. It must not be mistaken for an approved accounting resolver.

## Accounting and ranking guardrails

- Use the latest eligible annual filing only. Keep all selected values tied to the same accession and fiscal period.
- Preserve original concept, label, amount, unit, period, accession, and source context.
- Do not add dimensional breakdowns to consolidated totals.
- Do not treat missing values as zero.
- Do not assume standard PP&E, rental equipment, right-of-use assets, lease liabilities, restricted cash, short-term investments, noncontrolling interests, or separate financing obligations are interchangeable. Restricted cash variants and short-term investments are tracked separately from unrestricted cash and are never deducted from EV as cash equivalents by this candidate resolver.
- Direct reported operating income is preferred. The extraction review recognises the exact consolidated US-GAAP concepts `OperatingIncomeLoss` and IFRS concepts `OperatingProfitLoss` / `ProfitLossFromOperatingActivities`, but only when exactly one non-dimensional, non-abstract row has one value for the selected annual period. Multiple candidate rows remain ambiguous.
- A direct operating-profit row is still a review-only candidate, not an approved EBIT value. Filing-specific reconstructions remain review-required until an explicit resolver and regression suite approve them.
- EBIT reconstruction is never generalized from a successful reconciliation alone. The statement's operating/non-operating classification and filing presentation must independently support the bridge.
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

The existing production Worker still calculates US fundamentals directly from SEC Company Facts. The EdgarTools extraction workflow now discovers the active US MFI universe through a protected Worker endpoint and schedules a daily raw-evidence refresh. The Worker code change must be deployed before the new universe-discovery endpoint is available in production. Raw evidence ingestion does not change production fundamentals or rankings. The read-only deterministic resolver preview is implemented, but accounting policy approval, shadow validation, and runtime cutover are not yet complete. Do not describe production fundamentals or rankings as EdgarTools-backed until those later stages have passed.

### Accounting candidate guardrails

- Invested capital is surfaced only as a review candidate when current assets, current liabilities and net PP&E each have exactly one consolidated, non-dimensional value for the same annual period. The review output separately reports rental equipment, right-of-use asset and current/noncurrent lease-liability candidate counts and scope flags; their treatment must be decided before ROC approval. A PP&E fact whose taxonomy concept explicitly combines property/equipment with finance-lease right-of-use assets is separately flagged as an embedded-scope issue; it must not be added again as a standalone ROU asset.
- Conventional net debt is calculated only when current debt, noncurrent debt and unrestricted cash are each uniquely identified. If an aggregate debt total is also surfaced, the resolver compares it with current plus noncurrent components and reports the difference, but withholds the component sum rather than risk double counting. A matching reconciliation is diagnostic evidence, not proof that the debt definition excludes leases or other financing obligations. Missing components remain unknown, not zero.
- EV sensitivity scenarios are emitted only when each required adjustment is known. An explicitly reported zero NCI is different from an unavailable NCI fact; unavailable lease liabilities are not silently treated as zero.
- Lease liabilities, non-controlling interests, restricted cash, short-term investments and separate financing obligations remain scope flags. No EV/Earnings Yield or ROC candidate is promoted into production.


#### Debt maturity classification boundary
Unqualified IFRS-style labels such as "interest-bearing loans and borrowings" are deliberately not assumed to be noncurrent debt. Without a maturity qualifier or an unambiguous taxonomy concept, the fact remains unclassified rather than being added to the debt bridge. This avoids silently treating an issuer's potentially aggregate borrowing line as long-term debt.

Explicit payable and financing concepts are also recognised: current `LoansPayableCurrent`, `NotesPayableCurrent`, `ConvertibleDebtCurrent` and `LinesOfCreditCurrent`; noncurrent `LongTermLoansPayable`, `LongTermNotesPayable` and `LongTermLineOfCredit`. Labels such as "bank and other borrowings, current", "notes payables, non-current" and "venture debt, net of current portion" are accepted when they clearly identify maturity. If more than one debt instrument is surfaced in a maturity bucket, the bucket remains ambiguous; the resolver does not sum multiple rows until additive scope and subtotal overlap rules are explicitly approved.



Current and noncurrent conventional debt categories now have reciprocal exclusion rules. A noncurrent label or taxonomy concept cannot enter the current bucket, and a current label or taxonomy concept cannot enter the noncurrent bucket. This protects the debt bridge from double counting when issuer labels and taxonomy concepts disagree, including labels such as "long-term debt, net of current portion". The new regression fixture checks SEC and issuer-specific concepts and asserts the candidate sets do not overlap.

#### Explicit enterprise-value candidate selection policy

The read-only EV scope review now reports the treatment of each balance-sheet category:

- Conventional debt enters the diagnostic bridge only when current and noncurrent components are each unique and no aggregate debt candidate is present. Any aggregate candidate, including multiple ambiguous aggregate rows, withholds the component sum. A matching reconciliation is diagnostic only.
- Only one separately identified unrestricted cash and cash-equivalents candidate may be deducted. Missing or ambiguous unrestricted cash stays unknown.
- Restricted cash, short-term investments, and combined cash/restricted-cash/investment totals are excluded from the base bridge. Short-term investments require separate liquidity and cash-equivalent policy review.
- Lease liabilities, noncontrolling interest, and separate financing obligations are excluded from the conventional base bridge pending explicit policy and instrument-scope review. NCI also requires alignment between consolidated EBIT and enterprise value.
- The output exposes a `selection_policy_review` object with each category's treatment and the overall `review_only_no_production_ev_or_earnings_yield` boundary.

This is a conservative candidate-selection policy for diagnostics, not a final Magic Formula EV definition. No value is written to production fundamentals or rankings.

#### Classification guardrails added after issuer bakeoff

Current and noncurrent lease liabilities are separated using both taxonomy concepts and labels. A noncurrent concept remains excluded from the current bucket even when its label says "net of current portion" or uses unusual spacing. Combined cash/restricted-cash/short-term-investment totals are not counted as short-term investments, and noncurrent marketable securities remain outside that bucket. These are candidate-classification safeguards only; they do not establish EV policy.

The expanded payable and credit-line patterns were rerun against the 29 supported issuers in the 2026-11-20 cohort. Current debt classification produced 17 unique candidates, 2 ambiguous buckets and 10 with no candidate; noncurrent debt produced 21 unique candidates, 1 ambiguous bucket and 7 with no candidate. The new patterns surfaced IRWD convertible notes, MGTX notes payable and QTTB venture credit lines. MNTN and SBC remain ambiguous because multiple debt rows exist in the same maturity bucket; those rows are not summed. No aggregate-debt candidate was identified. Unrestricted cash was uniquely identified for 27 of 29 supported issuers; HPQ and VXRT report combined cash/restricted-cash facts and therefore remain unresolved for the base cash deduction.

This cohort snapshot is extraction evidence only. It does not approve debt aggregation, cash scope, EV, Earnings Yield, ROC, or production ranking.


#### Balance-sheet identity reconciliation

The extraction report also includes a read-only statement identity diagnostic. It compares one reported consolidated total-assets fact with one reported consolidated total-liabilities-and-equity fact from the same annual fiscal period. It recognises US-GAAP `Assets` / `LiabilitiesAndStockholdersEquity` and IFRS `Assets` / `EquityAndLiabilities` presentations.

- Only unique, non-abstract, non-dimensional facts with a value for the selected fiscal period are considered.
- Duplicate totals are reported as `ambiguous_inputs`; absent or period-mismatched totals are `insufficient_inputs`.
- The diagnostic does not derive a missing total from liabilities plus equity, and does not treat missing values as zero.
- Differences within a small scale-relative rounding tolerance are marked `reconciled`; larger differences are marked `difference`.
- A reconciled statement is a data-quality signal only. It does not approve EBIT, debt, cash, invested capital, EV, ROC or ranking inputs, and it does not change eligibility or production data.

The 2026-11-20 regression cohort produced 29 extracted statements and 29 `reconciled` results, all with a zero reported difference; two tickers (`AFMJF`, `EGHSF`) were unsupported by the EdgarTools SEC-company-index path and therefore had no reconciliation result. This is a sample-level data-quality result, not evidence that all underlying line-item classifications are correct.

The extraction artifact also contains a small number of filing-specific EBIT reconstructions (for example, HRB, PBI and SGHC) that rely on issuer-specific statement presentation and filing notes. These are not generic XBRL mappings and are never promoted into the resolver or ranking automatically. The accounting exception queue surfaces them as manual-review evidence only when both the raw filing accession and the filing-specific review accession exactly match the Worker resolver preview accession. It records the candidate, method and cross-checks while keeping `production_approved=false`.

The accounting exception queue carries this diagnostic forward only when the raw extraction accession exactly matches the Worker resolver preview accession. A non-reconciled status (`difference`, `ambiguous_inputs` or `insufficient_inputs`) is promoted to P1 triage. Mismatched filing accessions are never mixed; the queue records the stored-preview source and leaves the raw reconciliation unavailable. Reconciled statements do not create an exception or imply policy approval.

#### Candidate confidence is not policy approval

The resolver review queue reports two separate dimensions:

- **Classification confidence** describes the evidence: unique candidate, ambiguous candidates, no candidate identified, or unresolved.
- **Policy status** describes whether the accounting treatment has been approved for the Magic Formula calculation. A unique row can still be excluded or held pending policy review.

In particular, uniquely classified current/noncurrent debt is not automatically approved as conventional debt; lease liabilities remain excluded pending a lease policy; restricted cash and short-term investments remain excluded pending their respective liquidity policies. EBIT and invested-capital candidates also retain separate approval requirements. Every assessment is explicitly marked production_approved=false, and queue output remains read-only.

This separation prevents a stronger extraction/classification result from silently becoming an accounting-policy decision or a production value.

## Shadow MFI ranking preview

The protected `GET /api/fundamentals/edgartools/ranking-preview` endpoint builds a read-only cross-sectional Greenblatt-style ranking from the latest EdgarTools filing evidence and MFI market-cap snapshot.

Eligibility is intentionally conservative. A company must have:
- a unique direct operating-income candidate from the selected annual filing;
- a positive invested-capital candidate;
- USD reporting currency (the MFI market-cap snapshot is USD);
- uniquely classified conventional current and noncurrent debt;
- a separately identified unrestricted-cash candidate;
- positive enterprise value after the candidate debt/cash bridge.

Formulas:
- Earnings Yield = EBIT / (market cap + conventional gross debt - unrestricted cash)
- Return on Capital = EBIT / invested capital
- Combined score = mean of the cross-sectional percentile ranks for Earnings Yield and Return on Capital.

Higher values rank better. Ties receive average percentile ranks. At least five eligible companies are required before numeric ranks are published; below that threshold, all rank fields remain null to avoid misleading single-company percentiles.

This endpoint is a **shadow preview only**. Debt, cash, EBIT and invested-capital values remain candidate/review-only and are not policy-approved. The endpoint does not write to `stock_fundamentals`, `stock_snapshot`, production ratios, eligibility, or production rankings. It explicitly returns immutable production flags.


#### Open-source debt mapping reference

The debt taxonomy review borrows a narrow mapping insight from the MIT-licensed [crible SEC EDGAR provider](https://github.com/maxgfr/crible/blob/main/src/crible/providers/edgar.py): its provider intentionally avoids generic US-GAAP `LongTermDebt` because that fact can include current maturities, and instead prefers `LongTermDebtNoncurrent` for the noncurrent bucket and `DebtCurrent` for the current bucket. Magic Screen applies that distinction conservatively in its own review-only extractor.

Magic Screen does not import crible's full canonical accounting model or treat its derived total-debt/EV definitions as approved. The local resolver still requires one unambiguous candidate per maturity bucket, preserves all candidate facts and hierarchy metadata, and refuses automatic aggregation when multiple instruments, duplicate concepts, parent/child relationships or aggregate totals may overlap. The MIT licence permits reuse subject to retaining its copyright and licence notice; this change adapts the mapping rule rather than copying the provider implementation.

Reference: [crible src/crible/providers/edgar.py](https://github.com/maxgfr/crible/blob/main/src/crible/providers/edgar.py), especially its CONCEPT_MAP comments for LongTermDebtNoncurrent, LongTermDebtAndCapitalLeaseObligations and DebtCurrent.

Debt hierarchy interpretation is deliberately narrower than merely checking whether candidates share a parent. Two distinct instrument facts commonly share `LiabilitiesCurrent` or `Liabilities`; that is not evidence that one includes the other. The resolver now marks potential overlap only for duplicate concepts/labels or when a candidate's explicit `parent_concept` points to another candidate concept. Shared-parent instruments remain ambiguous and review-only, with automatic aggregation disabled.

IFRS `ShorttermBorrowings` and `LongtermBorrowings` are tested as separate maturity buckets. Generic IFRS `Borrowings` is not assigned to either bucket without a maturity-specific concept or label. This avoids inventing a current/noncurrent split from an aggregate.

The accounting review queue can also enrich its debt evidence from the current extraction artifact, but only when the filing accession exactly matches the Worker resolver row. This keeps the review artifact useful on push-based regression runs where raw evidence ingestion is intentionally skipped, without mixing values from different filing vintages. If the accessions differ or the raw artifact is absent, the queue falls back to the stored resolver preview and labels the source accordingly.