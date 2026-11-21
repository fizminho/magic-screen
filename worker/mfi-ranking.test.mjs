import assert from "node:assert/strict";
import testCase from "node:test";
import { ordinalRanks, assignCombinedRanks, canPublishRanks, MINIMUM_ELIGIBLE_COHORT } from "./mfi-ranking.mjs";

const row = (symbol, earnings_yield, return_on_capital) => ({ symbol, earnings_yield, return_on_capital });

testCase("highest metric gets rank 1 and ranks are ordinal, not percentile", () => {
  const ranks = ordinalRanks([row("A", 0.1, 0), row("B", 0.3, 0), row("C", 0.2, 0)], "earnings_yield");
  assert.deepEqual([ranks.get("B"), ranks.get("C"), ranks.get("A")], [1, 2, 3]);
});

testCase("exact metric ties share the average occupied position", () => {
  const ranks = ordinalRanks([row("A", 0.3, 0), row("B", 0.2, 0), row("C", 0.2, 0), row("D", 0.1, 0)], "earnings_yield");
  assert.deepEqual([ranks.get("A"), ranks.get("B"), ranks.get("C"), ranks.get("D")], [1, 2.5, 2.5, 4]);
});

testCase("negative metrics rank below positive ones and are not treated as zero", () => {
  const ranks = ordinalRanks([row("NEG", -0.05, 0), row("ZERO", 0, 0), row("POS", 0.01, 0)], "earnings_yield");
  assert.deepEqual([ranks.get("POS"), ranks.get("ZERO"), ranks.get("NEG")], [1, 2, 3]);
});

testCase("combined score is EY rank + ROC rank, lower is better, with 1,1,3 competition ties", () => {
  const rows = [row("A", 0.30, 0.10), row("B", 0.10, 0.30), row("C", 0.20, 0.20), row("D", 0.05, 0.05), row("E", 0.01, 0.01)];
  assert.equal(assignCombinedRanks(rows), true);
  const by = Object.fromEntries(rows.map(r => [r.symbol, r]));
  assert.equal(by.A.magic_formula_score, 4); // 1 + 3
  assert.equal(by.B.magic_formula_score, 4); // 3 + 1
  assert.equal(by.C.magic_formula_score, 4); // 2 + 2
  assert.deepEqual([by.A.magic_formula_rank, by.B.magic_formula_rank, by.C.magic_formula_rank], [1, 1, 1]);
  assert.equal(by.D.magic_formula_rank, 4); // competition rank skips 2 and 3
  assert.equal(by.E.magic_formula_rank, 5);
});

testCase("output is deterministic regardless of input order", () => {
  const base = [row("A", 0.3, 0.1), row("B", 0.1, 0.3), row("C", 0.2, 0.2), row("D", 0.05, 0.05), row("E", 0.01, 0.01)];
  const forward = structuredClone(base), backward = structuredClone(base).reverse();
  assignCombinedRanks(forward); assignCombinedRanks(backward);
  assert.deepEqual(forward.map(r => [r.symbol, r.magic_formula_rank]), backward.map(r => [r.symbol, r.magic_formula_rank]));
});

testCase("no ranks are assigned below the minimum eligible cohort", () => {
  const rows = [row("A", 0.3, 0.1), row("B", 0.1, 0.3)];
  assert.equal(assignCombinedRanks(rows), false);
  assert.equal(rows[0].magic_formula_rank, undefined);
  assert.equal(MINIMUM_ELIGIBLE_COHORT, 5);
});

testCase("completeness gate: any incomplete candidate (e.g. a newly added stock) blocks publication", () => {
  assert.equal(canPublishRanks({ activeCount: 30, completeCurrentCount: 30 }), true);
  assert.equal(canPublishRanks({ activeCount: 31, completeCurrentCount: 30 }), false);
  assert.equal(canPublishRanks({ activeCount: 4, completeCurrentCount: 4 }), false);
});
