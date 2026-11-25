# US MFI Shariah-first workflow

**Status:** Active implementation direction  
**Updated:** 24 November 2026  
**Scope:** Personal-use US stock research only

## Agreed workflow

1. **MFI ticker universe**  
   Keep Magic Formula Investing as the sole source of US candidate tickers.

2. **AI-assisted Shariah research**  
   Copy the current MFI tickers and structured prompt from Magic Screen. Use an AI assistant to research Musaffa and HalalScreener only where each provider's terms permit that access. The app does not connect to an LLM API.

3. **Paste JSON**  
   Copy the AI's JSON response and paste it into Magic Screen. Validate ticker membership, source, exact status, date and direct source URL.

4. **Dual-source decision**  
   Only fresh Halal results from both Musaffa and HalalScreener pass. Doubtful, Not Halal, No data, stale, missing or conflicting results are excluded or sent to manual review. Never infer missing ratios or statuses.

5. **Manual Investing Paths validation**  
   Open Investing Paths manually. Record only visible rank, EY, ROC, fiscal period, check date and source URL. No scraping, browser automation, bulk extraction or AI collection.

6. **Local shortlist**  
   Show provider evidence, decision reasons and manual Investing Paths observations. Save records only in browser localStorage.

## App boundaries

- Personal use only.
- No user login or user accounts.
- No Gemini API, LLM API key, provider API integration or paid data dependency.
- No Bursa market, manual ticker additions, watchlist, SEC accounting pipeline, EdgarTools shadow ranking, P1/P2/P3 accounting review or automated financial-ratio calculation.
- No Shariah data is sent to a backend. No file upload/download workflow.
- AI output is research input, not a fatwa or automatic religious ruling.

## Release gates

- [x] MFI is the only candidate-universe source.
- [x] Two-source Shariah decision logic with freshness and conflict handling.
- [x] Copyable ticker list and AI prompt.
- [x] Paste-only JSON import.
- [x] Manual Investing Paths entry form.
- [x] Browser-local persistence.
- [ ] Verify live Cloudflare deployment after merge.
- [ ] Test full workflow with a small set of real, current provider checks before using the complete MFI cohort.

## Historical implementation

The previous SEC/EdgarTools accounting research lane has been retired from the active app and Worker. Its old database tables are not dropped or migrated by this cleanup. Historical repository files may be removed while Git history preserves prior commits.

This is a personal research aid, not investment advice or a fatwa.
