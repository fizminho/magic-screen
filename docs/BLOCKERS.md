# Blockers

## Phase A automation

GitHub Actions now automates the Phase A checks:

- Workflow: `.github/workflows/phase-a-preflight.yml`
- Reuses the exact credential references already used by the deployment workflow:
  - `secrets.CLOUDFLARE_API_TOKEN`
  - `vars.CLOUDFLARE_ACCOUNT_ID`, falling back to `secrets.CLOUDFLARE_ACCOUNT_ID`
- Runs the remote D1 export, verifies the backup is non-empty, captures the live `sqlite_master` inventory, installs dependencies, builds, and runs the Node regression suite.
- It does not deploy, apply migrations, intentionally alter remote data, or delete secrets.
- The export operation can temporarily make the D1 database unavailable while it runs. Run it during a quiet period.
- The SQL backup and inventory are uploaded as a GitHub Actions artifact with a one-day retention period. Treat the SQL as sensitive production data: download it promptly and move it to approved secure storage. Do not commit it or paste it into chat.

### Explicit trigger

The workflow does not perform production exports on ordinary pushes.

- Manual dispatch requires `confirm_production_read=YES`.
- A push to `chore/ai-portfolio-rebuild` runs the jobs only when the commit message contains `[phase-a-run]`.
- This lets us run it from the working branch without merging the rebuild prematurely, while avoiding accidental production exports on every documentation/code push.

### Cloudflare permission blocker

The first run confirmed that the existing `CLOUDFLARE_API_TOKEN` and account ID are being passed to Wrangler, and the account identity matches the account configured in the existing deployment workflow. However, the export endpoint returned Cloudflare error `10000`.

Cloudflare's current D1 documentation states that `wrangler d1 export` requires the **D1 Write** API token permission because the export locks the database while it runs. The current token is therefore insufficient for this operation even though it is accepted by the Worker deployment workflow.

To keep reusing the existing credential, edit the existing Cloudflare API token and add **D1 Write** scoped to the correct account (and the narrowest available resource scope). Do not paste or rotate the token value. If expanding the deployment token is not acceptable, use a separate short-lived D1 Write token instead, but that would require a new GitHub secret.

After permission is updated, trigger the workflow with a commit message containing `[phase-a-run]`, or use manual dispatch with `YES` once the workflow is available from the default branch. If Cloudflare reports the wrong account/database, stop and correct the configuration before retrying.

## Phase A completion criteria

Do not mark A4/A5/A6 complete until a successful Actions run confirms:
1. A non-empty production D1 SQL export.
2. The live D1 schema inventory.
3. Successful dependency installation, build, and regression tests.

Record the workflow run URL, backup filename, table inventory, and pass/fail summary in `docs/CLEANUP_LOG.md`.

Until all gates pass, do not remove legacy code that may still serve production, do not apply remote migrations, and do not delete `MFI_SESSION_COOKIE`.

## Local fallback

If Actions is unavailable, run from a local checkout of `chore/ai-portfolio-rebuild` with Node.js 22, npm, Wrangler authenticated to the correct Cloudflare account, and D1 Write permission for export:

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
