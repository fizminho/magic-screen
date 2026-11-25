# Magic Folio setup

## Architecture

- React + TypeScript + Vite frontend.
- Cloudflare Worker with static assets.
- Cloudflare D1 for owner portfolio data.
- Passkey-only single-owner authentication using `@passwordless-id/webauthn`.
- Optional MarketData.app Free Forever browser adapter for US delayed quotes.
- Manual CSV imports for Bursa Malaysia quotes.
- Cloudflare Workers AI uses the Worker AI binding and does not require an external API key. The Workers Free allocation is 10,000 Neurons/day; do not enable paid billing or prepaid credits without owner approval.
- Official SEC EDGAR submissions and Company Facts are used for US public-company research.

## Local development

```bash
npm ci
cp .dev.vars.example .dev.vars
```

Generate a random 32-byte (or longer) local `SETUP_TOKEN` and set it in `.dev.vars`. Keep `RP_ID=localhost`, `RP_ORIGIN=http://localhost:8787` and `APP_ENV=development` for local testing. Never commit `.dev.vars`.

Run the Worker, local D1 and Vite assets together:

```bash
npm run cf:dev
```

`npm run dev` alone starts only Vite and will not provide the authentication or portfolio APIs.

## First production passkey

1. Confirm the final production hostname. Passkeys are bound to `RP_ID`; changing the hostname later requires re-registration.
2. Set `RP_ID` as the hostname only and `RP_ORIGIN` as the exact HTTPS origin in `wrangler.toml`.
3. Generate a random 32-byte (or longer) setup token and set it as the Cloudflare Worker secret named `SETUP_TOKEN`. Do not put it in `wrangler.toml`, GitHub vars or frontend code.
4. Deploy the replacement Worker and verify `/api/health`.
5. Open the site in a supported HTTPS browser and enter the setup token once to create the first passkey.
6. Sign in and add a second passkey on a separate device.
7. Delete the temporary Worker secret `SETUP_TOKEN` after confirming both passkeys work.
8. Protect the Cloudflare account with strong 2FA or a passkey.

The setup token is a one-time bootstrap gate, not a login password. Normal sign-in always uses the browser passkey prompt.

For SEC EDGAR filing lookup, configure the Worker variable `SEC_USER_AGENT` with an application name and your real contact email, for example `Magic Folio/0.1 (contact: you@example.com)`. Do not use the placeholder address. SEC lookups remain disabled until this value is valid. Add the company's 1–10 digit CIK to its US holding or watchlist item (the app stores it as a 10-digit string). You can find the CIK through [SEC EDGAR company search](https://www.sec.gov/edgar/search/). The owner-only lookup returns recent filing metadata and links to the original SEC documents; it does not copy filing bodies. The endpoint is limited to five lookups per hour.

## Scheduled jobs and AI research briefs

Two UTC cron triggers are configured in `wrangler.toml`:

- `0 1 * * 2-6`: refresh SEC submissions and Company Facts for up to eight owned US instruments with a valid CIK. After the refresh completes, generate public-data-only research briefs for recent filers, up to five per day.
- `0 2 * * 6`: weekly housekeeping for expired filing metadata, caches, alert records, job history, authentication challenges and rate-limit buckets.

Each scheduled task writes a `job_run` record with its status and bounded detail. Brief generation shares the five uncached analyses/day quota with manual analysis and reuses the 24-hour input-hash cache. The AI prompt contains only public SEC Company Facts and filing metadata. It does not include holding quantities, average cost, notes, portfolio weights, watchlist state, account identifiers, credentials or quote data. If no recent filing or fresh Company Facts are available, the job records a skipped status and does not call Workers AI. For each newly generated brief, it attempts a deduplicated ticker-specific Web Push notification that opens the app; the ticker is included in the notification title and body. Cached briefs do not trigger notifications. Push delivery is optional and cannot fail the research job; it requires VAPID secrets and at least one registered browser subscription. The existing daily push quota applies.

## Web Push notifications

Web Push uses the Worker’s built-in WebCrypto implementation. No Node-only `web-push` package is included in the Worker bundle.

1. Generate a P-256 VAPID key pair locally with `npx --yes web-push generate-vapid-keys`. Do not paste the private key into Git, a chat, or frontend configuration.
2. Set the public key as `VAPID_PUBLIC_KEY` in the `[vars]` section of `wrangler.toml` and set `VAPID_SUBJECT` to a real `mailto:` contact.
3. Store the private key only as a Worker secret: `npx wrangler secret put VAPID_PRIVATE_KEY`.
4. Deploy, subscribe a supported browser, and use the authenticated `POST /api/push/test` endpoint to verify delivery.
5. Keep the subscription private to the owner. The Worker accepts only HTTPS endpoints from supported browser push services and removes expired subscriptions when the service returns 404/410.

Never store VAPID private keys in `.dev.vars.example`, GitHub artifacts, the browser, or D1.

## Market data

MarketData.app is optional. The owner must create their own account and API token. The free tier has 100 credits/day, at least 24-hour delayed US quotes and a one-IP-at-a-time restriction. The token is entered after passkey sign-in and stored only in the current browser tab's session storage. It is sent directly to MarketData.app, never to the Worker or D1. Refresh quotes from one device/IP at a time; other devices read the private quote snapshots from D1.

Bursa quotes are manual CSV only until a licensed provider is approved. Use this header format:

```csv
symbol,price,asOf,prevClose
1155,6.42,2026-11-24T08:00:00+08:00,6.30
```

Add the Bursa instruments as MY holdings first, then import their actual quote timestamp and price. Do not scrape Bursa pages or undocumented broker endpoints. Review [data sources](DATA_SOURCES.md) for the current licence and provider decisions.

## Passkey recovery

If all passkeys are lost, use the secured Cloudflare account to set a new temporary `SETUP_TOKEN`, then clear only the passkey and session records:

```bash
npx wrangler d1 execute magic-screen-db --remote --command "DELETE FROM passkey_credential; DELETE FROM session;"
```

Register a new passkey, add a second recovery passkey, and remove the temporary token. This recovery does not delete portfolio holdings. Never run a full D1 reset for routine passkey recovery.

## Cloudflare deployment

1. Confirm the D1 database binding in `wrangler.toml`.
2. Configure GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and the account ID variable/secret.
3. Ensure the token can deploy Workers, list Worker secrets and read/write D1.
4. Merge reviewed changes to `main`; GitHub Actions builds, applies pending migrations and deploys the Worker.

The one-time production reset is a separate manual workflow. It permanently removes all existing user tables and data in `magic-screen-db`. It can run only from `main`, after the production RP hostname and `SETUP_TOKEN` are configured and all preflight checks pass.

## Secrets

Configure runtime credentials as Cloudflare Worker secrets only when the corresponding feature requires them. Workers AI uses a Cloudflare binding, not a model API key. Never put VAPID private, setup or session secrets in frontend variables, source files or GitHub artifacts.

## Verification

`npm ci`, `npm run build`, `node --experimental-strip-types --test worker/*.test.mjs`, `npm audit --audit-level=high`, and `npx wrangler deploy --dry-run` are the expected pre-deployment checks. A successful CI run is not proof of a live deployment.
