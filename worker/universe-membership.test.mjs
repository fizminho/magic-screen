import assert from "node:assert/strict";
import testCase from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  MEMBERSHIP_DDL, SOURCE_MFI, SOURCE_FRONTEND,
  backfillMfiMemberships, applyMfiSelection, addFrontendStock, removeFrontendStock,
  listActiveUsUniverse, normaliseUsSymbol
} from "./universe-membership.mjs";

// Minimal D1 shim over node:sqlite so the real SQL runs in tests.
function createDb() {
  const sqlite = new DatabaseSync(":memory:");
  const wrap = sql => ({
    bind: (...args) => ({
      sql, args,
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
      first: async () => sqlite.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...args) })
    }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run().changes) } }),
    first: async () => sqlite.prepare(sql).get() ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all() })
  });
  const db = {
    sqlite,
    prepare: wrap,
    batch: async statements => {
      sqlite.exec("BEGIN");
      try {
        const out = [];
        for (const statement of statements) out.push(await statement.run());
        sqlite.exec("COMMIT");
        return out;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    }
  };
  sqlite.exec(`CREATE TABLE stock_master (symbol TEXT NOT NULL, market TEXT NOT NULL, company_name TEXT NOT NULL, currency TEXT NOT NULL, exchange TEXT, sector TEXT, listing_status TEXT NOT NULL DEFAULT 'active', source TEXT NOT NULL, source_updated_at TEXT NOT NULL, PRIMARY KEY(symbol,market));
    CREATE TABLE stock_snapshot (symbol TEXT NOT NULL, market TEXT NOT NULL, company_name TEXT NOT NULL, currency TEXT NOT NULL, price REAL, change_percent REAL, market_cap REAL, earnings_yield REAL, return_on_capital REAL, magic_formula_rank INTEGER, shariah_status TEXT NOT NULL DEFAULT 'unverified', shariah_source TEXT, shariah_as_of TEXT, data_status TEXT NOT NULL DEFAULT 'unavailable', provider TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(symbol,market));`);
  for (const ddl of MEMBERSHIP_DDL) sqlite.exec(ddl);
  return db;
}

const mfi = (symbol, cap = 500) => ({ symbol, name: symbol + " Inc", marketCapMillions: cap });
const T1 = "2026-11-20T10:00:00.000Z";
const T2 = "2026-11-21T10:00:00.000Z";
const T3 = "2026-11-22T10:00:00.000Z";

const activeStatus = (db, symbol, market = "US") =>
  db.sqlite.prepare("SELECT listing_status FROM stock_master WHERE symbol=? AND market=?").get(symbol, market)?.listing_status;
const membership = (db, symbol, source) =>
  db.sqlite.prepare("SELECT active FROM stock_universe_membership WHERE market='US' AND symbol=? AND source=?").get(symbol, source)?.active;
const activeSymbols = async db => (await listActiveUsUniverse(db)).map(row => row.symbol);
const seedRank = (db, symbol, rank = 3) =>
  db.sqlite.prepare("UPDATE stock_snapshot SET magic_formula_rank=? WHERE symbol=? AND market='US'").run(rank, symbol);
const rankCount = db => db.sqlite.prepare("SELECT COUNT(*) AS c FROM stock_snapshot WHERE magic_formula_rank IS NOT NULL").get().c;

testCase("new MFI symbols are imported as MFI memberships", async () => {
  const db = createDb();
  const result = await applyMfiSelection(db, [mfi("AAA"), mfi("BBB")], T1);
  assert.deepEqual(await activeSymbols(db), ["AAA", "BBB"]);
  assert.deepEqual(result.mfiAdded.sort(), ["AAA", "BBB"]);
  assert.equal(activeStatus(db, "AAA"), "active");
});

testCase("a manually added stock survives an MFI refresh that omits it", async () => {
  const db = createDb();
  await applyMfiSelection(db, [mfi("AAA")], T1);
  await addFrontendStock(db, { symbol: "ZZZ", companyName: "Zed Corp" }, T1);
  const result = await applyMfiSelection(db, [mfi("BBB")], T2);
  assert.deepEqual(await activeSymbols(db), ["BBB", "ZZZ"]);
  assert.equal(activeStatus(db, "ZZZ"), "active");
  assert.equal(activeStatus(db, "AAA"), "inactive");
  assert.equal(membership(db, "AAA", SOURCE_MFI), 0);
  assert.deepEqual(result.mfiDeactivated, ["AAA"]);
});

testCase("a stock in both sources stays active when MFI drops it, and when the frontend drops it", async () => {
  const db = createDb();
  await applyMfiSelection(db, [mfi("AAA")], T1);
  await addFrontendStock(db, { symbol: "AAA" }, T1);
  assert.deepEqual((await listActiveUsUniverse(db))[0].sources, [SOURCE_FRONTEND, SOURCE_MFI].sort());

  const dropped = await applyMfiSelection(db, [mfi("BBB")], T2);
  assert.equal(activeStatus(db, "AAA"), "active");
  assert.equal(membership(db, "AAA", SOURCE_MFI), 0);
  assert.equal(membership(db, "AAA", SOURCE_FRONTEND), 1);
  assert.deepEqual(dropped.stillActiveViaOtherSource, ["AAA"]);

  // Re-add via MFI, then remove the frontend membership: MFI keeps it active.
  await applyMfiSelection(db, [mfi("AAA"), mfi("BBB")], T3);
  const removed = await removeFrontendStock(db, "AAA", T3);
  assert.equal(removed.status, "removed");
  assert.equal(removed.unionChanged, false);
  assert.equal(activeStatus(db, "AAA"), "active");
  assert.equal(membership(db, "AAA", SOURCE_MFI), 1);
});

testCase("removing the only manual membership deactivates the stock", async () => {
  const db = createDb();
  await addFrontendStock(db, { symbol: "ZZZ" }, T1);
  const removed = await removeFrontendStock(db, "ZZZ", T2);
  assert.equal(removed.unionChanged, true);
  assert.equal(activeStatus(db, "ZZZ"), "inactive");
  assert.deepEqual(await activeSymbols(db), []);
});

testCase("frontend cannot remove an MFI membership", async () => {
  const db = createDb();
  await applyMfiSelection(db, [mfi("AAA")], T1);
  const removed = await removeFrontendStock(db, "AAA", T2);
  assert.equal(removed.status, "not_found");
  assert.equal(activeStatus(db, "AAA"), "active");
});

testCase("duplicate additions and repeated MFI imports are idempotent", async () => {
  const db = createDb();
  const first = await addFrontendStock(db, { symbol: "ZZZ", companyName: "Zed" }, T1);
  const second = await addFrontendStock(db, { symbol: "zzz", companyName: "Other name" }, T2);
  assert.equal(first.status, "added");
  assert.equal(second.status, "already_active");
  assert.equal(second.unionChanged, false);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM stock_master WHERE symbol='ZZZ'").get().c, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM stock_universe_membership WHERE symbol='ZZZ'").get().c, 1);
  assert.equal(db.sqlite.prepare("SELECT company_name FROM stock_master WHERE symbol='ZZZ'").get().company_name, "Zed");

  await applyMfiSelection(db, [mfi("AAA")], T1);
  await applyMfiSelection(db, [mfi("AAA")], T1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM stock_universe_membership WHERE symbol='AAA'").get().c, 1);
  const row = db.sqlite.prepare("SELECT first_seen_at FROM stock_universe_membership WHERE symbol='AAA'").get();
  await applyMfiSelection(db, [mfi("AAA")], T3);
  assert.equal(db.sqlite.prepare("SELECT first_seen_at FROM stock_universe_membership WHERE symbol='AAA'").get().first_seen_at, row.first_seen_at);
});

testCase("inactive memberships do not appear as active stocks and reactivation works", async () => {
  const db = createDb();
  await addFrontendStock(db, { symbol: "ZZZ" }, T1);
  await removeFrontendStock(db, "ZZZ", T2);
  assert.deepEqual(await activeSymbols(db), []);
  const again = await addFrontendStock(db, { symbol: "ZZZ" }, T3);
  assert.equal(again.status, "reactivated");
  assert.deepEqual(await activeSymbols(db), ["ZZZ"]);
});

testCase("the MFI membership is reactivated when MFI returns a stock again", async () => {
  const db = createDb();
  await applyMfiSelection(db, [mfi("AAA")], T1);
  await applyMfiSelection(db, [mfi("BBB")], T2);
  assert.equal(activeStatus(db, "AAA"), "inactive");
  await applyMfiSelection(db, [mfi("AAA")], T3);
  assert.equal(activeStatus(db, "AAA"), "active");
  assert.equal(membership(db, "AAA", SOURCE_MFI), 1);
});

testCase("other markets, including Bursa, are unaffected", async () => {
  const db = createDb();
  db.sqlite.prepare("INSERT INTO stock_master VALUES ('1155.KL','MY','Maybank','MYR','Main Market',NULL,'active','Bursa directory import',?)").run(T1);
  await applyMfiSelection(db, [mfi("AAA")], T1);
  await addFrontendStock(db, { symbol: "ZZZ" }, T1);
  await applyMfiSelection(db, [mfi("BBB")], T2);
  await removeFrontendStock(db, "ZZZ", T3);
  assert.equal(activeStatus(db, "1155.KL", "MY"), "active");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM stock_universe_membership WHERE market!='US'").get().c, 0);
});

testCase("universe changes clear published ranks; no-op operations keep them", async () => {
  const db = createDb();
  await applyMfiSelection(db, [mfi("AAA"), mfi("BBB")], T1);
  seedRank(db, "AAA", 1); seedRank(db, "BBB", 2);

  await addFrontendStock(db, { symbol: "AAA" }, T2); // already in the union: no change
  assert.equal(rankCount(db), 2);
  await applyMfiSelection(db, [mfi("AAA"), mfi("BBB")], T2); // same universe, same caps: no change
  assert.equal(rankCount(db), 2);

  await addFrontendStock(db, { symbol: "NEW" }, T2); // new candidate: ranks must not be shown as current
  assert.equal(rankCount(db), 0);

  seedRank(db, "AAA", 1);
  await applyMfiSelection(db, [mfi("AAA")], T3); // BBB leaves the union
  assert.equal(rankCount(db), 0);
});

testCase("backfill converts legacy MFI rows to memberships and ignores other legacy sources", async () => {
  const db = createDb();
  const insert = db.sqlite.prepare("INSERT INTO stock_master VALUES (?,'US',?,'USD',NULL,NULL,?,?,?)");
  insert.run("OLD", "Old MFI", "active", SOURCE_MFI, T1);
  insert.run("GONE", "Gone MFI", "inactive", SOURCE_MFI, T1);
  insert.run("SEC1", "SEC directory", "active", "SEC company_tickers_exchange.json", T1);
  await backfillMfiMemberships(db);
  await backfillMfiMemberships(db); // idempotent
  assert.equal(membership(db, "OLD", SOURCE_MFI), 1);
  assert.equal(membership(db, "GONE", SOURCE_MFI), 0);
  assert.equal(membership(db, "SEC1", SOURCE_MFI), undefined);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM stock_universe_membership").get().c, 2);
});

testCase("a legacy SEC-sourced row that is manually added is relabelled so cleanup keeps it", async () => {
  const db = createDb();
  db.sqlite.prepare("INSERT INTO stock_master VALUES ('SEC1','US','SEC directory','USD',NULL,NULL,'inactive','SEC company_tickers_exchange.json',?)").run(T1);
  await addFrontendStock(db, { symbol: "SEC1" }, T2);
  assert.equal(db.sqlite.prepare("SELECT source FROM stock_master WHERE symbol='SEC1'").get().source, SOURCE_FRONTEND);
  assert.equal(activeStatus(db, "SEC1"), "active");
});

testCase("manual market cap fills a missing value but never overrides an MFI cap", async () => {
  const db = createDb();
  await applyMfiSelection(db, [mfi("AAA", 900)], T1);
  await addFrontendStock(db, { symbol: "AAA", marketCapMillions: 1 }, T2);
  assert.equal(db.sqlite.prepare("SELECT market_cap FROM stock_snapshot WHERE symbol='AAA'").get().market_cap, 900 * 1e6);
  await addFrontendStock(db, { symbol: "ZZZ", marketCapMillions: 250 }, T2);
  assert.equal(db.sqlite.prepare("SELECT market_cap FROM stock_snapshot WHERE symbol='ZZZ'").get().market_cap, 250 * 1e6);
});

testCase("symbol validation accepts US class shares and rejects exchange suffixes and junk", async () => {
  assert.equal(normaliseUsSymbol(" brk-b "), "BRK-B");
  assert.equal(normaliseUsSymbol("BF.B"), "BF.B");
  assert.equal(normaliseUsSymbol("1155.KL"), null);
  assert.equal(normaliseUsSymbol("A;DROP"), null);
  assert.equal(normaliseUsSymbol(""), null);
  const db = createDb();
  await assert.rejects(() => addFrontendStock(db, { symbol: "bad symbol" }, T1), /Invalid US ticker/);
  await assert.rejects(() => addFrontendStock(db, { symbol: "OK", marketCapMillions: -5 }, T1), /positive/);
});
