# Magic Screen

A lightweight, personal US stock research app built around one workflow:

**MFI tickers → Musaffa + HalalScreener research → Shariah validation → manual Investing Paths ranking.**

## What it does

- Gets the US candidate ticker universe from Magic Formula Investing (MFI).
- Copies the current ticker list with a ready-to-use AI research prompt.
- Accepts AI results as pasted JSON. No file upload or download.
- Requires fresh Halal results from both Musaffa and HalalScreener before a ticker passes.
- Flags missing, stale, doubtful or conflicting evidence for review.
- Lets the owner record Investing Paths rank, Earnings Yield, Return on Capital, fiscal period, checked date and source URL manually.
- Saves research records in this browser's local storage.

## Daily workflow

1. Open the Shariah shortlist and refresh the MFI universe when needed.
2. Tap **Copy tickers + AI prompt** and paste it into an AI assistant.
3. Ask the assistant to return the requested JSON using permitted source access only.
4. Copy the JSON response and paste it into Magic Screen.
5. Review the source evidence and import the records.
6. Manually check eligible tickers on Investing Paths and record the visible ranking details.

## Important boundaries

- The app has no user login, Gemini integration, LLM API key, or paid screening API.
- The owner must configure the MFI session cookie once as a Cloudflare Worker secret. It is never sent to the browser.
- AI access to Musaffa and HalalScreener must follow each provider's current terms. If AI/automated access is not permitted, the assistant must not access that source and should return No data for manual follow-up.
- Investing Paths checks remain manual. No scraping, browser automation, bulk extraction or AI collection.
- Shariah research is not a fatwa or investment advice. Verify evidence before relying on a result.
- Records are local to the current browser and do not sync across devices. There is no file-based import/export.

## Data and privacy

No AI provider receives an API key from this app. The prompt is copied to the user's chosen AI assistant only after the user taps the copy button. Pasted results are stored locally in the browser. The app does not send Shariah records to a server.

## Deployment

- React + TypeScript + Vite
- Cloudflare Workers Static Assets
- Cloudflare D1 for the MFI ticker cache

See [setup](docs/SETUP.md), [MFI integration](docs/MAGIC_FORMULA_INTEGRATION.md), [provider access policy](docs/PROVIDER_ACCESS_POLICY.md), and [security](SECURITY.md).

Research tool only. Not investment advice.
