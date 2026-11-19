# US financial fundamentals: SEC EDGAR

The US screener uses SEC EDGAR Company Facts as its primary financial-statement source. The SEC's data.sec.gov XBRL APIs are public and do not require an API key. Requests include a declared User-Agent.

## Data flow

1. The Worker maps the active Magic Formula Investing tickers to SEC CIK identifiers using the SEC company ticker/exchange directory.
2. It fetches each company's Company Facts JSON from `/api/xbrl/companyfacts/CIK##########.json`.
3. It selects the latest available annual 10-K, 20-F, or 40-F Operating Income (EBIT), then reads balance-sheet facts for the same fiscal period.
4. It stores the extracted facts and calculated ratios in D1. Company facts are refreshed after 30 days; ticker mappings are refreshed weekly and when new MFI candidates have no mapping.
5. The UI processes up to eight companies per US screener load/refresh so a single Worker request does not fan out across the entire universe.

## Initial Magic Formula calculations

- **Earnings Yield** = annual EBIT / Enterprise Value
- **Enterprise Value** = MFI market capitalization + reported debt - reported cash
- **Return on Capital** = annual EBIT / (Current Assets - Current Liabilities + Net PP&E)

The calculation uses the latest reported annual EBIT and balance-sheet facts for the same fiscal year-end. It does not annualize a partial quarter. A ratio remains unavailable when required facts or a usable denominator are missing. Debt must have at least one recognized reported debt fact; missing debt data is not silently treated as zero.

The SEC data is not a pre-calculated Magic Formula ranking. The Worker calculates each ratio from reported facts. A combined rank (rank by Earnings Yield plus rank by Return on Capital) is published only after every active MFI candidate in the selected universe has usable fundamentals. Until then the rank remains blank, avoiding misleading partial-universe rankings.

## Endpoint

`GET /api/fundamentals/sync?limit=8`

- `limit`: number of companies to process in this request, capped at 10.
- The response reports processed, calculated, failed, remaining, and ranked counts.
- The endpoint is called by the US screener after the MFI universe is available.
- A company with missing required XBRL facts is recorded as incomplete and retried after 30 days. Provider errors are recorded and also retried after the same interval.

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
