import test from "node:test";
import assert from "node:assert/strict";
import { parseHoldingsCsv } from "../src/providers/holdings-csv.ts";

test("holdings CSV parses US and Bursa positions with optional average cost", () => {
  const rows = parseHoldingsCsv(
    "symbol,market,quantity,avg_cost\nAAPL,US,2,100.25\n1155,MY,500,\n"
  );
  assert.deepEqual(rows, [
    { symbol: "AAPL", market: "US", quantity: 2, avgCost: 100.25, cik: null },
    { symbol: "1155", market: "MY", quantity: 500, avgCost: null, cik: null }
  ]);
});

test("holdings CSV supports quoted fields, whitespace and UTF-8 BOM", () => {
  const rows = parseHoldingsCsv(
    '\uFEFFsymbol,market,quantity,avg_cost\r\n" msft "," us ",10,0\r\n'
  );
  assert.deepEqual(rows, [
    { symbol: "MSFT", market: "US", quantity: 10, avgCost: 0, cik: null }
  ]);
});

test("holdings CSV rejects duplicate market-symbol pairs", () => {
  assert.throws(() => parseHoldingsCsv(
    "symbol,market,quantity,avg_cost\nAAPL,US,1,10\naapl,us,2,11\n"
  ), /duplicate holding/);
});

test("holdings CSV rejects invalid symbols, markets, quantities and costs", () => {
  assert.throws(() => parseHoldingsCsv("symbol,market,quantity,avg_cost\nAAPL,OTHER,1,10\n"), /market must be/);
  assert.throws(() => parseHoldingsCsv("symbol,market,quantity,avg_cost\nAAPL,US,0,10\n"), /quantity must be/);
  assert.throws(() => parseHoldingsCsv("symbol,market,quantity,avg_cost\nAAPL,US,1,-1\n"), /avg_cost must be/);
  assert.throws(() => parseHoldingsCsv("symbol,market,quantity,avg_cost\nBAD/NAME,US,1,10\n"), /invalid ticker/);
});

test("holdings CSV requires the agreed columns and limits each batch to 20 rows", () => {
  assert.throws(() => parseHoldingsCsv("symbol,quantity\nAAPL,1\n"), /headers must include/);
  const rows = ["symbol,market,quantity,avg_cost"];
  for (let i = 0; i < 21; i++) rows.push(`T${i},US,1,1`);
  assert.throws(() => parseHoldingsCsv(rows.join("\n")), /limited to 20/);
});

test("holdings CSV accepts an optional US CIK and rejects CIK on Bursa rows", () => {
  const rows = parseHoldingsCsv(
    "symbol,market,quantity,avg_cost,cik\nAAPL,US,2,100,320193\n"
  );
  assert.deepEqual(rows[0], { symbol: "AAPL", market: "US", quantity: 2, avgCost: 100, cik: "320193" });
  assert.throws(() => parseHoldingsCsv(
    "symbol,market,quantity,avg_cost,cik\n1155,MY,2,6.4,123456\n"
  ), /CIK must be/);
});
