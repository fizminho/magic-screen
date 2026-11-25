-- Defensive no-op list for known retired tables. The one-time reset script
-- enumerates and drops every user table, including retired SEC tables.
DROP TABLE IF EXISTS stock_universe_membership;
DROP TABLE IF EXISTS mfi_screening_meta;
DROP TABLE IF EXISTS refresh_log;
DROP TABLE IF EXISTS stock_snapshot;
DROP TABLE IF EXISTS stock_master;
