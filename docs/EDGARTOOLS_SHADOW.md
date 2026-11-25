# EdgarTools shadow extraction

Status: implemented as an isolated raw-evidence pipeline. It is not the production fundamentals provider.

## Flow

1. GitHub Actions runs daily at 02:30 UTC (10:30 Malaysia time) or on manual dispatch.
2. The Worker returns active US instruments currently present in the owner's holdings or watchlist.
3. A pinned EdgarTools 6.3.0 Python runner selects the latest available annual 10-K, 20-F or 40-F and extracts detailed income statement, balance sheet and cash-flow statement rows.
4. The report is validated and sent to the protected Worker ingestion endpoint.
5. D1 stores provider coverage in `edgartools_provider_status` and accession-scoped raw evidence in `edgartools_filing_evidence`.

## Security and isolation

- The universe, ingestion and status endpoints require `Authorization: Bearer` using the Worker secret `UNIVERSE_SYNC_TOKEN`.
- The matching GitHub Actions repository secret must use the same random token.
- Set the repository variable `EDGARTOOLS_INGEST_URL` to `https://investlah.binalah.com/api/fundamentals/edgartools/ingest`.
- The extraction runner identifies the application as `Magic Folio research support@binalah.co`.
- The endpoint limits payload size and company count, validates ticker/accession/period fields, and upserts by symbol/accession.
- This pipeline does not write `stock_fundamentals`, calculate ratios, change eligibility, publish ranks, or feed EdgarTools data into Research Brief.
- SEC Company Facts and SEC Submissions remain the existing Research Brief inputs. EdgarTools is shadow evidence only until a separate reviewed cutover.

## First-time setup

1. Generate a unique random token of at least 32 characters.
2. Add it as the Cloudflare Worker secret `UNIVERSE_SYNC_TOKEN`.
3. Add the same value as the GitHub Actions repository secret `UNIVERSE_SYNC_TOKEN`.
4. Add repository variable `EDGARTOOLS_INGEST_URL` with the full ingestion URL.
5. Apply D1 migration `0006_edgartools_shadow.sql` through the normal Cloudflare deployment pipeline.
6. Run **Actions → EdgarTools shadow extraction → Run workflow**.

A manual ticker override can be used for a focused test. If the ingestion secret or URL is not configured, the run keeps the JSON artifact only and does not write D1.

## Review before any cutover

Compare EdgarTools statement rows against the same accession and fiscal period in SEC Company Facts. Review currency, consolidated versus dimensional rows, annual-period alignment, and missing/ambiguous values. No extracted value is approved automatically. Any future production cutover requires explicit accounting rules, regression coverage, a complete-universe gate, and a separate change to the Research Brief input contract.
