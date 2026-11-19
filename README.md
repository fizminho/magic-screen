# Magic Screen

A Cloudflare-first stock research dashboard for Bursa Malaysia and US equities.

## Current build

- React + TypeScript responsive screener
- 30 Bursa Malaysia and 30 US starter tickers
- Cloudflare Worker API + D1 quote cache
- Weekday scheduled quote refresh, split by market
- Search, sort, market switcher and watchlist
- Shariah status is explicitly **Unverified** until sourced screening data is integrated

## Important data limitations

This is the first working scaffold, not yet a complete Magic Formula screener. The current adapter fetches indicative quotes from Yahoo Finance's unofficial chart endpoint. It does not yet fetch audited financial statements, calculate Earnings Yield or Return on Capital, or produce Magic Formula ranks. It also does not yet import the official SC Malaysia Shariah list or connect the US Shariah API. The UI leaves these fields unranked and unverified rather than fabricating results.

See [Cloudflare setup and data-source notes](docs/SETUP.md).

## Stack

- React, TypeScript, Vite
- Cloudflare Workers Static Assets
- Cloudflare D1
- Workers Cron Triggers
