# Stock universe data

## United States

Magic Screen's US candidate universe comes exclusively from the authenticated Magic Formula Investing (MFI) screening endpoint:

- Source: https://www.magicformulainvesting.com/Screening/StockScreening
- Refresh endpoint: `GET /api/mfi/screen`
- Displayed US stocks are read from `GET /api/stocks?market=US`.
- SEC's `company_tickers_exchange.json` directory is used only inside the fundamentals pipeline to map MFI tickers to CIKs. It must not be imported as the US candidate universe.
- `GET /api/universe?market=US` remains a read-only legacy/master-data query for compatibility and diagnostics. It is not called by the frontend and does not trigger SEC universe synchronisation. The former `sync=1` behaviour has been retired.

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


## Removing accidental SEC directory imports

The SEC company ticker exchange directory is not a stock universe. If legacy rows were imported into `stock_master`, use the protected cleanup endpoint to preview and then remove only rows with the exact SEC directory source marker. Rows whose quote snapshot provider is `Magic Formula Investing` are protected because the old upsert may have overwritten their source marker. The cleanup is batched and leaves quote/fundamental/CIK tables untouched.
