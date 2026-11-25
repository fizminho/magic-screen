# Free-tier budget verification

**Verified:** 2026-11-25  
**Scope:** Cloudflare Workers Free, D1 Free, Workers AI Free, MarketData Free and public SEC EDGAR endpoints. No Workers Paid plan, AI Gateway prepaid credits or paid model subscriptions.

## Confirmed platform limits

| Resource | Documented Free limit | Magic Folio design budget |
|---|---:|---:|
| Workers requests | 100,000/day | Target below 2,000/day |
| Worker CPU | 10 ms per HTTP/Cron invocation | Keep CPU-heavy parsing small; network wait does not count as CPU |
| Worker memory | 128 MB | Keep runtime dependencies and payloads small |
| Worker subrequests | 50/invocation | Target at or below 40 |
| Simultaneous outgoing connections | 6/invocation | Bound provider concurrency |
| Cron Triggers | 5/account | Maximum four scheduled jobs |
| D1 rows read | 5,000,000/day | Target below 200,000/day |
| D1 rows written | 100,000/day | Target below 10,000/day |
| D1 storage | 5 GB/account | Target below 100 MB |
| D1 database size | 500 MB/database | Keep the single-owner database comfortably below the limit |
| D1 databases | 10/account | Reuse the existing `magic-screen-db` |
| D1 queries per Worker invocation | 50 on Free | Batch related statements |
| D1 Time Travel | 7 days | Not used as a backup; owner explicitly waived the one-time pre-reset backup |

D1 Free daily row read/write limits are enforced. Queries fail after the account limit is exceeded until the UTC daily reset. Stored data is not deleted by this enforcement.

## Workers AI Free

Cloudflare documents a shared allocation of **10,000 Neurons per day** for Workers AI on Workers Free. The allowance resets at 00:00 UTC. Requests above the Free allocation fail; using more requires the Workers Paid plan. The app must never upgrade itself, enable paid billing, or use prepaid AI Gateway credits.

Selected model for the first fixture-tested prototype:

- Model ID: `@cf/zai-org/glm-4.7-flash`
- Available on Workers Free according to Cloudflare's November 2026 model availability update
- Model catalogue marks it as zero-data-retention
- Cache by deterministic public-input hash and stop on quota/capacity errors
- Enforce a conservative daily neuron budget server-side and surface a clear quota-exhausted state

Cloudflare's Workers AI data-usage commitment states that standard inference inputs and outputs are processed only as needed to deliver the response and are not used to train models. This does not remove the app's own responsibility for anything it stores in D1, KV, R2, logs or other stateful services.

**Privacy boundary:** send only public company facts, public SEC filing metadata and public-source news text to Workers AI. Never send holdings, quantities, cost basis, portfolio weights, account identifiers, credentials, private notes or session data. Gemini Free is not used for this private-finance application.

## Other external sources

- **MarketData Free:** the adapter is manually triggered and capped to the documented daily allowance. It must handle provider 429 responses without retry loops. The API token stays in tab-scoped browser storage and is never written to D1 or Worker logs.
- **SEC EDGAR:** no API key is required. The app requires an explicit app/contact User-Agent, performs at most five fresh lookups per IP per hour, caches metadata for six hours and stores only 30 days of filing metadata and official SEC links. No filing documents are mirrored.
- **No scraping:** do not scrape broker dashboards, paywalled publishers or sites whose terms do not permit the intended use.

## Official sources checked

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- D1 Free daily limit enforcement: https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- Workers AI pricing and free allocation: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Workers AI data usage and zero-retention commitment: https://developers.cloudflare.com/workers-ai/platform/data-usage/
- GLM-4.7-Flash model details: https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/
- Workers AI model availability update (2026-11-05): https://developers.cloudflare.com/changelog/post/2026-11-05-planned-model-deprecations/
- MarketData plan and API terms: https://www.marketdata.app/
- SEC EDGAR developer resources: https://www.sec.gov/edgar/sec-api-documentation

## Owner-account checks before production

- Confirm the Cloudflare account remains on Workers Free and Workers AI is available.
- Confirm actual D1 row metrics and storage for `magic-screen-db`.
- Confirm the MarketData account's current Free allowance and permitted personal-use terms.
- Set `SEC_USER_AGENT` to the app name and a real contact email before any live SEC request.
- Choose the final production hostname and configure RP ID/origin before passkey registration.
- Keep the production reset behind its explicit manual confirmation; no reset or deployment has been run by this checklist.
