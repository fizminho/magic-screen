# Magic Screen setup

## Architecture

- React + TypeScript + Vite frontend.
- Cloudflare Worker API and D1 cache.
- MFI is the only US ticker-universe source.
- Shariah checks and manual Investing Paths observations stay in browser localStorage.
- No user account, Gemini API, LLM API key, provider API or automated Investing Paths collection.

## Cloudflare setup

1. Create or use the D1 database named `magic-screen-db`.
2. Confirm its ID matches `wrangler.toml`.
3. Configure the Worker secret `MFI_SESSION_COOKIE` with the owner's authenticated Magic Formula Investing session cookie.
4. Optionally configure `UNIVERSE_SYNC_TOKEN` if the owner wants to bypass the public MFI refresh cooldown.
5. Connect the GitHub repository to Cloudflare Workers Builds.

Build command:

```bash
npm run build
```

Deploy command:

```bash
npx wrangler deploy
```

A successful GitHub build or Wrangler dry-run is not proof of a live deployment. Verify the Worker and app after release.

## MFI workflow

The app reads the cached MFI ticker universe from `GET /api/stocks`. Use **Refresh MFI** to request a fresh screen. The Worker caches successful MFI results for six hours and applies a 15-minute cooldown to anonymous forced refreshes.

See [MFI integration](MAGIC_FORMULA_INTEGRATION.md) for session setup and endpoint details.

## Shariah workflow

1. Copy the ticker list and AI prompt from the app.
2. Paste into an AI assistant that can research the sources.
3. The assistant must follow Musaffa and HalalScreener terms. If AI/automated access is not allowed, it must not access the source and must return No data.
4. Copy the raw JSON response.
5. Paste it into Magic Screen and validate.
6. Check eligible tickers manually on Investing Paths and record rank, EY, ROC, fiscal period, date and source URL.

Both Musaffa and HalalScreener must show fresh Halal results. Doubtful, Not Halal, No data, stale or conflicting results do not pass. Source-specific statuses remain visible.

## Local storage

Shariah and Investing Paths records are stored only in the current browser. They do not sync between devices or browsers. The app intentionally has no file upload/download workflow. Clearing browser data can remove the records.

## Development

```bash
npm install
npm run dev
```

The frontend can start without a live MFI session, but the Worker needs the D1 binding and `MFI_SESSION_COOKIE` for a fresh MFI screen.

Research tool only. Not investment advice.
