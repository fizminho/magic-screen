import assert from "node:assert/strict";
import testCase from "node:test";
import { diagnoseLegacyDebtFacts } from "./legacy-debt-diagnostic.mjs";

function facts(groups) {
  const result = { facts: { "us-gaap": {} } };
  for (const [tag, value] of Object.entries(groups)) {
    result.facts["us-gaap"][tag] = { units: { USD: [{
      val: value, accn: "0000000000-26-000001", end: "2025-12-31", filed: "2026-02-20", form: "10-K"
    }] } };
  }
  return result;
}

testCase("identifies the complete US aggregate debt pair", () => {
  const result = diagnoseLegacyDebtFacts(facts({
    DebtCurrent: 5, LongTermDebtAndFinanceLeaseObligationsNoncurrent: 95
  }), "2025-12-31", "0000000000-26-000001");
  assert.equal(result.debt_known, true);
  assert.equal(result.total_debt_candidate, 100);
  assert.equal(result.selected_method, "us_gaap_current_debt_plus_noncurrent_debt_and_finance_leases");
});

testCase("explains partial debt facts instead of silently treating them as zero", () => {
  const result = diagnoseLegacyDebtFacts(facts({ DebtCurrent: 5 }), "2025-12-31", "0000000000-26-000001");
  assert.equal(result.debt_known, false);
  assert.equal(result.total_debt_candidate, null);
  assert.equal(result.reason, "recognised_debt_facts_exist_but_required_paired_components_are_missing_or_ambiguous");
  assert.equal(result.fact_groups.debt_current_aggregate[0].value, 5);
});

testCase("explains when no recognised borrowing facts exist", () => {
  const result = diagnoseLegacyDebtFacts(facts({}), "2025-12-31", "0000000000-26-000001");
  assert.equal(result.debt_known, false);
  assert.equal(result.reason, "no_recognised_borrowing_or_lease_facts_in_anchor_filing");
});

testCase("does not accept a fact from another accession or period", () => {
  const input = facts({ DebtCurrent: 5, LongTermDebtAndFinanceLeaseObligationsNoncurrent: 95 });
  input.facts["us-gaap"].DebtCurrent.units.USD[0].accn = "other";
  const result = diagnoseLegacyDebtFacts(input, "2025-12-31", "0000000000-26-000001");
  assert.equal(result.debt_known, false);
  assert.equal(result.fact_groups.debt_current_aggregate.length, 0);
});

testCase("does not count non-USD or duration facts as eligible debt", () => {
  const input = facts({ DebtCurrent: 5, LongTermDebtAndFinanceLeaseObligationsNoncurrent: 95 });
  input.facts["us-gaap"].DebtCurrent.units.USD[0].start = "2025-01-01";
  const result = diagnoseLegacyDebtFacts(input, "2025-12-31", "0000000000-26-000001");
  assert.equal(result.debt_known, false);
  assert.equal(result.fact_groups.debt_current_aggregate[0].eligible_usd_instant, false);
});
