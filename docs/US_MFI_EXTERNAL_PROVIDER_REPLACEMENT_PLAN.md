# US MFI External-Provider Replacement Plan

**Owner:** repository owner  
**Created:** 24 November 2026  
**Status:** Proposed; read-only proof of concept is the only approved first step  
**Scope:** US Magic Formula Investing workflow in InvestLah / Magic Screen  
**Related control document:** [US MFI masterplan](US_MFI_MASTERPLAN.md)

## 1. Executive decision

The project has spent substantial effort building a filing-based accounting pipeline (P1/P2/P3 review queues, EBIT reconstruction, debt/cash/lease classification, invested-capital policy, XBRL mapping and Gemini accounting review). The proposed direction is to evaluate replacing that accounting calculation path with an external, already-calculated Magic Formula Investing (MFI) ranking source.

The goal is to reduce accounting-policy maintenance and avoid making InvestLah responsible for independently reconstructing every issuer's EBIT, enterprise value and invested capital.

**This is a proposal, not an approved production migration.** The first and only immediate phase is a read-only POC. Existing production fundamentals, rankings, SEC sync, P1/P2/P3 evidence, review history and database records must remain unchanged until the owner explicitly approves a later migration.

## 2. Target architecture

If the POC passes and an external source can be consumed through a permitted, sustainable method, the target US workflow is:

1. **MFI source:** external provider supplies ticker, ranking, Earnings Yield (EY), Return on Capital (ROC), calculation date and available methodology/provenance.
2. **InvestLah validation layer:** validate ticker identity, coverage, duplicate rows, numeric formats, freshness, ranking consistency and missing-data behaviour. Preserve provider/source metadata.
3. **Shariah screening:** compare Musaffa and HalalScreener results. Keep each provider's status and as-of date separately; do not silently treat disagreement or missing coverage as Halal.
4. **Market data:** retain the existing quote/price data path for current price display and other app functions. Do not recompute provider EY/ROC from a different market-cap snapshot and present it as the provider's value.
5. **Gemini:** use the existing Gemini free-tier integration, within quota, for qualitative company research, business risks and investment thesis. Gemini must not invent or override financial metrics or Shariah status.
6. **InvestLah output:** display the external MFI rank and metrics alongside Shariah consensus/disagreement, source timestamps, coverage and qualitative research.

FinRobot is not part of the target architecture. It is an agent framework, not a ready-made MFI ranking/data feed. Reconsider only if a later, separately scoped research-agent use case demonstrates value and can run within the free-cost constraint.

## 3. Candidate source assessment

### 3.1 Investing Paths

Candidate for the primary POC comparison.

- Public value screener reports Greenblatt MFI ranking and EY/ROC based on annual SEC filing data.
- Its stated behaviour of leaving incomplete cases unranked with reasons is useful for auditability.
- The POC must verify current availability, update cadence, active universe, calculation methodology, historical/as-of fields and whether automated access is explicitly permitted.
- A public webpage is not automatically an API or permission to scrape. Do not build a production scraper or bypass controls. If no documented or permitted machine-readable access exists, record it as a manual research reference only.

Website: https://investingpaths.com/tools/value-screener

### 3.2 Official Magic Formula Investing

Use as an independent comparison/reference source, not assume it is a complete integration feed.

- Verify whether its free screener requires an account and what data can be exported or accessed.
- Record its disclosed calculation notes and data refresh timing.
- Do not assume its ranking methodology is identical to Investing Paths or to the project's previous calculation.

Website: https://www.magicformulainvesting.com/

### 3.3 AlphaStocks

Optional comparison only.

- The free tier may have limits and the platform's terms/access restrictions must be reviewed.
- Do not scrape or automate browser collection where its terms prohibit bots, scraping or the intended use.
- Do not depend on paid-only data, registration-gated bulk exports or premium API access.

Website: https://alphastocks.app/rankings/greenblatt

### 3.4 Source selection rule

No candidate is approved as the production source merely because its webpage is publicly viewable or its free tier works interactively. A source can become the production source only if:

- the relevant data is accessible without payment or paid-trial dependency;
- the permitted use covers the intended personal/app use and automated access, if automation is required;
- the source has a stable and repeatable way to retrieve data;
- the data includes enough provenance to detect stale or partial updates;
- the provider's calculation scope and missing-data rules are documented sufficiently for the product to explain limitations;
- no login, CAPTCHA, rate-limit, access-control or technical restriction is bypassed.

If no source meets these conditions, do not force a scraper into production. Keep the POC as a comparison exercise and consider a manual import or a different genuinely free source.

## 4. Free-only operating constraints

The project target is **RM0 incremental recurring cost** for MFI data and AI analysis.

- No paid API, premium subscription, paid data feed or paid trial as a production dependency.
- No paid LLM dependency. Existing Gemini free-tier usage may continue within its current quota and terms; quotas and model availability can change.
- Musaffa and HalalScreener are to be used only through currently available free access. Do not assume their commercial APIs are free or available.
- SEC EDGAR remains a free reference/verification source, subject to its access policies.
- Existing hosting and market-data costs are outside this change; do not introduce new infrastructure or paid services.
- Record any free-tier limits, attribution requirements, account requirements, usage restrictions and terms-of-use changes.
- If a source changes its free access or terms, mark it unavailable and fail safely rather than silently switching to an unapproved paid source.

**Important:** “Free to view” does not mean “free to automate”. Legal/terms permission and technical availability are separate acceptance criteria.

## 5. Phase 0: Read-only POC (first milestone)

### Objective

Compare external provider results against the current 30-symbol US MFI universe and the existing project outputs, without changing production data or application behaviour.

### Scope

- Use the current 30 active tickers as the comparison cohort:
  `GTM, HPQ, HRB, HRMY, OTEX, PBI, SGHC, SSTK, XPOF, BCRX, FHTX, MNTN, NRIX, PRDO, PXED, SBC, STRA, VXRT, ZVRA, AFMJF, ALEC, BMBL, CRNC, EGHSF, IRWD, MGTX, PLTK, QTTB, SNDK, UPWK`.
- Capture Investing Paths results for those symbols where available.
- Capture official Magic Formula Investing results where accessible.
- Capture AlphaStocks only if access is permitted and practical; it is not a mandatory dependency.
- Capture source URL, retrieval timestamp, displayed data/as-of date, ticker, rank, EY, ROC, fiscal year/period if shown, missing/unranked reason, and methodology notes.
- Compare coverage and metrics with the current project's latest available evidence/shadow output. Do not assume values are directly comparable if the periods, market-cap dates, formula definitions or company perimeter differ.
- Keep provider results in a POC artifact or isolated staging data. Do not write to production fundamentals, rankings, watchlists or user-facing shortlist.

### Required comparison output

For each ticker, record:

| Field | Description |
|---|---|
| Ticker | Normalized US ticker |
| Provider | Exact source name |
| Provider rank | Rank as displayed; null if unranked |
| EY | Provider's displayed value and unit |
| ROC | Provider's displayed value and unit |
| Data/as-of date | Provider snapshot date, not the retrieval date |
| Fiscal period | Period used, if disclosed |
| Coverage status | Ranked, unranked, missing, unsupported or inaccessible |
| Reason | Provider's reason or POC explanation |
| Methodology delta | Known difference from current project formula/policy |
| Access method | Manual, documented export, documented API or other explicitly permitted method |
| Evidence | Source URL and captured evidence/artifact |

### POC acceptance criteria

The POC passes only if all applicable criteria are met:

1. **Coverage:** at least 27 of 30 tickers can be positively resolved by the proposed primary source, or every uncovered ticker has a clear provider reason and the owner accepts the coverage gap.
2. **Freshness:** the source displays a usable as-of/update date and its update cadence can be established.
3. **Reproducibility:** the same retrieval procedure can be repeated and produces a traceable snapshot.
4. **Metric integrity:** EY and ROC definitions, units, sign handling and ranking rules are documented well enough to explain the provider's output.
5. **Missing-data safety:** missing or unsupported data stays missing/unranked; it is never converted to zero or silently omitted from coverage reporting.
6. **Access permission:** the intended collection method is allowed by the source's terms and does not bypass access controls.
7. **Cost:** no paid API, subscription, premium feature or trial is required.
8. **Comparison:** discrepancies against the current project's figures are categorized (period/date, formula, company perimeter, cash/debt scope, invested-capital definition, stale data or unexplained).
9. **Production immutability:** confirm no production fundamentals, ranking, Shariah status, user data or cron behaviour changed.

If the primary source cannot meet access-permission or free-cost requirements, the POC may still produce a useful manual comparison, but it **fails as an automated production-provider candidate**.

### POC deliverables

- A source-comparison report for all 30 tickers.
- A machine-readable snapshot (CSV/JSON) stored as a workflow artifact, not committed if it contains restricted or non-redistributable data.
- A methodology and access assessment for each candidate.
- A discrepancy summary against the current accounting pipeline.
- A recommendation: proceed, manual-only, test another source, or stop.
- Explicit confirmation that production state is unchanged.

## 6. Phase 1: Provider adapter design (only after POC approval)

If a source passes the POC and its access method is permitted:

- Define a provider-neutral internal contract for ticker, provider rank, EY, ROC, as-of date, fiscal period, source URL, retrieval timestamp, coverage status and missing reason.
- Implement one adapter for the selected provider only. Avoid multi-provider abstraction until a second source is genuinely required.
- Store immutable dated snapshots so provider changes can be compared over time.
- Validate ticker normalization, duplicate symbols, numeric parsing, rank uniqueness/ties, freshness and coverage.
- Fail closed on malformed, stale or partial snapshots. Do not publish a partially refreshed universe as if it were complete.
- Preserve the existing production path while the new adapter runs in shadow mode.
- Add unit tests, fixture tests, integration tests and workflow-level coverage checks.
- Do not copy provider values into legacy accounting columns without an explicit schema and migration decision.

## 7. Phase 2: Shariah screening integration

The agreed initial Shariah sources are Musaffa and HalalScreener.

- Retain separate provider records and timestamps.
- Normalize statuses without erasing source-specific labels: Halal, Not Halal, Doubtful, Not Covered/No Data, and any provider-specific equivalent.
- Define an explicit consensus rule. Until owner approval, show both results and label disagreement as **Needs Review**; do not auto-upgrade a stock to Halal.
- Recheck stale results before presenting them as current.
- Do not assume either service offers a free API. Use only access methods permitted by each provider.
- Keep the earlier 30-stock comparison as a dated research snapshot, not a permanent Shariah certification.

## 8. Phase 3: Gemini qualitative analysis

Gemini remains optional and supplementary.

- Use the existing Gemini integration and free-tier configuration only.
- Analyse business model, competitive position, material risks, recent company developments and thesis invalidation points.
- Include the MFI source snapshot and Shariah provider statuses as context, clearly labelled with dates.
- Do not ask Gemini to recalculate EY/ROC, invent missing financial values, approve accounting policy or issue a Shariah ruling.
- Respect quota, caching, retry and rate-limit controls. If quota is exhausted, the app must still work without AI commentary.
- FinRobot is excluded from this release to avoid a new framework, model dependency and operational burden.

## 9. Phase 4: Shadow rollout and migration decision

Only after a provider adapter passes validation:

- Run external ranking in shadow mode beside the existing production path.
- Compare universe membership, ranks, EY/ROC, refresh dates and missing-data outcomes over multiple refresh cycles.
- Investigate unexplained differences; do not tune the old accounting policy merely to force agreement.
- Define the user-facing meaning of provider rank and clearly disclose the source and methodology.
- Prepare a rollback plan and verify it in staging.
- Obtain explicit owner approval before changing production ranking or disabling any existing sync.

### Legacy accounting pipeline retirement

If and only if the external provider is approved for production:

- Stop scheduling new work for the legacy accounting/shadow review pipeline through a reversible configuration change.
- Retain SEC evidence, P1/P2/P3 decisions, review history and old snapshots as historical audit records.
- Do not delete tables, columns, workflows, artifacts or evidence as part of the first cutover.
- Do not remove the legacy Company Facts sync until its production role and dependencies are confirmed and a separate rollback-tested change is approved.
- Remove obsolete code only in a later cleanup PR after confirming no Bursa/Malaysia behaviour, shared market functionality or other application features depend on it.

## 10. FinRobot decision

FinRobot is **not required** for this replacement plan.

It is an open-source agent framework, not a ready-made MFI data provider. It does not remove the need to source and validate EY/ROC values. Introducing it now would add framework and model orchestration work while the primary goal is to simplify accounting and keep recurring cost at zero.

Revisit only under a separate proposal if there is a concrete agent workflow that cannot be handled by the existing Gemini integration, with a demonstrable free model/runtime and acceptable maintenance cost.

## 11. Effort estimate

Indicative engineering effort, conditional on source access and permission:

| Phase | Estimated effort |
|---|---:|
| Read-only POC and source/methodology assessment | 0.5–1.5 days |
| Provider adapter, validation and snapshot storage | 1–2 days |
| Shariah status normalization and UI integration | 0.5–1 day |
| Shadow rollout, tests, documentation and migration rehearsal | 1–2 days |
| **Total after successful POC** | **3–6.5 days** |

These are estimates, not commitments. They exclude waiting for provider access/permission, resolving provider-side limitations, and substantial UI redesign. If no free permitted automated source exists, the project should stop before adapter implementation rather than spend time building a fragile scraper.

## 12. Explicit non-goals

- No immediate production replacement.
- No changes to live ranking, fundamentals, watchlist or Shariah status.
- No deleting or rewriting P1/P2/P3 evidence and review history.
- No lowering minimum cohort or inventing ranks for missing symbols.
- No paid data feeds, paid APIs, subscriptions or LLMs.
- No scraping against provider terms, CAPTCHA bypass or access-control circumvention.
- No FinRobot integration in this scope.
- No claim that external data is error-free or that outsourcing the calculation eliminates accounting risk.

## 13. Approval gates

| Gate | Required decision |
|---|---|
| Gate 0 | Approve read-only POC only |
| Gate 1 | Accept a primary source and its free/permitted access method |
| Gate 2 | Approve adapter and shadow-mode implementation |
| Gate 3 | Accept Shariah normalization/consensus presentation |
| Gate 4 | Approve production cutover and legacy scheduling changes |
| Gate 5 | Approve later code/schema cleanup, if desired |

**Current state:** Gate 0 is proposed. No implementation or production change is authorized by this document. The next action is to execute the read-only POC and return its evidence and recommendation for owner review.
