# Data sources and third-party components

Review date: 25 November 2026. Re-check provider terms before enabling or materially changing an adapter. Personal-use access is not permission to redistribute data.

## Authentication

| Component | Version | Licence | Use | Notes |
|---|---:|---|---|---|
| `@passwordless-id/webauthn` | 2.4.1 | MIT | Browser passkey ceremony and Worker-side WebAuthn response verification | Documents Cloudflare Workers/WebCrypto support. Server verifies challenge, origin, RP ID hash, user verification and authentication signatures. We additionally check registration user-presence flags, raw credential ID against the attested credential ID, algorithm consistency, cross-origin client data and discoverable user handle. No private key or biometric data is stored by this app. |

References:
- https://github.com/passwordless-id/webauthn
- https://webauthn.passwordless.id/registration/
- https://webauthn.passwordless.id/authentication/
- Release 2.4.1: https://github.com/passwordless-id/webauthn/releases/tag/2.4.1

The library is used as a dependency; no demo code was copied. Its browser client emits debug messages, so the app temporarily suppresses `console.debug` only while a passkey ceremony is running.

## US market prices: optional Market Data API

**Optional adapter implemented, not enabled:** MarketData.app Free Forever. The browser fetch adapter, owner-authenticated D1 quote-snapshot API and portfolio UI exist. Live account testing remains pending.

- Personal, non-professional use only. Its terms permit data storage on a computer/device or cloud storage service only when the data is accessible only to the account owner.
- Free tier: 100 API credits/day, standard pricing endpoints and at least 24-hour delayed data; history is limited to one year. It is not a real-time feed.
- Self-service use does not permit redistribution. The app must remain single-owner/private, and quote snapshots must never be exposed to another user, public API or export.
- The provider explicitly allows personal browser dashboards that only the subscriber accesses. Its CORS support is intended for that use. The API token is visible in browser requests, so it must be entered by the owner after passkey login, kept only in browser session memory/session storage, never committed or sent to the Worker.
- Each account may connect from only one IP at a time. Switching devices/IPs is allowed, but simultaneous requests from multiple IPs are not. Refresh should be initiated from one device; the resulting owner-only D1 snapshot can then be read on the owner's other devices.
- Free plan data must be deleted if the provider account is closed. Use the documented delayed-quotes endpoint (`/v1/stocks/quotes/`), not the real-time-prices endpoint. Without a UTP entitlement the free tier returns historical (at least one day old) quotes. Preserve the `updated` timestamp and label the data `24h delayed`.
- Coverage documented by the provider is US exchange data (IEX/UTP). It is not a Bursa Malaysia feed.

References:
- https://www.marketdata.app/terms/
- https://www.marketdata.app/docs/account/free-accounts/
- https://www.marketdata.app/docs/account/data-policies/single-ip/
- https://www.marketdata.app/docs/api/cors/
- https://www.marketdata.app/docs/account/data-freshness/
- https://www.marketdata.app/docs/api/stocks/quotes/

Do not enable this adapter until the owner has their own account/API token and accepts the 24-hour delay and single-IP restriction.

## Bursa Malaysia prices

No free, clearly licensed Bursa market-data API has been approved for this project. Bursa's Information Services Guidelines require an Information Services Licence Agreement for website ticker service, and the published fee schedule lists per-instrument website display charges for real-time, delayed and end-of-day information. Do not scrape Bursa pages or broker websites.

For the free rebuild, support manual price entry or import of a CSV exported by the owner's own broker, subject to that broker's personal-use terms. Keep the import private to the owner and preserve its source/date. A licensed Bursa feed can be added only after an explicit licence is obtained.

References:
- https://www.bursamalaysia.com/sites/5d809dcf39fba22790cad230/assets/6440f97839fba259236ba5ba/ISLA_Guidelines_V1.1_01_Apr_2023.pdf
- https://www.bursamalaysia.com/sites/5d809dcf39fba22790cad230/assets/63ae56f15b711a799d692659/Information_Services_Licence_Agreement_Price_List_in_Ringgit_Malaysia__MYR_01012023.pdf

## LLM analysis: Gemini API not approved for personal portfolio data

**Do not integrate Gemini Free for this personal portfolio use case at this time.** Google's current Gemini API Additional Terms (effective 23 March 2026) state that Gemini API/AI Studio are for developers building for professional or business purposes, not consumer use. The unpaid quota also allows Google to use submitted prompts and generated responses to improve products and machine-learning technologies; human reviewers may read and process inputs/outputs. The terms explicitly say not to submit sensitive, confidential or personal information to unpaid services.

Magic Folio is currently a private personal portfolio tool and its holdings, watchlist, allocation weights and activity are personal financial information. Do not send those values, ticker lists tied to the owner's portfolio, prompts, or generated analysis to Gemini Free. Removing names or quantities does not automatically make a private portfolio non-personal. Do not enable GEMINI_API_KEY, a Gemini model var, scheduled AI jobs, or client-side Gemini calls until a compliant use case/provider and data-handling basis are confirmed.

The deterministic dashboard, concentration checks, daily-move thresholds and quote-quality warnings run locally in the Worker and remain the approved v1 analysis path. Any future model provider must be reviewed for consumer-use eligibility, input retention/training, human review, data residency, rate limits and pricing before implementation. Paid Gemini quota states prompts/responses are not used to improve Google's products, but it is not free and does not remove the need to check the service's use restrictions.

References:
- https://ai.google.dev/gemini-api/docs/terms
- https://ai.google.dev/gemini-api/docs/pricing
## US filings: official SEC EDGAR

**Approved source for US issuer filings and XBRL facts.**

- Use the official `data.sec.gov` submissions and companyfacts JSON APIs, plus official EDGAR filing archive links.
- No API key is required. Every request must identify the application/operator in a descriptive `User-Agent` with a contact address.
- SEC fair-access guidance sets a maximum of 10 requests/second across all machines. Magic Folio should stay well below this (target no more than 2 requests/second), fetch only portfolio CIKs, cache responses and respect 429 responses.
- The owner enters a 1–10 digit CIK on a US holding/watchlist item; the Worker normalizes it to 10 digits. SEC's ticker/CIK association file is periodically updated but not guaranteed accurate or complete, so the app does not silently infer CIKs.
- The on-demand owner-only endpoint fetches the company's submissions JSON, returns selected recent form metadata and official SEC URLs, and caches metadata in D1 for six hours. Filing metadata has a 30-day retention policy and is pruned on the next cache miss for that instrument; a scheduled global cleanup is still pending. Full filing documents and article bodies are never mirrored. Cache misses are rate-limited to 5 upstream lookups/hour per source IP. Do not crawl the whole EDGAR site.

References:
- https://www.sec.gov/about/developer-resources
- https://www.sec.gov/about/webmaster-frequently-asked-questions
- https://www.sec.gov/Archives/edgar/data/

The SEC `User-Agent` contact value must be configured by the owner before SEC requests are enabled. It must include the app name and the owner's real contact email. Do not use a placeholder or invent a contact email. The API stays disabled when this variable is missing.

## News and issuer announcements

No general publisher-news RSS scraper is approved for the app. The Star RSS page describes personal, non-commercial RSS use, but its broader terms restrict online reuse and prohibit use of its content in AI/RAG without permission. The Edge and Bernama also impose restrictions on copying, storing or republishing their content. Do not ingest those feeds into D1 or send their content to any AI model without written permission.

For the first release:
- Use official SEC filings for US issuer event/filing alerts.
- Allow the owner to save an issuer's official investor-relations URL or Bursa announcement URL manually.
- Open the original source in the browser; do not copy the article body.
- Add a news/RSS provider only after its terms explicitly permit the intended private-app storage and display.

References:
- https://www.thestar.com.my/Rss/
- https://www.thestar.com.my/Terms/
- https://www.bursamalaysia.com/sites/5d809dcf39fba22790cad230/assets/6440f97839fba259236ba5ba/ISLA_Guidelines_V1.1_01_Apr_2023.pdf
- https://blis.bernama.com/index.php?mod=page&opt=disclaimer

## Rejected sources

| Provider/source | Decision | Reason |
|---|---|---|
| Yahoo Finance chart endpoint / `yfinance` | Rejected | Yahoo's terms prohibit automated collection without express prior permission. Do not scrape undocumented chart endpoints. |
| Financial Modeling Prep free plan | Rejected for UI display | Its pricing page says displaying/redistributing data requires a separate Data Display and Licensing Agreement. |
| Alpha Vantage | Not selected | Terms are ambiguous around intended investment-analysis use; free request limits and market coverage do not yet meet the combined US/Bursa requirement. Seek written clarification before use. |
| The Edge / Bernama news scraping | Rejected | Content reuse, storage and redistribution restrictions are incompatible with an unattended cached news database without permission. |

## AI provider

### Google Gemini API
Rejected for this app's current personal-consumer use. The Gemini API terms effective 23 March 2026 describe the service as intended for professional/business use, not consumer use. Google also states that Free Tier prompts and responses may be used to improve its products and may be reviewed by humans. Do not integrate Gemini Free or send personal portfolio data to it.

References:
- https://ai.google.dev/gemini-api/terms
- https://ai.google.dev/gemini-api/docs/pricing

### Cloudflare Workers AI
Selected for the private research brief, subject to the following boundaries:

- Use the Cloudflare Workers AI binding with model `@cf/zai-org/glm-4.7-flash`. Cloudflare lists this model as available on the Workers Free plan.
- Workers Free includes 10,000 Neurons/day at no charge; requests fail when the free allocation is exhausted unless the account is upgraded. Do not enable paid billing or prepaid credits for this project without explicit owner approval.
- Cloudflare's Workers AI data-usage commitment states zero retention for standard inference and that Customer Content is not used to train AI models. Stateful features, logging or application caching can change retention, so do not enable AI Gateway logging or log raw prompts/responses.
- The GLM-4.7-Flash model is listed with an MIT licence. Cloudflare hosts the model; review its model licence and Cloudflare terms before changes.
- AI input is restricted to public SEC companyfacts and public SEC filing metadata. Do not send holding/watchlist status, quantities, average cost, personal notes, portfolio weights, account identifiers, provider tokens, personal settings or MarketData.app quote data.
- AI output is a public-company research brief only. No personalized buy/sell recommendation, target price or guaranteed-return statement. Every cited accession must be present in the supplied SEC source set.

References:
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/platform/data-usage/
- https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/
- https://huggingface.co/zai-org/GLM-4.7-Flash
- https://developers.cloudflare.com/workers-ai/changelog/product/workers-ai/
