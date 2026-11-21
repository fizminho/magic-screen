import test from "node:test";
import assert from "node:assert/strict";
import { listGeminiAccountingEscalations } from "./gemini-accounting-review.mjs";

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

test("recognizes NCI escalation in the real EdgarTools underscore-based evidence shape", () => {
  const company = {
    balance_sheet_fact_review: {
      categories: {
        current_debt_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [{ concept: "us-gaap_LongTermDebtCurrent", label: "Current portion of long-term debt", value: 5900000 }] },
        noncurrent_debt_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [{ concept: "us-gaap_LongTermDebtNoncurrent", label: "Long-term debt, net of current portion", value: 1318100000 }] },
        aggregate_debt_candidates: { status: "not_found", candidate_count: 0, candidates: [] },
        cash_unrestricted_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [{ concept: "us-gaap_CashAndCashEquivalentsAtCarryingValue", label: "Cash and cash equivalents", value: 175900000 }] },
        cash_restricted_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [{ concept: "us-gaap_RestrictedCashNoncurrent", label: "Restricted cash, non-current", value: 9800000 }] },
        short_term_investment_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [{ concept: "us-gaap_ShortTermInvestments", label: "Short-term investments", value: 4000000 }] },
        current_lease_liability_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [{ concept: "us-gaap_OperatingLeaseLiabilityCurrent", label: "Current portion of operating lease liabilities", value: 6000000 }] },
        noncurrent_lease_liability_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [{ concept: "us-gaap_OperatingLeaseLiabilityNoncurrent", label: "Operating lease liabilities, net of current portion", value: 239200000 }] }
      },
      unresolved_categories: [
        "cash_combined_or_investment_candidates",
        "nondebt_financing_obligation_candidates",
        "noncontrolling_interest_candidates",
        "aggregate_debt_candidates"
      ]
    },
    enterprise_value_scope_review: {
      selection_policy_review: {
        noncontrolling_interest: { treatment: "excluded_from_base_bridge_pending_consolidated_ebit_alignment_review", candidate_count: 0 },
        separate_financing_obligations: { treatment: "excluded_from_conventional_debt_bridge_pending_instrument_review", candidate_count: 0 }
      },
      review_flags: [
        "lease_liabilities_separate_from_conventional_debt_require_policy_decision",
        "restricted_cash_or_short_term_investments_require_cash_scope_review"
      ]
    }
  };
  const resolver = {
    symbol: "GTM",
    accession: "0001794515-26-000012",
    fiscal_period: "2025-12-31",
    review_flags: [
      "right_of_use_assets_present_review_invested_capital_scope",
      "lease_liabilities_present_review_debt_and_invested_capital_treatment",
      "restricted_cash_or_combined_cash_present_review_enterprise_value_cash_input",
      "balance_sheet:nondebt_financing_obligation_candidates",
      "balance_sheet:noncontrolling_interest_candidates",
      "balance_sheet:aggregate_debt_candidates"
    ],
    enterprise_value_candidate_review: {
      conventional_debt_status: "identified_from_unique_current_and_noncurrent_components",
      debt_reconciliation_status: "insufficient_unique_inputs"
    }
  };
  const tasks = listGeminiAccountingEscalations("GTM", company, resolver).map(item => item.task);
  assert.deepEqual(tasks.sort(), ["cash_scope", "debt_scope", "financing_scope", "lease_scope", "nci_scope"].sort());
});


test("supplies only exact evidence IDs and rejects invalid Gemini finding fields precisely", async () => {
  const { validateGeminiAccountingResponse } = await import("./gemini-accounting-review.mjs");
  const evidence = { categories: { current_debt: { candidates: [{ evidence_id: "current_debt:0", source_kind: "filing_fact_candidate" }] } } };
  const base = { task: "debt_scope", status: "REVIEW_REQUIRED", summary: "Review required.", findings: [
    { evidence_id: "current_debt:0", evidence_ids: ["current_debt:0"], classification: "conventional_debt", rationale: "Reported borrowing.", confidence: "medium" }
  ], unresolved_questions: [] };
  assert.equal(validateGeminiAccountingResponse(base, "debt_scope", evidence).findings.length, 1);
  assert.throws(() => validateGeminiAccountingResponse({ ...base, findings: [{ ...base.findings[0], evidence_id: "current_debt_candidate_0" }] }, "debt_scope", evidence), /evidence_id is missing or not in the supplied evidence allowlist/);
  assert.throws(() => validateGeminiAccountingResponse({ ...base, findings: [{ ...base.findings[0], classification: "debt" }] }, "debt_scope", evidence), /classification is missing or not in the allowed classification list/);
  assert.throws(() => validateGeminiAccountingResponse({ ...base, findings: [{ ...base.findings[0], confidence: "certain" }] }, "debt_scope", evidence), /confidence must be low, medium, or high/);
});


test("only filing-fact candidate IDs are eligible for Gemini findings", async () => {
  const { validateGeminiAccountingResponse } = await import("./gemini-accounting-review.mjs");
  const evidence = {
    categories: { current_debt: { candidates: [
      { evidence_id: "current_debt:0", source_kind: "filing_fact_candidate" }
    ] } },
    structured_review_evidence: [
      { evidence_id: "ev:conventional_gross_debt_candidate", source_kind: "resolver_summary" },
      { evidence_id: "ev:lease_liabilities", source_kind: "resolver_summary" }
    ]
  };
  const base = { task: "debt_scope", status: "REVIEW_REQUIRED", summary: "Review required.", findings: [
    { evidence_id: "current_debt:0", evidence_ids: ["current_debt:0"], classification: "conventional_debt", rationale: "Reported current borrowing.", confidence: "high" }
  ], unresolved_questions: [] };
  assert.equal(validateGeminiAccountingResponse(base, "debt_scope", evidence).findings.length, 1);
  for (const evidence_id of ["ev:conventional_gross_debt_candidate", "ev:lease_liabilities"]) {
    assert.throws(() => validateGeminiAccountingResponse({ ...base, findings: [{ ...base.findings[0], evidence_id }] }, "debt_scope", evidence), /evidence_id is missing or not in the supplied evidence allowlist/);
  }
});


test("supplies raw NCI and separate financing obligation filing candidates to their tasks", () => {
  const company = { balance_sheet_fact_review: { categories: {
    noncontrolling_interest_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [
      { concept: "us-gaap_NoncontrollingInterestInConsolidatedEntity", label: "Noncontrolling interest in consolidated entity", value: 12000000 }
    ] },
    nondebt_financing_obligation_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [
      { concept: "issuer_SaleLeaseBackFinancingLiability", label: "Sale leaseback financing liability", value: 56000000 }
    ] }
  }, unresolved_categories: ["noncontrolling_interest_candidates", "nondebt_financing_obligation_candidates"] } };
  const resolver = { symbol: "ABC", accession: "a", fiscal_period: "2025-12-31", review_flags: [
    "noncontrolling_interest_candidates", "nondebt_financing_obligation_candidates"
  ] };
  const tasks = listGeminiAccountingEscalations("ABC", company, resolver);
  const nci = tasks.find(item => item.task === "nci_scope");
  const financing = tasks.find(item => item.task === "financing_scope");
  assert.equal(nci?.evidence_count, 1);
  assert.equal(financing?.evidence_count, 1);
});


test("uses bounded filing-note evidence for NCI and financing task escalation", () => {
  const company = { filing_note_review: { candidates: [
    { note_id: "note:0", title: "Debt and financing", topics: ["financing_scope"], excerpt: "Supplier finance arrangements are disclosed." },
    { note_id: "note:1", title: "Equity", topics: ["nci_scope"], excerpt: "Noncontrolling interest in consolidated subsidiaries." }
  ] } };
  const resolver = { symbol: "ABC", accession: "a", fiscal_period: "2025-12-31", review_flags: [] };
  const tasks = listGeminiAccountingEscalations("ABC", company, resolver);
  assert.equal(tasks.find(item => item.task === "financing_scope")?.evidence_count, 1);
  assert.equal(tasks.find(item => item.task === "nci_scope")?.evidence_count, 1);
});

test("allows exact filing-note evidence IDs but still rejects resolver summaries", async () => {
  const { validateGeminiAccountingResponse } = await import("./gemini-accounting-review.mjs");
  const evidence = {
    filing_note_candidates: [{ evidence_id: "filing_note:0", source_kind: "filing_note_candidate" }],
    structured_review_evidence: [{ evidence_id: "ev:lease_liabilities", source_kind: "resolver_summary" }]
  };
  const base = { task: "lease_scope", status: "REVIEW_REQUIRED", summary: "Review required.", findings: [
    { evidence_id: "filing_note:0", evidence_ids: ["filing_note:0"], classification: "lease_liability", rationale: "The note describes lease obligations.", confidence: "medium" }
  ], unresolved_questions: [] };
  assert.equal(validateGeminiAccountingResponse(base, "lease_scope", evidence).findings.length, 1);
  assert.throws(() => validateGeminiAccountingResponse({
    ...base, findings: [{ ...base.findings[0], evidence_id: "ev:lease_liabilities" }]
  }, "lease_scope", evidence), /evidence_id is missing or not in the supplied evidence allowlist/);
});

test("does not call Gemini when a task has no filing evidence", async () => {
  const { runGeminiAccountingReview } = await import("./gemini-accounting-review.mjs");
  const result = await runGeminiAccountingReview({ GEMINI_API_KEY: "test-key" }, {
    task: "nci_scope", symbol: "GTM", accession: "a",
    company: { balance_sheet_fact_review: { categories: {}, unresolved_categories: ["noncontrolling_interest_candidates"] } },
    resolver: { symbol: "GTM", accession: "a", fiscal_period: "2025-12-31", review_flags: ["noncontrolling_interest_candidates"] }
  });
  assert.equal(result.status, "NOT_APPLICABLE");
  assert.match(result.note, /Gemini was not called/);
});

test("groups duplicate financing classifications while preserving every evidence ID and reported amount", async () => {
  const { groupGeminiAccountingFindings } = await import("./gemini-accounting-review.mjs");
  const evidence = { categories: { obligations: { candidates: [
    { evidence_id: "financing:0", source_kind: "filing_fact_candidate", concept: "CurrentRoyaltyFinancing", label: "Current royalty financing", value: 38455000 },
    { evidence_id: "financing:1", source_kind: "filing_fact_candidate", concept: "NoncurrentRoyaltyFinancing", label: "Noncurrent royalty financing", value: 427233000 }
  ] } } };
  const grouped = groupGeminiAccountingFindings([
    { evidence_id: "financing:0", classification: "royalty_financing", rationale: "Current portion.", confidence: "high" },
    { evidence_id: "financing:1", classification: "royalty_financing", rationale: "Noncurrent portion.", confidence: "medium" }
  ], evidence);
  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0].evidence_ids, ["financing:0", "financing:1"]);
  assert.deepEqual(grouped[0].supporting_evidence.map(x => x.reported_value), [38455000, 427233000]);
  assert.equal(grouped[0].confidence, "medium");
});

test("uses distinct failed sale-leaseback and lease liability classifications", async () => {
  const { validateGeminiAccountingResponse } = await import("./gemini-accounting-review.mjs");
  const evidence = { filing_note_candidates: [{ evidence_id: "filing_note:1", source_kind: "filing_note_candidate" }] };
  const result = validateGeminiAccountingResponse({
    task: "financing_scope", status: "REVIEW_REQUIRED", summary: "Separate financing treatment requires review.",
    findings: [{ evidence_id: "filing_note:1", evidence_ids: ["filing_note:1"], classification: "failed_sale_leaseback_financing", rationale: "The note describes failed sale-leaseback financing.", confidence: "medium" }],
    unresolved_questions: []
  }, "financing_scope", evidence);
  assert.equal(result.findings[0].classification, "failed_sale_leaseback_financing");
});

test("Gemini transient retries use exponential backoff, jitter, and provider retry-after", async () => {
  const { getGeminiRetryDelayMs, parseGeminiRetryAfterMs, isGeminiQuotaExhaustion } = await import("./gemini-accounting-review.mjs");
  assert.equal(getGeminiRetryDelayMs(0, 0, 0.5), 1500);
  assert.equal(getGeminiRetryDelayMs(1, 5000, 0), 5000);
  assert.equal(parseGeminiRetryAfterMs("3"), 3000);
  assert.equal(parseGeminiRetryAfterMs(null, '{"error":{"details":[{"retryDelay":"12.5s"}]}}'), 12500);
  assert.equal(isGeminiQuotaExhaustion(429, "You exceeded your current quota"), true);
  assert.equal(isGeminiQuotaExhaustion(429, "Requests per minute limit reached"), false);
  assert.equal(isGeminiQuotaExhaustion(503, "quota exhausted"), false);
});

test("reserves a shared request slot in D1 and defaults to a conservative six requests per minute", async () => {
  const { waitForGeminiRequestSlot } = await import("./gemini-accounting-review.mjs");
  const statements = [];
  const env = { DB: { prepare(sql) {
    statements.push(sql);
    return { run: async () => ({}), bind(...args) {
      return { first: async () => ({ scheduled_at: Date.now() }), args };
    } };
  } } };
  const result = await waitForGeminiRequestSlot(env);
  assert.equal(result.interval_ms, 10000);
  assert.equal(result.delay_ms, 0);
  assert.match(statements[0], /CREATE TABLE IF NOT EXISTS gemini_api_request_gate/);
  assert.match(statements[1], /ON CONFLICT\(gate_key\) DO UPDATE/);
  assert.match(statements[1], /RETURNING next_allowed_at - \? AS scheduled_at/);
});


test("requires every filing evidence ID cited in rationale to be explicitly supported", async () => {
  const { validateGeminiAccountingResponse } = await import("./gemini-accounting-review.mjs");
  const evidence = { categories: { financing: { candidates: [
    { evidence_id: "nondebt_financing_obligation:0", source_kind: "filing_fact_candidate" }
  ] } }, filing_note_candidates: [
    { evidence_id: "filing_note:1", source_kind: "filing_note_candidate" }
  ] };
  const finding = { evidence_id: "nondebt_financing_obligation:0", evidence_ids: ["nondebt_financing_obligation:0"],
    classification: "failed_sale_leaseback_financing",
    rationale: "Filing note filing_note:1 confirms failed sale-leaseback treatment.", confidence: "high" };
  const base = { task: "financing_scope", status: "ACCEPTED_CANDIDATE", summary: "Supported.", findings: [finding], unresolved_questions: [] };
  assert.throws(() => validateGeminiAccountingResponse(base, "financing_scope", evidence), /every filing evidence ID cited in rationale/);
  const accepted = validateGeminiAccountingResponse({ ...base, findings: [{ ...finding,
    evidence_ids: ["nondebt_financing_obligation:0", "filing_note:1"] }] }, "financing_scope", evidence);
  assert.deepEqual(accepted.findings[0].evidence_ids, ["nondebt_financing_obligation:0", "filing_note:1"]);
});

test("grouping preserves all primary and supporting evidence IDs", async () => {
  const { groupGeminiAccountingFindings } = await import("./gemini-accounting-review.mjs");
  const evidence = { categories: { financing: { candidates: [
    { evidence_id: "fact:0", source_kind: "filing_fact_candidate", value: 56 }
  ] } }, filing_note_candidates: [
    { evidence_id: "filing_note:1", source_kind: "filing_note_candidate", excerpt: "Failed sale-leaseback." }
  ] };
  const grouped = groupGeminiAccountingFindings([{ evidence_id: "fact:0", evidence_ids: ["fact:0", "filing_note:1"],
    classification: "failed_sale_leaseback_financing", rationale: "Note filing_note:1 supports classification.", confidence: "high" }], evidence);
  assert.deepEqual(grouped[0].evidence_ids, ["fact:0", "filing_note:1"]);
  assert.deepEqual(grouped[0].supporting_evidence.map(item => item.evidence_id), ["fact:0", "filing_note:1"]);
});

test("cross-task reconciliation flags one evidence ID classified differently", async () => {
  const { reconcileGeminiCrossTaskFindings } = await import("./gemini-accounting-review.mjs");
  const conflicts = reconcileGeminiCrossTaskFindings([
    { evidence_id: "fact:0", evidence_ids: ["fact:0"], classification: "failed_sale_leaseback_financing" }
  ], [{ findings: [{ evidence_id: "fact:0", evidence_ids: ["fact:0"], classification: "lease_liability" }] }]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].evidence_id, "fact:0");
  assert.deepEqual(conflicts[0].prior_classifications, ["lease_liability"]);
  assert.deepEqual(reconcileGeminiCrossTaskFindings([
    { evidence_id: "fact:0", evidence_ids: ["fact:0"], classification: "failed_sale_leaseback_financing" }
  ], [{ findings: [{ evidence_id: "fact:0", evidence_ids: ["fact:0"], classification: "failed_sale_leaseback_financing" }] }]), []);
});


test("flags potential overlap between failed sale-leaseback financing and lease liabilities without assuming double count", async () => {
  const { reconcileGeminiLeaseFinancingOverlap } = await import("./gemini-accounting-review.mjs");
  const leaseReview = { findings: [
    { evidence_id: "current_lease_liabilities:0", evidence_ids: ["current_lease_liabilities:0", "noncurrent_lease_liabilities:0"], classification: "operating_lease_liability" },
    { evidence_id: "current_lease_liabilities:1", evidence_ids: ["current_lease_liabilities:1", "noncurrent_lease_liabilities:1"], classification: "finance_lease_liability" }
  ] };
  const financingReview = { findings: [
    { evidence_id: "nondebt_financing_obligation:0", evidence_ids: ["nondebt_financing_obligation:0", "filing_note:1"], classification: "failed_sale_leaseback_financing" }
  ] };
  const leaseSide = reconcileGeminiLeaseFinancingOverlap("lease_scope", leaseReview.findings, [financingReview]);
  assert.equal(leaseSide.requires_manual_reconciliation, true);
  assert.deepEqual(leaseSide.lease_evidence_ids, [
    "current_lease_liabilities:0", "noncurrent_lease_liabilities:0",
    "current_lease_liabilities:1", "noncurrent_lease_liabilities:1"
  ]);
  assert.deepEqual(leaseSide.failed_sale_leaseback_evidence_ids, ["nondebt_financing_obligation:0", "filing_note:1"]);
  const financingSide = reconcileGeminiLeaseFinancingOverlap("financing_scope", financingReview.findings, [leaseReview]);
  assert.equal(financingSide.requires_manual_reconciliation, true);
  assert.match(financingSide.note, /must not be added together/);
  assert.equal(reconcileGeminiLeaseFinancingOverlap("cash_scope", [], [leaseReview, financingReview]), null);
});


test("resolves lease and failed sale-leaseback overlap only with explicit note and separate balance-sheet presentation", async () => {
  const { reconcileGeminiLeaseFinancingOverlap } = await import("./gemini-accounting-review.mjs");
  const leaseReview = { findings: [
    { evidence_id: "current_lease_liabilities:0", evidence_ids: ["current_lease_liabilities:0", "noncurrent_lease_liabilities:0"], classification: "operating_lease_liability" },
    { evidence_id: "current_lease_liabilities:1", evidence_ids: ["current_lease_liabilities:1", "noncurrent_lease_liabilities:1"], classification: "finance_lease_liability" }
  ] };
  const financingReview = { findings: [
    { evidence_id: "nondebt_financing_obligation:0", evidence_ids: ["nondebt_financing_obligation:0", "filing_note:1"], classification: "failed_sale_leaseback_financing" }
  ] };
  const company = {
    balance_sheet_fact_review: { categories: {
      nondebt_financing_obligation_candidates: { candidates: [{ concept: "prdo_SaleLeaseBackFinancing", label: "Sale lease-back financing", value: 56992000, row_index: 52, parent_concept: "us-gaap_LiabilitiesNoncurrent" }] },
      current_lease_liability_candidates: { candidates: [{ concept: "us-gaap_OperatingLeaseLiabilityCurrent", label: "Lease liabilities - operating", value: 6032000, row_index: 39, parent_concept: "us-gaap_LiabilitiesCurrent" }] },
      noncurrent_lease_liability_candidates: { candidates: [{ concept: "us-gaap_OperatingLeaseLiabilityNoncurrent", label: "Lease liabilities - operating", value: 43752000, row_index: 50, parent_concept: "us-gaap_LiabilitiesNoncurrent" }] }
    }},
    filing_note_review: { lease_financing_reconciliation: {
      status: "financing_treatment_supported",
      matched_signals: ["failed_sale_leaseback_identified", "financing_obligation_recognized"],
      evidence_excerpt: "The failed sale-leaseback is a separate financing obligation."
    }}
  };
  const resolved = reconcileGeminiLeaseFinancingOverlap("lease_scope", leaseReview.findings, [financingReview], company);
  assert.equal(resolved.requires_manual_reconciliation, false);
  assert.equal(resolved.relationship, "separate_obligations_supported_by_filing");
  assert.equal(resolved.filing_reconciliation.separate_balance_sheet_line_item.value, 56992000);
  assert.equal(resolved.filing_reconciliation.separate_balance_sheet_line_item.row_index, 52);
  assert.equal(resolved.filing_reconciliation.ordinary_lease_balance_sheet_rows[0].row_index, 39);
  const unproven = reconcileGeminiLeaseFinancingOverlap("lease_scope", leaseReview.findings, [financingReview], {
    ...company, filing_note_review: { lease_financing_reconciliation: { status: "insufficient_evidence" } }
  });
  assert.equal(unproven.requires_manual_reconciliation, true);
  assert.equal(unproven.relationship, "unresolved");
  const duplicatedFaceRow = reconcileGeminiLeaseFinancingOverlap("lease_scope", leaseReview.findings, [financingReview], {
    ...company,
    balance_sheet_fact_review: { categories: {
      ...company.balance_sheet_fact_review.categories,
      current_lease_liability_candidates: { candidates: [{ concept: "us-gaap_OperatingLeaseLiabilityCurrent", label: "Lease liabilities - operating", value: 6032000, row_index: 52 }] }
    }}
  });
  assert.equal(duplicatedFaceRow.requires_manual_reconciliation, true);
  assert.equal(duplicatedFaceRow.relationship, "unresolved");
});


test("full scope escalation bundles EBIT and invested-capital ambiguity with existing accounting scopes", async () => {
  const { buildGeminiAccountingEvidence } = await import("./gemini-accounting-review.mjs");
  const company = {
    balance_sheet_fact_review: { categories: {
      current_debt_candidates: { status: "ambiguous", candidate_count: 2, candidates: [
        { concept: "NotesPayableCurrent", label: "Notes payable", value: 100, row_index: 10 }
      ] },
      current_assets_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [
        { concept: "AssetsCurrent", label: "Total current assets", value: 500, fiscal_period: "2025-12-31", row_index: 2 }
      ] },
      current_liabilities_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [
        { concept: "LiabilitiesCurrent", label: "Total current liabilities", value: 300, fiscal_period: "2025-12-31", row_index: 3 }
      ] },
      net_ppe_candidates: { status: "unique_candidate", candidate_count: 1, candidates: [
        { concept: "PropertyPlantAndEquipmentNet", label: "Property and equipment, net", value: 200, fiscal_period: "2025-12-31", row_index: 4 }
      ] },
      right_of_use_asset_candidates: { status: "identified", candidate_count: 1, candidates: [
        { concept: "OperatingLeaseRightOfUseAsset", label: "Operating lease right-of-use asset", value: 50, row_index: 5 }
      ] }
    }, unresolved_categories: ["current_debt_ambiguous"] },
    statements: { income_statement: { rows: [
      { index: 6, dimension: false, abstract: false, concept: "us-gaap_OperatingIncomeLoss", label: "Operating income", values: { "2025-12-31": 80 } },
      { index: 7, dimension: false, abstract: false, concept: "us-gaap_RestructuringCostsAndAssetImpairmentCharges", label: "Restructuring and impairment", values: { "2025-12-31": 5 } },
      { index: 8, dimension: true, abstract: false, concept: "us-gaap_OperatingIncomeLoss", label: "Segment operating income", values: { "2025-12-31": 20 } }
    ] } },
    direct_operating_income_review: { status: "ambiguous", candidate_review: { status: "ambiguous" } },
    invested_capital_review: { scope_flags: ["right_of_use_assets_require_invested_capital_scope_review"], scope_review: { right_of_use_asset_candidate_count: 1 } },
    filing_note_review: { candidates: [
      { title: "Note 8 - Debt", topics: ["debt_scope"], excerpt: "Supplier finance arrangements." },
      { title: "Note 12 - Operations", topics: ["ebit_scope"], excerpt: "Operating income includes restructuring costs." },
      { title: "Note 15 - Leases", topics: ["invested_capital_scope", "lease_scope"], excerpt: "Right-of-use assets and lease liabilities." }
    ] }
  };
  const resolver = { symbol: "ABC", accession: "a", fiscal_period: "2025-12-31", review_flags: [],
    ebit_status: "direct_reported_candidate_review_only", invested_capital_status: "positive_denominator_candidate_review_only",
    enterprise_value_candidate_review: { conventional_debt_status: "incomplete_or_ambiguous_debt_inputs" } };
  const escalations = listGeminiAccountingEscalations("ABC", company, resolver);
  assert.ok(escalations.some(item => item.task === "ebit_scope"));
  assert.ok(escalations.some(item => item.task === "invested_capital_scope"));
  assert.ok(escalations.some(item => item.task === "full_scope"));
  const evidence = buildGeminiAccountingEvidence("full_scope", company, resolver);
  assert.equal(evidence.income_statement_candidates.length, 2);
  assert.equal(evidence.income_statement_candidates[0].evidence_id, "income_statement:0");
  assert.equal(evidence.categories.current_assets.candidates[0].row_index, 2);
  assert.equal(evidence.filing_note_candidates.length, 3);
});

test("full scope reconciles lease and sale-leaseback findings in the same response", async () => {
  const { reconcileGeminiLeaseFinancingOverlap } = await import("./gemini-accounting-review.mjs");
  const findings = [
    { evidence_id: "current_lease_liabilities:0", evidence_ids: ["current_lease_liabilities:0"], classification: "operating_lease_liability" },
    { evidence_id: "nondebt_financing_obligation:0", evidence_ids: ["nondebt_financing_obligation:0"], classification: "failed_sale_leaseback_financing" }
  ];
  const company = {
    balance_sheet_fact_review: { categories: {
      nondebt_financing_obligation_candidates: { candidates: [{ label: "Sale lease-back financing", value: 56992000, row_index: 52 }] },
      current_lease_liability_candidates: { candidates: [{ label: "Operating lease liability current", value: 6032000, row_index: 39 }] },
      noncurrent_lease_liability_candidates: { candidates: [{ label: "Operating lease liability noncurrent", value: 43752000, row_index: 50 }] }
    }},
    filing_note_review: { lease_financing_reconciliation: { status: "financing_treatment_supported", matched_signals: ["failed_sale_leaseback_identified"] } }
  };
  const result = reconcileGeminiLeaseFinancingOverlap("full_scope", findings, [], company);
  assert.equal(result.requires_manual_reconciliation, false);
  assert.equal(result.relationship, "separate_obligations_supported_by_filing");
});
