# Blockers

## 2026-11-25: Local execution and Cloudflare access required

The AI portfolio runbook cannot safely pass Phase A yet because this session's GitHub integration can inspect and commit repository files but cannot run shell commands, Node/npm tests, Wrangler, or Cloudflare D1 exports/queries.

Required owner/environment action:
- Provide an execution environment with a checkout of `chore/ai-portfolio-rebuild`, Node.js 22, npm, Wrangler, and authorized Cloudflare credentials.
- Export and verify the production D1 backup before any destructive migration.
- Capture the exact remote D1 table inventory before generating legacy DROP statements.

Until those checks are complete, do not remove legacy code that may still be serving production, do not apply migrations remotely, and do not delete `MFI_SESSION_COOKIE`.


## Exact Phase A commands to unblock

Run these from a local checkout of the repository, on branch chore/ai-portfolio-rebuild, with Node.js 22, npm, Wrangler authenticated to the correct Cloudflare account, and permission to access the production D1 database.

```bash
git switch chore/ai-portfolio-rebuild
git status --short
git log --oneline -20
git branch -a

# A4: export and verify a production backup before any destructive change
BACKUP="backup-$(date +%F).sql"
npx wrangler d1 export magic-screen-db --remote --output "./$BACKUP"
test -s "./$BACKUP" && echo "BACKUP_OK: $BACKUP"

# A5: capture the actual live schema inventory (do not guess table names)
npx wrangler d1 execute magic-screen-db --remote --command "SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name;" | tee /tmp/magic-screen-d1-inventory.txt

# A6: capture baseline
npm install
npm run build
node --experimental-strip-types --test worker/*.test.mjs
```

Do not paste the SQL backup into chat or commit it. Keep it in a secure local location. Paste only the git command output, inventory table names/types, backup filename plus confirmation that the file is non-empty, and build/test summaries. Do not paste environment files, session cookies, API keys, or Wrangler credentials.

If Wrangler reports the wrong account or database, stop. Do not run the export/inventory against a guessed database.
