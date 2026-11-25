-- Optional SEC EDGAR company identifier for US instruments.
-- CIK is stored as a 10-digit string to preserve leading zeroes.
ALTER TABLE instrument ADD COLUMN cik TEXT
  CHECK(cik IS NULL OR (length(cik) = 10 AND cik NOT GLOB '*[^0-9]*'));

CREATE INDEX IF NOT EXISTS idx_instrument_cik
  ON instrument(cik) WHERE cik IS NOT NULL;
