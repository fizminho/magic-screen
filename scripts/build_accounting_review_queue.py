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


def next_review_actions(
    provider: str, ebit: str, invested: str, debt: str, cash: Any, flags: list[str],
) -> list[str]:
    """Return deterministic reviewer actions without promoting any accounting candidate."""
    if provider == "unsupported_provider":
        return ["Keep visible in coverage; do not infer missing filing values or invoke an unapproved fallback."]
    actions: list[str] = []
    if ebit != "direct_reported_candidate_review_only":
        actions.append("Locate the operating-income subtotal in the accession-matched annual filing; document any reconstruction bridge and cross-check it to pretax income.")
    else:
        actions.append("Confirm the selected operating-income concept is consolidated, non-dimensional, annual and consistent with the issuer statement presentation.")
    if invested != "positive_denominator_candidate_review_only":
        actions.append("Resolve current assets, current liabilities and net PP&E from the same fiscal period; keep non-positive or unresolved denominators unranked.")
    else:
        actions.append("Review working-capital composition, ROU/rental-equipment scope and denominator sensitivity before accepting invested capital.")
    if "negative_working_capital_offset_high_risk_manual_review" in flags:
        actions.append("Manually inspect the negative-working-capital offset; do not rely on an extreme ROC produced by a near-zero positive denominator.")
    if debt != "identified_from_unique_current_and_noncurrent_components":
        actions.append("Reconcile each borrowing instrument to current/noncurrent maturity buckets; distinguish explicit zero from unknown and avoid double-counting aggregate debt.")
    else:
        actions.append("Tie current and noncurrent borrowing candidates to filing-note carrying values and confirm no aggregate/component double count.")
    if cash is None:
        actions.append("Identify unrestricted cash and cash equivalents from the same annual filing; leave missing cash unknown, not zero.")
    else:
        actions.append("Confirm cash is unrestricted; keep restricted cash, customer escrow and marketable securities separate pending a uniform policy.")
    if any("noncontrolling_interest" in flag for flag in flags):
        actions.append("Quantify NCI and document whether the EV numerator/denominator treatment is consistent across the cohort.")
    if any("nondebt_financing_obligation" in flag for flag in flags):
        actions.append("Classify royalty, sale-leaseback or other financing obligations separately; do not silently fold them into conventional debt.")
    return list(dict.fromkeys(actions))

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

    def debt_bucket_gap(name: str) -> dict[str, Any]:
        detail = balance.get(name) or {}
        status = str(detail.get("status") or "not_found")
        count = detail.get("candidate_count", 0)
        if status in ("unique", "unique_candidate") and count == 1:
            disposition = "unique_candidate_review_only"
        elif status in ("ambiguous", "ambiguous_candidates") or (isinstance(count, int) and count > 1):
            disposition = "ambiguous_manual_review"
        else:
            disposition = "unknown_not_zero"
        return {
            "candidate_status": status,
            "candidate_count": count,
            "disposition": disposition,
            "production_approved": False,
        }

    debt_resolution_gap = {
        "current": debt_bucket_gap("current_debt"),
        "noncurrent": debt_bucket_gap("noncurrent_debt"),
        "aggregate": debt_bucket_gap("aggregate_debt"),
        "overall_status": debt,
        "interpretation": "A missing maturity bucket is unknown, not zero. Aggregate debt evidence is diagnostic and must not be added to maturity components.",
        "production_approved": False,
    }

    def cash_bucket_scope(name: str) -> dict[str, Any]:
        detail = balance.get(name) or {}
        status = str(detail.get("status") or "not_found")
        count = detail.get("candidate_count", 0)
        if status in ("unique", "unique_candidate") and count == 1:
            disposition = "unique_candidate_review_only"
        elif status in ("ambiguous", "ambiguous_candidates") or (isinstance(count, int) and count > 1):
            disposition = "ambiguous_manual_review"
        else:
            disposition = "unknown_not_zero"
        candidates = detail.get("candidates") or []
        values = [
            candidate.get("value", candidate.get("amount"))
            for candidate in candidates if isinstance(candidate, dict)
        ]
        explicit_zero = (
            disposition == "unique_candidate_review_only"
            and len(values) == 1
            and isinstance(values[0], (int, float))
            and values[0] == 0
        )
        return {
            "candidate_status": status,
            "candidate_count": count,
            "candidate_values": values,
            "disposition": disposition,
            "explicit_zero_for_this_line_only": explicit_zero,
            "production_approved": False,
        }

    cash_scope_resolution = {
        "unrestricted_cash": cash_bucket_scope("unrestricted_cash"),
        "restricted_cash": cash_bucket_scope("restricted_cash"),
        "short_term_investments": cash_bucket_scope("short_term_investments"),
        "candidate_cash_amount": cash,
        "interpretation": "Missing unrestricted cash is unknown, not zero. Restricted cash is not deducted from EV. Short-term or marketable investments remain separate until a uniform cash-like policy is approved.",
        "production_approved": False,
        "cash_candidate_promoted": False,
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
        "next_review_actions": next_review_actions(provider, ebit, invested, debt, cash, flags),
        "issue_count": len(issues),
        "issues": issues,
        "balance_sheet_exceptions": category_summary,
        "debt_instrument_evidence": debt_instrument_evidence,
        "debt_resolution_gap": debt_resolution_gap,
        "cash_scope_resolution": cash_scope_resolution,
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


EV_SCOPE_POLICY = {
    "conventional_debt": "candidate_gross_debt_pending_debt_measurement_policy",
    "restricted_cash": "exclude_from_unrestricted_cash_pending_policy",
    "unrestricted_cash": "candidate_cash_pending_availability_and_EV_policy",
    "marketable_debt_securities": "separate_liquidity_category_pending_cash_like_policy",
    "marketable_securities_unclassified": "composition_unknown_do_not_assume_debt_or_cash_equivalent",
    "marketable_equity_securities": "not_cash_equivalents_pending_explicit_policy",
    "equity_method_investments": "not_cash_equivalents_pending_explicit_policy",
    "notes_receivable": "not_cash_equivalents_pending_explicit_policy",
    "lease_liabilities": "separate_lease_category_pending_consistent_EBIT_policy",
    "noncontrolling_interests": "separate_EV_adjustment_pending_consolidated_EV_policy",
    "customer_escrow_assets_and_payables": "exclude_matched_customer_funds_from_company_cash_and_debt",
    "other_financing_obligations": "separate_financing_category_pending_debt_like_policy",
}


def extract_ev_scope_evidence(raw_company: dict[str, Any]) -> dict[str, Any]:
    """Classify selected annual balance-sheet face rows for EV policy review only."""
    statement = ((raw_company.get("statements") or {}).get("balance_sheet") or {})
    fiscal_period = (
        (raw_company.get("balance_sheet_fact_review") or {}).get("fiscal_period")
        or (raw_company.get("filing") or {}).get("period_of_report")
    )
    rows: list[dict[str, Any]] = []
    for row in statement.get("rows", []):
        if row.get("abstract") or row.get("dimension") or row.get("is_breakdown"):
            continue
        concept = str(row.get("concept") or "")
        label = str(row.get("label") or "")
        parent = str(row.get("parent_concept") or "")
        searchable = (concept + " " + label).lower()
        parent_lower = parent.lower()
        values = row.get("values") or {}
        amount = values.get(fiscal_period) if fiscal_period else None
        if amount is None:
            continue

        category = None
        is_asset = "asset" in parent_lower
        is_liability = "liabilit" in parent_lower
        concept_lower = concept.lower()
        label_lower = label.lower()
        is_explicit_nci = (
            "noncontrolling interest" in label_lower
            or "non-controlling interest" in label_lower
            or "minority interest" in label_lower
            or (
                "noncontrollinginterest" in concept_lower
                and "stockholdersequity" not in concept_lower
            )
            or concept_lower.endswith("_minorityinterest")
        )
        if is_explicit_nci:
            category = "noncontrolling_interests"
        elif "escrow" in searchable or ("customer funds" in searchable and ("payable" in searchable or is_asset)):
            category = "customer_escrow_assets_and_payables"
        elif is_liability and "lease" in searchable and ("liabilit" in searchable or "obligation" in searchable):
            category = "lease_liabilities"
        elif is_asset and "restricted" in searchable and "cash" in searchable:
            category = "restricted_cash"
        elif is_asset and "cash" in searchable:
            category = "unrestricted_cash"
        elif is_asset and any(x in searchable for x in ("equity method investment", "equity-method investment")):
            category = "equity_method_investments"
        elif is_asset and any(x in searchable for x in ("marketable equity", "equity securities")):
            category = "marketable_equity_securities"
        elif is_asset and any(x in searchable for x in ("marketable debt", "debt securities", "debtsecurities", "commercial paper", "treasury securities", "treasury bills", "fixed income securities")):
            category = "marketable_debt_securities"
        elif is_asset and "marketable securities" in searchable:
            category = "marketable_securities_unclassified"
        elif is_asset and any(x in searchable for x in ("notes receivable", "note receivable", "loans receivable")):
            category = "notes_receivable"
        elif is_liability and any(x in searchable for x in ("royalt", "sale lease-back", "sale leaseback", "financing obligation", "financing liabilities")):
            category = "other_financing_obligations"
        elif is_liability and any(x in searchable for x in ("debt", "borrow", "loan payable", "notes payable", "note payable", "line of credit", "commercial paper")):
            category = "conventional_debt"
        if category is None:
            continue
        rows.append({
            "concept": concept,
            "label": label,
            "parent_concept": parent,
            "amount": amount,
            "fiscal_period": fiscal_period,
            "category": category,
            "explicit_zero": isinstance(amount, (int, float)) and amount == 0,
            "policy_status": EV_SCOPE_POLICY[category],
            "source": "selected_annual_filing_balance_sheet_face_row",
            "accession": ((raw_company.get("filing") or {}).get("accession_number")
                          or (raw_company.get("filing") or {}).get("accession_no")),
            "dimension": False,
            "production_approved": False,
            "resolver_input": False,
        })
    rows.sort(key=lambda row: (row["category"], row["concept"], row["label"]))
    counts = Counter(row["category"] for row in rows)
    return {
        "status": "evidence_found" if rows else "no_matching_EV_scope_face_rows",
        "fiscal_period": fiscal_period,
        "row_count": len(rows),
        "category_counts": dict(counts),
        "rows": rows,
        "interpretation": "Face-row evidence only. Classification is a triage hint, not a cash/debt conclusion. Missing rows are unknown, explicit zero applies only to the exact reported row, and matched escrow/restricted cash are not unrestricted cash.",
        "production_approved": False,
        "resolver_input": False,
    }



# Accession-bound cash / investment scope reviews. These explain the nature and
# liquidity of selected investment balances; they are not cash-equivalent approvals.
FILING_EV_SCOPE_NOTE_REVIEWS: dict[str, dict[str, Any]] = {
    "SGHC": {
        "accession": "0001628280-26-025609",
        "method": "cash_availability_regulatory_segregation_and_customer_funds_review",
        "observations": [
            "FY2025 cash and cash equivalents total 513m: 45m cash-in-transit and 468m bank balances. Of bank balances, 129m of processor balances are held in wallets accessible on demand.",
            "The issuer separately reports 6m cash segregated for users under licensing regulations; keep this separate from corporate cash unless the statement presentation proves it is already included in the 513m total.",
            "The 468m bank-balance disclosure includes 19m in designated regulatory accounts, typically subject to minimum balances, and 12m earmarked for corporate social responsibility programs.",
            "The issuer says regulatory cash is available for corporate use but minimum balances typically must be maintained. CSR cash is earmarked for community programs."
        ],
        "interpretation": "The 513m cash-equivalent total is the reported face candidate, but its accessibility includes processor wallet balances, regulatory minimums and CSR earmarks. The separate 6m user-segregated cash must not be confused with unrestricted corporate cash.",
        "limitations": [
            "Do not add the separately disclosed 6m user-segregated cash to corporate cash.",
            "Do not automatically deduct the 19m regulatory or 12m CSR components from reported cash; assess availability and restrictions consistently across the universe.",
            "Do not assume processor balances are unavailable: the issuer says the 129m wallet balances are accessible on demand."
        ],
        "source_url": "https://s205.q4cdn.com/195659402/files/doc_financials/2025/ar/Super-Group-SGHC-Limited-20-F-Annual-and-Transition-Report-foreign-issuer.pdf",
    },
    "FHTX": {
        "accession": "0001628280-26-016814",
        "method": "available_for_sale_marketable_securities_composition_and_maturity_policy",
        "observations": [
            "FY2025 marketable securities were 78.018m: U.S. government agency securities 1.500m, commercial paper 35.287m and corporate notes and bonds 41.231m.",
            "The portfolio is available-for-sale and carried at fair value. The issuer says securities with maturities beyond one year may still be classified short-term because they are highly liquid and available for current operations.",
            "Cash equivalents use an original maturity of three months or less. Restricted cash is separately pledged as collateral for lease-related letters of credit."
        ],
        "interpretation": "The marketable securities are debt instruments with a stated current-operations purpose, but they remain separate from cash equivalents and require a common maturity/liquidity policy.",
        "limitations": ["Do not merge the 78.018m portfolio into cash equivalents solely because it is available for current operations.", "Keep restricted cash pledged for lease letters of credit outside unrestricted cash.", "Review instrument maturities and credit quality consistently across issuers."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1822462/000162828026016814/fhtx-20251231.htm",
    },
    "NRIX": {
        "accession": "0001549595-26-000016",
        "method": "available_for_sale_treasury_securities_and_money_market_cash_equivalents",
        "observations": [
            "At November 30, 2025, marketable securities were 345.981m and consisted of U.S. Treasury securities; the face XBRL concept is DebtSecuritiesAvailableForSaleExcludingAccruedInterestCurrent.",
            "The issuer separately reported 241.364m of money market funds in cash and cash equivalents.",
            "The issuer describes marketable securities as money market funds, U.S. Treasuries and U.S. government agency securities, classified as available-for-sale; contractual maturities greater than 12 months are classified long-term."
        ],
        "interpretation": "The 345.981m face-row balance is confirmed as U.S. Treasury debt securities, not equity securities. Its current classification and liquidity are useful evidence, but it is not automatically cash-equivalent.",
        "limitations": ["Do not combine the 345.981m marketable securities with the 241.364m cash-equivalent money market funds without an approved cash-like-asset rule.", "Do not treat the current classification alone as proof that every instrument meets a universal cash-equivalent maturity threshold."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1549595/000154959526000016/nrix-20251130.htm",
    },
    "PXED": {
        "accession": "0001193125-26-445323",
        "method": "marketable_debt_security_composition_maturity_and_deployability_review",
        "observations": [
            "FY2026 marketable securities were 167.852m: 137.094m current and 30.758m noncurrent. Cash and cash equivalents were 159.363m and restricted cash was 4.516m.",
            "The issuer invests excess cash in money market funds and marketable debt securities including U.S. Treasury and agency securities, commercial paper and corporate debt securities. Investments with original maturities greater than three months are classified as marketable securities.",
            "Current marketable securities have remaining contractual maturities of twelve months or less; noncurrent securities mature after twelve months. The portfolio maturities are within three years and securities are investment grade.",
            "The issuer states that its ability to deploy currently available liquidity is constrained by Department of Education financial-responsibility composite-score requirements."
        ],
        "interpretation": "The portfolio is identified as debt securities and is relatively liquid, but noncurrent maturities and regulatory deployability constraints mean the full 167.852m should not be assumed freely available cash.",
        "limitations": ["Do not net restricted cash against EV.", "Do not treat noncurrent securities as cash-like without a maturity rule.", "Consider the Department of Education composite-score constraint before treating the portfolio as freely deployable cash."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1600222/000119312526445323/pxed-20260831.htm",
    },
    "STRA": {
        "accession": "0001013934-26-000006",
        "method": "held_to_maturity_term_deposit_and_debt_security_maturity_review",
        "observations": [
            "FY2025 marketable securities totaled 12.297m: 7.297m due within one year and 5.000m due after one year through five years.",
            "The 2025 maturity table classifies the portfolio as held-to-maturity; it consists of term deposits, U.S. Treasury securities and corporate debt securities. No available-for-sale balance was reported for 2025.",
            "The issuer says investments are investment grade and reports no allowance for credit losses; it does not intend to sell the securities and does not expect to be required to sell them before recovery at maturity."
        ],
        "interpretation": "These are held-to-maturity investments rather than cash equivalents. The five-year maturity bucket and stated intent to hold make automatic cash-like treatment inappropriate.",
        "limitations": ["Do not treat held-to-maturity securities as unrestricted cash by default.", "Do not assume the noncurrent 5.000m balance is immediately deployable.", "Apply the same treatment to other held-to-maturity portfolios."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1013934/000101393426000006/stra-20251231.htm",
    },
    "ALEC": {
        "accession": "0001193125-26-071593",
        "method": "available_for_sale_portfolio_composition_and_contractual_maturity_review",
        "observations": [
            "FY2025 marketable securities were 190.222m; cash and cash equivalents were 65.802m and restricted cash was 1.846m.",
            "All marketable securities are available-for-sale and carried at fair value. The issuer considers the portfolio available for current operations and invests in money market funds, U.S. Treasury securities, corporate bonds, certificates of deposit and commercial paper.",
            "The combined cash-equivalent and marketable-securities maturity disclosure reports 214.4m due within one year and 41.0m due after one year through two years."
        ],
        "interpretation": "The portfolio has observable market prices and is available for current operations, but includes multiple debt instruments and maturities extending beyond one year. Keep it separate pending a universe-wide maturity and liquidity rule.",
        "limitations": ["Do not count restricted cash as unrestricted.", "Do not treat the entire 190.222m as cash equivalents merely because the portfolio is available for current operations.", "The combined maturity table includes cash equivalents; do not misattribute its entire amount to marketable securities."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1653087/000119312526071593/alec-20251231.htm",
    },
    "PLTK": {
        "accession": "0001828016-26-000010",
        "method": "short_term_term_deposit_and_commercial_paper_maturity_review",
        "observations": [
            "FY2025 short-term investments were 136.0m: term deposits 71.8m and commercial paper 64.2m.",
            "The issuer defines cash equivalents as highly liquid investments with maturities of three months or less. Short-term investments have maturities greater than three months and less than one year.",
            "The investment policy imposes maturity limits and restricts permitted investments to bank deposits and highly rated fixed-income securities."
        ],
        "interpretation": "The 136.0m portfolio is liquid, short-dated debt-like investment exposure but is explicitly outside cash equivalents under the issuer's own three-month definition.",
        "limitations": ["Do not reclassify the 136.0m as cash equivalents without an explicit MFI cash-like policy.", "Keep maturity thresholds consistent with the treatment of other issuers' term deposits and commercial paper."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1828016/000182801626000010/playtika-20251231.htm",
    },
    "ZVRA": {
        "accession": "0001434647-26-000011",
        "method": "available_for_sale_treasury_and_corporate_debt_security_maturity_review",
        "observations": [
            "FY2025 securities at fair value totaled 176.484m: 128.605m current and 47.879m noncurrent.",
            "The issuer says these available-for-sale investment securities primarily consist of U.S. Treasury securities and corporate bonds and are carried at fair value.",
            "The 128.605m current balance matures within one year; the 47.879m noncurrent balance matures in one to three years. The issuer says excess cash is being invested to fund future operations."
        ],
        "interpretation": "The portfolio is explicitly debt securities and supports future operating needs, but 47.879m has one-to-three-year maturities. Cash-like treatment requires an explicit maturity cutoff and consistent liquidity policy.",
        "limitations": ["Do not automatically deduct the full 176.484m from EV.", "Do not assume the one-to-three-year noncurrent tranche is cash-equivalent.", "Do not mix subsequent securities balances into the annual reporting-date snapshot."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1434647/000143464726000011/zvra-20251231.htm",
    },
    "UPWK": {
        "accession": "0001627475-26-000012",
        "method": "marketable_securities_composition_and_customer_funds_separation",
        "observations": [
            "FY2025 marketable securities were 378.425m, separately presented from 294.356m cash and cash equivalents.",
            "The issuer describes the portfolio as money-market funds, commercial paper, Treasury bills, corporate bonds and other fixed-income securities available for current operations.",
            "Restricted cash was 3.8m; customer funds held in escrow, including funds in transit, were 180.752m and matched by an escrow-funds-payable liability."
        ],
        "interpretation": "The portfolio contains cash-like and longer-duration fixed-income instruments, but the balance-sheet face row does not identify the exact composition and maturity mix. Keep it separate pending a uniform portfolio eligibility rule.",
        "limitations": ["Do not count restricted cash or matched customer escrow as company cash.", "Do not treat the full marketable-securities balance as cash-equivalent without instrument-level maturity and liquidity evidence.", "Keep the annual debt snapshot and any subsequent repayment data on a consistent point-in-time basis."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1627475/000162747526000012/upwk-20251231.htm",
    },
}



# Structured, issuer-specific cash-equivalent policy dimensions. These fields
# summarize cited annual filing evidence; they are not accounting approvals.
FILING_EV_CASH_POLICY_DIMENSIONS: dict[str, dict[str, Any]] = {
    "SGHC": {
        "instrument_types": ["cash_in_transit", "bank_balances", "processor_wallet_balances"],
        "issuer_cash_equivalent_definition": "Reported cash and cash equivalents; bank balances include processor wallets accessible on demand.",
        "maturity_profile": "Cash and on-demand balances; no separate marketable-securities maturity portfolio in this review.",
        "liquidity_evidence": "129m processor wallet balances are stated accessible on demand; 45m cash in transit and 468m bank balances.",
        "restriction_or_encumbrance": "19m designated regulatory accounts with minimum-balance expectations; 12m CSR earmarked; separate 6m user-segregated cash.",
        "provisional_mfi_treatment": "Keep reported 513m cash-equivalent face balance as the review candidate; separately assess regulatory and CSR availability; exclude user-segregated funds.",
        "unresolved_questions": ["Are regulatory minimums legally or operationally unavailable at the reporting date?", "Confirm whether separate 6m user cash is already excluded from 513m total."],
    },
    "FHTX": {
        "instrument_types": ["us_government_agency_securities", "commercial_paper", "corporate_notes_and_bonds"],
        "issuer_cash_equivalent_definition": "Cash equivalents use original maturities of three months or less.",
        "maturity_profile": "Marketable securities may have maturities beyond one year while remaining classified short-term due to liquidity and current-operations availability.",
        "liquidity_evidence": "Issuer describes the available-for-sale portfolio as highly liquid and available for current operations.",
        "restriction_or_encumbrance": "Restricted cash is separately pledged as collateral for lease-related letters of credit.",
        "provisional_mfi_treatment": "Keep 78.018m marketable securities separate from cash equivalents; exclude pledged restricted cash.",
        "unresolved_questions": ["Instrument-level contractual maturity and settlement timing for each security.", "Whether any balances are subject to sale, transfer or regulatory restrictions."],
    },
    "NRIX": {
        "instrument_types": ["us_treasury_securities", "money_market_funds"],
        "issuer_cash_equivalent_definition": "Money market funds are included in cash equivalents; Treasury portfolio is separately presented as available-for-sale marketable securities.",
        "maturity_profile": "345.981m Treasury securities; contractual maturities greater than 12 months are classified long-term.",
        "liquidity_evidence": "Treasury securities are marketable; 241.364m money market funds are separately included in cash and cash equivalents.",
        "restriction_or_encumbrance": "No specific encumbrance identified in this review; verify restrictions at the filing date.",
        "provisional_mfi_treatment": "Do not combine Treasury securities with cash equivalents until a uniform maturity and liquidity rule is approved.",
        "unresolved_questions": ["Security-by-security maturity and settlement data for the current tranche.", "Confirm absence of pledges or other restrictions."],
    },
    "PXED": {
        "instrument_types": ["us_treasury_securities", "us_agency_securities", "commercial_paper", "corporate_debt_securities"],
        "issuer_cash_equivalent_definition": "Investments with original maturities greater than three months are marketable securities rather than cash equivalents.",
        "maturity_profile": "137.094m current with remaining maturities up to 12 months; 30.758m noncurrent; portfolio maturities within three years.",
        "liquidity_evidence": "Investment grade, but issuer says deployability is constrained by Department of Education financial-responsibility composite-score requirements.",
        "restriction_or_encumbrance": "Regulatory financial-responsibility requirements constrain available liquidity; 4.516m restricted cash is separate.",
        "provisional_mfi_treatment": "Keep all 167.852m marketable securities separate; do not assume regulatory-constrained liquidity is freely deployable.",
        "unresolved_questions": ["Quantify which securities are available for general corporate use after regulatory constraints.", "Determine maturity and settlement profile by instrument."],
    },
    "STRA": {
        "instrument_types": ["term_deposits", "us_treasury_securities", "corporate_debt_securities"],
        "issuer_cash_equivalent_definition": "Portfolio is held-to-maturity, not reported as cash equivalents in this review.",
        "maturity_profile": "7.297m due within one year; 5.000m due after one year through five years.",
        "liquidity_evidence": "Investment grade, but issuer states it does not intend or expect to need to sell before maturity.",
        "restriction_or_encumbrance": "No specific pledge identified; held-to-maturity classification and intent limit assumptions about immediate deployment.",
        "provisional_mfi_treatment": "Keep the full 12.297m held-to-maturity portfolio separate from unrestricted cash.",
        "unresolved_questions": ["Confirm any early withdrawal or sale constraints on term deposits.", "Assess whether any portion meets a future uniform short-maturity cash-like rule."],
    },
    "ALEC": {
        "instrument_types": ["money_market_funds", "us_treasury_securities", "corporate_bonds", "certificates_of_deposit", "commercial_paper"],
        "issuer_cash_equivalent_definition": "Cash equivalents and marketable securities are separately presented; marketable securities are available-for-sale.",
        "maturity_profile": "Combined cash-equivalent and marketable-securities table includes 214.4m within one year and 41.0m from one to two years; do not attribute combined totals solely to marketable securities.",
        "liquidity_evidence": "Issuer describes the portfolio as available for current operations and carried at fair value.",
        "restriction_or_encumbrance": "1.846m restricted cash separately reported.",
        "provisional_mfi_treatment": "Keep 190.222m marketable securities separate; do not use combined maturity totals as if they describe only marketable securities.",
        "unresolved_questions": ["Obtain instrument-level maturity split excluding cash equivalents.", "Confirm any portfolio-specific restrictions."],
    },
    "PLTK": {
        "instrument_types": ["term_deposits", "commercial_paper"],
        "issuer_cash_equivalent_definition": "Cash equivalents are highly liquid investments with maturities of three months or less; short-term investments exceed three months and are less than one year.",
        "maturity_profile": "136.0m short-term investments: 71.8m term deposits and 64.2m commercial paper, with stated maturities greater than three months and less than one year.",
        "liquidity_evidence": "Investment policy imposes maturity limits and permits bank deposits and highly rated fixed-income securities.",
        "restriction_or_encumbrance": "No specific encumbrance identified in this review; verify security-level restrictions.",
        "provisional_mfi_treatment": "Keep the 136.0m portfolio separate from cash equivalents under the issuer's own three-month definition.",
        "unresolved_questions": ["Confirm instrument-level maturity dates and settlement access.", "Confirm whether any deposits are pledged or subject to withdrawal penalties."],
    },
    "ZVRA": {
        "instrument_types": ["us_treasury_securities", "corporate_bonds"],
        "issuer_cash_equivalent_definition": "Available-for-sale investment securities are separately presented from cash equivalents.",
        "maturity_profile": "128.605m current due within one year; 47.879m noncurrent due in one to three years.",
        "liquidity_evidence": "Securities are carried at fair value; issuer invests excess cash to fund future operations.",
        "restriction_or_encumbrance": "No specific pledge identified in this review; verify restrictions at the reporting date.",
        "provisional_mfi_treatment": "Keep all 176.484m separate; the one-to-three-year noncurrent tranche is not cash-like by default.",
        "unresolved_questions": ["Determine whether current securities satisfy a future uniform short-maturity rule.", "Confirm instrument-level settlement and encumbrance details."],
    },
    "UPWK": {
        "instrument_types": ["money_market_funds", "commercial_paper", "treasury_bills", "corporate_bonds", "other_fixed_income"],
        "issuer_cash_equivalent_definition": "Marketable securities are separately presented from cash and cash equivalents.",
        "maturity_profile": "Exact instrument-level maturity mix is not identified in this review; portfolio contains potentially short- and longer-duration instruments.",
        "liquidity_evidence": "Issuer describes securities as available for current operations, but face-row disclosure does not establish composition or maturity eligibility.",
        "restriction_or_encumbrance": "3.8m restricted cash; 180.752m customer escrow and funds in transit matched by escrow-funds-payable liability.",
        "provisional_mfi_treatment": "Keep 378.425m marketable securities separate from 294.356m cash and cash equivalents; exclude 3.8m restricted cash and 180.752m matched customer escrow.",
        "unresolved_questions": ["Obtain instrument-level composition, maturity and settlement data.", "Confirm whether any portfolio balances are pledged or otherwise restricted."],
    },
}


# Controlled tags make the free-text filing notes comparable across issuers.
# Security/cash portfolio details are issuer-note evidence, in USD millions.
# Amounts are populated only where the filing review disclosed them explicitly.
# A null amount is intentionally unknown; combined maturity schedules are labelled
# as such and must never be allocated to marketable securities alone.
FILING_EV_PORTFOLIO_COMPOSITION: dict[str, dict[str, Any]] = {
    "SGHC": {
        "portfolio_type": "cash_and_cash_equivalents",
        "reported_total_millions": 513.0,
        "components": [
            {"instrument_type": "cash_in_transit", "amount_millions": 45.0, "amount_status": "disclosed"},
            {"instrument_type": "bank_balances", "amount_millions": 468.0, "amount_status": "disclosed",
             "subcomponents": [
                 {"instrument_type": "processor_wallet_balances", "amount_millions": 129.0, "amount_status": "disclosed"},
                 {"instrument_type": "regulatory_designated_accounts", "amount_millions": 19.0, "amount_status": "disclosed"},
                 {"instrument_type": "csr_earmarked_balances", "amount_millions": 12.0, "amount_status": "disclosed"},
             ]},
        ],
        "separate_items": [{"instrument_type": "user_segregated_cash", "amount_millions": 6.0,
                            "amount_status": "disclosed", "included_in_reported_total": False}],
        "reconciliation_status": "top_level_components_reconcile; nested balances are subsets and must not be added again",
    },
    "FHTX": {
        "portfolio_type": "marketable_debt_securities",
        "reported_total_millions": 78.018,
        "components": [
            {"instrument_type": "us_government_agency_securities", "amount_millions": 1.500, "amount_status": "disclosed"},
            {"instrument_type": "commercial_paper", "amount_millions": 35.287, "amount_status": "disclosed"},
            {"instrument_type": "corporate_notes_and_bonds", "amount_millions": 41.231, "amount_status": "disclosed"},
        ],
        "reconciliation_status": "components_reconcile_to_reported_total",
    },
    "NRIX": {
        "portfolio_type": "marketable_debt_securities",
        "reported_total_millions": 345.981,
        "components": [{"instrument_type": "us_treasury_securities", "amount_millions": 345.981, "amount_status": "disclosed"}],
        "separate_items": [{"instrument_type": "money_market_funds_in_cash_equivalents", "amount_millions": 241.364,
                            "amount_status": "disclosed", "included_in_reported_total": False}],
        "maturity_buckets": [{"bucket": "current_face_classification", "amount_millions": 345.981, "scope": "marketable_securities_face_row"},
                             {"bucket": "over_12_months", "amount_millions": None, "scope": "issuer_policy_classifies_contractual_maturities_over_12_months_as_long_term"}],
        "reconciliation_status": "marketable_security_total_identified; security_level_maturity_split_not_disclosed",
    },
    "PXED": {
        "portfolio_type": "marketable_debt_securities",
        "reported_total_millions": 167.852,
        "components": [
            {"instrument_type": "us_treasury_securities", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
            {"instrument_type": "us_agency_securities", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
            {"instrument_type": "commercial_paper", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
            {"instrument_type": "corporate_debt_securities", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
        ],
        "maturity_buckets": [
            {"bucket": "within_12_months", "amount_millions": 137.094, "scope": "current_marketable_securities"},
            {"bucket": "over_12_months", "amount_millions": 30.758, "scope": "noncurrent_marketable_securities"},
        ],
        "reconciliation_status": "maturity_buckets_reconcile_to_reported_total; instrument_amounts_not_disclosed",
    },
    "STRA": {
        "portfolio_type": "held_to_maturity_debt_investments",
        "reported_total_millions": 12.297,
        "components": [
            {"instrument_type": "term_deposits", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
            {"instrument_type": "us_treasury_securities", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
            {"instrument_type": "corporate_debt_securities", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
        ],
        "maturity_buckets": [
            {"bucket": "within_12_months", "amount_millions": 7.297, "scope": "held_to_maturity_portfolio"},
            {"bucket": "1_to_5_years", "amount_millions": 5.000, "scope": "held_to_maturity_portfolio"},
        ],
        "reconciliation_status": "maturity_buckets_reconcile_to_reported_total; instrument_amounts_not_disclosed",
    },
    "ALEC": {
        "portfolio_type": "marketable_debt_securities",
        "reported_total_millions": 190.222,
        "components": [
            {"instrument_type": "money_market_funds", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
            {"instrument_type": "us_treasury_securities", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
            {"instrument_type": "corporate_bonds", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
            {"instrument_type": "certificates_of_deposit", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
            {"instrument_type": "commercial_paper", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
        ],
        "maturity_buckets": [
            {"bucket": "within_12_months", "amount_millions": 214.4, "scope": "combined_cash_equivalents_and_marketable_securities"},
            {"bucket": "1_to_2_years", "amount_millions": 41.0, "scope": "combined_cash_equivalents_and_marketable_securities"},
        ],
        "reconciliation_status": "combined_maturity_schedule_not_attributable_to_marketable_securities_alone",
    },
    "PLTK": {
        "portfolio_type": "short_term_debt_investments",
        "reported_total_millions": 136.0,
        "components": [
            {"instrument_type": "term_deposits", "amount_millions": 71.8, "amount_status": "disclosed"},
            {"instrument_type": "commercial_paper", "amount_millions": 64.2, "amount_status": "disclosed"},
        ],
        "reconciliation_status": "components_reconcile_to_reported_total",
    },
    "ZVRA": {
        "portfolio_type": "available_for_sale_debt_securities",
        "reported_total_millions": 176.484,
        "components": [
            {"instrument_type": "us_treasury_securities", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
            {"instrument_type": "corporate_bonds", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
        ],
        "maturity_buckets": [
            {"bucket": "within_12_months", "amount_millions": 128.605, "scope": "current_investment_securities"},
            {"bucket": "1_to_3_years", "amount_millions": 47.879, "scope": "noncurrent_investment_securities"},
        ],
        "reconciliation_status": "maturity_buckets_reconcile_to_reported_total; instrument_amounts_not_disclosed",
    },
    "UPWK": {
        "portfolio_type": "marketable_fixed_income_securities",
        "reported_total_millions": 378.425,
        "components": [
            {"instrument_type": "money_market_funds", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
            {"instrument_type": "commercial_paper", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
            {"instrument_type": "treasury_bills", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
            {"instrument_type": "corporate_bonds", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
            {"instrument_type": "other_fixed_income", "amount_millions": None, "amount_status": "not_disclosed_by_instrument"},
        ],
        "separate_items": [
            {"instrument_type": "cash_and_cash_equivalents", "amount_millions": 294.356, "amount_status": "disclosed", "included_in_reported_total": False},
            {"instrument_type": "restricted_cash", "amount_millions": 3.8, "amount_status": "disclosed", "included_in_reported_total": False},
            {"instrument_type": "customer_escrow_and_funds_in_transit", "amount_millions": 180.752, "amount_status": "disclosed", "included_in_reported_total": False},
        ],
        "reconciliation_status": "instrument_level_amounts_not_disclosed; separate_cash_restricted_and_customer_funds_not_part_of_marketable_total",
    },
}

FILING_EV_CASH_POLICY_TAGS: dict[str, dict[str, list[str]]] = {
    "SGHC": {
        "maturity_buckets": ["on_demand", "not_applicable_cash_balance"],
        "credit_quality": ["not_applicable_cash_balance"],
        "availability": ["on_demand_access", "regulatory_or_earmarked_balances_present"],
    },
    "FHTX": {
        "maturity_buckets": ["mixed_or_security_level_detail_required", "over_12_months_possible"],
        "credit_quality": ["mixed_or_not_fully_disclosed"],
        "availability": ["available_for_current_operations", "restricted_cash_separately_pledged"],
    },
    "NRIX": {
        "maturity_buckets": ["within_12_months", "over_12_months"],
        "credit_quality": ["us_government_obligations"],
        "availability": ["marketable_subject_to_settlement", "cash_equivalents_separately_reported"],
    },
    "PXED": {
        "maturity_buckets": ["within_12_months", "1_to_3_years"],
        "credit_quality": ["investment_grade"],
        "availability": ["regulatory_or_earmarked_balances_present", "restricted_cash_separately_reported"],
    },
    "STRA": {
        "maturity_buckets": ["within_12_months", "1_to_5_years"],
        "credit_quality": ["investment_grade"],
        "availability": ["held_to_maturity_no_intent_to_sell"],
    },
    "ALEC": {
        "maturity_buckets": ["within_12_months", "1_to_2_years", "combined_cash_and_investment_schedule"],
        "credit_quality": ["mixed_or_not_fully_disclosed"],
        "availability": ["available_for_current_operations", "restricted_cash_separately_reported"],
    },
    "PLTK": {
        "maturity_buckets": ["3_to_12_months"],
        "credit_quality": ["highly_rated_fixed_income_policy"],
        "availability": ["short_term_investments_separately_reported"],
    },
    "ZVRA": {
        "maturity_buckets": ["within_12_months", "1_to_3_years"],
        "credit_quality": ["mixed_or_not_fully_disclosed"],
        "availability": ["available_for_future_operations", "settlement_timing_requires_review"],
    },
    "UPWK": {
        "maturity_buckets": ["not_disclosed_in_review", "mixed_or_security_level_detail_required"],
        "credit_quality": ["not_disclosed_in_review"],
        "availability": ["issuer_says_available_for_current_operations", "customer_funds_and_restricted_cash_excluded"],
    },
}

def filing_ev_scope_note_review(symbol: str, accession: str | None) -> dict[str, Any] | None:
    """Attach issuer cash/investment note evidence only to its exact annual filing."""
    review = FILING_EV_SCOPE_NOTE_REVIEWS.get(symbol)
    if not review or not accession or review["accession"] != accession:
        return None
    dimensions = FILING_EV_CASH_POLICY_DIMENSIONS.get(symbol)
    if not dimensions:
        return None
    combined_dimensions = {
        **dimensions,
        **FILING_EV_CASH_POLICY_TAGS[symbol],
    }
    required_dimensions = (
        "instrument_types", "issuer_cash_equivalent_definition", "maturity_profile",
        "liquidity_evidence", "restriction_or_encumbrance",
        "provisional_mfi_treatment", "unresolved_questions",
        "maturity_buckets", "credit_quality", "availability",
    )
    return {
        **review,
        "cash_policy_dimensions": {
            **combined_dimensions,
            "portfolio_composition": FILING_EV_PORTFOLIO_COMPOSITION[symbol],
        },
        "cash_policy_dimensions_complete": all(
            combined_dimensions.get(key) for key in required_dimensions
        ),
        "status": "review_only",
        "source": "curated_primary_annual_filing_cash_investment_note_review",
        "production_approved": False,
        "resolver_input": False,
        "cash_candidate_promoted": False,
    }



FILING_DEBT_REVIEW_CLASSIFICATIONS: dict[str, str] = {
    "MNTN": "named_instrument_zero_or_undrawn_facility",
    "SPRO": "issuer_explicit_no_conventional_debt_statement",
    "BCRX": "separate_royalty_financing_obligation",
    "PRDO": "separate_sale_leaseback_financing_obligation",
    "VXRT": "separate_future_royalty_financing_obligation",
    "SBC": "conventional_borrowing_maturity_reconciliation",
    "SGHC": "conventional_borrowing_with_current_bucket_unresolved",
    "ZVRA": "conventional_term_loan_maturity_schedule",
    "PXED": "named_instrument_zero_or_undrawn_facility",
    "STRA": "named_instrument_zero_or_undrawn_facility",
    "OTEX": "conventional_borrowing_maturity_reconciliation",
    "IRWD": "conventional_borrowing_maturity_reconciliation",
    "QTTB": "conventional_term_loan_maturity_schedule",
    "SNDK": "named_instrument_zero_or_undrawn_facility",
    "UPWK": "conventional_borrowing_current_maturity",
    "FHTX": "face_statement_no_debt_line_note_review_incomplete",
    "NRIX": "face_statement_no_debt_line_note_review_incomplete",
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
        "method": "ifrs_borrowing_facility_maturity_and_on_demand_scope_review",
        "observations": [
            "The FY2025 20-F reports 17m of interest-bearing loans and borrowings as noncurrent. Note 24 identifies Waterview Facilities A and B, both maturing March 7, 2030, with combined carrying amount 17.3m.",
            "The same facility table lists other loans denominated in NGN, payable on demand, at 0% interest, but gives the facility amount as unspecified. The filing does not quantify a year-end drawn balance for this row.",
            "The issuer says it complied with the Waterview financial covenants throughout FY2025 and reported no indication of difficulty complying at the next test. This is not evidence that no default or acceleration could ever occur."
        ],
        "interpretation": "The Waterview facilities support a noncurrent borrowing candidate. The separate on-demand NGN loan line has an unspecified facility amount and no disclosed carrying balance in the cited table, so total current debt cannot be concluded from this note alone.",
        "limitations": [
            "Do not infer the on-demand NGN loan balance is zero from its unspecified facility amount.",
            "Do not infer current debt is zero from the 17m noncurrent face-statement row.",
            "Do not add lease liabilities to conventional debt without a separate lease policy."
        ],
        "source_url": "https://s205.q4cdn.com/195659402/files/doc_financials/2025/ar/Super-Group-SGHC-Limited-20-F-Annual-and-Transition-Report-foreign-issuer.pdf",
    },
    "ZVRA": {
        "accession": "0001434647-26-000011",
        "method": "term_loan_maturity_schedule_and_subsequent_repayment_review",
        "observations": [
            "FY2025 debt note reconciles 63.608m principal less 1.680m unamortized discount, issuance costs and PIK interest to 61.928m long-term debt.",
            "The contractual maturity is April 5, 2029; the FY2025 principal schedule shows no scheduled payments in 2026, 2027 or 2028 and 63.608m due in 2029.",
            "The credit agreement permits acceleration upon customary events of default, including non-payment, covenant defaults, insolvency, material judgments and inaccurate representations. This is a contractual remedy, not evidence that an event of default existed at FY2025 year-end.",
            "Subsequent-event context only: the Q1 2026 Form 10-Q says all outstanding obligations were repaid in full on March 12, 2026, with approximately 63.1m principal including PIK interest plus 1.4m accrued cash interest; the credit agreement and related loan documents were terminated and liens released."
        ],
        "interpretation": "The FY2025 filing supports a noncurrent 61.928m carrying-value candidate with no scheduled principal in the next three calendar years. The March 2026 payoff is a subsequent event and must not overwrite the FY2025 balance-sheet snapshot. The generic resolver's current bucket remains unknown pending explicit policy.",
        "limitations": [
            "Do not convert the current bucket to zero solely from the maturity schedule; retain the acceleration/default caveat.",
            "Do not use the March 2026 repayment to rewrite FY2025 debt or mix it with annual EBIT unless the ranking's point-in-time policy explicitly selects subsequent interim data."
        ],
        "subsequent_event_source_url": "https://www.sec.gov/Archives/edgar/data/1434647/000143464726000031/zvra-20260331.htm",
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
    "OTEX": {
        "accession": "0001002638-26-000068",
        "method": "debt_note_rollforward_and_cash_restriction_scope_review",
        "observations": [
            "Note 11 reports total debt carrying amount 5,770.369m after 66.156m unamortized discounts and issuance costs; current portion 35.850m plus noncurrent 5,734.519m reconciles exactly.",
            "The debt note lists five instrument groups: Senior Notes 2031 650m, 2030 900m, 2029 850m, 2028 900m, Senior Secured Notes 2027 1,000m, and Acquisition Term Loan 1,536.525m principal.",
            "The FY2026 cash-flow reconciliation reports 956.024m cash and cash equivalents plus 1.230m restricted cash.",
            "Note 9 separately reports deposits and restricted cash of 4.824m current and 16.334m noncurrent; Note 9 also reports 112.022m equity-method investments and 45.142m available-for-sale financial assets.",
            "Operating lease liabilities are separately reported at 63.612m current and 138.425m noncurrent; noncontrolling interests are 1.962m."
        ],
        "interpretation": "Current and noncurrent conventional-debt carrying values reconcile to the debt-note carrying amount. Unrestricted cash is separately reported. Restricted cash, security deposits, investments, leases and noncontrolling interests remain distinct EV-scope questions.",
        "limitations": ["Do not add restricted cash or deposits to unrestricted cash.", "Do not treat equity-method investments or available-for-sale financial assets as cash equivalents.", "Do not add lease liabilities or noncontrolling interests without an approved EV policy.", "Do not replace carrying value with principal or contractual payments without an explicit debt measurement policy."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1002638/000100263826000068/otex-20260630.htm",
    },
    "SNDK": {
        "accession": "0001628280-26-057406",
        "method": "term_loan_settlement_and_undrawn_revolver_review",
        "observations": [
            "The FY2026 10-K reports current and noncurrent long-term debt as explicit zero balances.",
            "Note 8 states the remaining Term Loan Facility principal was repaid in full on March 4, 2026; the company had drawn no amounts under its 1.5bn Revolving Credit Facility at July 3, 2026.",
            "Cash and cash equivalents were 4,762m; 2,879m was held outside the United States, with no material unaccrued repatriation tax consequences disclosed.",
            "Marketable equity securities of 1,777m and notes receivable/investments in Flash Ventures of 678m are separately presented from cash and cash equivalents.",
            "Operating lease liabilities total 201m, comprising 24m current and 177m noncurrent."
        ],
        "interpretation": "The explicit zero debt rows are corroborated by note-level settlement and undrawn-facility disclosures for the reviewed reporting date. Cash equivalents are separately identified; strategic equity investments, notes receivable and lease liabilities remain outside conventional cash/debt pending policy.",
        "limitations": ["The zero balance applies to the named facilities and FY2026 reporting date only.", "Do not add marketable equity securities or Flash Ventures notes/investments to cash equivalents.", "Do not include operating lease liabilities in conventional debt without lease-policy approval."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/2023554/000162828026057406/sndk-20260703.htm",
    },
    "IRWD": {
        "accession": "0001104659-26-020489",
        "method": "convertible_note_and_revolver_debt_note_reconciliation",
        "observations": [
            "At December 31, 2025, the 2026 Convertible Notes had 200m principal and 199.680m net carrying value after 0.320m unamortized issuance costs; the notes were classified current.",
            "The Revolving Credit Facility had 385m outstanding principal at December 31, 2025; the facility commitment was 550m and included a 10m letter-of-credit subfacility.",
            "The two balance-sheet debt candidates total 584.680m, matching 199.680m convertible-note carrying value plus 385m revolver principal.",
            "Cash and cash equivalents were 215.456m, including money market funds, U.S. Treasury securities and commercial paper.",
            "Operating lease liabilities are separately reported at 3.252m current and 9.870m noncurrent; 0.6m of letters of credit supports lease obligations."
        ],
        "interpretation": "Both conventional borrowing candidates have direct instrument-note support and reconcile to the reported balances. Lease liabilities and lease-supporting letters of credit remain separate. The annual filing is a December 31, 2025 snapshot.",
        "limitations": ["Do not count the 0.6m lease letter of credit as drawn debt.", "Do not include operating lease liabilities without lease-policy approval.", "Do not substitute subsequent interim repayments into the annual-period debt snapshot without an approved point-in-time data policy."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1446847/000110465926020489/irwd-20251231x10k.htm",
    },
    "QTTB": {
        "accession": "0001193125-26-099339",
        "method": "venture_debt_carrying_value_and_restricted_cash_reconciliation",
        "observations": [
            "Note 11 reports 9.375m term-loan principal less 0.333m unamortized debt discount and issuance costs, yielding 9.708m carrying amount.",
            "The carrying amount reconciles to 6.235m current portion plus 3.473m long-term debt.",
            "Restricted cash of 0.647m is explicitly identified as collateral for venture debt and letters of credit related to lease arrangements; cash and cash equivalents are 48.297m.",
            "A separate 4.943m noncurrent operating lease liability is reported."
        ],
        "interpretation": "Venture debt is supported by a note-level carrying-value reconciliation. The 0.647m restricted balance must remain excluded from unrestricted cash; lease liability remains a separate category.",
        "limitations": ["Do not add restricted cash to unrestricted cash.", "Do not use gross principal in place of carrying value without an approved debt measurement policy.", "Do not include operating lease liabilities in conventional debt without lease-policy approval."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1661998/000119312526099339/qttb-20251231.htm",
    },
    "UPWK": {
        "accession": "0001627475-26-000012",
        "method": "convertible_note_and_customer_escrow_cash_scope_review",
        "observations": [
            "Note 10 reports 360.998m convertible-note principal less 1.228m unamortized debt issuance costs, yielding 359.770m carrying value, all classified current at December 31, 2025.",
            "The notes mature August 15, 2026; the 10-K explicitly classifies them as current because maturity falls within twelve months of the balance-sheet date.",
            "Cash and cash equivalents were 294.356m; marketable securities were 378.425m and separately classified.",
            "Restricted cash was 3.8m; customer funds held in escrow, including funds in transit, were 180.752m with an equal escrow-funds-payable liability.",
            "The marketable-securities note states they are available for current operations; their portfolio includes money-market funds, commercial paper, Treasury bills, corporate bonds and other fixed-income securities."
        ],
        "interpretation": "Debt carrying value and current classification are directly supported. Company cash is distinct from restricted cash and customer escrow. Marketable securities are a separate liquidity category requiring an explicit EV cash-like-asset policy.",
        "limitations": ["Do not subtract restricted cash or customer escrow funds as unrestricted company cash.", "Do not automatically combine marketable securities with cash equivalents; require a documented cash-like-asset policy.", "Do not count escrow funds payable as conventional debt.", "Do not ignore the note maturity date or mix a later interim balance into this annual filing snapshot without a point-in-time policy."],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1627475/000162747526000012/upwk-20251231.htm",
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
    "OTEX": {"evidence_scope": "reconciled_instrument_debt_with_restricted_cash_investment_lease_and_nci_scope", "manual_review_questions": ["Confirm whether the EV debt input should use the reconciled 5,770.369m carrying value or another documented debt measure.", "Keep 1.230m restricted cash and separately disclosed security deposits/restricted cash outside unrestricted cash.", "Decide whether the 112.022m equity-method investments or 45.142m available-for-sale financial assets qualify as cash-like assets.", "Set explicit treatment for 202.037m operating lease liabilities and 1.962m noncontrolling interests."], "prohibited_inferences": ["Do not treat all deposits and restricted cash as unrestricted cash.", "Do not automatically add investment assets, leases or NCI to EV inputs."]},
    "SNDK": {"evidence_scope": "FY2026_zero_facility_debt_with_separate_investment_and_lease_categories", "manual_review_questions": ["Confirm the explicit zero balances and the March 4, 2026 term-loan settlement against the FY2026 period.", "Keep 1,777m marketable equity securities and 678m Flash Ventures notes/investments distinct from cash equivalents.", "Decide whether 201m operating lease liabilities belong in the chosen EV debt policy."], "prohibited_inferences": ["Do not infer all future or unreported debt categories are zero from the reviewed facilities.", "Do not treat equity investments or notes receivable as cash equivalents."]},
    "IRWD": {"evidence_scope": "reconciled_convertible_note_and_revolver_debt_with_cash_and_lease_separation", "manual_review_questions": ["Confirm the 199.680m note carrying value plus 385m revolver balance against the 584.680m debt candidates.", "Keep lease liabilities and lease-supporting letters of credit outside drawn conventional debt.", "Confirm whether the annual-period snapshot or a later interim debt snapshot is required by the ranking point-in-time policy."], "prohibited_inferences": ["Do not treat undrawn letter-of-credit capacity as debt drawn.", "Do not mix subsequent interim repayments into annual data without an explicit policy."]},
    "QTTB": {"evidence_scope": "reconciled_venture_debt_and_collateral_restricted_cash", "manual_review_questions": ["Confirm the 9.708m debt carrying value and its 6.235m/3.473m maturity split.", "Keep 0.647m collateral restricted cash outside unrestricted cash.", "Decide whether the 4.943m noncurrent operating lease liability is excluded under the chosen EV policy."], "prohibited_inferences": ["Do not add restricted cash to unrestricted cash.", "Do not merge lease liabilities into conventional borrowings automatically."]},
    "UPWK": {"evidence_scope": "reconciled_convertible_note_debt_with_customer_escrow_restricted_cash_and_marketable_securities", "manual_review_questions": ["Confirm 359.770m debt carrying value and August 15, 2026 maturity at the annual reporting date.", "Keep 3.8m restricted cash and 180.752m customer escrow funds outside unrestricted cash.", "Decide whether the 378.425m marketable securities qualify as cash-like assets under a consistent EV policy.", "Determine whether subsequent debt repayment data should affect a current-market-cap ranking that otherwise uses annual filing fundamentals."], "prohibited_inferences": ["Do not count customer escrow assets as company cash when matched by escrow liabilities.", "Do not treat restricted cash as unrestricted.", "Do not automatically add marketable securities to cash equivalents or ignore debt maturity timing."]},
}
def debt_candidate_evidence_review(raw_company: dict[str, Any]) -> dict[str, Any]:
    """Describe debt candidates without summing instruments or converting missing rows to zero."""
    fact_review = raw_company.get("balance_sheet_fact_review") or {}
    categories = fact_review.get("categories") or {}
    fiscal_period = fact_review.get("fiscal_period")
    result: dict[str, Any] = {
        "fiscal_period": fiscal_period,
        "currency": raw_company.get("reporting_currency_review", {}).get("currency"),
        "buckets": {},
        "production_approved": False,
        "resolver_input": False,
        "debt_candidate_promoted": False,
    }
    for bucket, category_name in (
        ("current", "current_debt_candidates"),
        ("noncurrent", "noncurrent_debt_candidates"),
    ):
        category = categories.get(category_name) or {}
        candidates = [
            candidate for candidate in category.get("candidates", [])
            if candidate.get("fiscal_period") == fiscal_period
        ]
        nonzero = [candidate for candidate in candidates if candidate.get("value") not in (None, 0, 0.0)]
        explicit_zero = [candidate for candidate in candidates if candidate.get("value") in (0, 0.0)]
        unknown = [candidate for candidate in candidates if candidate.get("value") is None]
        if not candidates:
            disposition = "unknown_not_zero"
        elif len(nonzero) > 1 or unknown:
            disposition = "multiple_or_unknown_instrument_values_manual_review"
        elif len(nonzero) == 1 and explicit_zero:
            disposition = "one_nonzero_plus_explicit_zero_instruments_review_only"
        elif len(nonzero) == 1:
            disposition = "unique_nonzero_candidate_review_only"
        elif explicit_zero and len(explicit_zero) == len(candidates):
            disposition = "all_reported_instrument_lines_explicit_zero_review_only"
        else:
            disposition = "ambiguous_manual_review"
        result["buckets"][bucket] = {
            "source_category_status": category.get("status", "not_found"),
            "source_candidate_count": category.get("candidate_count", len(candidates)),
            "fiscal_period_candidate_count": len(candidates),
            "nonzero_candidate_count": len(nonzero),
            "explicit_zero_candidate_count": len(explicit_zero),
            "unknown_value_candidate_count": len(unknown),
            "disposition": disposition,
            "candidates": [
                {
                    "concept": candidate.get("concept"),
                    "label": candidate.get("label"),
                    "value": candidate.get("value"),
                    "fiscal_period": candidate.get("fiscal_period"),
                    "row_index": candidate.get("row_index"),
                }
                for candidate in candidates
            ],
            "automatic_aggregation": False,
            "production_approved": False,
        }
    return result


FILING_OPERATING_INCOME_QUALITY_REVIEWS: dict[str, dict[str, Any]] = {
    "QTTB": {
        "accession": "0001193125-26-099339",
        "fiscal_period": "2025-12-31",
        "review_classification": "material_nonrecurring_operating_revenue_in_reported_EBIT",
        "reported_operating_income_millions": 16.902,
        "identified_nonrecurring_operating_revenue_millions": 53.737,
        "observations": [
            "FY2025 reported operating income is 16.902m, calculated as 53.737m collaboration-arrangement revenue less 36.835m operating expenses.",
            "The filing explains that the 53.737m collaboration-arrangement revenue arose from settlement of a customer refund liability following the Amgen amendment.",
            "The issuer states that it has not commercialized product candidates and does not expect product sales for several years, if at all."
        ],
        "interpretation": "The reported GAAP operating-income subtotal is arithmetically valid, but a one-time settlement is the entire revenue line and materially affects the positive EBIT candidate. The shadow rank is a mechanical reported-GAAP result, not a recurring-earnings quality signal.",
        "manual_review_questions": [
            "Should the Magic Formula EBIT numerator use reported GAAP operating income without adjustment, or is a documented cohort-wide exceptional-item policy required?",
            "If any adjustment policy is adopted, define it consistently and retain the reported GAAP amount alongside every adjusted candidate."
        ],
        "prohibited_inferences": [
            "Do not silently remove the settlement revenue or replace reported EBIT.",
            "Do not mark the issuer production-approved based on the positive reported operating-income subtotal."
        ],
        "source_url": "https://www.sec.gov/Archives/edgar/data/1661998/000119312526099339/qttb-20251231.htm",
        "source": "curated_primary_annual_filing_operating_income_quality_review",
        "status": "review_only",
        "production_approved": False,
        "resolver_input": False,
        "ranking_input_changed": False
    },
    "VXRT": {
        "accession": "0001437749-26-008023",
        "fiscal_period": "2025-12-31",
        "review_classification": "noncash_royalty_revenue_related_to_sold_royalties",
        "reported_operating_income_millions": 18.074,
        "identified_nonrecurring_operating_revenue_millions": 1.929,
        "observations": [
            "FY2025 GAAP operating income is 18.074m.",
            "The filing separately reports 1.929m non-cash royalty revenue related to the sale of future royalties from Daiichi Sankyo; royalties received are required to be paid to HCRP.",
            "The liability from sale of future royalties is 4.060m at year-end, comprising 1.381m current and 2.679m noncurrent.",
            "The liability roll-forward reports 4.521m non-cash royalty revenue paid to HCRP and 2.823m non-cash imputed interest expense during FY2025; these are roll-forward mechanics and should not be conflated with the 1.929m revenue line in the MD&A."
        ],
        "interpretation": "The issuer's sold-royalty financing produces a noncash revenue line and a separately accreting financing liability. This creates an operating-income quality and EV-scope question: the EBIT candidate may include revenue from a stream already sold, while the related financing obligation remains outstanding.",
        "manual_review_questions": [
            "Should noncash royalty revenue related to sold future royalties remain in the MFI EBIT numerator, or should a documented cohort-wide policy adjust such financing-linked operating revenue?",
            "Should the 4.060m future-royalty sale liability be treated as debt-like for EV, separately from conventional borrowings and leases?",
            "Reconcile the 1.929m reported noncash royalty revenue with the 4.521m liability roll-forward payment line; do not assume they are the same measure."
        ],
        "prohibited_inferences": [
            "Do not silently remove noncash royalty revenue or adjust EBIT without an approved cohort-wide rule.",
            "Do not automatically classify the royalty liability as conventional debt or ordinary lease liability."
        ],
        "source_url": "https://www.sec.gov/Archives/edgar/data/72444/000143774926008023/vxrt20251231_10k.htm",
        "source": "curated_primary_annual_filing_operating_income_quality_review",
        "status": "review_only",
        "production_approved": False,
        "resolver_input": False,
        "ranking_input_changed": False
    }
}


FILING_COMPANY_PERIMETER_REVIEWS: dict[str, dict[str, Any]] = {
    "VSNT": {
        "accession": "0002067876-26-000010",
        "fiscal_period": "2025-12-31",
        "review_classification": "pre_separation_combined_financials_not_comparable_to_standalone_public_equity",
        "observations": [
            "The FY2025 Form 10-K states that the separation from Comcast completed on January 2, 2026 and regular-way trading under VSNT began on January 5, 2026.",
            "The FY2025 statements are combined historical financial statements for operations previously run within Comcast; the issuer says they are not necessarily representative of results as an independent company and may not reliably indicate future results.",
            "At December 31, 2025, the combined balance sheet reports 983m long-term debt and 1,034m restricted cash, primarily senior-note proceeds held in escrow pending the separation.",
            "The 1.0bn Term Loan A and 750m revolving facility were funded/available in connection with the January 2, 2026 separation; an additional 1.0bn Term Loan B was also funded on January 2, 2026.",
            "The FY2025 filing reports 1,272m operating income, 2,502m current assets, 622m current liabilities and 423m net PP&E, but those amounts describe the pre-separation combined perimeter."
        ],
        "interpretation": "Using a post-spin-off VSNT market capitalization with pre-separation combined FY2025 financial statements creates a company-perimeter mismatch. The 2025 cash/debt snapshot also straddles the separation financing: senior-note proceeds were in restricted escrow at year-end, while major term-loan borrowings funded after year-end. This is not a routine missing-debt issue.",
        "manual_review_questions": [
            "Should VSNT remain excluded from the MFI ranked cohort until the first standalone annual financial statements are available?",
            "If any pre-separation historical figures are used for coverage or comparison, define a standalone pro forma bridge and align the debt/cash perimeter to the listed equity."
        ],
        "prohibited_inferences": [
            "Do not treat pre-separation combined financial statements as directly comparable to post-separation standalone market capitalization.",
            "Do not add the post-year-end term loans to FY2025 debt while also retaining the FY2025 escrow cash without a pro forma separation bridge.",
            "Do not rank VSNT using these FY2025 combined statements until the company-perimeter issue is resolved."
        ],
        "source_url": "https://www.sec.gov/Archives/edgar/data/2067876/000206787626000010/vsnt-20251231.htm",
        "source": "curated_primary_annual_filing_company_perimeter_review",
        "status": "review_only",
        "production_approved": False,
        "resolver_input": False,
        "ranking_input_changed": False
    }
}


def filing_company_perimeter_review(symbol: str, accession: str | None) -> dict[str, Any] | None:
    """Attach exact-accession entity-perimeter warnings without changing resolver or rank inputs."""
    review = FILING_COMPANY_PERIMETER_REVIEWS.get(symbol)
    if not review or not accession or review["accession"] != accession:
        return None
    return dict(review)


def filing_operating_income_quality_review(symbol: str, accession: str | None) -> dict[str, Any] | None:
    """Attach accession-bound operating-income quality observations without adjusting EBIT."""
    review = FILING_OPERATING_INCOME_QUALITY_REVIEWS.get(symbol)
    if not review or not accession or review["accession"] != accession:
        return None
    return dict(review)


def filing_debt_note_review(symbol: str, accession: str | None) -> dict[str, Any] | None:
    """Attach exact-accession evidence to the read-only review queue only; never approve or promote resolver candidates."""
    review = FILING_DEBT_NOTE_REVIEWS.get(symbol)
    if not review or not accession or review["accession"] != accession:
        return None
    return {
        **review,
        **FILING_DEBT_REVIEW_ACTIONS[symbol],
        "review_classification": FILING_DEBT_REVIEW_CLASSIFICATIONS.get(symbol, "unclassified_manual_review"),
        "status": "review_only",
        "source": "curated_primary_annual_filing_note_review",
        "production_approved": False,
        "resolver_input": False,
        "debt_candidate_promoted": False
    }


def build_queue(
    report: dict[str, Any],
    raw_evidence: dict[str, Any] | None = None,
    ranking_preview: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if ranking_preview and (ranking_preview.get("production_write") is not False or ranking_preview.get("rankings_changed") is not False):
        raise ValueError("Ranking preview did not confirm production immutability.")
    ranking_by_symbol = {
        str(row.get("symbol", "")).upper(): row
        for row in (ranking_preview or {}).get("rankings", [])
        if row.get("symbol")
    }
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
        shadow = ranking_by_symbol.get(item["symbol"].upper())
        item["mfi_shadow_ranking"] = ({
            "rank": shadow.get("magic_formula_rank"),
            "combined_score": shadow.get("magic_formula_score"),
            "earnings_yield": shadow.get("earnings_yield"),
            "return_on_capital": shadow.get("return_on_capital"),
            "eligibility_status": shadow.get("eligibility_status"),
            "preview_eligible": shadow.get("ranking_eligible") is True,
            "ranked": shadow.get("magic_formula_rank") is not None,
            "production_approved": shadow.get("production_approved") is True,
            "methodology_version": (ranking_preview or {}).get("methodology_version"),
        } if shadow else None)
        resolution_accession = resolution.get("accession")
        item["filing_operating_income_quality_review"] = filing_operating_income_quality_review(
            item["symbol"], resolution_accession
        )
        item["filing_operating_income_quality_review_source"] = (
            "curated_primary_annual_filing_operating_income_quality_review_same_accession"
            if item["filing_operating_income_quality_review"] else "not_available"
        )
        if item["filing_operating_income_quality_review"]:
            item["issues"].append("filing_operating_income_quality_review_available_manual_review")
            item["next_review_actions"].append(
                "Review material nonrecurring items in the reported operating-income subtotal; do not silently adjust EBIT or change the ranking formula."
            )
            item["issue_count"] = len(item["issues"])
        item["filing_company_perimeter_review"] = filing_company_perimeter_review(
            item["symbol"], resolution_accession
        )
        item["filing_company_perimeter_review_source"] = (
            "curated_primary_annual_filing_company_perimeter_review_same_accession"
            if item["filing_company_perimeter_review"] else "not_available"
        )
        if item["filing_company_perimeter_review"]:
            item["issues"].append("filing_company_perimeter_not_comparable_manual_review")
            item["next_review_actions"].append(
                "Do not compare post-separation market capitalization with pre-separation combined financial statements; keep the issuer out of ranked output until a comparable standalone annual filing or approved pro forma bridge exists."
            )
            item["priority"] = "P1"
            item["issue_count"] = len(item["issues"])
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
            item["debt_candidate_evidence_review"] = debt_candidate_evidence_review(raw_company)
            item["debt_candidate_evidence_review_source"] = "fresh_extraction_artifact_same_accession"
            # Surface filing-specific evidence that narrows an ambiguous bucket without
            # changing the resolver's disposition or promoting a value into EV inputs.
            for bucket in ("current", "noncurrent"):
                evidence = item["debt_candidate_evidence_review"]["buckets"].get(bucket, {})
                gap = (item.get("debt_resolution_gap") or {}).get(bucket)
                if gap is None:
                    continue
                gap["filing_evidence_disposition"] = evidence.get("disposition", "not_available")
                gap["nonzero_candidate_count"] = evidence.get("nonzero_candidate_count", 0)
                gap["explicit_zero_candidate_count"] = evidence.get("explicit_zero_candidate_count", 0)
                gap["manual_nonzero_candidate_values"] = [
                    candidate.get("value")
                    for candidate in evidence.get("candidates", [])
                    if isinstance(candidate.get("value"), (int, float)) and candidate.get("value") != 0
                ]
                gap["automatic_aggregation"] = False
                gap["resolver_input"] = False
                gap["production_approved"] = False
                if evidence.get("disposition") == "one_nonzero_plus_explicit_zero_instruments_review_only":
                    gap["manual_review_hint"] = (
                        "One non-zero instrument plus separately reported explicit-zero instruments; "
                        "review the non-zero line against filing notes and maturity schedule. "
                        "The resolver remains ambiguous and no amount is promoted."
                    )
            item["debt_scope_evidence"] = extract_debt_scope_evidence(raw_company)
            item["debt_scope_evidence_source"] = "fresh_extraction_artifact_same_accession"
            item["ev_scope_evidence"] = extract_ev_scope_evidence(raw_company)
            item["ev_scope_evidence_source"] = "fresh_extraction_artifact_same_accession"
            item["filing_debt_note_review"] = filing_debt_note_review(item["symbol"], raw_accession)
            item["filing_debt_note_review_source"] = (
                "curated_primary_annual_filing_note_review_same_accession"
                if item["filing_debt_note_review"] else "not_available"
            )
            item["filing_ev_scope_note_review"] = filing_ev_scope_note_review(item["symbol"], raw_accession)
            item["filing_ev_scope_note_review_source"] = (
                "curated_primary_annual_filing_cash_investment_note_review_same_accession"
                if item["filing_ev_scope_note_review"] else "not_available"
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
            item["ev_scope_evidence"] = None
            item["ev_scope_evidence_source"] = "stored_resolver_preview"
            item["filing_debt_note_review"] = None
            item["filing_debt_note_review_source"] = "stored_resolver_preview"
            item["filing_ev_scope_note_review"] = None
            item["filing_ev_scope_note_review_source"] = "stored_resolver_preview"
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
        "ranking_methodology_version": (ranking_preview or {}).get("methodology_version"),
        "ranking_preview_as_of": (ranking_preview or {}).get("as_of"),
        "generated_from_preview": report.get("generated_at"),
        "production_fundamentals_changed": report.get("production_fundamentals_changed"),
        "rankings_changed": report.get("rankings_changed"),
        "production_write": False,
        "summary": {
            "total": len(rows),
            "shadow_preview_eligible": sum(1 for row in rows if (row.get("mfi_shadow_ranking") or {}).get("preview_eligible")),
            "shadow_ranked_review_items": sum(1 for row in rows if (row.get("mfi_shadow_ranking") or {}).get("ranked")),
            "shadow_production_approved": sum(1 for row in rows if (row.get("mfi_shadow_ranking") or {}).get("production_approved")),
            "priority_1": counts.get("P1", 0),
            "priority_2": counts.get("P2", 0),
            "priority_3": counts.get("P3", 0),
            "balance_sheet_reconciliation": dict(Counter(
                str((row.get("balance_sheet_reconciliation_review") or {}).get("status") or "not_available")
                for row in rows
            )),
            "debt_scope_evidence_companies": sum(1 for row in rows if row.get("debt_scope_evidence") and row["debt_scope_evidence"].get("row_count", 0)),
            "filing_debt_note_manual_reviews_available": sum(1 for row in rows if row.get("filing_debt_note_review")),
            "filing_operating_income_quality_manual_reviews_available": sum(1 for row in rows if row.get("filing_operating_income_quality_review")),
            "filing_company_perimeter_manual_reviews_available": sum(1 for row in rows if row.get("filing_company_perimeter_review")),
            "filing_debt_note_review_classifications": dict(Counter(
                (row.get("filing_debt_note_review") or {}).get("review_classification", "unclassified")
                for row in rows if row.get("filing_debt_note_review")
            )),
            "debt_candidate_evidence_dispositions": dict(Counter(
                f"{bucket}:{(row.get('debt_candidate_evidence_review') or {}).get('buckets', {}).get(bucket, {}).get('disposition', 'not_available')}"
                for row in rows for bucket in ("current", "noncurrent")
            )),
            "debt_bucket_gap_dispositions": dict(Counter(
                f"{bucket}:{(row.get('debt_resolution_gap') or {}).get(bucket, {}).get('disposition', 'not_available')}"
                for row in rows for bucket in ("current", "noncurrent")
            )),
            "cash_scope_dispositions": dict(Counter(
                f"{bucket}:{(row.get('cash_scope_resolution') or {}).get(bucket, {}).get('disposition', 'not_available')}"
                for row in rows for bucket in ("unrestricted_cash", "restricted_cash", "short_term_investments")
            )),
            "filing_ev_scope_note_manual_reviews_available": sum(1 for row in rows if row.get("filing_ev_scope_note_review")),
            "filing_ev_scope_policy_dimensions_complete": sum(
                1 for row in rows
                if (row.get("filing_ev_scope_note_review") or {}).get("cash_policy_dimensions_complete") is True
            ),
            "cash_policy_unresolved_questions": sum(
                len((row.get("filing_ev_scope_note_review") or {}).get("cash_policy_dimensions", {}).get("unresolved_questions", []))
                for row in rows
            ),
            "cash_policy_maturity_bucket_tags": dict(Counter(
                tag
                for row in rows
                for tag in ((row.get("filing_ev_scope_note_review") or {}).get("cash_policy_dimensions", {}).get("maturity_buckets") or [])
            )),
            "cash_policy_credit_quality_tags": dict(Counter(
                tag
                for row in rows
                for tag in ((row.get("filing_ev_scope_note_review") or {}).get("cash_policy_dimensions", {}).get("credit_quality") or [])
            )),
            "cash_policy_availability_tags": dict(Counter(
                tag
                for row in rows
                for tag in ((row.get("filing_ev_scope_note_review") or {}).get("cash_policy_dimensions", {}).get("availability") or [])
            )),
            "ev_scope_classification_rows": dict(Counter(
                category
                for row in rows for evidence in ((row.get("ev_scope_evidence") or {}).get("rows") or [])
                for category in [evidence["category"]]
            )),
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
    parser.add_argument("--ranking-preview", default="edgartools-mfi-ranking-preview.json")
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

    ranking_preview = None
    ranking_path = Path(args.ranking_preview)
    if ranking_path.exists():
        ranking_preview = json.loads(ranking_path.read_text(encoding="utf-8"))
    queue = build_queue(report, raw_evidence, ranking_preview)
    Path(args.json_output).write_text(json.dumps(queue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    fields = [
        "symbol", "priority", "mfi_shadow_ranking", "provider_status", "ebit_status", "invested_capital_status",
        "debt_status", "debt_resolution_gap", "debt_candidate_evidence_review", "debt_candidate_evidence_review_source", "cash_scope_resolution", "unrestricted_cash_candidate", "candidate_roc", "reporting_currency",
        "issue_count", "issues", "balance_sheet_exceptions", "debt_instrument_evidence",
        "debt_instrument_evidence_source", "debt_scope_evidence", "debt_scope_evidence_source", "ev_scope_evidence", "ev_scope_evidence_source", "filing_debt_note_review", "filing_debt_note_review_source", "filing_ev_scope_note_review", "filing_ev_scope_note_review_source", "balance_sheet_reconciliation_review",
        "balance_sheet_reconciliation_evidence_source", "invested_capital_denominator_diagnostics",
        "invested_capital_denominator_diagnostics_source", "filing_specific_ebit_review",
        "filing_specific_ebit_review_source", "filing_operating_income_quality_review", "filing_operating_income_quality_review_source", "filing_company_perimeter_review", "filing_company_perimeter_review_source", "candidate_vs_policy_assessment", "next_review_actions", "production_write",
    ]
    with Path(args.csv_output).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for item in queue["items"]:
            row = dict(item)
            row["issues"] = " | ".join(item["issues"])
            row["next_review_actions"] = " | ".join(item.get("next_review_actions", []))
            row["balance_sheet_exceptions"] = " | ".join(item["balance_sheet_exceptions"])
            row["debt_instrument_evidence"] = json.dumps(item["debt_instrument_evidence"], separators=(",", ":"))
            row["debt_resolution_gap"] = json.dumps(item.get("debt_resolution_gap"), separators=(",", ":"))
            row["debt_candidate_evidence_review"] = json.dumps(item.get("debt_candidate_evidence_review"), separators=(",", ":"))
            row["cash_scope_resolution"] = json.dumps(item.get("cash_scope_resolution"), separators=(",", ":"))
            row["debt_scope_evidence"] = json.dumps(item.get("debt_scope_evidence"), separators=(",", ":"))
            row["ev_scope_evidence"] = json.dumps(item.get("ev_scope_evidence"), separators=(",", ":"))
            row["filing_debt_note_review"] = json.dumps(item.get("filing_debt_note_review"), separators=(",", ":"))
            row["filing_ev_scope_note_review"] = json.dumps(item.get("filing_ev_scope_note_review"), separators=(",", ":"))
            row["balance_sheet_reconciliation_review"] = json.dumps(
                item.get("balance_sheet_reconciliation_review"), separators=(",", ":")
            )
            row["invested_capital_denominator_diagnostics"] = json.dumps(
                item.get("invested_capital_denominator_diagnostics"), separators=(",", ":")
            )
            row["filing_specific_ebit_review"] = json.dumps(
                item.get("filing_specific_ebit_review"), separators=(",", ":")
            )
            row["filing_operating_income_quality_review"] = json.dumps(
                item.get("filing_operating_income_quality_review"), separators=(",", ":")
            )
            row["filing_company_perimeter_review"] = json.dumps(
                item.get("filing_company_perimeter_review"), separators=(",", ":")
            )
            row["mfi_shadow_ranking"] = json.dumps(item.get("mfi_shadow_ranking"), separators=(",", ":"))
            row["candidate_vs_policy_assessment"] = json.dumps(item["candidate_vs_policy_assessment"], separators=(",", ":"))
            writer.writerow(row)
    print("Accounting review queue:", json.dumps(queue["summary"], sort_keys=True))
    print("Review-only; production fundamentals and rankings were not changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
