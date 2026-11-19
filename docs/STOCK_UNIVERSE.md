# Stock universe data

## United States

Magic Screen can import the SEC's public company ticker/exchange directory into D1:

- Source: https://www.sec.gov/files/company_tickers_exchange.json
- Endpoint: `GET /api/universe?market=US&sync=1`
- The frontend invokes this sync when **Refresh data** is pressed on the US market.
- The SEC warns that this directory is not guaranteed to be accurate or complete. It is a discovery universe, not a definitive list of every exchange-listed security. It can include ETFs, trusts and foreign issuers, so review the results before treating them as eligible common stocks.

The import is additive/upsert-based. It does not automatically delete records absent from a later SEC file, because absence from this directory does not prove a security was delisted.

## Bursa Malaysia

Bursa's listed-company directory should be treated as the source of truth. Magic Screen intentionally does not scrape unofficial stock-list websites.

1. Obtain/export the current listed-company directory from Bursa Malaysia.
2. Prepare JSON rows using the fields below. The `symbol` can be the Bursa stock code (for example `1155`) or Yahoo symbol (for example `1155.KL`). The importer adds `.KL` when missing.
3. Configure a Worker secret named `UNIVERSE_SYNC_TOKEN` in Cloudflare Dashboard → Workers & Pages → magic-screen → Settings → Variables and Secrets.
4. Send a POST to `/api/universe/import-my` with `Authorization: Bearer <token>`.

Example request body:

```json
{
  "source": "Bursa Malaysia listed companies directory (YYYY-MM-DD)",
  "rows": [
    {
      "symbol": "1155",
      "company_name": "Malayan Banking Berhad",
      "exchange": "Main Market",
      "sector": "Financial Services",
      "listing_status": "active"
    }
  ]
}
```

Allowed optional fields: `exchange`, `sector`, `listing_status`. Required fields: `symbol`, `company_name`. Maximum 5,000 rows per request. Invalid rows are skipped. Re-importing updates matching symbols.

## Quote refresh

Quote refresh works in batches of 40 active stocks per request and prioritizes stocks without a quote, then the oldest quote. Repeated refreshes progressively cover a large universe without trying to fetch thousands of Yahoo Finance quotes in one Worker request. Yahoo Finance is an unofficial quote source and may not cover every symbol.

## Data integrity

- A missing quote is shown as missing; it does not remove the company from the universe.
- Magic Formula values remain blank until verified financial statement inputs are integrated.
- Shariah status remains `unverified` until a trusted, dated source is connected.
