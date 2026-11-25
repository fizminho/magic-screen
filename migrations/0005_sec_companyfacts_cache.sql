CREATE TABLE sec_companyfacts_cache (
  instrument_id INTEGER PRIMARY KEY REFERENCES instrument(id) ON DELETE CASCADE,
  cik TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  facts_json TEXT NOT NULL
);
CREATE INDEX idx_sec_companyfacts_cik ON sec_companyfacts_cache(cik);
