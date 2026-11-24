# Magic Formula Investing integration

The US market uses Magic Formula Investing as its screening-universe source. Bursa Malaysia remains on the separate Bursa CSV import workflow.

## Cloudflare secret

Configure a Worker secret named `MFI_SESSION_COOKIE` in the `magic-screen` Worker:

1. Sign in to Magic Formula Investing in a desktop browser.
2. Open Developer Tools, then Network.
3. Reload the Stock Screener page while signed in.
4. Select the `/Screening/StockScreening` document request.
5. Copy the complete `Cookie` request-header value.
6. In Cloudflare Dashboard, open Workers & Pages > magic-screen > Settings > Variables and Secrets.
7. Add a secret named `MFI_SESSION_COOKIE` and paste the cookie value. Do not put it in GitHub, D1, source code, or chat.

Treat this cookie like a password. Anyone holding it may be able to use the authenticated session. Use a dedicated account if possible. Do not share the cookie. If it expires, sign in again and replace the Worker secret.

The Worker fetches the screening page, extracts the current `__RequestVerificationToken`, submits the form, parses the HTML result table, and upserts the returned symbols and market capitalizations into D1. The anti-forgery token is not stored.

## Endpoint

`GET /api/mfi/screen?minimumMarketCap=50&select30=true`

- `minimumMarketCap`: USD millions; site minimum is 50.
- `select30=true`: request 30 stocks. Use `false` for 50.
- The response list is displayed in the order supplied by the source. The sample response is alphabetically sorted, not ranked by Magic Formula score.
- The response does not include Earnings Yield, Return on Capital, or an individual Magic Formula rank. Those fields remain unavailable rather than being inferred.
- Yahoo Finance remains the quote source.
- The source is an undocumented website endpoint and may change or restrict automated access. Session expiry requires replacing the secret.

## First test

After the secret is saved and the Worker deployment is live, request:

`/api/mfi/screen?minimumMarketCap=50&select30=true`

A successful response includes `imported`, `stocks`, `priceDate`, and `quarterDate`. A missing or expired session returns an explanatory error.

## Forced refresh rate limit

`force=1` from an anonymous caller is throttled for 15 minutes after the last successful sync; inside that window the cached result is returned. Failed upstream attempts are not separately persisted yet, so this is not a complete attempt-based rate limit. Configure a Cloudflare WAF rate-limiting rule as an additional control. A valid bearer token bypasses the application cooldown. See `SECURITY.md`.
