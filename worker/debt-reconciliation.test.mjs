import assert from "node:assert/strict";
import testCase from "node:test";
import { classifyDebtReconciliation } from "./debt-reconciliation.mjs";

testCase("unique debt components without aggregate are not misreported as insufficient", () => {
  const status = classifyDebtReconciliation({
    current_debt_candidates: { candidate_count: 1, candidates: [{ value: 5_900_000 }] },
    noncurrent_debt_candidates: { candidate_count: 1, candidates: [{ value: 1_318_100_000 }] },
    aggregate_debt_candidates: { candidate_count: 0, candidates: [] }
  });
  assert.equal(status, "aggregate_not_reported_components_unique");
});
testCase("reconciles unique aggregate against unique maturity components", () => {
  const status = classifyDebtReconciliation({
    current_debt_candidates: { candidate_count: 1, candidates: [{ value: 25 }] },
    noncurrent_debt_candidates: { candidate_count: 1, candidates: [{ value: 125 }] },
    aggregate_debt_candidates: { candidate_count: 1, candidates: [{ value: 150 }] }
  });
  assert.equal(status, "reconciles_within_1");
});
testCase("detects aggregate debt mismatch", () => {
  const status = classifyDebtReconciliation({
    current_debt_candidates: { candidate_count: 1, candidates: [{ value: 25 }] },
    noncurrent_debt_candidates: { candidate_count: 1, candidates: [{ value: 120 }] },
    aggregate_debt_candidates: { candidate_count: 1, candidates: [{ value: 150 }] }
  });
  assert.equal(status, "does_not_reconcile");
});
testCase("keeps ambiguous aggregate and missing maturity components unresolved", () => {
  const ambiguous = classifyDebtReconciliation({
    current_debt_candidates: { candidate_count: 1, candidates: [{ value: 25 }] },
    noncurrent_debt_candidates: { candidate_count: 1, candidates: [{ value: 125 }] },
    aggregate_debt_candidates: { candidate_count: 2, candidates: [{ value: 150 }, { value: 151 }] }
  });
  const missing = classifyDebtReconciliation({
    current_debt_candidates: { candidate_count: 1, candidates: [{ value: 25 }] },
    noncurrent_debt_candidates: { candidate_count: 0, candidates: [] },
    aggregate_debt_candidates: { candidate_count: 0, candidates: [] }
  });
  assert.equal(ambiguous, "aggregate_present_not_uniquely_resolved");
  assert.equal(missing, "insufficient_unique_inputs");
});
