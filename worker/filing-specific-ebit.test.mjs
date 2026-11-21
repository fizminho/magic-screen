import assert from "node:assert/strict";
import testCase from "node:test";
import { resolveFilingSpecificEbitCandidate } from "./filing-specific-ebit.ts";

const accession = "0000012659-26-000026";
const period = "2026-06-30";
function hrbReview() {
  return {
    filing: { accession_number: accession, period_of_report: period, form: "10-K" },
    filing_specific_review: {
      status: "review_only",
      method: "statement_subtotal_reconstructed",
      automation_status: "manual_review_only",
      filing_accession: accession,
      fiscal_period: period,
      reported_revenue: 3945392000,
      reported_total_operating_expenses: 3037706000,
      reported_pretax_income: 853888000,
      reported_other_income_expense_net: 26813000,
      reported_interest_expense_signed: -80611000,
      ebit_candidate: 907686000,
      cross_checks: { reconciles_within_1: true, difference_between_methods: 0 },
    },
  };
}

testCase("accepts exact accession-matched, independently reconciled HRB EBIT review", () => {
  assert.deepEqual(
    resolveFilingSpecificEbitCandidate(hrbReview(), accession, period, 0),
    { value: 907686000, method: "filing_specific_statement_subtotal_reconstruction" },
  );
});

testCase("rejects a different filing accession", () => {
  assert.equal(resolveFilingSpecificEbitCandidate(hrbReview(), "0000000000-26-000001", period, 0), null);
});

testCase("rejects a different fiscal period", () => {
  assert.equal(resolveFilingSpecificEbitCandidate(hrbReview(), accession, "2025-06-30", 0), null);
});

testCase("rejects when a direct EBIT row exists", () => {
  assert.equal(resolveFilingSpecificEbitCandidate(hrbReview(), accession, period, 1), null);
});

testCase("rejects a review that is not explicitly manual and review-only", () => {
  const company = hrbReview();
  company.filing_specific_review.automation_status = "automated";
  assert.equal(resolveFilingSpecificEbitCandidate(company, accession, period, 0), null);
});

testCase("rejects an EBIT value that does not reconcile to both statement bridges", () => {
  const company = hrbReview();
  company.filing_specific_review.ebit_candidate += 1000;
  assert.equal(resolveFilingSpecificEbitCandidate(company, accession, period, 0), null);
});

testCase("rejects a failed cross-check", () => {
  const company = hrbReview();
  company.filing_specific_review.cross_checks.reconciles_within_1 = false;
  assert.equal(resolveFilingSpecificEbitCandidate(company, accession, period, 0), null);
});
