# US financial fundamentals: SEC EDGAR

The US screener uses SEC EDGAR Company Facts as its primary financial-statement source. The SEC's data.sec.gov XBRL APIs are public and do not require an API key. Requests include a declared User-Agent.

## Data flow

1. The Worker maps the active Magic Formula Investing tickers to SEC CIK identifiers using the SEC company ticker/exchange directory.
2. It fetches each company's Company Facts JSON from `/api/xbrl/companyfacts/CIK##########.json`.
3. It selects the latest available annual 10-K, 20-F, or 40-F Operating Income (EBIT), then reads balance-sheet facts for the same fiscal period.
4. It stores the extracted facts and calculated ratios in D1. Successfully calculated company facts are refreshed after 30 days; incomplete/provider-error cases are retried after seven days. Ticker mappings are refreshed weekly and when new MFI candidates have no mapping.
5. A Cloudflare Cron Trigger runs every 10 minutes and processes up to 10 companies per invocation. This works independently of browser visits, so the first 30/50-company universe is populated progressively in the background. The UI only reads the latest sync status; it does not fetch SEC facts itself.

## Initial Magic Formula calculations

- **Earnings Yield** = annual EBIT / Enterprise Value
- **Enterprise Value** = MFI market capitalization + reported debt - reported cash
- **Return on Capital** = annual EBIT / (Current Assets - Current Liabilities + Net PP&E)

The calculation uses the latest reported annual EBIT and balance-sheet facts for the same fiscal year-end. It does not annualize a partial quarter. A ratio remains unavailable when required facts or a usable denominator are missing. Debt must have at least one recognized reported debt fact; missing debt data is not silently treated as zero.

The SEC data is not a pre-calculated Magic Formula ranking. The Worker calculates each ratio from reported facts. A combined rank (rank by Earnings Yield plus rank by Return on Capital) is published only after every active MFI candidate in the selected universe has usable fundamentals. Until then the rank remains blank, avoiding misleading partial-universe rankings.

## Endpoint

`GET /api/fundamentals/sync?limit=10`

- `limit`: number of companies to process in a request, capped at 10. This endpoint remains available for controlled/manual diagnostics, but the UI does not call it during normal page loads.
- `GET /api/fundamentals/status` reports total MFI candidates, calculated companies, unmapped tickers, incomplete facts, provider errors, and the latest update time.
- The scheduled job processes up to 10 companies every 10 minutes. A 30-company universe normally takes about 30 minutes and a 50-company universe about 50 minutes to work through, assuming successful SEC responses. No repeated page refresh is required.
- A company with missing required XBRL facts or a provider error is retried after seven days; successful calculations are refreshed after 30 days.

## Important limitations

- XBRL tagging differs across issuers. The first version supports standard US-GAAP and selected IFRS concepts, and deliberately leaves unsupported cases unranked.
- Financial companies and companies with unusual balance sheets may not have meaningful working-capital-based Return on Capital. Review sector suitability before interpreting their ratios.
- Market capitalization comes from the MFI screening result; SEC provides the reported financial statements.
- SEC facts can be amended or restated. The stored period and filing date should be checked when reviewing a company.
- This is a screening aid, not investment advice. Verify the latest 10-K/10-Q and company disclosures before making an investment decision.

## Official references

- SEC EDGAR API overview: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- SEC Company Facts endpoint pattern: https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
- SEC developer resources and fair-access guidance: https://www.sec.gov/about/developer-resources
