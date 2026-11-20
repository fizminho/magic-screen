#!/usr/bin/env python3
"""Build a deterministic, review-only accounting exception queue from Worker preview JSON."""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path
from typing import Any


def candidate_confidence(status: str, count: Any) -> str:
    """Describe evidence uniqueness without implying accounting-policy approval."""
    if status in ("unique", "unique_candidate") and count == 1:
        return "unique_candidate"
    if status in ("ambiguous", "ambiguous_candidates") or (isinstance(count, int) and count > 1):
        return "ambiguous_candidates"
    if status in ("not_found", "not_identified"):
        return "no_candidate_identified"
    return "unresolved"


BALANCE_POLICY_STATUS = {
    "current_debt": "pending_conventional_debt_policy_and_EV_approval",
    "noncurrent_debt": "pending_conventional_debt_policy_and_EV_approval",
    "aggregate_debt": "pending_aggregate_debt_policy_and_reconciliation",
    "unrestricted_cash": "pending_cash_scope_and_EV_approval",
    "restricted_cash": "excluded_pending_restricted_cash_policy",
    "short_term_investments": "excluded_pending_liquidity_and_cash_equivalent_policy",
    "current_lease_liabilities": "excluded_pending_lease_policy",
    "noncurrent_lease_liabilities": "excluded_pending_lease_policy",
}


def classify(row: dict[str, Any]) -> dict[str, Any]:
    symbol = str(row.get("symbol") or "UNKNOWN")
    flags = [str(x) for x in row.get("review_flags", [])]
    ebit = str(row.get("ebit_status") or "not_resolved")
    invested = str(row.get("invested_capital_status") or "not_resolved")
    ev = row.get("enterprise_value_candidate_review") or {}
    debt = str(ev.get("conventional_debt_status") or "not_resolved")
    cash = ev.get("unrestricted_cash_candidate")
    provider = str(row.get("provider_status") or "awaiting_evidence")
    issues: list[str] = []

    if provider == "unsupported_provider" or row.get("overall_status") == "unsupported_provider":
        tier = "P3"
        issues.append("provider_unsupported_no_fallback")
    elif row.get("overall_status") == "awaiting_evidence" or provider == "awaiting_evidence":
        tier = "P1"
        issues.append("awaiting_filing_evidence")
    else:
        if ebit != "direct_reported_candidate_review_only":
            issues.append("direct_ebit_unresolved_or_ambiguous")
        else:
            issues.append("direct_ebit_candidate_requires_accounting_approval")
        if invested != "positive_denominator_candidate_review_only":
            issues.append("invested_capital_unresolved_or_nonpositive")
        else:
            issues.append("invested_capital_candidate_requires_scope_approval")
        if debt != "identified_from_unique_current_and_noncurrent_components":
            issues.append("conventional_debt_not_uniquely_resolved")
        if cash is None:
            issues.append("unrestricted_cash_not_uniquely_resolved")
        if ebit != "direct_reported_candidate_review_only" or invested != "positive_denominator_candidate_review_only":
            tier = "P1"
        elif debt != "identified_from_unique_current_and_noncurrent_components" or cash is None:
            tier = "P2"
        else:
            tier = "P3"

    if flags:
        issues.extend("flag:" + flag for flag in flags)
    balance = row.get("balance_sheet_candidate_review") or {}
    category_summary: list[str] = []
    balance_assessments: dict[str, Any] = {}
    for name, detail in sorted(balance.items()):
        detail = detail or {}
        status = str(detail.get("status") or "not_found")
        count = detail.get("candidate_count", 0)
        confidence = candidate_confidence(status, count)
        balance_assessments[name] = {
            "candidate_status": status,
            "candidate_count": count,
            "classification_confidence": confidence,
            "policy_status": BALANCE_POLICY_STATUS.get(name, "pending_accounting_policy_review"),
            "production_approved": False,
        }
        if confidence not in ("unique_candidate", "no_candidate_identified"):
            category_summary.append(f"{name}={status}({count})")

    debt_instrument_evidence = {
        name: (balance.get(name) or {})
        for name in (
            "current_debt",
            "noncurrent_debt",
            "aggregate_debt",
        )
    }
    assessment = {
        "ebit": {
            "candidate_status": ebit,
            "classification_confidence": "unique_candidate" if ebit == "direct_reported_candidate_review_only" else "unresolved",
            "policy_status": "pending_operating_income_and_Magic_Formula_EBIT_approval",
            "production_approved": False,
        },
        "invested_capital": {
            "candidate_status": invested,
            "classification_confidence": "unique_positive_candidate" if invested == "positive_denominator_candidate_review_only" else "unresolved",
            "policy_status": "pending_invested_capital_scope_approval",
            "production_approved": False,
        },
        "balance_sheet": balance_assessments,
        "enterprise_value": {
            "candidate_status": ev.get("status") or "not_resolved",
            "debt_classification_status": debt,
            "approval_status": ev.get("approval_status") or "review_only_no_production_ev_or_earnings_yield",
            "production_approved": False,
        },
    }
    return {
        "symbol": symbol,
        "priority": tier,
        "provider_status": provider,
        "ebit_status": ebit,
        "invested_capital_status": invested,
        "debt_status": debt,
        "unrestricted_cash_candidate": cash,
        "candidate_roc": row.get("candidate_roc"),
        "reporting_currency": row.get("reporting_currency"),
        "issue_count": len(issues),
        "issues": issues,
        "balance_sheet_exceptions": category_summary,
        "debt_instrument_evidence": debt_instrument_evidence,
        "candidate_vs_policy_assessment": assessment,
        "production_write": False,
    }


DEBT_SCOPE_PATTERNS = (
    "debt", "borrow", "loan", "lease liabilit", "royalt", "sale lease-back",
    "sale leaseback", "financing", "note payable", "notes payable", "notes payables", "notespayable",
)


def extract_debt_scope_evidence(raw_company: dict[str, Any]) -> dict[str, Any]:
    """Collect filing-face liability rows that explain why debt is or is not resolved.

    This is evidence triage only. It does not infer zero from missing rows, add
    instruments, or promote leases/other financing obligations into conventional debt.
    """
    statement = ((raw_company.get("statements") or {}).get("balance_sheet") or {})
    fiscal_period = (
        (raw_company.get("balance_sheet_fact_review") or {}).get("fiscal_period")
        or (raw_company.get("filing") or {}).get("period_of_report")
    )
    rows = []
    for row in statement.get("rows", []):
        if row.get("abstract") or row.get("dimension") or row.get("is_breakdown"):
            continue
        parent = str(row.get("parent_concept") or "").lower()
        if "liabilit" not in parent:
            continue
        concept = str(row.get("concept") or "")
        label = str(row.get("label") or "")
        searchable = (concept + " " + label).lower()
        if not any(pattern in searchable for pattern in DEBT_SCOPE_PATTERNS):
            continue
        values = row.get("values") or {}
        amount = values.get(fiscal_period) if fiscal_period else None
        if amount is None:
            continue
        if "lease" in searchable and "liabilit" in searchable:
            classification = "lease_liability"
        elif any(word in searchable for word in ("royalt", "sale lease", "financing")):
            classification = "separate_financing_obligation"
        elif "otherlongtermdebtnoncurrent" in concept.lower() and "other long-term liabilities" in label.lower():
            classification = "other_financing_or_liability_review"
        elif any(word in searchable for word in ("debt", "borrow", "loan", "note payable", "line of credit")):
            classification = "conventional_debt_candidate"
        else:
            classification = "other_financing_or_liability_review"
        rows.append({
            "concept": concept,
            "label": label,
            "amount": amount,
            "fiscal_period": fiscal_period,
            "parent_concept": row.get("parent_concept"),
            "classification": classification,
            "explicit_zero": isinstance(amount, (int, float)) and amount == 0,
            "source": "selected_annual_filing_balance_sheet_face_row",
            "dimension": False,
            "production_approved": False,
        })
    rows.sort(key=lambda row: (row["classification"], row["concept"], row["label"]))
    counts = Counter(row["classification"] for row in rows)
    return {
        "status": "evidence_found" if rows else "no_matching_face_liability_rows",
        "fiscal_period": fiscal_period,
        "row_count": len(rows),
        "classification_counts": dict(counts),
        "rows": rows,
        "interpretation": "Absence of a matching row is not proof of no debt. Explicit zero is preserved only for the exact reported row. Lease and separate financing rows are not automatically added to conventional debt.",
        "production_approved": False,
    }



# Curated filing-note checks. These are attached only to the exact accession
# below; they are review evidence, never resolver inputs or approved debt values.
FILING_DEBT_NOTE_REVIEWS: dict[str, dict[str, Any]] = {
    "MNTN": {
        "accession": "0001891027-26-000019",
        "method": "convertible_note_settlement_and_revolver_zero_review",
        "observations": ["The 10-K states the convertible notes were fully settled at the May 23, 2025 IPO and had no outstanding balance at December 31, 2025.", "The December 31, 2025 revolving facility had zero borrowings and up to 49.4m available.", "The 0.6m short-term note payable at December 31, 2024 was settled in Q1 2025; the reporting-date balance was zero.", "One remaining partial-recourse promissory note is owed by an employee to the company and is not company borrowing."],
        "interpretation": "Issuer note evidence supports zero outstanding balance for the identified convertible notes, revolver and short-term holdback at FY2025 year-end; preserve each instrument-specific scope.",
        "limitations": ["Do not treat employee promissory notes receivable as company debt.", "Do not infer debt-free status beyond the reviewed instruments without complete note coverage."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1891027/000189102726000019/mntn-20251231.htm",
    },
    "SPRO": {
        "accession": "0001193125-26-126192",
        "method": "explicit_no_debt_and_lease_liability_scope_review",
        "observations": ["The 10-K states the company has no debt in its lease accounting policy discussion.", "The balance sheet separately reports current and noncurrent operating lease liabilities totaling 2.895m and other long-term liabilities of 91k.", "The contractual-obligations table identifies 3.112m of future operating lease payments, reconciled to 2.895m lease liabilities after imputed interest."],
        "interpretation": "Explicit no-debt statement supports no conventional borrowings at the reporting date; lease liabilities remain separately identified and other long-term liabilities are not automatically debt.",
        "limitations": ["Do not include operating lease liabilities in conventional debt without lease policy approval.", "Do not classify the 91k other long-term liability as debt without its own supporting evidence."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1701108/000119312526126192/spro-20251231.htm",
    },
    "BCRX": {
        "accession": "0001628280-26-012240",
        "method": "royalty_financing_note_review",
        "observations": [
            "Note 9 identifies royalty purchase proceeds as royalty financing obligations measured using the effective-interest method; FY2025 roll-forward ends at 465.688m.",
            "Note 10 says the Pharmakon term loan was paid off in full during 2025, consistent with the exact year-end secured-term-loan row of zero.",
        ],
        "interpretation": "Royalty financing is a separate financing liability for EV policy review, not automatically conventional borrowings.",
        "limitations": ["Do not merge royalty financing into conventional debt automatically.", "The zero term-loan row applies only to that instrument."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/882796/000162828026012240/bcrx-20251231.htm",
    },
    "PRDO": {
        "accession": "0001193125-26-059331",
        "method": "sale_leaseback_financing_note_review",
        "observations": ["The 56.992m sale lease-back financing balance arose from construction financing recategorized at lease commencement because the transaction failed sale-leaseback accounting; it is presented separately from ordinary lease liabilities."],
        "interpretation": "Keep as a separate financing-obligation category pending EV policy review.",
        "limitations": ["Do not classify as ordinary lease liability or automatically add to conventional debt."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1046568/000119312526149817/prdo-ars-april_2026.pdf",
    },
    "VXRT": {
        "accession": "0001437749-26-008023",
        "method": "future_royalty_financing_note_review",
        "observations": ["Note 6 describes cash received for specified future royalty rights; the remaining liability accretes imputed interest and is reduced as pass-through royalties are paid."],
        "interpretation": "Financing-related obligation, separate from conventional bank borrowing and lease liabilities.",
        "limitations": ["EV inclusion requires an explicit debt-like financing policy."],
        "source_url": "https://investors.vaxart.com/static-files/4f2a1a16-8cbd-4bc9-8bf3-8978df723980",
    },
    "SBC": {
        "accession": "0001193125-26-127557",
        "method": "bank_borrowings_maturity_reconciliation",
        "observations": ["Current and noncurrent bank and other borrowings total 42.833484m; Note 15 maturity schedule totals the same amount.", "Related-party notes payable are separately reported as zero in both maturity buckets."],
        "interpretation": "Strong evidence supporting distinct bank-borrowing maturity buckets; retain manual review pending additive-scope policy.",
        "limitations": ["Do not automatically sum distinct concepts or promote to approved EV debt."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1930313/000119312526127557/sbc-20251231.htm",
    },
    "SGHC": {
        "accession": "0001628280-26-025609",
        "method": "ifrs_borrowing_facility_maturity_review",
        "observations": ["The 20-F presents 17m interest-bearing borrowings as noncurrent; Note 24 identifies Waterview Facilities A and B maturing March 7, 2030, with combined carrying amount 17.3m.", "The same note lists other loans payable on demand with an unspecified facility amount."],
        "interpretation": "Noncurrent borrowing candidate is supported; current borrowing scope remains unresolved.",
        "limitations": ["Do not infer current debt is zero from the missing current face-statement row."],
        "source_url": "https://s205.q4cdn.com/195659402/files/doc_financials/2025/ar/Super-Group-SGHC-Limited-20-F-Annual-and-Transition-Report-foreign-private-issuer.pdf",
    },
    "ZVRA": {
        "accession": "0001434647-26-000011",
        "method": "term_loan_maturity_schedule_review",
        "observations": ["Debt note reconciles 63.608m principal less 1.680m unamortized discount, issuance costs and PIK interest to 61.928m long-term debt.", "Future principal schedule shows 63.608m due in 2029 and no scheduled principal in 2026-2028."],
        "interpretation": "Supports noncurrent classification of the reported carrying amount; current debt remains unresolved in the generic resolver.",
        "limitations": ["Do not convert the current bucket to zero without reviewing acceleration and on-demand provisions."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1434647/000143464726000011/zvra-20251231.htm",
    },
    "PXED": {
        "accession": "0001193125-26-445323",
        "method": "revolving_credit_facility_note_review",
        "observations": ["FY2026 10-K describes a 100m senior secured revolver maturing November 13, 2030 and explicitly reports no outstanding borrowings at August 31, 2026.", "A 28.4m letter of credit supports a sublease and reduces facility availability; it is not a drawn borrowing."],
        "interpretation": "Negative evidence applies to the named facility only.",
        "limitations": ["Do not treat the letter of credit as drawn debt or infer all debt categories are zero.", "Review restricted-cash release separately from unrestricted cash."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1600222/000119312526445323/pxed-20260831.htm",
    },
    "STRA": {
        "accession": "0001013934-26-000006",
        "method": "revolving_credit_facility_note_review",
        "observations": ["FY2025 10-K describes a 250m senior secured revolver and explicitly states no borrowings were outstanding at December 31, 2025."],
        "interpretation": "Negative evidence applies to the named revolver only; other debt categories remain subject to review.",
        "limitations": ["Do not set all conventional debt to zero based on this facility disclosure alone."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1013934/000101393426000006/stra-20251231.htm",
    },
    "FHTX": {
        "accession": "0001628280-26-016814",
        "method": "face_statement_and_off_balance_sheet_review",
        "observations": ["FY2025 balance sheet reports operating lease liabilities and other liabilities without a separately presented conventional-debt line; filing states no off-balance-sheet arrangements."],
        "interpretation": "Useful negative evidence, but insufficient to conclude the issuer has no conventional borrowing.",
        "limitations": ["Absence of a face-statement debt row is not proof of zero debt."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1822462/000162828026016814/fhtx-20251231.htm",
    },
    "NRIX": {
        "accession": "0001549595-26-000016",
        "method": "face_statement_review",
        "observations": ["FY2025 balance sheet reports operating lease liabilities and deferred revenue without a separately presented conventional-debt line."],
        "interpretation": "Face-statement observation only; conventional debt remains unknown pending complete note review.",
        "limitations": ["Absence of a face-statement debt row is not proof of zero debt."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1549595/000154959526000016/nrix-20251130.htm",
    },
}


FILING_DEBT_REVIEW_ACTIONS: dict[str, dict[str, Any]] = {
    "MNTN": {"evidence_scope": "identified_convertible_notes_revolver_and_short_term_holdback", "manual_review_questions": ["Confirm the exact reporting-date zero balances for the convertible notes, revolver and short-term holdback against the extracted facts.", "Keep employee promissory notes receivable outside company debt.", "Check for any other debt instruments not covered by these disclosures."], "prohibited_inferences": ["Do not classify employee promissory notes receivable as company borrowing.", "Do not generalize the named instrument balances to all possible financing arrangements without full note review."]},
    "SPRO": {"evidence_scope": "issuer_no_debt_statement_with_separately_reported_leases", "manual_review_questions": ["Confirm the no-debt statement applies to conventional borrowing at the reporting date.", "Keep 2.895m operating lease liabilities separate from conventional debt.", "Identify the nature of the 91k other long-term liability before any debt classification."], "prohibited_inferences": ["Do not include lease liabilities or the 91k other long-term liability as conventional debt without separate policy/evidence."]},
    "BCRX": {"evidence_scope": "instrument_specific_royalty_financing_and_repaid_term_loan", "manual_review_questions": ["Decide whether the outstanding royalty financing obligation is debt-like for EV.", "Confirm the repaid Pharmakon term loan is not counted at the FY2025 reporting date."], "prohibited_inferences": ["Do not treat the royalty obligation as an ordinary bank loan by default.", "Do not infer all other borrowing categories are zero from the repaid term loan."]},
    "PRDO": {"evidence_scope": "specific_failed_sale_leaseback_financing_arrangement", "manual_review_questions": ["Determine whether the construction financing balance should be included as debt-like financing in EV.", "Keep it distinct from ordinary lease liabilities until policy is approved."], "prohibited_inferences": ["Do not merge this balance into ordinary lease liabilities or conventional borrowings automatically."]},
    "VXRT": {"evidence_scope": "specific_future_royalty_financing_obligation", "manual_review_questions": ["Determine whether the accreting future-royalty obligation is debt-like for EV.", "Check the reporting-date carrying value and avoid double-counting royalty pass-throughs."], "prohibited_inferences": ["Do not treat the obligation as an ordinary bank loan or a lease liability."]},
    "SBC": {"evidence_scope": "current_and_noncurrent_bank_borrowings_with_maturity_reconciliation", "manual_review_questions": ["Verify current and noncurrent bank-borrowing components against the maturity schedule.", "Confirm related-party notes payable remain separate zero-valued instruments.", "Decide whether distinct bank-borrowing rows can be used as the issuer-specific conventional-debt candidate."], "prohibited_inferences": ["Do not add related-party notes payable to bank borrowings as if they were the same instrument.", "Do not promote the maturity reconciliation to production debt without reviewer approval."]},
    "SGHC": {"evidence_scope": "noncurrent_facilities_plus_unquantified_on_demand_loans", "manual_review_questions": ["Reconcile the noncurrent facility carrying value to the Waterview facility note.", "Quantify and classify other loans payable on demand, including current/noncurrent treatment."], "prohibited_inferences": ["Do not infer current debt is zero from the 17m noncurrent face-statement row."]},
    "ZVRA": {"evidence_scope": "term_loan_principal_and_future_maturity_schedule", "manual_review_questions": ["Reconcile principal, unamortized discount/issuance costs and balance-sheet carrying amount.", "Review acceleration and on-demand terms before concluding the current portion is zero."], "prohibited_inferences": ["Do not convert the absence of scheduled 2026-2028 principal into a zero current-debt classification."]},
    "PXED": {"evidence_scope": "named_revolver_undrawn_status_and_letter_of_credit", "manual_review_questions": ["Confirm whether any other conventional borrowing or financing arrangement exists.", "Keep the sublease letter of credit separate from drawn borrowings.", "Review release of cash collateral before using cash as unrestricted."], "prohibited_inferences": ["Do not infer company-wide zero debt from the undrawn revolver.", "Do not count the letter of credit as a drawn borrowing."]},
    "STRA": {"evidence_scope": "named_revolver_undrawn_status", "manual_review_questions": ["Confirm whether any other debt instruments exist outside the disclosed revolver.", "Review other financing and lease note disclosures before resolving enterprise value."], "prohibited_inferences": ["Do not infer company-wide zero debt from the undrawn revolver."]},
    "FHTX": {"evidence_scope": "face_statement_absence_and_off_balance_sheet_disclosure", "manual_review_questions": ["Review all debt, commitment, collaboration and financing notes for instruments not separately presented on the face balance sheet.", "Retain debt as unresolved unless complete note evidence supports a conclusion."], "prohibited_inferences": ["Do not infer zero debt solely because no separate conventional-debt face row is presented."]},
    "NRIX": {"evidence_scope": "face_statement_absence_only", "manual_review_questions": ["Review the complete annual filing notes for borrowings, credit facilities, financing arrangements and guarantees.", "Retain debt as unresolved until note-level coverage is complete."], "prohibited_inferences": ["Do not infer zero debt solely because no separate conventional-debt face row is presented."]},
}
def filing_debt_note_review(symbol: str, accession: str | None) -> dict[str, Any] | None:
    """Return curated note evidence only for the exact issuer and filing accession."""
    review = FILING_DEBT_NOTE_REVIEWS.get(symbol)
    if not review or not accession or review["accession"] != accession:
        return None
    return {
        **review,
        **FILING_DEBT_REVIEW_ACTIONS[symbol],
        "status": "review_only",
        "source": "curated_primary_annual_filing_note_review",
        "production_approved": False,
        "resolver_input": False,
        "debt_candidate_promoted": False
    }


def build_queue(
    report: dict[str, Any],
    raw_evidence: dict[str, Any] | None = None,
) -> dict[str, Any]:
    raw_by_symbol = {
        str(company.get("symbol")): company
        for company in (raw_evidence or {}).get("companies", [])
        if company.get("symbol")
    }
    rows = []
    raw_category_names = {
        "current_debt": "current_debt_candidates",
        "noncurrent_debt": "noncurrent_debt_candidates",
        "aggregate_debt": "aggregate_debt_candidates",
    }
    for resolution in report.get("resolutions", []):
        item = classify(resolution)
        raw_company = raw_by_symbol.get(item["symbol"])
        raw_accession = (
            (raw_company or {}).get("filing", {}).get("accession_number")
            or (raw_company or {}).get("filing", {}).get("accession_no")
        )
        # Only enrich when the extracted filing is exactly the same accession
        # as the Worker preview. This prevents mixing different filing periods.
        if raw_company and raw_accession and raw_accession == resolution.get("accession"):
            categories = (raw_company.get("balance_sheet_fact_review") or {}).get("categories", {})
            item["debt_instrument_evidence"] = {
                name: categories.get(raw_name, {
                    "status": "not_found",
                    "candidate_count": 0,
                    "resolution_hint": "no_candidate_identified",
                    "automatic_aggregation": False,
                    "candidates": [],
                })
                for name, raw_name in raw_category_names.items()
            }
            item["debt_instrument_evidence_source"] = "fresh_extraction_artifact_same_accession"
            item["debt_scope_evidence"] = extract_debt_scope_evidence(raw_company)
            item["debt_scope_evidence_source"] = "fresh_extraction_artifact_same_accession"
            item["filing_debt_note_review"] = filing_debt_note_review(item["symbol"], raw_accession)
            item["filing_debt_note_review_source"] = (
                "curated_primary_annual_filing_note_review_same_accession"
                if item["filing_debt_note_review"] else "not_available"
            )
            if item["filing_debt_note_review"]:
                item["issues"].append("filing_debt_note_review_available_manual_review")
                item["issue_count"] = len(item["issues"])
            invested_review = raw_company.get("invested_capital_review") or {}
            denominator_diagnostics = invested_review.get("denominator_diagnostics")
            item["invested_capital_denominator_diagnostics"] = denominator_diagnostics
            item["invested_capital_denominator_diagnostics_source"] = (
                "fresh_extraction_artifact_same_accession" if denominator_diagnostics else "not_available"
            )
            if (denominator_diagnostics or {}).get(
                "negative_working_capital_offsets_at_least_90pct_of_net_ppe"
            ):
                item["issues"].append("invested_capital_negative_working_capital_offset_high_risk_manual_review")
                item["priority"] = "P1"
                item["issue_count"] = len(item["issues"])
            reconciliation = raw_company.get("balance_sheet_reconciliation_review")
            item["balance_sheet_reconciliation_review"] = reconciliation
            item["balance_sheet_reconciliation_evidence_source"] = (
                "fresh_extraction_artifact_same_accession" if reconciliation else "not_available"
            )
            filing_review = raw_company.get("filing_specific_review")
            filing_review_accession = (filing_review or {}).get("filing_accession")
            if filing_review and filing_review_accession == raw_accession:
                item["filing_specific_ebit_review"] = filing_review
                item["filing_specific_ebit_review_source"] = "fresh_extraction_artifact_same_accession"
                if filing_review.get("status") == "review_only" and isinstance(
                    filing_review.get("ebit_candidate"), (int, float)
                ):
                    item["issues"].append("filing_specific_ebit_candidate_available_manual_review")
                    item["issue_count"] = len(item["issues"])
                item["candidate_vs_policy_assessment"]["filing_specific_ebit"] = {
                    "candidate_status": filing_review.get("status"),
                    "method": filing_review.get("method"),
                    "candidate_value": filing_review.get("ebit_candidate"),
                    "policy_status": "pending_filing_specific_manual_review_and_EBIT_policy_approval",
                    "production_approved": False,
                }
            else:
                item["filing_specific_ebit_review"] = None
                item["filing_specific_ebit_review_source"] = "not_available"
            reconciliation_status = str((reconciliation or {}).get("status") or "not_available")
            if reconciliation_status not in ("reconciled", "not_available"):
                item["issues"].append("balance_sheet_reconciliation_" + reconciliation_status)
                item["priority"] = "P1"
                item["issue_count"] = len(item["issues"])
        else:
            item["debt_instrument_evidence_source"] = "stored_resolver_preview"
            item["debt_scope_evidence"] = None
            item["debt_scope_evidence_source"] = "stored_resolver_preview"
            item["filing_debt_note_review"] = None
            item["filing_debt_note_review_source"] = "stored_resolver_preview"
            item["invested_capital_denominator_diagnostics"] = None
            item["invested_capital_denominator_diagnostics_source"] = "stored_resolver_preview"
            item["balance_sheet_reconciliation_review"] = None
            item["balance_sheet_reconciliation_evidence_source"] = "stored_resolver_preview"
            item["filing_specific_ebit_review"] = None
            item["filing_specific_ebit_review_source"] = "stored_resolver_preview"
        rows.append(item)
    order = {"P1": 0, "P2": 1, "P3": 2}
    rows.sort(key=lambda row: (order.get(row["priority"], 9), row["symbol"]))
    counts = Counter(row["priority"] for row in rows)
    return {
        "source": "Magic Screen EdgarTools deterministic resolver preview",
        "resolver": report.get("resolver"),
        "generated_from_preview": report.get("generated_at"),
        "production_fundamentals_changed": report.get("production_fundamentals_changed"),
        "rankings_changed": report.get("rankings_changed"),
        "production_write": False,
        "summary": {
            "total": len(rows),
            "priority_1": counts.get("P1", 0),
            "priority_2": counts.get("P2", 0),
            "priority_3": counts.get("P3", 0),
            "balance_sheet_reconciliation": dict(Counter(
                str((row.get("balance_sheet_reconciliation_review") or {}).get("status") or "not_available")
                for row in rows
            )),
            "debt_scope_evidence_companies": sum(1 for row in rows if row.get("debt_scope_evidence") and row["debt_scope_evidence"].get("row_count", 0)),
            "filing_debt_note_manual_reviews_available": sum(1 for row in rows if row.get("filing_debt_note_review")),
            "debt_scope_classification_rows": dict(Counter(
                classification
                for row in rows for evidence in ((row.get("debt_scope_evidence") or {}).get("rows") or [])
                for classification in [evidence["classification"]]
            )),
            "filing_specific_ebit_manual_review_available": sum(
                1 for row in rows if row.get("filing_specific_ebit_review")
                and isinstance(row["filing_specific_ebit_review"].get("ebit_candidate"), (int, float))
            ),
            "negative_working_capital_offset_high_risk": sum(
                1 for row in rows
                if (row.get("invested_capital_denominator_diagnostics") or {}).get(
                    "negative_working_capital_offsets_at_least_90pct_of_net_ppe"
                )
            ),
        },
        "items": rows,
        "guardrail": "Triage only. Candidate values and classifications remain unapproved; missing values are unknown, never zero.",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="edgartools-resolver-preview.json")
    parser.add_argument("--raw-evidence", default="edgartools-bakeoff.json")
    parser.add_argument("--json-output", default="accounting-review-queue.json")
    parser.add_argument("--csv-output", default="accounting-review-queue.csv")
    args = parser.parse_args()

    report = json.loads(Path(args.input).read_text(encoding="utf-8"))
    raw_evidence = None
    raw_path = Path(args.raw_evidence)
    if raw_path.exists():
        raw_evidence = json.loads(raw_path.read_text(encoding="utf-8"))
    if not isinstance(report.get("resolutions"), list):
        raise SystemExit("Resolver preview JSON must contain a resolutions array.")
    if report.get("production_fundamentals_changed") is not False or report.get("rankings_changed") is not False:
        raise SystemExit("Refusing to build queue: preview did not confirm production/ranking immutability.")

    queue = build_queue(report, raw_evidence)
    Path(args.json_output).write_text(json.dumps(queue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    fields = [
        "symbol", "priority", "provider_status", "ebit_status", "invested_capital_status",
        "debt_status", "unrestricted_cash_candidate", "candidate_roc", "reporting_currency",
        "issue_count", "issues", "balance_sheet_exceptions", "debt_instrument_evidence",
        "debt_instrument_evidence_source", "debt_scope_evidence", "debt_scope_evidence_source", "filing_debt_note_review", "filing_debt_note_review_source", "balance_sheet_reconciliation_review",
        "balance_sheet_reconciliation_evidence_source", "invested_capital_denominator_diagnostics",
        "invested_capital_denominator_diagnostics_source", "filing_specific_ebit_review",
        "filing_specific_ebit_review_source", "candidate_vs_policy_assessment", "production_write",
    ]
    with Path(args.csv_output).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for item in queue["items"]:
            row = dict(item)
            row["issues"] = " | ".join(item["issues"])
            row["balance_sheet_exceptions"] = " | ".join(item["balance_sheet_exceptions"])
            row["debt_instrument_evidence"] = json.dumps(item["debt_instrument_evidence"], separators=(",", ":"))
            row["debt_scope_evidence"] = json.dumps(item.get("debt_scope_evidence"), separators=(",", ":"))
            row["filing_debt_note_review"] = json.dumps(item.get("filing_debt_note_review"), separators=(",", ":"))
            row["balance_sheet_reconciliation_review"] = json.dumps(
                item.get("balance_sheet_reconciliation_review"), separators=(",", ":")
            )
            row["invested_capital_denominator_diagnostics"] = json.dumps(
                item.get("invested_capital_denominator_diagnostics"), separators=(",", ":")
            )
            row["filing_specific_ebit_review"] = json.dumps(
                item.get("filing_specific_ebit_review"), separators=(",", ":")
            )
            row["candidate_vs_policy_assessment"] = json.dumps(item["candidate_vs_policy_assessment"], separators=(",", ":"))
            writer.writerow(row)
    print("Accounting review queue:", json.dumps(queue["summary"], sort_keys=True))
    print("Review-only; production fundamentals and rankings were not changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
