function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Classify debt reconciliation from accession-matched balance-sheet candidate buckets.
 * An absent aggregate row is not a missing maturity component and is not a mismatch.
 */
export function classifyDebtReconciliation(categories) {
  const uniqueValue = (name) => {
    const category = categories?.[name] ?? {};
    const candidates = Array.isArray(category.candidates) ? category.candidates : [];
    if (category.candidate_count !== 1 || candidates.length !== 1) return null;
    return finiteNumber(candidates[0]?.value);
  };
  const current = uniqueValue("current_debt_candidates");
  const noncurrent = uniqueValue("noncurrent_debt_candidates");
  const aggregateCategory = categories?.aggregate_debt_candidates ?? {};
  const aggregateCount = Number.isInteger(aggregateCategory.candidate_count)
    ? aggregateCategory.candidate_count : 0;
  const aggregate = uniqueValue("aggregate_debt_candidates");
  const componentSum = current !== null && noncurrent !== null ? current + noncurrent : null;

  if (aggregateCount > 0) {
    if (aggregate !== null && componentSum !== null) {
      return Math.abs(aggregate - componentSum) <= 1
        ? "reconciles_within_1" : "does_not_reconcile";
    }
    return "aggregate_present_not_uniquely_resolved";
  }
  if (componentSum !== null) return "aggregate_not_reported_components_unique";
  return "insufficient_unique_inputs";
}
