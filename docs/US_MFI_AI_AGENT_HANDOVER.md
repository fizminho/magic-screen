# US MFI agent handover

**Last refreshed:** 22 November 2026 (full-universe and ledger audit)  
**Repository:** fizminho/magic-screen  
**Authoritative execution plan:** [US MFI masterplan](US_MFI_MASTERPLAN.md)

## Start here

Read [US_MFI_MASTERPLAN.md](US_MFI_MASTERPLAN.md) before doing any work. It is the source of truth for priorities, completed work, open blockers, release gates and the next implementation sequence. This handover is an entrypoint, not a parallel task plan.

Always inspect current main and open PRs before coding. Do not rely on historical branch names, commit SHAs, counts or old agent instructions without re-verifying them.

## Current verified state

- PR #55 merged: SEC Company Facts debt shadow discovery now scans issuer-specific taxonomies and distinguishes royalty financing, other financing, leases and convertible debt. It remains read-only and does not change production fundamentals or rankings.
- PR #55 deployment succeeded in [run #44986755869](https://github.com/fizminho/magic-screen/actions/runs/44986755869).
- PR #53 merged: a manually triggered, read-only export of persistent Gemini review history and human decisions is available. It makes no Gemini calls and performs no application writes.
- PR #57 merged: the read-only legacy-versus-EdgarTools reconciliation now exposes legacy row presence, stored CIK, updated_at and filed date, plus an explicit unavailable accession state. Its CI also runs the complete Node regression suite.
- PR #60 merged: issuer-taxonomy debt discovery now has regression coverage for all categories, accession/period/dimension filtering and the deterministic 120-concept cap.
- PR #61 merged and deployed: legacy debt shadow now exposes legacy row presence, status, source, updated_at, fiscal period/filed date and CIK mapping update time.
- PR #62 merged: README documents the controlled `[full-universe]` trigger. Full dynamic run [#44989926114](https://github.com/fizminho/magic-screen/actions/runs/44989926114) passed every stage; artifact contains 30 active issuers, 28 supported, 2 unsupported, 2 shadow eligible, 0 ranked and 0 production approved.
- PR #63 merged: README and workflow document/support controlled `[ledger-export]` runs. Export [#44990205149](https://github.com/fizminho/magic-screen/actions/runs/44990205149) passed and was inspected: 139 history rows, 26 issuers, zero decisions, no duplicate cache keys/input hashes.
- PR #64 merged: review history now returns deduplicated evidence-ID metadata while continuing to omit raw Gemini response JSON. [CI #44990410412](https://github.com/fizminho/magic-screen/actions/runs/44990410412) passed; wait for deployment and rerun the ledger export.
- Main commit `33fa04740b5c70e7e296cf4708f081b618393165` is passing through deployment and [Build #44990629361](https://github.com/fizminho/magic-screen/actions/runs/44990629361), including full Node regression, Python policy tests, TypeScript build and Wrangler dry-run.
- PR #28 was closed unmerged because its active-universe lease/ROU filtering and regression test were already present on main. Do not reapply.
- Production migration is not approved.

## Architecture and safety boundaries

1. EdgarTools is the designated primary extraction provider for the target US fundamentals workflow. GitHub Actions extracts annual SEC filings and posts raw evidence to the Worker.
2. The EdgarTools ingestion, deterministic resolver, accounting review queue and ranking preview are evidence/shadow paths. They must not write production fundamentals, ratios, eligibility or rankings.
3. The legacy SEC Company Facts sync still runs in the Worker on a 30-minute cron and writes the existing production fundamentals path. It is a legacy runtime lane during migration, not an approved replacement for EdgarTools.
4. Do not disable or redirect the legacy lane until side-by-side reconciliation, staging write rehearsal, rollback and explicit owner approval are complete.
5. Do not change Bursa/Malaysia behaviour as part of US MFI work.
6. Missing values remain unknown, never zero. Preserve accession, period, filed date, currency, unit, dimensions and source provenance.
7. Keep conventional debt, convertible debt, royalty financing, lease liabilities, sale-leaseback, securitisation and other financing obligations separate unless an approved policy explicitly classifies them.
8. Gemini is for genuinely ambiguous filing interpretation only. Do not resend unchanged evidence or use AI for deterministic arithmetic.

## Immediate next steps

Follow the unchecked items in the masterplan in order:

1. Verify PR #64 deployment, rerun the ledger export, and reconcile evidence IDs to issuer/task/accession records.
2. Begin human review in this order: OTEX (extreme 64.65x ROC candidate from USD 16.745m invested capital), GTM (non-positive IC and USD 2.7319bn tax receivable agreement), SGHC (IFRS EBIT and debt/on-demand borrowing), PBI (filing-specific EBIT bridge), HPQ (large debt, cash and IC scope), SSTK (IC and contributor royalties), XPOF (IC/cash/NCI), HRMY (IC), HRB (reconstructed EBIT and lease/IC scope).
3. Record human decisions with evidence references and rationale; the current ledger has zero decisions. Do not treat ACCEPTED_CANDIDATE as approval.
4. Resolve the remaining P2/P3 issuer evidence and unsupported-provider handling. Reconcile IRWD convertible-note classification between legacy Company Facts shadow discovery and filing-based debt-note review.
5. Obtain explicit owner approval for cohort-wide EBIT, debt, lease, cash, invested-capital, NCI and ranking policies.
6. Complete legacy-versus-EdgarTools reconciliation, staging and rollback before requesting production cutover.

## Rules for future agents

- Work in focused branches and pull requests; do not push directly to main.
- Update the masterplan checkboxes only when supported by a merged commit, successful workflow/artifact or explicit owner decision.
- Do not mark a task complete because code exists if live validation or accounting approval is still outstanding.
- Do not change production accounting values, formulas, eligibility or rankings without explicit owner approval.
- Report exactly what was tested, what was not tested, and the relevant run/PR links.
