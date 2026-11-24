# Security

Magic Screen is a single-owner personal research app. It has no end-user accounts, login flow, Gemini integration or LLM API key.

## Secrets

| Secret | Location | Purpose |
|---|---|---|
| `MFI_SESSION_COOKIE` | Cloudflare Worker secret | Owner's authenticated MFI session. Required to refresh the candidate universe. |
| `UNIVERSE_SYNC_TOKEN` | Optional Cloudflare Worker secret | Allows the owner to bypass the anonymous MFI refresh cooldown. |

Never put either secret in source code, frontend variables, GitHub commits, prompts, or chat. Configure with `npx wrangler secret put MFI_SESSION_COOKIE`. Treat the MFI cookie like a password and rotate it if exposed or expired.

No Gemini or other AI API key is used by the application.

## Public API surface

- `GET /api/health`
- `GET /api/pipeline/status`
- `GET /api/stocks`
- `GET /api/mfi/screen`

The MFI refresh endpoint caches successful results for six hours. Anonymous forced refreshes are subject to a 15-minute cooldown after the last successful sync. Failed upstream attempts are not persisted separately, so apply Cloudflare WAF rate limiting to public API paths.

## Data handling

- Shariah checks and manual Investing Paths observations are stored in browser localStorage.
- The app does not upload these records to Worker or D1.
- The AI prompt is copied only after a user action. AI research is external to the app.
- No provider passwords, session cookies or API credentials belong in the prompt or pasted JSON.

## Hardening

- Security headers are applied to Worker responses.
- Same-origin API; no wildcard CORS.
- Public errors are sanitised.
- GitHub Actions builds and runs regression tests before merge.

A successful CI run does not prove that the live Cloudflare deployment has completed. Verify the live Worker separately after release.
