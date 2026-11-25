# Magic Formula Investing integration

Magic Formula Investing supplies the US ticker universe. Its screen order is not treated as a rank, and the app does not derive Earnings Yield or Return on Capital from MFI output.

## Required Worker secret

Configure `MFI_SESSION_COOKIE` in the Cloudflare Worker:

1. Sign in to Magic Formula Investing in a desktop browser.
2. Open Developer Tools → Network and reload the Stock Screener page.
3. Select the `/Screening/StockScreening` document request.
4. Copy the complete `Cookie` request-header value.
5. In Cloudflare Dashboard → Workers & Pages → magic-screen → Settings → Variables and Secrets, add `MFI_SESSION_COOKIE` as a secret.

Treat the cookie like a password. Never place it in Git, browser code, prompts or chat. Replace it when the session expires.

## Endpoint

`GET /api/mfi/screen?minimumMarketCap=50&select30=true`

- `minimumMarketCap`: USD millions; minimum supported value is 50.
- `select30=true`: request 30 candidates. Use `false` for 50.
- Successful results are cached for six hours when the screen settings match.
- Anonymous forced refresh is limited by a 15-minute cooldown after the last successful sync.
- The response provides candidate tickers, company names and market-cap snapshots. It does not provide Investing Paths rank, EY or ROC.

The Worker fetches the screening page, extracts its anti-forgery token, submits the form and stores the returned candidate list in D1. The anti-forgery token is not stored.

MFI access is subject to the provider's current website terms and session restrictions. Do not bypass CAPTCHA, access controls or rate limits.
