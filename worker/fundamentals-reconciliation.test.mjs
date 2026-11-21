import assert from "node:assert/strict";
import testCase from "node:test";
import { buildFundamentalsReconciliationPreview, classifyDebtReconciliation } from "./fundamentals-reconciliation.ts";
function row(overrides={}){return {
  symbol:"TEST",company_name:"Test Inc",current_market_cap:100000000,market_cap_updated_at:"2026-11-20T10:00:00.000Z",
  legacy_status:"calculated",legacy_source:"SEC EDGAR Company Facts",legacy_fiscal_period:"2025-12-31",legacy_filed_at:"2026-02-20",
  legacy_ebit:10000000,legacy_current_assets:50000000,legacy_current_liabilities:20000000,legacy_net_ppe:20000000,
  legacy_total_debt:10000000,legacy_cash:5000000,legacy_market_cap:100000000,
  legacy_stored_earnings_yield:0.095238,legacy_stored_return_on_capital:0.2,
  edgar:{provider_status:"supported",accession:"0000000000-26-000001",fiscal_period:"2025-12-31",filing_form:"10-K",reporting_currency:"USD",
    ebit_candidate:10000000,ebit_status:"direct_reported_candidate_review_only",invested_capital_candidate:50000000,
    invested_capital_status:"positive_denominator_candidate_review_only",review_flags:[],
    enterprise_value_candidate_review:{conventional_debt_status:"identified_from_unique_current_and_noncurrent_components",conventional_gross_debt_candidate:10000000,unrestricted_cash_candidate:5000000}},
  ...overrides};}
testCase("reconciles identical same-period inputs using a common current market cap",()=>{const r=buildFundamentalsReconciliationPreview([row()]);const x=r.rows[0];assert.equal(x.status,"comparable");assert.equal(x.legacy.metrics.enterprise_value,105000000);assert.equal(x.edgartools.metrics.enterprise_value,105000000);assert.equal(x.metric_deltas.earnings_yield_percentage_points,0);assert.equal(r.production_write,false);});
testCase("reports partial same-period inputs when legacy debt is missing",()=>{
  const input=row({legacy_status:"missing_required_facts",legacy_ebit:9000000,legacy_total_debt:null});
  const result=buildFundamentalsReconciliationPreview([input]);
  const item=result.rows[0];
  assert.equal(item.metrics_comparable,false);
  assert.equal(item.metric_deltas,null);
  assert.equal(item.status,"legacy_not_calculated");
  assert.equal(item.partial_input_deltas.ebit.delta,1000000);
  assert.equal(item.partial_input_deltas.invested_capital.delta,0);
  assert.equal(item.partial_input_deltas.gross_debt,null);
  assert.equal(item.partial_input_deltas.unrestricted_cash.delta,0);
  assert.equal(item.has_partial_input_differences,true);
  assert.equal(result.summary.partial_input_comparison_rows,1);
  assert.equal(result.summary.rows_with_partial_input_differences,1);
  assert.equal(result.summary.legacy_debt_missing_supported,1);
});

testCase("does not compare different fiscal periods",()=>{const x=buildFundamentalsReconciliationPreview([row({legacy_fiscal_period:"2024-12-31"})]).rows[0];assert.equal(x.status,"period_mismatch");assert.equal(x.metrics_comparable,false);assert.equal(x.metric_deltas,null);assert.ok(x.mismatch_reasons.includes("fiscal_period_mismatch"));});
testCase("does not compare uncalculated legacy fundamentals",()=>{const x=buildFundamentalsReconciliationPreview([row({legacy_status:"missing_required_facts"})]).rows[0];assert.equal(x.status,"legacy_not_calculated");assert.equal(x.legacy.metrics,null);});
testCase("keeps unsupported providers visible but non-comparable",()=>{const r=row();r.edgar.provider_status="unsupported_provider";const x=buildFundamentalsReconciliationPreview([r]).rows[0];assert.equal(x.status,"edgartools_unsupported_or_missing");assert.equal(x.edgartools.metrics,null);});
testCase("flags market-cap drift while using current snapshot for both metrics",()=>{const x=buildFundamentalsReconciliationPreview([row({legacy_market_cap:90000000})]).rows[0];assert.equal(x.legacy.metrics.enterprise_value,105000000);assert.ok(x.edgartools.review_flags.includes("legacy_market_cap_differs_from_current_snapshot"));});
testCase("rejects incomplete EdgarTools debt inputs from comparison",()=>{const r=row();r.edgar.enterprise_value_candidate_review.conventional_debt_status="incomplete_or_ambiguous_debt_inputs";const x=buildFundamentalsReconciliationPreview([r]).rows[0];assert.equal(x.status,"edgartools_inputs_incomplete");assert.equal(x.metric_deltas,null);});

testCase("classifies unique debt components without aggregate as not reported, not insufficient",()=>{
  const status=classifyDebtReconciliation({
    current_debt_candidates:{candidate_count:1,candidates:[{value:5_900_000}]},
    noncurrent_debt_candidates:{candidate_count:1,candidates:[{value:1_318_100_000}]},
    aggregate_debt_candidates:{candidate_count:0,candidates:[]}
  });
  assert.equal(status,"aggregate_not_reported_components_unique");
});
testCase("reconciles a unique aggregate against unique maturity components",()=>{
  const status=classifyDebtReconciliation({
    current_debt_candidates:{candidate_count:1,candidates:[{value:25}]},
    noncurrent_debt_candidates:{candidate_count:1,candidates:[{value:125}]},
    aggregate_debt_candidates:{candidate_count:1,candidates:[{value:150}]}
  });
  assert.equal(status,"reconciles_within_1");
});
testCase("detects aggregate debt mismatch",()=>{
  const status=classifyDebtReconciliation({
    current_debt_candidates:{candidate_count:1,candidates:[{value:25}]},
    noncurrent_debt_candidates:{candidate_count:1,candidates:[{value:120}]},
    aggregate_debt_candidates:{candidate_count:1,candidates:[{value:150}]}
  });
  assert.equal(status,"does_not_reconcile");
});
testCase("keeps ambiguous aggregate and missing components unresolved",()=>{
  const ambiguous=classifyDebtReconciliation({
    current_debt_candidates:{candidate_count:1,candidates:[{value:25}]},
    noncurrent_debt_candidates:{candidate_count:1,candidates:[{value:125}]},
    aggregate_debt_candidates:{candidate_count:2,candidates:[{value:150},{value:151}]}
  });
  const missing=classifyDebtReconciliation({
    current_debt_candidates:{candidate_count:1,candidates:[{value:25}]},
    noncurrent_debt_candidates:{candidate_count:0,candidates:[]},
    aggregate_debt_candidates:{candidate_count:0,candidates:[]}
  });
  assert.equal(ambiguous,"aggregate_present_not_uniquely_resolved");
  assert.equal(missing,"insufficient_unique_inputs");
});
