# Blockers

## Phase A automation

A GitHub Actions workflow now automates the Phase A checks:

- Workflow: `.github/workflows/phase-a-preflight.yml`
- Existing Cloudflare credentials reused from the deployment workflow:
  - `secrets.CLOUDFLARE_API_TOKEN`
  - `vars.CLOUDFLARE_ACCOUNT_ID`, falling back to `secrets.CLOUDFLARE_ACCOUNT_ID`
- It performs a remote D1 export, verifies the backup is non-empty, captures the live `sqlite_master` inventory, installs dependencies, builds, and runs the existing Node regression suite.
- It does not deploy, apply migrations, alter remote data, or delete secrets.
- The D1 backup and inventory are uploaded as a GitHub Actions artifact with a one-day retention period. The SQL backup is sensitive production data: download it promptly and move it to approved secure storage. Do not commit it or paste it into chat.
- The workflow is triggered by a push to `chore/ai-portfolio-rebuild` that changes this workflow or this blocker document. It can also be run manually with the explicit `YES` confirmation. Manual runs default to `NO`.

### Important security gate

The current deploy workflow proves the repository already references the Cloudflare token/account ID secret names, but GitHub does not reveal whether those credentials are configured or whether the token has D1 read permissions. The workflow validates presence and the actual Wrangler export verifies access. It never prints credential values.

If the run fails because the token lacks D1 permissions, update the existing Cloudflare API token's permissions in GitHub/Cloudflare settings. Do not add a token value to source code or chat. If the account/database identity is unexpected, stop and correct the configuration before retrying.

## Phase A completion criteria

Do not mark A4/A5/A6 complete until the Actions run is green and its artifact contains:
1. A non-empty production D1 SQL export.
2. The live D1 schema inventory.

The run must also show successful dependency installation, build, and regression tests. Record the workflow run URL, backup filename, table inventory, and pass/fail summary in `docs/CLEANUP_LOG.md`.

Until all gates pass, do not remove legacy code that may still serve production, do not apply remote migrations, and do not delete `MFI_SESSION_COOKIE`.

## Local fallback

If Actions is unavailable, run from a local checkout of `chore/ai-portfolio-rebuild` with Node.js 22, npm, Wrangler authenticated to the correct Cloudflare account, and D1 read/export permission:

```bash
git switch chore/ai-portfolio-rebuild
git status --short
git log --oneline -20
git branch -a

BACKUP="backup-$(date +%F).sql"
npx wrangler d1 export magic-screen-db --remote --output "./$BACKUP"
test -s "./$BACKUP" && echo "BACKUP_OK: $BACKUP"

npx wrangler d1 execute magic-screen-db --remote --command "SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name;"

npm install
npm run build
node --experimental-strip-types --test worker/*.test.mjs
```

Keep SQL backups out of git and in secure storage. Never paste environment files, session cookies, API keys, Wrangler credentials, or SQL backup contents into chat.
