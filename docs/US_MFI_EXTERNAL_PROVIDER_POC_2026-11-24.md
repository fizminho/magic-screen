# US MFI External-Provider Read-Only POC Report

**Date:** 24 November 2026  
**Repository:** fizminho/magic-screen  
**Scope:** 30 active US MFI tickers  
**Execution mode:** Public-page research only; no code, database, workflow, production or ranking changes  
**Decision:** **FAIL for automated production replacement under the current free-only and permitted-access requirements**

## 1. Executive result

The POC confirms that external MFI screeners can provide useful independent research and precomputed EY/ROC values. However, none of the three reviewed candidates currently satisfies all of the project's production requirements at once: free access, repeatable automated retrieval, sufficient coverage, and terms that permit using the data to power InvestLah.

**Do not build an adapter or scraper against any of these three sources at this stage.** In particular, Investing Paths is technically the closest match but its Terms of Service prohibit scraping, bulk-download and using its data/calculated outputs to build a competing product. AlphaStocks explicitly prohibits scraping and automated collection and limits use to personal research. The official Magic Formula Investing screener requires registration and its terms describe the content as for personal information only and prohibit commercial copying/redistribution.

This does not mean the accounting engine has been proven better. It means the desired free, permitted, machine-readable replacement source has not yet been found.

## 2. Candidate evaluation

| Candidate | Free viewing | MFI data | Freshness | Access / terms finding | POC decision |
|---|---|---|---|---|---|
| Investing Paths Value Screener | Yes; public screener, no account needed to open the tool | EY, ROC, annual filing period and ranking | Page snapshot updated 17 Nov 2026; data through 16 Nov 2026; site says rebuilt nightly | Terms prohibit scraping, bulk-download/resale, and use to build a competing product | **Reject for automated InvestLah feed unless written permission is obtained** |
| Official Magic Formula Investing | Free, but account registration required to use screener | Proprietary Magic Formula ranking; slight accounting adjustments | FAQ says prices typically daily and financial data quarterly | Registration terms say content is for personal information only and prohibit copying, redistribution or republication for commercial gain; no public API identified | **Reference/manual research only; no integration approval** |
| AlphaStocks Greenblatt | Free plan exists | Greenblatt status/score and daily ranking | Ranking page as of 21 Nov 2026 | Terms prohibit scraping/crawling/automated collection, redistribution and commercial use beyond personal research | **Reject for automated feed** |

Sources:
- Investing Paths value screener: https://investingpaths.com/tools/value-screener
- Investing Paths methodology: https://investingpaths.com/methodology
- Investing Paths terms: https://investingpaths.com/terms
- Official MFI FAQ: https://www.magicformulainvesting.com/Home/Faqs
- Official MFI registration terms: https://www.magicformulainvesting.com/Account/Register
- AlphaStocks Greenblatt ranking: https://alphastocks.app/rankings/greenblatt
- AlphaStocks methodology: https://alphastocks.app/methodology/greenblatt
- AlphaStocks terms: https://alphastocks.app/terms

## 3. Investing Paths: methodology and observed sample

The public page reported 1,519 US companies ranked and 1,081 left unranked with reasons. It describes the ranking as the sum of ordinal ranks for earnings yield and return on capital, computed from annual SEC filings. The latest snapshot captured for this POC was updated 17 November 2026 with data through 16 November 2026.

Six symbols from the current 30-name cohort appeared in the publicly displayed top-25 table:

| Ticker | Displayed rank | EY | ROC | Fiscal year ended |
|---|---:|---:|---:|---|
| BCRX | 3 | 18.7% | 157% | 2025-12-31 |
| IRWD | 5 | 12.5% | 279% | 2025-12-31 |
| HRB | 7 | 11.5% | 279% | 2026-06-30 |
| SNDK | 13 | 11.2% | 157% | 2026-07-03 |
| OTEX | 15 | 10.0% | 207% | 2026-06-30 |
| GTM | 19 | 10.8% | 139% | 2025-12-31 |

These values are a dated provider snapshot, not current live metrics and not a recommendation. They are not copied into application data.

The other 24 cohort symbols were **not individually resolved** in this POC. The public page exposes the first 25 ranked names and a control to show the full 1,519; the Terms of Service prohibit bulk-download and use of the service to build a competing product. We therefore did not retrieve the remaining table or infer that a ticker absent from the visible top 25 is unranked. This is an intentional access/terms boundary, not a missing-data conclusion.

### Methodology differences and risks

Investing Paths states:
- It uses as-reported SEC filing values, stamped with filing publication dates.
- Missing required figures are generally left unscored rather than estimated.
- It uses annual figures, so results can lag the current operating situation by several quarters.
- Its EV calculation omits minority interest and preferred stock, and nets cash and cash equivalents only, not short-term investments.
- It says a filer that has never reported any borrowing is treated as debt-free; this is a provider-specific inference that must be understood before relying on its debt treatment.
- It has not backtested the screen.

This could materially differ from the project's existing policy candidates, especially for NCI, preferred stock, short-term investments, debt discovery and fiscal-period timing. Outsourcing the calculation does not eliminate accounting methodology risk; it transfers the calculation and its assumptions to the provider.

## 4. Official Magic Formula Investing: findings

The FAQ describes the website as a free Magic Formula stock screener and states that it makes slight accounting adjustments to commonly used ratios. It says price data is typically refreshed each trading day and financial data quarterly.

However:
- The screener requires account registration.
- Registration terms describe the content as for personal information only and prohibit copying, redistribution or republication for commercial gain.
- No documented public API or authorized automated export was identified in this review.
- The provider's exact accounting adjustments are not sufficiently disclosed in the FAQ to reproduce or reconcile every value.

It remains useful as an independent human research reference, but it is not approved as an automated InvestLah data source.

## 5. AlphaStocks: findings

The Greenblatt ranking page reports a daily ranking and the methodology page explains its EY/ROC and combined ordinal-rank approach. A free tier exists.

However, the current Terms of Use explicitly prohibit:
- scraping, crawling or automated collection using bots/scripts;
- redistribution, republication or resale of scores/data/content;
- commercial use beyond personal research.

The free plan does not override these restrictions. AlphaStocks is therefore excluded from automated collection and product integration. No AlphaStocks ranking data is persisted in this report or the application.

## 6. 30-ticker coverage status

The cohort is:
`GTM, HPQ, HRB, HRMY, OTEX, PBI, SGHC, SSTK, XPOF, BCRX, FHTX, MNTN, NRIX, PRDO, PXED, SBC, STRA, VXRT, ZVRA, AFMJF, ALEC, BMBL, CRNC, EGHSF, IRWD, MGTX, PLTK, QTTB, SNDK, UPWK`.

For Investing Paths, only the six tickers shown in Section 3 were positively observed in the public top-25 table. The remaining 24 are **not assessed**, not classified as unranked or unsupported. The POC's minimum coverage acceptance criterion of 27/30 was not met, and the terms prevent retrieving the entire table for this product-building purpose.

No candidate passed all production acceptance criteria. No external rank is promoted into InvestLah.

## 7. Production and repository safety

The POC was performed as public-source research only.

- No repository code was changed.
- No application database or D1 records were changed.
- No production fundamentals or rankings were changed.
- No Shariah statuses or watchlists were changed.
- No Worker cron, GitHub Actions workflow, schedule or secret was changed.
- No provider scraper, API adapter or browser automation was created.
- No FinRobot dependency or model was added.

The only repository change associated with this work is this documentation report and the update to the external-provider plan.

## 8. Recommendation and next decision

**Recommendation: do not proceed to Phase 1 adapter implementation.**

The current free sources are useful as human research references but do not offer a verified, permitted automated data path for InvestLah. We should not disguise a prohibited scraper as a free integration.

Recommended next choices, in order:

1. **Request written permission/data access from Investing Paths** for a narrow private-app use case, including automated retrieval, caching, display, attribution and redistribution rights. Ask whether they offer an authorized API or export and whether it is free.
2. **Ask Magic Formula Investing** whether they provide authorized data access for a private app and what reuse terms apply.
3. If both decline or require payment, stop the external-provider replacement effort. Keep the current production path stable, pause further accounting-engine expansion where safe, and decide separately whether to retain a smaller transparent calculation scope or pursue another provider with an explicit free API and suitable licence.

Do not integrate AlphaStocks unless its terms are changed or written permission explicitly authorizes the intended automated/product use.

FinRobot remains unnecessary: it is not a data provider and does not solve this access problem.

## 9. Gate status

| Gate | Status | Evidence / decision |
|---|---|---|
| Gate 0: Read-only POC | **Completed** | This report |
| Gate 1: Select free, permitted source | **Blocked** | No reviewed source passes access and reuse requirements |
| Gate 2: Provider adapter | **Not started** | Requires Gate 1 approval |
| Gate 3: Shariah integration | **Unchanged** | Existing Musaffa + HalalScreener research plan remains separate |
| Gate 4: Production cutover | **Not approved** | No production changes |
| Gate 5: Legacy cleanup | **Not approved** | Preserve evidence and rollback options |

**Final POC outcome:** no source approved; no implementation authorized; production remains unchanged.
