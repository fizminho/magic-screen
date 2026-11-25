# Magic Folio setup

## Architecture

- React + TypeScript + Vite frontend.
- Cloudflare Worker with static assets.
- Cloudflare D1 for owner portfolio data.
- Passkey-only single-owner authentication using `@passwordless-id/webauthn`.
- Gemini free tier for constrained portfolio analysis, subject to current provider terms and quotas.
- Official or terms-compliant market/news sources only.

## Local development

```bash
npm ci
cp .dev.vars.example .dev.vars
```

Generate a long random local `SETUP_TOKEN` and set it in `.dev.vars`. Keep `RP_ID=localhost`, `RP_ORIGIN=http://localhost:8787` and `APP_ENV=development` for local testing. Never commit `.dev.vars`.

Run the Worker and static assets together so the browser can reach the `/api/auth/*` routes:

```bash
npm run cf:dev
```

## First production passkey

1. Confirm the final production hostname. Passkeys are bound to `RP_ID`; changing the hostname later requires re-registration.
2. Configure `RP_ID` as the hostname only and `RP_ORIGIN` as the exact HTTPS origin in Worker vars.
3. Generate a long random setup token and set it as the Cloudflare Worker secret named `SETUP_TOKEN`. Do not put it in `wrangler.toml`, GitHub vars or frontend code.
4. Deploy the replacement Worker and verify `/api/health`.
5. Open the site in a supported HTTPS browser and enter the setup token once to create the first passkey.
6. Sign in and add a second passkey on a separate device.
7. Delete the temporary Worker secret `SETUP_TOKEN` after confirming both passkeys work.
8. Protect the Cloudflare account with strong 2FA or a passkey.

The setup token is a one-time bootstrap gate, not a login password. Normal sign-in always uses the browser passkey prompt.

## Passkey recovery

If all passkeys are lost, use the secured Cloudflare account to set a new temporary `SETUP_TOKEN`, then clear only the passkey and session records:

```bash
npx wrangler d1 execute magic-screen-db --remote --command "DELETE FROM passkey_credential; DELETE FROM session;"
```

Register a new passkey, add a second recovery passkey, and remove the temporary token. This recovery does not delete portfolio holdings. Never run a full D1 reset for routine passkey recovery.

## Cloudflare deployment

1. Confirm the D1 database binding in `wrangler.toml`.
2. Configure GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and the account ID variable/secret.
3. Ensure the token has the minimum permissions needed for Worker deployment and D1 migrations.
4. Merge reviewed changes to `main`; GitHub Actions builds, applies pending migrations and deploys the Worker.

The one-time production reset is a separate manual workflow. It permanently removes all existing user tables and data in `magic-screen-db`. Do not run it until the replacement Worker and its authentication controls are complete.

## Secrets

Configure runtime credentials as Cloudflare Worker secrets only when the corresponding feature is implemented. Never put Gemini, VAPID private, setup or session secrets in frontend variables, source files or GitHub artifacts.

## Verification

`npm ci`, `npm run build`, `node --experimental-strip-types --test worker/*.test.mjs`, `npm audit --audit-level=high`, and `npx wrangler deploy --dry-run` are the expected pre-deployment checks. A successful CI run is not proof of a live deployment.
