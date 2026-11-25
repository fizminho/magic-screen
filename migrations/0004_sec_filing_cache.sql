-- SEC EDGAR filing metadata and a six-hour per-instrument response cache.
-- Only metadata and official filing links are stored; filing documents are never mirrored.
CREATE TABLE sec_fetch_cache (
  instrument_id INTEGER PRIMARY KEY REFERENCES instrument(id) ON DELETE CASCADE,
  cik TEXT NOT NULL CHECK(length(cik)=10 AND cik NOT GLOB '*[^0-9]*'),
  fetched_at TEXT NOT NULL,
  company_name TEXT NOT NULL,
  filing_count INTEGER NOT NULL DEFAULT 0 CHECK (filing_count >= 0)
);

CREATE TABLE sec_filing (
  accession_number TEXT PRIMARY KEY,
  cik TEXT NOT NULL CHECK(length(cik)=10 AND cik NOT GLOB '*[^0-9]*'),
  instrument_id INTEGER NOT NULL REFERENCES instrument(id) ON DELETE CASCADE,
  form TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  filing_date TEXT NOT NULL,
  report_date TEXT,
  primary_document TEXT,
  url TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX idx_sec_filing_instrument_date
  ON sec_filing(instrument_id, filing_date DESC);
CREATE INDEX idx_sec_filing_fetched
  ON sec_filing(fetched_at);
