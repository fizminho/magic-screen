# Blockers

## 2026-11-25: Local execution and Cloudflare access required

The AI portfolio runbook cannot safely pass Phase A yet because this session's GitHub integration can inspect and commit repository files but cannot run shell commands, Node/npm tests, Wrangler, or Cloudflare D1 exports/queries.

Required owner/environment action:
- Provide an execution environment with a checkout of `chore/ai-portfolio-rebuild`, Node.js 22, npm, Wrangler, and authorized Cloudflare credentials.
- Export and verify the production D1 backup before any destructive migration.
- Capture the exact remote D1 table inventory before generating legacy DROP statements.

Until those checks are complete, do not remove legacy code that may still be serving production, do not apply migrations remotely, and do not delete `MFI_SESSION_COOKIE`.
