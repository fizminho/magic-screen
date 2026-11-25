# Magic Folio setup

## Architecture

- React + TypeScript + Vite frontend.
- Cloudflare Worker with static assets.
- Cloudflare D1 for owner portfolio data.
- Passkey-only single-owner authentication.
- Gemini free tier for constrained portfolio analysis, subject to current provider terms and quotas.
- Official or terms-compliant market/news sources only.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Use local-only RP values from `.dev.vars.example`. Never put production credentials in local examples or commit `.dev.vars`.

## Cloudflare deployment

1. Confirm the D1 database binding in `wrangler.toml`.
2. Configure GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and the account ID variable/secret.
3. Ensure the token has the minimum permissions needed for Worker deployment and D1 migrations.
4. Merge reviewed changes to `main`; GitHub Actions builds, applies pending migrations and deploys the Worker.

The one-time production reset is a separate manual workflow. It permanently removes all existing user tables and data in `magic-screen-db`. Do not run it until the replacement Worker and its authentication controls are complete.

## Secrets

Configure runtime credentials as Cloudflare Worker secrets only when the corresponding feature is implemented. Never put Gemini, VAPID private, setup or session secrets in frontend variables, source files or GitHub artifacts.

## Verification

`npm run build`, `node --experimental-strip-types --test worker/*.test.mjs`, `npm audit --omit=dev --audit-level=high`, and `npx wrangler deploy --dry-run` are the expected pre-deployment checks. A successful CI run is not proof of a live deployment.
