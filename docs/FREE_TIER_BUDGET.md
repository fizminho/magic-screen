# Free-tier budget verification

**Verified:** 2026-11-25  
**Scope:** Cloudflare Workers Free, Cloudflare D1 Free, Gemini Developer API Free.  
**Policy:** These are platform ceilings, not a promise that a particular account/project has every feature or model enabled. Re-check before deployment.

## Confirmed platform limits

| Resource | Current documented Free limit | Magic Folio design budget / decision |
|---|---:|---|
| Workers requests | 100,000 per day | Target <2,000/day |
| Worker CPU | 10 ms per HTTP invocation and Cron invocation | Keep CPU-heavy parsing small; network wait does not count as CPU |
| Worker memory | 128 MB | Keep runtime dependencies and payloads small |
| Worker subrequests | 50 per invocation | Target <=40; chunk jobs and stop on quota errors |
| Simultaneous outgoing connections | 6 per invocation | Bound provider concurrency |
| Cron Triggers | 5 per account | Runbook uses 4 |
| D1 rows read | 5,000,000 per day | Target <200,000/day; index filter columns and inspect query metadata |
| D1 rows written | 100,000 per day | Target <10,000/day; batch writes and avoid unnecessary index churn |
| D1 storage | 5 GB total across account | Target <100 MB |
| D1 database size | 500 MB per database | Keep this single-owner database comfortably below limit |
| D1 databases | 10 per account | One existing database; do not rename/recreate it |
| D1 queries per Worker invocation | 50 on Free | Batch related statements |
| D1 Time Travel | 7 days | Not a substitute for the required pre-migration export |

D1 Free daily row read/write limits are enforced: queries fail after the account limit is exceeded until the UTC daily reset. Stored data is not deleted by this enforcement.

## Gemini Developer API Free

Google documents rate limits as model- and project-specific, across requests per minute (RPM), input tokens per minute (TPM), and requests per day (RPD). RPD resets at midnight Pacific Time. Google directs developers to the active AI Studio Rate Limits page for the actual limits on their project; the public documentation does not establish one universal RPM/TPM/RPD value for every Flash model and account.

- Keep GEMINI_DAILY_CAP=20 as the app's own conservative ceiling.
- Enforce the cap server-side in D1, not in browser state.
- Cache analysis by deterministic input hash.
- Never automatically retry quota/rate-limit failures in a loop.
- Select GEMINI_MODEL only after checking the model is currently available on the owner's Free project and recording its exact ID.
- Do not enable paid billing or paid-only tools as part of this free-tier design.

**Privacy caveat:** Google's pricing documentation states that Free-tier content may be used to improve Google's products. The planned Gemini input includes holding symbols, portfolio weights, sector and selected news context. It must not include quantities, average costs, account identifiers, credentials or other unnecessary personal data. The owner should explicitly accept this data-handling trade-off before enabling live Gemini analysis. A strict no-training/data-use guarantee is not established by this free-tier design.

## Official sources checked

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/ (last updated 2026-11-18)
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/ (last updated 2026-11-20)
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/ (last updated 2026-10-30)
- D1 Free daily limit enforcement: https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- Gemini rate limits: https://ai.google.dev/gemini-api/docs/rate-limits (redirects to AI Studio rate-limit documentation)
- Gemini pricing / Free-tier data handling: https://ai.google.dev/gemini-api/docs/pricing/

## Still requires owner-account verification

- Open AI Studio > Rate limits for the exact Gemini project and model; record current RPM, TPM and RPD.
- Confirm the selected Flash model is available to the project on Free tier.
- Confirm Cloudflare dashboard plan and actual D1 row metrics for magic-screen-db.
- Confirm the exact Cron Trigger account capacity if other Workers already consume triggers.
