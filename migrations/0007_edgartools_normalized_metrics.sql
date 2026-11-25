-- Analytics-ready EdgarTools metrics, kept separate from production fundamentals.
CREATE TABLE IF NOT EXISTS edgartools_normalized_metric (
  symbol TEXT NOT NULL,
  accession TEXT NOT NULL,
  form TEXT NOT NULL,
  statement TEXT NOT NULL CHECK(statement IN ('income_statement','balance_sheet','cash_flow_statement')),
  metric TEXT NOT NULL,
  period_end TEXT NOT NULL,
  period_type TEXT NOT NULL CHECK(period_type IN ('duration','instant')),
  fiscal_label TEXT,
  value REAL NOT NULL,
  currency TEXT,
  source_concept TEXT,
  source_label TEXT,
  standard_concept TEXT,
  balance TEXT,
  mapping_version INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  PRIMARY KEY(symbol, accession, statement, metric, period_end, period_type)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_edgartools_metric_lookup
  ON edgartools_normalized_metric(symbol, metric, period_type, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_edgartools_metric_accession
  ON edgartools_normalized_metric(accession, symbol);
