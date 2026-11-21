import test from "node:test";
import assert from "node:assert/strict";
import { listGeminiAccountingEscalations } from "./gemini-accounting-review.ts";

test("does not escalate deterministic categories with no unresolved signals", () => {
  const company = { balance_sheet_fact_review: { categories: {
    current_debt_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [{ concept: "LongTermDebtCurrent", value: 10 }] },
    cash_unrestricted_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [{ concept: "CashAndCashEquivalentsAtCarryingValue", value: 20 }] }
  }, unresolved_categories: [] }, enterprise_value_scope_review: {} };
  const resolver = { symbol: "ABC", accession: "a", fiscal_period: "2025-12-31", review_flags: [],
    ebit_status: "direct_reported_candidate_review_only", invested_capital_status: "positive_denominator_candidate_review_only",
    enterprise_value_candidate_review: { conventional_debt_status: "identified_from_unique_current_and_noncurrent_components" } };
  assert.deepEqual(listGeminiAccountingEscalations("ABC", company, resolver), []);
});

test("escalates ambiguous debt and restricted cash only", () => {
  const company = { balance_sheet_fact_review: { categories: {
    current_debt_candidates: { status: "ambiguous", candidate_count: 2, candidates: [
      { concept: "NotesPayableCurrent", label: "Notes payable", value: 100 },
      { concept: "CreditFacilityCurrent", label: "Credit facility", value: 200 }
    ] },
    cash_restricted_candidates: { status: "identified", candidate_count: 1, candidates: [{ concept: "RestrictedCash", label: "Restricted cash", value: 5 }] }
  }, unresolved_categories: ["restricted_cash_or_short_term_investments_require_cash_scope_review"] }, enterprise_value_scope_review: {} };
  const resolver = { symbol: "ABC", accession: "a", fiscal_period: "2025-12-31",
    review_flags: ["restricted_cash_or_short_term_investments_require_cash_scope_review"],
    enterprise_value_candidate_review: { conventional_debt_status: "incomplete_or_ambiguous_debt_inputs" } };
  const tasks = listGeminiAccountingEscalations("ABC", company, resolver).map(x => x.task);
  assert.ok(tasks.includes("debt_scope"));
  assert.ok(tasks.includes("cash_scope"));
  assert.ok(!tasks.includes("lease_scope"));
});

test("does not escalate simply because an ordinary unique lease row exists", () => {
  const company = { balance_sheet_fact_review: { categories: {
    current_lease_liability_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [{ concept: "LeaseLiabilityCurrent", value: 9 }] }
  }, unresolved_categories: [] }, enterprise_value_scope_review: {} };
  const resolver = { symbol: "ABC", accession: "a", fiscal_period: "2025-12-31", review_flags: [] };
  assert.deepEqual(listGeminiAccountingEscalations("ABC", company, resolver), []);
});
