CREATE TABLE IF NOT EXISTS stock_snapshot (
  symbol TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('MY', 'US')),
  company_name TEXT NOT NULL,
  currency TEXT NOT NULL,
  price REAL,
  change_percent REAL,
  market_cap REAL,
  earnings_yield REAL,
  return_on_capital REAL,
  magic_formula_rank INTEGER,
  shariah_status TEXT NOT NULL DEFAULT 'unverified',
  shariah_source TEXT,
  shariah_as_of TEXT,
  data_status TEXT NOT NULL DEFAULT 'unavailable',
  provider TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (symbol, market)
);
CREATE INDEX IF NOT EXISTS idx_stock_snapshot_market_rank ON stock_snapshot(market, magic_formula_rank);
CREATE TABLE IF NOT EXISTS refresh_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  message TEXT
);