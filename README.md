# Magic Screen

A Cloudflare-first stock research dashboard for Bursa Malaysia and US equities.

## Current capabilities

- React + TypeScript responsive screener
- Bursa Malaysia and US market views
- US candidate universe sourced from the authenticated Magic Formula Investing screener
- Quote snapshots cached in Cloudflare D1
- EdgarTools is the designated primary extraction provider for US fundamentals (Python extraction lane; runtime cutover in progress)
- SEC EDGAR filings remain the underlying source; Company Facts is retained as a legacy runtime/comparison lane during migration, not as the target EdgarTools provider fallback
- Earnings Yield and Return on Capital remain candidate metrics until deterministic accounting validation and full-universe checks are approved
- The shadow US MFI preview ranks the accounting-validated subset using classic Greenblatt ordinal-rank sums; unsupported and unresolved candidates remain visible in coverage and are excluded from the ranked subset
- Production US rankings remain gated until the full universe, accounting policy and shadow validation are approved
- Legacy SEC Company Facts fundamentals sync runs in the background every 30 minutes, processing up to 10 candidates per invocation; this is not the EdgarTools extraction schedule
- Search, sort, market switcher, watchlist and Shariah-status filtering
- Shariah status remains **Unverified** until a credible screening source is integrated

## Data sources and limitations

- **US candidate list:** Magic Formula Investing. Its screening results are a candidate universe, not a ranked result list.
- **US financial statements:** SEC EDGAR annual filings extracted through EdgarTools for the target evidence workflow. The older Company Facts runtime lane still runs during migration and must not be mistaken for the approved target accounting dataset.
- **Quotes:** Yahoo Finance's unofficial chart endpoint, provided on a best-effort basis without an uptime or usage guarantee.
- **Bursa Malaysia universe:** imported through the protected universe-import endpoint. Verify listing data against Bursa sources.
- **Shariah:** no compliance status is inferred from a company name, ticker or sector.

The screener is a research aid, not investment advice. Verify current filings, company disclosures and Shariah status before making an investment decision.

## Targeted Gemini review batch

The accounting-review batch supports manual dispatch for normal resumable runs. For a narrowly scoped gap, a controlled main push can trigger one or two explicitly named active US tickers by including `[gemini-review:TICKER1,TICKER2]` in the commit message while changing this README, the batch workflow or its runner script.

The guarded push mode:
- accepts at most two tickers;
- disables `full_scope` re-review;
- caps each Worker page at two new Gemini calls;
- stops after 15 minutes;
- reuses existing cache entries and locks, so unchanged evidence is not resent.

Use this only for a verified coverage gap. The run is AI review only, not human approval, and never writes production fundamentals or rankings.

The current P1 follow-up is OTEX and GTM after the fresh full-universe refresh [#44993883641](https://github.com/fizminho/magic-screen/actions/runs/44993883641). Their targeted batch supplements the filing worksheets only; denominator, tax-receivable-agreement and cohort policy decisions remain for human approval.

## Gemini review ledger export

The persistent review history and human-decision export is read-only. It makes no Gemini calls and does not change application data or rankings.

- Manual run: Actions → Export Gemini review audit ledger → Run workflow.
- Controlled main push: a push affecting this workflow, its export script or README whose commit message contains `[ledger-export]` also runs the export.
- The workflow uploads JSON and Markdown artifacts with 14-day retention. History rows include evidence-ID metadata; raw Gemini response JSON is not exposed by the history endpoint. Treat the JSON as sensitive operational data and do not commit it to the repository.
- After any targeted issuer review, refresh this export so the audit ledger captures the new task history; a successful batch run is not a human accounting approval.

## Full-universe validation operations

The EdgarTools fundamentals bakeoff supports three execution modes:

- Scheduled run: the daily schedule resolves the current active US MFI universe.
- Manual run: use Actions → EdgarTools fundamentals bakeoff → Run workflow. Leave `symbols`, `mfi_price_date` and `market_caps_json` blank to use the current active universe and its matching market-cap snapshot.
- Controlled main-branch run: a push affecting a configured bakeoff path whose commit message contains `[full-universe]` also resolves the live active universe. A normal push-triggered run without this marker is regression-only and uses the pinned fixture cohort.
- Verification rule: a green regression-only push is not a fresh cohort refresh. Confirm the workflow log includes active-universe discovery, raw ingestion and full-universe coverage validation before updating the current cohort snapshot. The last accepted full-universe baseline is [run #44989926114](https://github.com/fizminho/magic-screen/actions/runs/44989926114); [run #44993168825](https://github.com/fizminho/magic-screen/actions/runs/44993168825) was regression-only.

Do not supply a ticker override or custom market-cap map for a cohort refresh. Confirm the run's universe-resolution, extraction, evidence-ingestion, lease/ROU, exception-queue, policy-cohort and ranking-sensitivity stages before treating it as a full validation. All bakeoff modes are shadow-only and must report production data unchanged.

## External MFI provider replacement evaluation

The proposed free-only external-provider path and its completed read-only POC are documented here:
- [External-provider replacement plan](docs/US_MFI_EXTERNAL_PROVIDER_REPLACEMENT_PLAN.md)
- [Read-only POC report (24 November 2026)](docs/US_MFI_EXTERNAL_PROVIDER_POC_2026-11-24.md)

The POC found no provider approved for automated production use under the current free-only and permitted-access requirements. Do not implement a scraper or provider adapter without a separately verified access permission and owner approval. Production rankings and the existing accounting path remain unchanged.

## US MFI implementation control

The execution order and current completion checklist live in [US MFI masterplan](docs/US_MFI_MASTERPLAN.md). Read it before implementing US accounting, provider migration, ranking or production-release changes.

## Intentional design decisions

Read [Intentional design decisions](docs/INTENTIONAL_DESIGN_DECISIONS.md) before changing candidate selection, ranking gates, currency handling, SEC retry rules, MFI caching or scheduled processing. These behaviours are deliberate safeguards against misleading financial data.

Additional technical notes:
- [EdgarTools primary provider decision and rollout](docs/EDGARTOOLS_PROVIDER.md)
- [SEC fundamentals pipeline](docs/SEC_FUNDAMENTALS.md)
- [Magic Formula Investing integration](docs/MAGIC_FORMULA_INTEGRATION.md)
- [Stock universe and Bursa import](docs/STOCK_UNIVERSE.md)
- [Cloudflare setup](docs/SETUP.md)

## Stack

- React, TypeScript, Vite
- Cloudflare Workers Static Assets
- Cloudflare D1
- Workers Cron Triggers

**US MFI market-cap provenance:** Full-universe EdgarTools runs take market caps from the same refreshed Magic Formula Investing response as the active ticker list, use its quote date for FX alignment, and validate every active symbol before ranking. The pinned 18 November 2026 map is regression-only; custom maps replace it without filling missing tickers from stale values.

## Security

See [SECURITY.md](SECURITY.md) for secrets, route access model and hardening notes.
