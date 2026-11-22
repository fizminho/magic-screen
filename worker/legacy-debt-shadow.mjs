// Read-only SHADOW candidate: conventional debt = LongTermDebtCurrent + LongTermDebtNoncurrent.
// Pure function. Never writes production data. Missing is unknown, never zero.
const TAXONOMIES = ["us-gaap", "ifrs-full"];
const FORMS = ["10-K", "20-F", "40-F", "10-Q"];
const CURRENT_TAGS = ["LongTermDebtCurrent"];
const NONCURRENT_TAGS = ["LongTermDebtNoncurrent"];
const SHORT_TERM_TAGS = ["ShortTermBorrowings", "ShortTermDebtCurrent"];
const CURRENT_AGGREGATE_TAGS = ["DebtCurrent", "BorrowingsCurrent"];
const LEASE_AGGREGATE_TAGS = [
  "LongTermDebtAndFinanceLeaseObligationsNoncurrent", "LongTermDebtAndCapitalLeaseObligationsNoncurrent",
  "LongTermDebtAndFinanceLeaseObligationsCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"
];
const CROSS_CHECK_TAGS = ["LongTermDebt"];
const SELECTED = new Set([...CURRENT_TAGS, ...NONCURRENT_TAGS, ...SHORT_TERM_TAGS,
  ...CURRENT_AGGREGATE_TAGS, ...LEASE_AGGREGATE_TAGS, ...CROSS_CHECK_TAGS]);
const DISCOVERY = /Debt|Borrowing|Loan|Lease|Royalty|Financing|NotesPayable|Convertible|CreditFacility|Securiti[sz]|SaleLeaseback|Obligation/i;
const MAX_DISCOVERED = 60;

function hasDimension(entry) {
  return Boolean(entry?.segment || entry?.dimensions || entry?.members || entry?.dimension || entry?.axis);
}

function reject(entry, taxonomy, tag, unit, reason) {
  return { taxonomy, tag, unit, value: typeof entry?.val === "number" ? entry.val : null,
    end: entry?.end ?? null, start: entry?.start ?? null, filed: entry?.filed ?? null, reason };
}

// Collect facts of one accession for the given tags; split into eligible and rejected.
function collect(facts, tags, accession, periodEnd) {
  const eligible = [], rejected = [];
  for (const taxonomy of TAXONOMIES) for (const tag of tags) {
    const units = facts?.facts?.[taxonomy]?.[tag]?.units ?? {};
    for (const [unit, entries] of Object.entries(units)) for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry?.accn !== accession) continue;
      let reason = null;
      if (hasDimension(entry)) reason = "dimensional_fact";
      else if (unit !== "USD") reason = "non_usd_unit";
      else if (entry?.start || entry?.end !== periodEnd) reason = "period_mismatch";
      else if (typeof entry?.val !== "number" || !Number.isFinite(entry.val)) reason = "non_numeric_value";
      else if (!entry?.filed) reason = "missing_filed_date";
      else if (!FORMS.includes(entry?.form)) reason = "unsupported_form";
      if (reason) rejected.push(reject(entry, taxonomy, tag, unit, reason));
      else eligible.push({ taxonomy, tag, unit, currency: "USD", value: entry.val, end: entry.end,
        filed: entry.filed, form: entry.form, accession });
    }
  }
  return { eligible, rejected };
}

// One component: unique value across eligible facts, else absent or ambiguous.
function component(facts, tags, accession, periodEnd) {
  const { eligible, rejected } = collect(facts, tags, accession, periodEnd);
  const values = [...new Set(eligible.map(f => f.value))];
  if (!eligible.length) return { status: "absent", fact: null, rejected };
  if (values.length > 1) return { status: "ambiguous", fact: null, competing_values: values, rejected };
  const best = [...eligible].sort((a, b) => String(b.filed).localeCompare(String(a.filed)))[0];
  return { status: "present", fact: best, rejected };
}

function describe(c) {
  return c.fact ? { concept: `${c.fact.taxonomy}:${c.fact.tag}`, value: c.fact.value, unit: c.fact.unit,
    currency: c.fact.currency, accession: c.fact.accession, fiscal_period: c.fact.end,
    filed: c.fact.filed, form: c.fact.form, reported: true } : null;
}

function categorize(tag) {
  if (/Royalty|SaleLeaseback|Securiti[sz]|CustomerFinancing|FinancingObligation|FailedSale/i.test(tag)) return "royalty_or_other_financing";
  if (/Lease/i.test(tag)) return "lease";
  return "other_debt_related";
}

function discover(facts, accession, periodEnd) {
  const out = [];
  for (const taxonomy of TAXONOMIES) for (const [tag, node] of Object.entries(facts?.facts?.[taxonomy] ?? {})) {
    if (SELECTED.has(tag) || !DISCOVERY.test(tag)) continue;
    for (const [unit, entries] of Object.entries(node?.units ?? {})) for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry?.accn !== accession || entry?.start || entry?.end !== periodEnd || hasDimension(entry)) continue;
      if (typeof entry?.val !== "number" || !Number.isFinite(entry.val)) continue;
      out.push({ concept: `${taxonomy}:${tag}`, value: entry.val, unit, filed: entry.filed ?? null,
        category: categorize(tag), included_in_candidate: false });
    }
  }
  const seen = new Set();
  return out.filter(x => { const k = `${x.concept}|${x.unit}|${x.value}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, MAX_DISCOVERED);
}

export function resolveLegacyDebtShadow(facts, periodEnd, accession) {
  const cur = component(facts, CURRENT_TAGS, accession, periodEnd);
  const non = component(facts, NONCURRENT_TAGS, accession, periodEnd);
  const short = component(facts, SHORT_TERM_TAGS, accession, periodEnd);
  const aggs = CURRENT_AGGREGATE_TAGS.map(tag => component(facts, [tag], accession, periodEnd));
  const leaseAgg = component(facts, LEASE_AGGREGATE_TAGS, accession, periodEnd);
  const longTermDebt = component(facts, CROSS_CHECK_TAGS, accession, periodEnd);
  const discovered = discover(facts, accession, periodEnd);
  const reasons = [], flags = [];
  const note = (list, v) => { if (!list.includes(v)) list.push(v); };

  for (const [label, c] of [["current_long_term_debt", cur], ["noncurrent_long_term_debt", non]]) {
    if (c.status === "absent") note(reasons, `missing_${label}`);
    if (c.status === "ambiguous") note(reasons, `ambiguous_${label}`);
  }
  if (short.status === "ambiguous") note(reasons, "ambiguous_short_term_borrowings");

  let methodComponents = "current_plus_noncurrent_long_term_debt";
  let shortIncluded = false;
  if (cur.status === "present" && short.status === "present") {
    // Short-term borrowings are added only when an aggregate proves non-overlap.
    const proof = aggs.find(a => a.status === "present" && a.fact.value === cur.fact.value + short.fact.value);
    if (short.fact.value === 0) { shortIncluded = true; }
    else if (proof) { shortIncluded = true; methodComponents = "current_plus_short_term_plus_noncurrent_long_term_debt"; }
    else note(reasons, "short_term_borrowings_overlap_unproven");
  }
  if (cur.status === "present") for (const a of aggs) {
    if (a.status === "ambiguous") note(reasons, "ambiguous_current_aggregate");
    if (a.status !== "present") continue;
    const expected = cur.fact.value + (shortIncluded && short.status === "present" ? short.fact.value : 0);
    if (a.fact.value !== expected && a.fact.value !== cur.fact.value) note(reasons, "current_aggregate_conflicts_with_components");
  }
  if (leaseAgg.status === "present") note(flags, "debt_and_lease_aggregate_present_not_used");
  const royalty = discovered.filter(d => d.category === "royalty_or_other_financing");
  const leases = discovered.filter(d => d.category === "lease");
  if (royalty.length) note(flags, "scope_review_required_royalty_or_other_financing");
  if (leases.length) note(flags, "separate_lease_evidence_not_included");

  const anyDebtEvidence = discovered.length > 0 || [cur, non, short, longTermDebt, leaseAgg, ...aggs].some(c => c.status !== "absent");
  let status, total = null, method = null;
  if (reasons.length) {
    status = reasons.some(r => r.startsWith("ambiguous") || r.includes("conflict") || r.includes("overlap"))
      ? "unresolved_ambiguous" : "unresolved_insufficient_inputs";
  } else {
    total = cur.fact.value + non.fact.value + (shortIncluded && short.status === "present" ? short.fact.value : 0);
    method = methodComponents;
    status = flags.some(f => f.startsWith("scope_review_required")) ? "candidate_scope_review_required" : "candidate";
  }
  if (status === "unresolved_insufficient_inputs" && !anyDebtEvidence) {
    note(reasons, "no_recognised_debt_evidence_not_proof_of_no_debt");
    status = "insufficient_evidence";
  }
  if (longTermDebt.status === "present" && total !== null && longTermDebt.fact.value !== total)
    note(flags, "long_term_debt_total_differs_from_candidate");

  return {
    anchor: { accession, fiscal_period: periodEnd },
    status, candidate_conventional_debt: total, calculation_method: method, currency: total === null ? null : "USD",
    components: { current_long_term_debt: describe(cur), noncurrent_long_term_debt: describe(non),
      short_term_borrowings: shortIncluded ? describe(short) : null },
    short_term_borrowing: {
      separately_identified: short.status === "present",
      status: short.status === "present" ? (shortIncluded ? "included_proven_incremental_or_zero" : "present_not_included_overlap_unproven")
        : short.status === "ambiguous" ? "ambiguous" : "not_separately_identified_unknown",
      fact: describe(short)
    },
    unresolved_reasons: reasons, review_flags: flags,
    other_concepts_discovered: discovered,
    rejected_facts: [...cur.rejected, ...non.rejected, ...short.rejected],
    production_write: false, rankings_changed: false
  };
}