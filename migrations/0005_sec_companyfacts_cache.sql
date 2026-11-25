CREATE TABLE sec_companyfacts_cache (
  instrument_id INTEGER PRIMARY KEY REFERENCES instrument(id) ON DELETE CASCADE,
  cik TEXT NOT NULL CHECK(length(cik)=10 AND cik NOT GLOB '*[^0-9]*'),
  fetched_at TEXT NOT NULL,
  facts_json TEXT NOT NULL CHECK(json_valid(facts_json))
);
CREATE INDEX idx_sec_companyfacts_cik ON sec_companyfacts_cache(cik);
