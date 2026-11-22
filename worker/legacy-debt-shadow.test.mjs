import assert from "node:assert/strict";
import testCase from "node:test";
import { resolveLegacyDebtShadow } from "./legacy-debt-shadow.mjs";
import { readFileSync } from "node:fs";

const ACC = "0000000000-26-000001", END = "2025-12-31";
const M = 1e6;
function fact(val, extra = {}) { return { val, accn: ACC, end: END, filed: "2026-02-20", form: "10-K", ...extra }; }
function build(spec) {
  const out = { facts: { "us-gaap": {} } };
  for (const [tag, v] of Object.entries(spec)) {
    const list = Array.isArray(v) ? v : [v];
    out.facts["us-gaap"][tag] = { units: { USD: list.map(x => (x && typeof x === "object") ? x : fact(x)) } };
  }
  return out;
}
const run = spec => resolveLegacyDebtShadow(build(spec), END, ACC);

testCase("BMBL: current + noncurrent", () => {
  const r = run({ LongTermDebtCurrent: 5.750 * M, LongTermDebtNoncurrent: 582.715 * M });
  assert.equal(r.status, "candidate");
  assert.ok(Math.abs(r.candidate_conventional_debt - 588.465 * M) < 1);
  assert.equal(r.short_term_borrowing.status, "not_separately_identified_unknown");
  assert.equal(r.short_term_borrowing.separately_identified, false);
  assert.equal(r.components.current_long_term_debt.concept, "us-gaap:LongTermDebtCurrent");
  assert.equal(r.production_write, false); assert.equal(r.rankings_changed, false);
});
testCase("OTEX: current + noncurrent", () => {
  const r = run({ LongTermDebtCurrent: 35.850 * M, LongTermDebtNoncurrent: 5734.519 * M });
  assert.ok(Math.abs(r.candidate_conventional_debt - 5770.369 * M) < 1);
});
testCase("UPWK: explicit reported zero noncurrent is filing-supported", () => {
  const r = run({ LongTermDebtCurrent: 359.770 * M, LongTermDebtNoncurrent: 0 });
  assert.equal(r.candidate_conventional_debt, 359.770 * M);
  assert.equal(r.components.noncurrent_long_term_debt.reported, true);
  assert.equal(r.components.noncurrent_long_term_debt.value, 0);
});
testCase("UPWK-like: absent noncurrent is NOT zero", () => {
  const r = run({ LongTermDebtCurrent: 359.770 * M });
  assert.equal(r.candidate_conventional_debt, null);
  assert.equal(r.status, "unresolved_insufficient_inputs");
  assert.ok(r.unresolved_reasons.includes("missing_noncurrent_long_term_debt"));
});
testCase("BCRX control: royalty financing and finance leases stay separate", () => {
  const r = run({
    LongTermDebtCurrent: 0, LongTermDebtNoncurrent: 0,
    RoyaltyFinancingLiabilityCurrent: 38.455 * M, RoyaltyFinancingLiabilityNoncurrent: 427.233 * M,
    FinanceLeaseLiabilityCurrent: 1.312 * M, FinanceLeaseLiabilityNoncurrent: 1.441 * M
  });
  assert.equal(r.candidate_conventional_debt, 0);
  assert.equal(r.status, "candidate_scope_review_required");
  assert.ok(r.review_flags.includes("scope_review_required_royalty_financing"));
  assert.ok(r.review_flags.includes("separate_lease_evidence_not_included"));
  const royalty = r.other_concepts_discovered.filter(d => d.category === "royalty_financing");
  assert.equal(royalty.reduce((s, d) => s + d.value, 0), 465.688 * M);
  assert.ok(r.other_concepts_discovered.every(d => d.included_in_candidate === false));
});
testCase("IRWD-like: no recognised facts => insufficient evidence, not zero", () => {
  const r = run({ Revenues: 1 });
  assert.equal(r.status, "insufficient_evidence");
  assert.equal(r.candidate_conventional_debt, null);
  assert.ok(r.unresolved_reasons.includes("no_recognised_debt_evidence_not_proof_of_no_debt"));
});
testCase("IRWD-like: broader discovery surfaces unrecognised tags without using them", () => {
  const r = run({ NotesPayable: 100 * M });
  assert.equal(r.candidate_conventional_debt, null);
  assert.equal(r.status, "unresolved_insufficient_inputs");
  assert.equal(r.other_concepts_discovered[0].concept, "us-gaap:NotesPayable");
});
testCase("missing current component", () => {
  const r = run({ LongTermDebtNoncurrent: 10 });
  assert.equal(r.candidate_conventional_debt, null);
  assert.ok(r.unresolved_reasons.includes("missing_current_long_term_debt"));
});
testCase("short-term borrowings incremental only when aggregate proves it", () => {
  const ok = run({ LongTermDebtCurrent: 5, ShortTermBorrowings: 3, DebtCurrent: 8, LongTermDebtNoncurrent: 90 });
  assert.equal(ok.candidate_conventional_debt, 98);
  assert.equal(ok.calculation_method, "current_plus_short_term_plus_noncurrent_long_term_debt");
  assert.equal(ok.short_term_borrowing.separately_identified, true);
  const unproven = run({ LongTermDebtCurrent: 5, ShortTermBorrowings: 3, LongTermDebtNoncurrent: 90 });
  assert.equal(unproven.candidate_conventional_debt, null);
  assert.equal(unproven.status, "unresolved_ambiguous");
  assert.ok(unproven.unresolved_reasons.includes("short_term_borrowings_overlap_unproven"));
});
testCase("aggregate equal to current component is not double counted", () => {
  const r = run({ LongTermDebtCurrent: 5, DebtCurrent: 5, LongTermDebtNoncurrent: 90 });
  assert.equal(r.candidate_conventional_debt, 95);
});
testCase("aggregate conflicting with components stays unresolved", () => {
  const r = run({ LongTermDebtCurrent: 5, DebtCurrent: 50, LongTermDebtNoncurrent: 90 });
  assert.equal(r.candidate_conventional_debt, null);
  assert.ok(r.unresolved_reasons.includes("current_aggregate_conflicts_with_components"));
});
testCase("debt-and-lease aggregate is not used as conventional debt", () => {
  const r = run({ LongTermDebtCurrent: 5, LongTermDebtAndFinanceLeaseObligationsNoncurrent: 95 });
  assert.equal(r.candidate_conventional_debt, null);
  assert.ok(r.review_flags.includes("debt_and_lease_aggregate_present_not_used"));
});
testCase("mixed accession, period, unit and dimension facts are rejected", () => {
  const spec = build({ LongTermDebtCurrent: 5, LongTermDebtNoncurrent: 90 });
  const cur = spec.facts["us-gaap"].LongTermDebtCurrent.units;
  cur.USD.push(fact(999, { accn: "other" }), fact(998, { end: "2024-12-31" }),
    fact(997, { segment: { member: "X" } }), fact(996, { start: "2025-01-01" }));
  cur.EUR = [fact(995)];
  const r = resolveLegacyDebtShadow(spec, END, ACC);
  assert.equal(r.candidate_conventional_debt, 95);
  const reasons = r.rejected_facts.map(x => x.reason).sort();
  assert.deepEqual(reasons, ["dimensional_fact", "non_usd_unit", "period_mismatch", "period_mismatch"]);
});
testCase("only non-USD fact => unresolved", () => {
  const spec = build({ LongTermDebtNoncurrent: 90 });
  spec.facts["us-gaap"].LongTermDebtCurrent = { units: { EUR: [fact(5)] } };
  const r = resolveLegacyDebtShadow(spec, END, ACC);
  assert.equal(r.candidate_conventional_debt, null);
  assert.equal(r.rejected_facts[0].reason, "non_usd_unit");
});
testCase("duplicate identical facts are fine; competing values are ambiguous", () => {
  const same = run({ LongTermDebtCurrent: [fact(5), fact(5, { filed: "2026-03-01" })], LongTermDebtNoncurrent: 90 });
  assert.equal(same.candidate_conventional_debt, 95);
  assert.equal(same.components.current_long_term_debt.filed, "2026-03-01");
  const diff = run({ LongTermDebtCurrent: [fact(5), fact(6, { filed: "2026-03-01" })], LongTermDebtNoncurrent: 90 });
  assert.equal(diff.candidate_conventional_debt, null);
  assert.equal(diff.status, "unresolved_ambiguous");
});
testCase("reported zero for both components stays zero, absent stays unknown", () => {
  assert.equal(run({ LongTermDebtCurrent: 0, LongTermDebtNoncurrent: 0 }).candidate_conventional_debt, 0);
  assert.equal(run({ LongTermDebtCurrent: 0 }).candidate_conventional_debt, null);
});
testCase("LongTermDebt total mismatch is flagged, not blocking", () => {
  const r = run({ LongTermDebtCurrent: 5, LongTermDebtNoncurrent: 90, LongTermDebt: 100 });
  assert.equal(r.candidate_conventional_debt, 95);
  assert.ok(r.review_flags.includes("long_term_debt_total_differs_from_candidate"));
});
testCase("endpoint is authenticated, shadow-only and never writes", () => {
  const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const start = src.indexOf('"/api/fundamentals/legacy-debt-shadow-preview"');
  assert.ok(start > 0);
  const end = src.indexOf('"/api/fundamentals/legacy-debt-diagnostic"', start);
  assert.ok(end > start);
  const block = src.slice(start, end);
  assert.match(block, /UNIVERSE_SYNC_TOKEN/);
  assert.match(block, /Unauthorized[\s\S]*401|401/);
  assert.match(block, /production_write:false/);
  assert.match(block, /rankings_changed:false/);
  assert.doesNotMatch(block, /INSERT|UPDATE|DELETE|REPLACE|\.run\(|\.batch\(/i);
  assert.doesNotMatch(block, /stock_fundamentals\s*\(|ranking_snapshot/i);
});
testCase("issuer-specific taxonomy royalty facts are discovered and remain outside conventional debt", () => {
  const facts = build({ LongTermDebtCurrent: 0, LongTermDebtNoncurrent: 0 });
  facts.facts["bcrx-custom"] = {
    RoyaltyFinancingLiabilityCurrent: { units: { USD: [fact(38.455 * M)] } },
    RoyaltyFinancingLiabilityNoncurrent: { units: { USD: [fact(427.233 * M)] } }
  };
  const r = resolveLegacyDebtShadow(facts, END, ACC);
  const royalty = r.other_concepts_discovered.filter(x => x.category === "royalty_financing");
  assert.equal(royalty.length, 2);
  assert.equal(royalty.reduce((sum, x) => sum + x.value, 0), 465.688 * M);
  assert.ok(r.review_flags.includes("scope_review_required_royalty_financing"));
  assert.ok(royalty.every(x => x.included_in_candidate === false));
});

testCase("convertible debt is surfaced as a separate scope-review category", () => {
  const r = run({ ConvertibleDebtCurrent: 199.680 * M });
  assert.equal(r.candidate_conventional_debt, null);
  assert.equal(r.status, "unresolved_insufficient_inputs");
  assert.ok(r.other_concepts_discovered.some(x =>
    x.concept === "us-gaap:ConvertibleDebtCurrent" && x.category === "convertible_debt"));
  assert.ok(r.review_flags.includes("scope_review_required_convertible_debt"));
});


testCase("discovery classifies every debt-related category across issuer taxonomies", () => {
  const facts = build({ LongTermDebtCurrent: 0, LongTermDebtNoncurrent: 0 });
  facts.facts["issuer-custom"] = {
    RoyaltyFinancingLiability: { units: { USD: [fact(10)] } },
    FailedSaleLeasebackObligation: { units: { USD: [fact(20)] } },
    OperatingLeaseLiability: { units: { USD: [fact(30)] } },
    ConvertibleDebtCurrent: { units: { USD: [fact(40)] } },
    CreditFacilityOutstanding: { units: { USD: [fact(50)] } }
  };
  const r = resolveLegacyDebtShadow(facts, END, ACC);
  const categories = new Map(r.other_concepts_discovered.map(x => [x.concept.split(":")[1], x.category]));
  assert.equal(categories.get("RoyaltyFinancingLiability"), "royalty_financing");
  assert.equal(categories.get("FailedSaleLeasebackObligation"), "other_financing");
  assert.equal(categories.get("OperatingLeaseLiability"), "lease");
  assert.equal(categories.get("ConvertibleDebtCurrent"), "convertible_debt");
  assert.equal(categories.get("CreditFacilityOutstanding"), "other_debt_related");
  assert.ok(r.review_flags.includes("scope_review_required_royalty_financing"));
  assert.ok(r.review_flags.includes("scope_review_required_other_financing"));
  assert.ok(r.review_flags.includes("separate_lease_evidence_not_included"));
  assert.ok(r.review_flags.includes("scope_review_required_convertible_debt"));
  assert.ok(r.other_concepts_discovered.every(x => x.included_in_candidate === false));
});

testCase("discovery rejects mismatched accession, period and dimensional facts", () => {
  const facts = build({ LongTermDebtCurrent: 0, LongTermDebtNoncurrent: 0 });
  facts.facts["issuer-custom"] = {
    RoyaltyFinancingLiability: { units: { USD: [
      fact(10),
      fact(11, { accn: "different-accession" }),
      fact(12, { end: "2024-12-31" }),
      fact(13, { segment: { member: "Domestic" } })
    ] } }
  };
  const r = resolveLegacyDebtShadow(facts, END, ACC);
  assert.equal(r.other_concepts_discovered.length, 1);
  assert.equal(r.other_concepts_discovered[0].value, 10);
  assert.equal(r.other_concepts_discovered[0].concept, "issuer-custom:RoyaltyFinancingLiability");
});

testCase("discovery cap is deterministic and bounded", () => {
  const facts = build({ LongTermDebtCurrent: 0, LongTermDebtNoncurrent: 0 });
  const custom = {};
  for (let i = 0; i < 125; i++) {
    const tag = `CustomDebtObligation${String(i).padStart(3, "0")}`;
    custom[tag] = { units: { USD: [fact(i + 1)] } };
  }
  facts.facts["issuer-custom"] = custom;
  const r = resolveLegacyDebtShadow(facts, END, ACC);
  assert.equal(r.other_concepts_discovered.length, 120);
  assert.equal(r.other_concepts_discovered[0].concept, "issuer-custom:CustomDebtObligation000");
  assert.equal(r.other_concepts_discovered.at(-1).concept, "issuer-custom:CustomDebtObligation119");
  assert.ok(!r.other_concepts_discovered.some(x => x.concept.endsWith("CustomDebtObligation120")));
});
