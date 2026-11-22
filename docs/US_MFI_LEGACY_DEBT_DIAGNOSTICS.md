# Legacy SEC debt diagnostics

**Mode:** read-only. This diagnostic does not write fundamentals, ratios, eligibility or rankings.

## Why this exists

The legacy stock_fundamentals table stores the selected CIK, annual fiscal period, filing date, resolved debt value, status and update timestamp. It does not store the individual SEC debt tags that led to total_debt. When debt is null, the ordinary reconciliation preview cannot distinguish an absent SEC concept from a partially reported or mismatched set of debt components.

The protected diagnostic endpoint retrieves the current SEC Company Facts JSON for selected active US MFI issuers, anchors the analysis to the stored legacy fiscal period and filing date where available, and reports the debt tags used by the legacy calculation.

## Endpoint

POST /api/fundamentals/legacy-debt-diagnostic

Authorization: existing UNIVERSE_SYNC_TOKEN bearer token.

Request body:

```json
{
  "symbols": ["BMBL", "BCRX", "OTEX"]
}
```

Provide 1 to 10 active US MFI symbols per request. The response includes:
- SEC CIK and CIK mapping update timestamp.
- Legacy status, source, update timestamp, fiscal period and filed date.
- Stored legacy EBIT, debt, cash and invested-capital source fields.
- Selected SEC filing accession and period.
- For each recognised debt tag: taxonomy, tag, unit, value, period, filing date, form, accession match and whether it meets the legacy USD instant-fact selector.
- The exact legacy debt-composition branch that can or cannot be satisfied.

## Debt resolution rules mirrored

The diagnostic mirrors the current legacy syncUsFundamentals logic and secFactValue selector:
- Same filing accession and fiscal period.
- USD facts only.
- Instant balance-sheet facts only (no start date).
- Annual filing anchor selected from 10-K, 20-F or 40-F.
- Existing tag and taxonomy precedence is preserved.
- Current and non-current components are paired only under the existing US GAAP / IFRS combinations.
- A missing component remains unknown. The diagnostic never substitutes zero.

The result is diagnostic evidence, not a proposal to loosen the production selector. If the SEC facts show that a legitimate debt concept is not currently recognised, any mapping change must be separately reviewed and tested against issuer filings.

## Example

```bash
curl -X POST "https://magic-screen.96muhdhafiz.workers.dev/api/fundamentals/legacy-debt-diagnostic" \
  -H "Authorization: Bearer $UNIVERSE_SYNC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"symbols":["BMBL","BCRX","OTEX"]}'
```

Do not paste the bearer token into chat or commit it. Run the endpoint after the Worker deployment completes. Results are limited to public SEC filing facts and the user's own stored reconciliation metadata.


See `US_MFI_LEGACY_DEBT_SHADOW_CANDIDATE.md` for the separate shadow candidate endpoint (shadow only; no production writes or ranking changes).
