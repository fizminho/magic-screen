-- Raw EdgarTools extraction evidence only. Never used by production fundamentals or ranking.
CREATE TABLE IF NOT EXISTS edgartools_provider_status (
  symbol TEXT PRIMARY KEY,
  provider_status TEXT NOT NULL CHECK(provider_status IN ('supported','unsupported_provider','extraction_error')),
  accession TEXT,
  fiscal_period TEXT,
  form TEXT,
  filed_at TEXT,
  provider_version TEXT,
  generated_at TEXT NOT NULL,
  detail TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS edgartools_filing_evidence (
  symbol TEXT NOT NULL,
  accession TEXT NOT NULL,
  fiscal_period TEXT,
  form TEXT NOT NULL,
  filed_at TEXT,
  provider_version TEXT,
  generated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  PRIMARY KEY(symbol, accession)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_edgartools_evidence_symbol_period
  ON edgartools_filing_evidence(symbol, fiscal_period DESC);
