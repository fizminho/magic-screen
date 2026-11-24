# Manual screening data (personal use)

Copy the files in `examples/` to this folder (drop `.example` from the name), then fill them in by hand:

- `mfi-universe.json` — tickers from the existing MFI source, with source URL and retrieval time.
- `shariah-checks.json` — one row per ticker per source (`musaffa`, `halalscreener`): status as displayed, checked date, reference.
- `investing-paths-observations.json` — only fields you actually saw on the page, `collection_method: "manual"`, `manually_verified: true`, checked date and source reference. Not on the site => `found: false` with no rank.

Build: `node scripts/build_shariah_shortlist.mjs data dist-reports 30`

Rules: no scraping, automation, bulk download or AI collection of any source. Personal use only; do not publish the output. Real `data/*.json` and `dist-reports/` are git-ignored.
