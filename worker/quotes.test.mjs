import test from "node:test";
import assert from "node:assert/strict";
import { parseManualQuotesCsv } from "../src/providers/manual-csv.ts";

test("manual Bursa CSV parser normalizes symbols and computes daily change", () => {
  const now = Date.parse("2026-11-25T04:00:00.000Z");
  const [quote] = parseManualQuotesCsv(
    'symbol,price,asOf,prevClose\r\n1155,6.42,2026-11-24T08:00:00+08:00,6.30\r\n',
    now
  );
  assert.equal(quote.symbol, "1155");
  assert.equal(quote.market, "MY");
  assert.equal(quote.price, 6.42);
  assert.equal(quote.prevClose, 6.3);
  assert.ok(Math.abs(quote.changePct - (0.12 / 6.3)) < 0.0000001);
  assert.equal(quote.currency, "MYR");
  assert.equal(quote.provider, "manual-csv");
  assert.equal(quote.status, "ok");
});

test("manual CSV supports quoted company-style values and optional previous close", () => {
  const now = Date.parse("2026-11-25T04:00:00.000Z");
  const [quote] = parseManualQuotesCsv(
    'symbol,price,asOf,prevClose\n"1023",1.25,"2026-11-25T10:00:00+08:00",\n',
    now
  );
  assert.equal(quote.symbol, "1023");
  assert.equal(quote.prevClose, null);
  assert.equal(quote.changePct, null);
});

test("manual CSV rejects duplicate symbols and invalid prices", () => {
  const now = Date.now();
  assert.throws(() => parseManualQuotesCsv(
    "symbol,price,asOf\n1155,6.4,2026-11-24\n1155,6.5,2026-11-24\n", now
  ), /duplicate symbol/);
  assert.throws(() => parseManualQuotesCsv(
    "symbol,price,asOf\n1155,-1,2026-11-24\n", now
  ), /price must be greater than zero/);
});

test("manual CSV rejects future and malformed dates", () => {
  const now = Date.parse("2026-11-25T04:00:00.000Z");
  assert.throws(() => parseManualQuotesCsv(
    "symbol,price,asOf\n1155,6.4,2026-11-26T00:00:00Z\n", now
  ), /valid date\/time/);
  assert.throws(() => parseManualQuotesCsv(
    "symbol,price,asOf\n1155,6.4,not-a-date\n", now
  ), /valid date\/time/);
});

test("manual CSV marks old prices stale and rejects unclosed CSV quotes", () => {
  const now = Date.parse("2026-11-25T04:00:00.000Z");
  const [quote] = parseManualQuotesCsv(
    "symbol,price,asOf\n1155,6.4,2026-11-10T00:00:00Z\n", now
  );
  assert.equal(quote.status, "stale");
  assert.throws(() => parseManualQuotesCsv('symbol,price,asOf\n"1155,6.4,2026-11-24\n', now), /unclosed quoted field/);
});
