// Source-aware US universe membership.
//
// stock_master keeps one canonical row per (market, symbol). Universe membership is tracked
// per source in stock_universe_membership so that one source (for example a Magic Formula
// Investing refresh) can only ever change its own membership. A stock is active in the US
// universe while at least one source membership is active; stock_master.listing_status is a
// derived projection of that rule and is reconciled by this module.
//
// All functions take a D1-compatible `db` (prepare/bind/run/first/all/batch) so they can be
// contract-tested against an in-memory SQLite shim.

export const SOURCE_MFI = "Magic Formula Investing";
export const SOURCE_FRONTEND = "Frontend";
export const US = "US";

export const MEMBERSHIP_DDL = [
  `CREATE TABLE IF NOT EXISTS stock_universe_membership (
    market TEXT NOT NULL,
    symbol TEXT NOT NULL,
    source TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    deactivated_at TEXT,
    metadata_json TEXT,
    PRIMARY KEY (market, symbol, source)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_universe_membership_active ON stock_universe_membership(market, active, symbol)"
];

// SQL predicate: stock_master alias `alias` is an active member of the US universe through any source.
export function activeUsUniverseClause(alias = "m") {
  return `EXISTS (SELECT 1 FROM stock_universe_membership um WHERE um.market='US' AND um.symbol=${alias}.symbol AND um.active=1)`;
}

// US tickers: letters/digits with an optional share-class suffix (BRK-B, BF.B, BAC-PL). Multi-letter dot
// suffixes such as Bursa's .KL are rejected, so other-market tickers cannot enter the US universe.
export function normaliseUsSymbol(raw) {
  const symbol = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{1,10}(\.[A-Z]|-[A-Z]{1,2})?$/.test(symbol) ? symbol : null;
}

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function activeSymbols(db, source) {
  const result = source
    ? await db.prepare("SELECT symbol FROM stock_universe_membership WHERE market='US' AND source=? AND active=1 ORDER BY symbol").bind(source).all()
    : await db.prepare("SELECT DISTINCT symbol FROM stock_universe_membership WHERE market='US' AND active=1 ORDER BY symbol").all();
  return new Set(result.results.map(row => String(row.symbol)));
}

export async function listActiveUsUniverse(db) {
  const result = await db.prepare(
    "SELECT symbol, GROUP_CONCAT(source, '|') AS sources FROM stock_universe_membership WHERE market='US' AND active=1 GROUP BY symbol ORDER BY symbol"
  ).all();
  return result.results.map(row => ({ symbol: String(row.symbol), sources: String(row.sources).split("|").sort() }));
}

// One-off, idempotent backfill: existing MFI-sourced rows become MFI memberships. Legacy rows from
// other sources (SEC directory, starter list) are deliberately not backfilled, so they stay out of
// the universe exactly as before.
export async function backfillMfiMemberships(db) {
  await db.prepare(
    `INSERT OR IGNORE INTO stock_universe_membership (market,symbol,source,active,first_seen_at,last_seen_at,deactivated_at,metadata_json)
     SELECT 'US',symbol,?,CASE WHEN listing_status='active' THEN 1 ELSE 0 END,source_updated_at,source_updated_at,
            CASE WHEN listing_status='active' THEN NULL ELSE source_updated_at END,'{"backfilled":true}'
     FROM stock_master WHERE market='US' AND source=?`
  ).bind(SOURCE_MFI, SOURCE_MFI).run();
}

// stock_master.listing_status is derived: active iff any source membership is active (US only).
export async function reconcileUsListingStatus(db) {
  await db.prepare(
    `UPDATE stock_master SET listing_status='active'
     WHERE market='US' AND listing_status!='active' AND ${activeUsUniverseClause("stock_master")}`
  ).run();
  await db.prepare(
    `UPDATE stock_master SET listing_status='inactive'
     WHERE market='US' AND listing_status='active' AND NOT ${activeUsUniverseClause("stock_master")}`
  ).run();
}

// Universe or market-cap changes invalidate every published US rank (all-candidate completeness gate).
export async function invalidateUsRanks(db) {
  await db.prepare("UPDATE stock_snapshot SET magic_formula_rank=NULL WHERE market='US' AND magic_formula_rank IS NOT NULL").run();
}

const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));

// Apply one MFI.com screen result. Only the MFI membership may be deactivated here.
export async function applyMfiSelection(db, rows, now) {
  const unionBefore = await activeSymbols(db);
  const mfiBefore = await activeSymbols(db, SOURCE_MFI);
  const next = new Set(rows.map(row => row.symbol));

  for (const part of chunk(rows, 25)) {
    await db.batch(part.flatMap(row => [
      db.prepare(
        `INSERT INTO stock_master (symbol,market,company_name,currency,exchange,listing_status,source,source_updated_at)
         VALUES (?,'US',?,'USD',?,'active',?,?)
         ON CONFLICT(symbol,market) DO UPDATE SET company_name=excluded.company_name,exchange=excluded.exchange,listing_status='active',
           source=CASE WHEN stock_master.source=? THEN stock_master.source ELSE excluded.source END,
           source_updated_at=excluded.source_updated_at
         WHERE stock_master.company_name IS NOT excluded.company_name OR stock_master.exchange IS NOT excluded.exchange
           OR stock_master.listing_status IS NOT 'active'`
      ).bind(row.symbol, row.name, SOURCE_MFI, SOURCE_MFI, now, SOURCE_FRONTEND),
      // At most one write per row per day while membership is unchanged (preserves D1 write quota).
      db.prepare(
        `INSERT INTO stock_universe_membership (market,symbol,source,active,first_seen_at,last_seen_at,deactivated_at,metadata_json)
         VALUES ('US',?,?,1,?,?,NULL,NULL)
         ON CONFLICT(market,symbol,source) DO UPDATE SET active=1,last_seen_at=excluded.last_seen_at,deactivated_at=NULL
         WHERE stock_universe_membership.active=0 OR substr(stock_universe_membership.last_seen_at,1,10)<substr(excluded.last_seen_at,1,10)`
      ).bind(row.symbol, SOURCE_MFI, now, now),
      db.prepare(
        `INSERT INTO stock_snapshot (symbol,market,company_name,currency,market_cap,shariah_status,data_status,provider,updated_at)
         VALUES (?,'US',?,'USD',?,'unverified','mfi_screened',?,?)
         ON CONFLICT(symbol,market) DO UPDATE SET company_name=excluded.company_name,market_cap=excluded.market_cap,updated_at=excluded.updated_at
         WHERE stock_snapshot.company_name IS NOT excluded.company_name OR stock_snapshot.market_cap IS NOT excluded.market_cap`
      ).bind(row.symbol, row.name, row.marketCapMillions * 1000000, SOURCE_MFI, now)
    ]));
  }

  // Deactivate ONLY the MFI membership for symbols MFI no longer returns. Frontend (or any other
  // source) memberships are untouched, so those stocks stay active.
  const dropped = [...mfiBefore].filter(symbol => !next.has(symbol));
  for (const part of chunk(dropped, 80)) {
    await db.prepare(
      `UPDATE stock_universe_membership SET active=0,deactivated_at=?
       WHERE market='US' AND source=? AND active=1 AND symbol IN (${part.map(() => "?").join(",")})`
    ).bind(now, SOURCE_MFI, ...part).run();
  }
  await reconcileUsListingStatus(db);

  const unionAfter = await activeSymbols(db);
  const mfiAfter = await activeSymbols(db, SOURCE_MFI);
  const unionChanged = !sameSet(unionBefore, unionAfter);
  // Any membership change invalidates published ranks. Callers add market-cap-change invalidation.
  if (unionChanged || !sameSet(mfiBefore, mfiAfter)) await invalidateUsRanks(db);
  return {
    mfiMembershipChanged: !sameSet(mfiBefore, mfiAfter),
    unionChanged,
    mfiAdded: [...mfiAfter].filter(s => !mfiBefore.has(s)),
    mfiDeactivated: dropped,
    stillActiveViaOtherSource: dropped.filter(s => unionAfter.has(s)),
    activeUniverseSize: unionAfter.size
  };
}

// Add a stock through the frontend. Idempotent; never touches other sources' memberships.
export async function addFrontendStock(db, { symbol: rawSymbol, companyName, marketCapMillions = null, metadata = null }, now) {
  const symbol = normaliseUsSymbol(rawSymbol);
  if (!symbol) throw new Error("Invalid US ticker symbol");
  const name = String(companyName ?? "").trim() || symbol;
  const cap = marketCapMillions == null ? null : Number(marketCapMillions);
  if (cap != null && (!Number.isFinite(cap) || cap <= 0)) throw new Error("market_cap_millions must be a positive number");

  const unionBefore = await activeSymbols(db);
  const existing = await db.prepare(
    "SELECT active FROM stock_universe_membership WHERE market='US' AND symbol=? AND source=?"
  ).bind(symbol, SOURCE_FRONTEND).first();

  await db.batch([
    // Canonical row: created once; an existing row keeps its name/source (legacy SEC / starter rows are re-labelled).
    db.prepare(
      `INSERT INTO stock_master (symbol,market,company_name,currency,exchange,listing_status,source,source_updated_at)
       VALUES (?,'US',?,'USD',?,'active',?,?)
       ON CONFLICT(symbol,market) DO UPDATE SET listing_status='active',
         source=CASE WHEN stock_master.source IN ('SEC company_tickers_exchange.json','curated-starter-universe') THEN excluded.source ELSE stock_master.source END,
         source_updated_at=excluded.source_updated_at`
    ).bind(symbol, name, SOURCE_FRONTEND, SOURCE_FRONTEND, now),
    db.prepare(
      `INSERT INTO stock_universe_membership (market,symbol,source,active,first_seen_at,last_seen_at,deactivated_at,metadata_json)
       VALUES ('US',?,?,1,?,?,NULL,?)
       ON CONFLICT(market,symbol,source) DO UPDATE SET active=1,last_seen_at=excluded.last_seen_at,deactivated_at=NULL,
         metadata_json=COALESCE(excluded.metadata_json,stock_universe_membership.metadata_json)`
    ).bind(symbol, SOURCE_FRONTEND, now, now, metadata ? JSON.stringify(metadata) : null),
    // Snapshot row so the stock is visible; a user-supplied market cap only fills a missing value and
    // never overrides one that came from MFI.com.
    db.prepare(
      `INSERT INTO stock_snapshot (symbol,market,company_name,currency,market_cap,shariah_status,data_status,provider,updated_at)
       VALUES (?,'US',?,'USD',?,'unverified','awaiting_quote',?,?)
       ON CONFLICT(symbol,market) DO UPDATE SET market_cap=excluded.market_cap
       WHERE stock_snapshot.market_cap IS NULL AND excluded.market_cap IS NOT NULL`
    ).bind(symbol, name, cap == null ? null : cap * 1000000, SOURCE_FRONTEND, now)
  ]);
  await reconcileUsListingStatus(db);

  const unionAfter = await activeSymbols(db);
  const unionChanged = !unionBefore.has(symbol);
  if (unionChanged) await invalidateUsRanks(db);
  const sources = (await listActiveUsUniverse(db)).find(row => row.symbol === symbol)?.sources ?? [];
  return {
    symbol,
    status: existing?.active === 1 ? "already_active" : existing ? "reactivated" : "added",
    unionChanged,
    sources,
    activeUniverseSize: unionAfter.size
  };
}

// Remove only the frontend membership. The stock stays active if MFI (or another source) still holds it.
export async function removeFrontendStock(db, rawSymbol, now) {
  const symbol = normaliseUsSymbol(rawSymbol);
  if (!symbol) throw new Error("Invalid US ticker symbol");
  const unionBefore = await activeSymbols(db);
  const result = await db.prepare(
    "UPDATE stock_universe_membership SET active=0,deactivated_at=? WHERE market='US' AND symbol=? AND source=? AND active=1"
  ).bind(now, symbol, SOURCE_FRONTEND).run();
  if (!(result.meta?.changes > 0)) return { symbol, status: "not_found", unionChanged: false, sources: [...unionBefore].includes(symbol) ? (await listActiveUsUniverse(db)).find(r => r.symbol === symbol)?.sources ?? [] : [] };
  await reconcileUsListingStatus(db);
  const unionAfter = await activeSymbols(db);
  const unionChanged = !sameSet(unionBefore, unionAfter);
  if (unionChanged) await invalidateUsRanks(db);
  const sources = (await listActiveUsUniverse(db)).find(row => row.symbol === symbol)?.sources ?? [];
  return { symbol, status: "removed", unionChanged, sources, activeUniverseSize: unionAfter.size };
}
