# AI Portfolio Rebuild Cleanup Log

## Phase A: repository triage

- Date: 2026-11-25
- Repository: `fizminho/magic-screen`
- Default branch: `main`
- Base commit inspected: `b02d67c1ffdbf2d0ea50142c4e8f5bb3808e9244`
- Working branch created: `chore/ai-portfolio-rebuild`
- Open pull requests: none returned by the GitHub open-PR search.
- Existing branches: numerous historical feature, cleanup, fix, and Dependabot branches; none named `chore/ai-portfolio-rebuild` before this run.
- Repository permissions: read/write/admin confirmed by GitHub connection.
- Baseline status: not run. This GitHub connection can inspect and commit repository content, but it does not provide a shell, Node.js runtime, or Wrangler execution environment.
- D1 backup: NOT performed. No Cloudflare account/D1 execution connection is available in this session. No remote database changes or destructive migrations will be attempted until a verified export exists.
- Live D1 inventory: NOT performed for the same reason. Legacy SEC/EdgarTools table names remain unknown and must not be guessed.

## Initial findings from `main`

1. `package-lock.json` is absent from the repository tree.
2. Build workflow uses `npm install`, and its production audit step is advisory (`continue-on-error: true`).
3. GitHub Actions use mutable tags (`actions/checkout@v4`, `actions/setup-node@v4`).
4. No open PRs were found at triage, so there are no open Dependabot PR diffs to port or close.
5. `wrangler.toml` has the existing D1 database binding but no `migrations_dir`.
6. `worker/index.ts` still exposes unauthenticated `GET /api/mfi/screen`, `GET /api/stocks`, and `GET /api/pipeline/status`; it performs runtime DDL and can use `MFI_SESSION_COOKIE`.
7. `worker/security.mjs` still permits inline styles and does not yet include the PWA manifest/worker CSP directives.
8. `.gitignore` already excludes `.dev.vars`, `.dev.vars.*`, and `.env*`, but does not yet exclude `backup-*.sql`.
9. `package.json` currently has React 18, Vite 6, TypeScript 5.6, Wrangler 4, and lucide-react. Dependency health has not been audited because npm cannot be run here.
10. The existing README and SECURITY.md still describe the old MFI/Shariah product.

## Gate / blocker

Phase A is intentionally incomplete. Required next actions in an environment with repository checkout + Node.js + Wrangler + authorized Cloudflare credentials:

1. Run `git status`, `git log --oneline -20`, and `git branch -a`; record the exact local checkout state.
2. Export production D1 to `backup-YYYY-MM-DD.sql` and verify the file exists and is non-empty. Add `backup-*.sql` to `.gitignore`.
3. Query `sqlite_master` on remote D1 and append the exact table inventory here.
4. Run `npm install`, `npm run build`, and `node --experimental-strip-types --test worker/*.test.mjs`; record results.
5. Only after the backup and inventory are verified may destructive migration planning continue.

No production secret was deleted, no remote D1 data was changed, no existing branch was deleted, and no pull request was closed.


## Phase A follow-up: repository/API checks and public limits

- GitHub API confirms default branch main; its latest commit at inspection is b02d67c1ffdbf2d0ea50142c4e8f5bb3808e9244.
- The first 20 commit records were inspected; this is not a substitute for the requested local git log --oneline -20 command output.
- GitHub API confirms zero open PRs at the time of this check. There were therefore no open Dependabot PR diffs to port or classify.
- The working branch exists and is based on the inspected main commit.
- git status and a complete local git branch -a remain unverified because no shell checkout is available.
- Public Cloudflare/Gemini documentation limits are recorded in docs/FREE_TIER_BUDGET.md. Exact Gemini project quotas and current account D1 metrics remain owner-account checks.
- Licence/reference findings from the runbook's reference scan are recorded in docs/REFERENCES.md; no external code was copied.
- A key product privacy consideration was added to the budget notes: Google documents Free-tier Gemini content may be used to improve products. The owner must accept this before sending portfolio context to Gemini.

### Phase A remaining
A4 production D1 export, A5 live table inventory, and A6 local install/build/test baseline remain blocked on an execution environment with Node.js/Wrangler and authorized Cloudflare credentials. Do not proceed to destructive phases C/D until those gates pass.


- Added backup-*.sql to .gitignore before any backup is created, as required by A4.
- Added exact local commands for A1/A4/A5/A6 to docs/BLOCKERS.md. No backup file has been created by this session.


## Phase A automation added

- Added `.github/workflows/phase-a-preflight.yml` on `chore/ai-portfolio-rebuild`.
- Reuses the exact Cloudflare credential references already present in `.github/workflows/deploy-worker.yml`: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (repository variable preferred, secret fallback).
- The workflow is read-only against production D1: export, verify non-empty file, and inventory `sqlite_master`. It separately runs npm install, build, and Node regression tests.
- The workflow does not deploy, run migrations, write to D1, delete secrets, or change Worker production configuration.
- Backup and inventory are stored in a one-day GitHub Actions artifact. Treat the backup as sensitive production data and move it to secure storage promptly.
- Workflow file commit: `ff319f603ca35e280d53da1adcebc14d6ca66e4c`.
- Workflow execution status: not yet verified at the time this log entry was written. A4/A5/A6 remain incomplete until the Actions run and artifact are inspected.
