const TAGS = {
  debt_current_aggregate: ["DebtCurrent"],
  borrowings_current_aggregate: ["BorrowingsCurrent"],
  debt_current: ["LongTermDebtCurrent"],
  short_debt: ["ShortTermBorrowings", "ShortTermDebtCurrent"],
  debt_long: ["LongTermDebtNoncurrent"],
  long_term_debt_fallback: ["LongTermDebt"],
  borrowings_long: ["BorrowingsNoncurrent"],
  debt_and_lease_long: ["LongTermDebtAndFinanceLeaseObligationsNoncurrent", "LongTermDebtAndCapitalLeaseObligationsNoncurrent"],
  lease_current: ["LongTermDebtAndFinanceLeaseObligationsCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"]
};

function factsFor(facts, tags, accession, periodEnd) {
  const found = [];
  for (const taxonomy of ["us-gaap", "ifrs-full"]) {
    for (const tag of tags) {
      const units = facts?.facts?.[taxonomy]?.[tag]?.units ?? {};
      for (const [unit, entries] of Object.entries(units)) {
        for (const entry of Array.isArray(entries) ? entries : []) {
          if (entry?.accn !== accession) continue;
          const samePeriod = entry?.end === periodEnd && !entry?.start;
          found.push({
            taxonomy, tag, unit, value: typeof entry?.val === "number" ? entry.val : null,
            end: entry?.end ?? null, start: entry?.start ?? null, filed: entry?.filed ?? null,
            form: entry?.form ?? null, same_period: samePeriod,
            eligible_usd_instant: unit === "USD" && samePeriod &&
              typeof entry?.val === "number" && Number.isFinite(entry.val) &&
              ["10-K", "20-F", "40-F", "10-Q"].includes(entry?.form)
          });
        }
      }
    }
  }
  return found;
}

function selectedValue(items) {
  // Match secFactValue(): taxonomy and tag priority are preserved, then latest filed fact wins.
  const eligible = items.filter(item => item.eligible_usd_instant)
    .sort((a, b) => String(b.filed ?? "").localeCompare(String(a.filed ?? "")));
  return eligible.length ? eligible[0].value : null;
}

export function diagnoseLegacyDebtFacts(facts, periodEnd, accession) {
  const groups = {};
  for (const [name, tags] of Object.entries(TAGS)) {
    groups[name] = factsFor(facts, tags, accession, periodEnd);
  }
  const value = name => uniqueValue(groups[name]);
  const debtCurrentAggregate = value("debt_current_aggregate");
  const borrowingsCurrentAggregate = value("borrowings_current_aggregate");
  const debtCurrent = value("debt_current");
  const shortDebt = value("short_debt");
  const debtLong = value("debt_long");
  const longTermDebtFallback = value("long_term_debt_fallback");
  const borrowingsLong = value("borrowings_long");
  const debtAndLeaseLong = value("debt_and_lease_long");
  const leaseCurrent = value("lease_current");
  const usAggregateDebtKnown = debtCurrentAggregate !== null && debtAndLeaseLong !== null;
  const ifrsAggregateDebtKnown = borrowingsCurrentAggregate !== null && borrowingsLong !== null;
  const splitDebtKnown = debtCurrent !== null && shortDebt !== null && debtLong !== null;
  const zeroCurrentLongTermDebtKnown = debtCurrentAggregate === 0 && longTermDebtFallback !== null;
  const anyBorrowingFacts = [
    "debt_current_aggregate", "borrowings_current_aggregate", "debt_current", "short_debt",
    "debt_long", "borrowings_long", "long_term_debt_fallback"
  ].some(name => groups[name].some(item => item.eligible_usd_instant));
  const leaseDebtKnown = leaseCurrent !== null && debtAndLeaseLong !== null;
  const debtKnown = usAggregateDebtKnown || ifrsAggregateDebtKnown || splitDebtKnown ||
    zeroCurrentLongTermDebtKnown || (!anyBorrowingFacts && leaseDebtKnown);
  const totalDebt = usAggregateDebtKnown ? debtCurrentAggregate + debtAndLeaseLong
    : ifrsAggregateDebtKnown ? borrowingsCurrentAggregate + borrowingsLong
    : splitDebtKnown ? debtCurrent + shortDebt + debtLong
    : zeroCurrentLongTermDebtKnown ? longTermDebtFallback
    : !anyBorrowingFacts && leaseDebtKnown ? leaseCurrent + debtAndLeaseLong : null;
  let reason;
  let selectedMethod = null;
  if (usAggregateDebtKnown) selectedMethod = "us_gaap_current_debt_plus_noncurrent_debt_and_finance_leases";
  else if (ifrsAggregateDebtKnown) selectedMethod = "ifrs_current_plus_noncurrent_borrowings";
  else if (splitDebtKnown) selectedMethod = "us_gaap_current_maturities_plus_short_term_borrowings_plus_noncurrent_debt";
  else if (zeroCurrentLongTermDebtKnown) selectedMethod = "zero_current_debt_plus_long_term_debt_fallback";
  else if (!anyBorrowingFacts && leaseDebtKnown) selectedMethod = "lease_only_when_no_borrowing_facts_reported";
  if (debtKnown) reason = "debt_inputs_resolved";
  else if (!anyBorrowingFacts && !leaseDebtKnown) reason = "no_recognised_borrowing_or_lease_facts_in_anchor_filing";
  else if (anyBorrowingFacts) reason = "recognised_debt_facts_exist_but_required_paired_components_are_missing_or_ambiguous";
  else reason = "debt_inputs_not_resolved";
  return {
    anchor: { fiscal_period: periodEnd, accession },
    debt_known: debtKnown, total_debt_candidate: totalDebt, selected_method: selectedMethod, reason,
    fact_groups: groups,
    rules: {
      us_aggregate_pair_complete: usAggregateDebtKnown,
      ifrs_borrowings_pair_complete: ifrsAggregateDebtKnown,
      split_debt_components_complete: splitDebtKnown,
      zero_current_fallback_complete: zeroCurrentLongTermDebtKnown,
      any_borrowing_facts: anyBorrowingFacts,
      lease_pair_complete: leaseDebtKnown
    }
  };
}
