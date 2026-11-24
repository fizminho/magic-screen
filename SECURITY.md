# Security

Personal-use research tool. Single owner; no public data feed (see `docs/US_MFI_MASTERPLAN.md`).

## Secrets (Cloudflare Worker secrets / GitHub secrets only — never in git)
| Name | Where | Purpose |
|---|---|---|
| `UNIVERSE_SYNC_TOKEN` | Worker secret + GitHub secret | Bearer token for every write/admin/diagnostic route |
| `MFI_SESSION_COOKIE` | Worker secret | Owner's Magic Formula Investing session |
| `GEMINI_API_KEY` | Worker secret | Not approved for use in the current phase |
| `CLOUDFLARE_API_TOKEN` | GitHub secret | Deploy (scope: Workers Scripts:Edit + D1:Edit for this account only) |

Set with `npx wrangler secret put <NAME>`. Rotate immediately if exposed: generate a new value, `wrangler secret put`, update the GitHub secret, redeploy.
Use a long random `UNIVERSE_SYNC_TOKEN` (`openssl rand -base64 32`).

## Route access model
- **Public (read-only, cached):** `/api/health`, `/api/stocks`, `/api/universe`, `/api/pipeline/status`, `/api/fundamentals/status`, `/api/fundamentals/edgartools/ranking-preview/public`, `/api/mfi/screen`.
- **Public but rate-limited:** `/api/mfi/screen?force=1` (15 min) and `/api/stocks?refresh=1` (5 min) — within the window they serve cache. A valid bearer token bypasses the limit.
- **Bearer token required:** everything else, including `/api/fundamentals/sync`, all `/edgartools/*` ingest/review routes, `/api/universe/*` writes and `/api/admin/*`.
- Token checks are constant-time and fail closed (503) when the secret is unset.

## Hardening in place
- Security headers on every response (CSP, HSTS, nosniff, frame deny, no-referrer, COOP/CORP).
- No wildcard CORS (UI is same-origin).
- Public endpoints return generic errors; details go to Worker logs only.
- CI runs with read-only `GITHUB_TOKEN`; Dependabot watches npm and Actions.

## Recommended Cloudflare dashboard settings (not expressible in code)
- WAF rate-limiting rule on `/api/*` (e.g. 60 req/min/IP) and a stricter one for 401 responses.
- Optionally put the whole app behind Cloudflare Access since it is personal-use.
- Restrict the deploy API token to this account/zone.

## Known gaps
- No `package-lock.json` is committed; run `npm install` once locally and commit it, then switch CI to `npm ci`.
- Third-party GitHub Actions are pinned by tag, not commit SHA.
- `ranking-preview/public` exposes derived ranking output; review against source licences before keeping it public.

Report issues privately to the repository owner.
