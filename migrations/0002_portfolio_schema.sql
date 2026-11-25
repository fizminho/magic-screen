CREATE TABLE instrument (
  id INTEGER PRIMARY KEY,
  symbol TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('US','MY')),
  quote_symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('USD','MYR')),
  sector TEXT,
  shariah_flag TEXT NOT NULL DEFAULT 'unknown' CHECK (shariah_flag IN ('compliant','non_compliant','unknown')),
  is_candidate INTEGER NOT NULL DEFAULT 0 CHECK (is_candidate IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE (market, symbol)
);
CREATE TABLE holding (
  instrument_id INTEGER PRIMARY KEY REFERENCES instrument(id) ON DELETE CASCADE,
  quantity REAL NOT NULL CHECK (quantity >= 0),
  avg_cost REAL,
  notes TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE watchlist (
  instrument_id INTEGER PRIMARY KEY REFERENCES instrument(id) ON DELETE CASCADE,
  note TEXT,
  added_at TEXT NOT NULL
);
CREATE TABLE quote_latest (
  instrument_id INTEGER PRIMARY KEY REFERENCES instrument(id) ON DELETE CASCADE,
  price REAL, prev_close REAL, change_pct REAL, as_of TEXT, provider TEXT,
  status TEXT NOT NULL DEFAULT 'unavailable' CHECK (status IN ('ok','stale','unavailable'))
);
CREATE TABLE price_daily (
  instrument_id INTEGER NOT NULL REFERENCES instrument(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  close REAL NOT NULL,
  PRIMARY KEY (instrument_id, date)
) WITHOUT ROWID;
CREATE TABLE news_item (
  id INTEGER PRIMARY KEY,
  url_hash TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  market TEXT CHECK (market IN ('US','MY')),
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX idx_news_published ON news_item(published_at);
CREATE TABLE news_instrument (
  news_id INTEGER NOT NULL REFERENCES news_item(id) ON DELETE CASCADE,
  instrument_id INTEGER NOT NULL REFERENCES instrument(id) ON DELETE CASCADE,
  PRIMARY KEY (news_id, instrument_id)
) WITHOUT ROWID;
CREATE INDEX idx_news_instrument_inst ON news_instrument(instrument_id);
CREATE TABLE analysis (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('brief','recommendation')),
  market TEXT CHECK (market IN ('US','MY')),
  model TEXT NOT NULL,
  input_hash TEXT NOT NULL UNIQUE,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_analysis_kind_created ON analysis(kind, created_at);
CREATE TABLE push_subscription (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_success_at TEXT
);
CREATE TABLE alert_log (
  dedupe_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  sent_at TEXT NOT NULL
);
CREATE TABLE passkey_credential (
  id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  algorithm INTEGER NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  backed_up INTEGER NOT NULL DEFAULT 0 CHECK (backed_up IN (0,1)),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE TABLE auth_challenge (
  challenge TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('register','login')),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_auth_challenge_exp ON auth_challenge(expires_at);
CREATE TABLE session (
  token_hash TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL REFERENCES passkey_credential(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX idx_session_exp ON session(expires_at);
CREATE INDEX idx_session_credential ON session(credential_id);
CREATE TABLE auth_attempt (
  ip_hash TEXT NOT NULL,
  window TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('options','verify_fail')),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, window, kind)
) WITHOUT ROWID;
CREATE TABLE setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
CREATE TABLE job_run (
  id INTEGER PRIMARY KEY,
  job TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX idx_job_run_started ON job_run(started_at);
INSERT INTO setting(key,value) VALUES
  ('alert_move_pct','4'),
  ('max_pushes_per_day','8'),
  ('quote_cursor','0'),
  ('max_position_pct','25');
