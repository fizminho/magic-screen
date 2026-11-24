# US stock universe

## Source

Magic Formula Investing is the only source of US candidate membership.

- `GET /api/mfi/screen` refreshes the MFI screen.
- `GET /api/stocks` returns the active MFI candidates.
- A successful MFI result updates the source membership, company name and market-cap snapshot.
- The app does not add stocks manually, import Bursa listings, or merge the SEC ticker directory into the candidate universe.

## Integrity rules

- MFI's screen order is not an individual Magic Formula rank.
- MFI output does not supply the Investing Paths ranking, EY or ROC values used in the manual validation step.
- A candidate removed by a later MFI refresh is no longer included in the current Shariah shortlist.
- Missing or stale MFI data must remain visible as unavailable, not be replaced with an invented value.

## Cache

The Worker caches a successful MFI result for six hours when the screen settings match. A forced anonymous refresh is subject to a 15-minute cooldown after the last successful sync.
