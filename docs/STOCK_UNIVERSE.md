# Stock universe data

## United States

The US candidate universe is the union of active source memberships stored in `stock_universe_membership`:

| Source | How it enters | What can remove it |
|---|---|---|
| `Magic Formula Investing` | Authenticated MFI screen, `GET /api/mfi/screen` (https://www.magicformulainvesting.com/Screening/StockScreening) | Only an MFI refresh that no longer returns the symbol |
| `Frontend` | `POST /api/universe/us/stocks` (the "Add US stock" dialog), bearer `UNIVERSE_SYNC_TOKEN` | Only `DELETE /api/universe/us/stocks?symbol=...` |

Rules:

- One canonical `stock_master` row per `(market, symbol)`. A stock is active while any source membership is active, and `listing_status` is reconciled from that.
- Additions and imports are idempotent. Existing MFI rows are backfilled into MFI memberships automatically. Legacy SEC-directory or starter rows are not backfilled and stay out of the universe.
- Displayed US stocks come from `GET /api/stocks?market=US`, which includes `universe_sources` per stock. MFI.com's screen order is not a Magic Formula ranking.
- SEC's `company_tickers_exchange.json` / `company_tickers.json` are used only to map tickers to CIKs and to sanity-check frontend additions. They must never be imported as the universe. Tickers with no SEC match stay visible as unsupported in coverage.
- Any change to the active universe, or to MFI market caps, clears published US ranks until every active candidate has current complete fundamentals. A frontend addition with no market cap keeps ranks withheld until a cap is available (optionally supply `market_cap_millions`; it never overrides an MFI cap).
- `GET /api/universe?market=US` remains a read-only legacy/master-data query and is not called by the frontend.

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
