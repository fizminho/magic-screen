// Pure, dependency-free Magic Formula rank assignment (classic Greenblatt ordinal rank sum).
// Extracted from worker/index.ts so the arithmetic can be tested directly. Behaviour is unchanged.

export const MINIMUM_ELIGIBLE_COHORT = 5;

// Highest value gets rank 1. Exact ties share the average of the occupied ordinal positions.
// Rows must already have finite numeric `key` values; missing inputs are excluded upstream, never zero-filled.
export function ordinalRanks(rows, key) {
  const sorted = [...rows].sort((a, b) => b[key] - a[key] || a.symbol.localeCompare(b.symbol));
  const result = new Map();
  for (let i = 0; i < sorted.length;) {
    let end = i + 1;
    while (end < sorted.length && sorted[end][key] === sorted[i][key]) end++;
    const averageRank = ((i + 1) + end) / 2;
    for (let j = i; j < end; j++) result.set(sorted[j].symbol, averageRank);
    i = end;
  }
  return result;
}

// Mutates and returns `eligible`, sorted best-first. Combined score = EY rank + ROC rank (lower is better).
// Exact combined-score ties share the same competition rank (1,1,3).
// Returns false (and assigns nothing) when the cohort is below the minimum.
export function assignCombinedRanks(eligible, minimumCohort = MINIMUM_ELIGIBLE_COHORT) {
  if (eligible.length < minimumCohort) return false;
  const ey = ordinalRanks(eligible, "earnings_yield");
  const roc = ordinalRanks(eligible, "return_on_capital");
  for (const row of eligible) {
    row.earnings_yield_rank = ey.get(row.symbol) ?? null;
    row.return_on_capital_rank = roc.get(row.symbol) ?? null;
    row.magic_formula_score = row.earnings_yield_rank + row.return_on_capital_rank;
  }
  eligible.sort((a, b) => a.magic_formula_score - b.magic_formula_score || a.symbol.localeCompare(b.symbol));
  let previousScore = null;
  let previousRank = 0;
  eligible.forEach((row, index) => {
    if (previousScore === null || row.magic_formula_score !== previousScore) previousRank = index + 1;
    row.magic_formula_rank = previousRank;
    previousScore = row.magic_formula_score;
  });
  return true;
}

// Completeness gate: ranks may be published only when EVERY active candidate is complete and current.
export function canPublishRanks({ activeCount, completeCurrentCount, minimumCohort = MINIMUM_ELIGIBLE_COHORT }) {
  return activeCount >= minimumCohort && completeCurrentCount === activeCount;
}
