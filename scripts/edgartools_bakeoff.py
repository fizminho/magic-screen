#!/usr/bin/env python3
"""Test-only EdgarTools extraction for Magic Screen's SEC fundamentals bakeoff.

INTENTIONAL: this script only reads SEC filings and writes a local JSON artifact.
It never calls Magic Screen APIs, writes D1, calculates production ratios, or ranks stocks.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from edgar import Company, set_identity

DEFAULT_SYMBOLS = ("HRB", "PBI", "ADBE", "AFMJF", "HPQ", "OTEX", "PRDO", "PLTK", "UPWK", "SNDK", "SGHC")
ROW_PATTERN = re.compile(
    r"operating income|operating profit|income from operations|profit from operations|"
    r"earnings before interest|\bebit\b|property|plant|equipment|fixed assets|"
    r"depreciation|depletion|amortization|current assets|current liabilities|"
    r"cash and cash equivalents|cash equivalents|cash and bank|\bcash\b|"
    r"long.?term debt|short.?term debt|current portion of debt|borrowings|"
    r"loans payable|notes payable|finance lease|lease liabilities|interest expense",
    re.IGNORECASE,
)
METADATA_FIELDS = (
    "accession_number", "accession_no", "accession", "filing_date",
    "period_of_report", "report_date", "form", "company",
)


def safe_value(value: Any) -> Any:
    """Convert pandas/numpy/date/container values into JSON-safe primitives."""
    if value is None or isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(key): safe_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [safe_value(item) for item in value]
    if hasattr(value, "item"):
        try:
            return safe_value(value.item())
        except Exception:
            pass
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass
    try:
        import pandas as pd
        if pd.isna(value):
            return None
    except (ImportError, TypeError, ValueError):
        pass
    return str(value)


def filing_metadata(filing: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for name in METADATA_FIELDS:
        try:
            value = getattr(filing, name, None)
            if value is not None and not callable(value):
                result[name] = safe_value(value)
        except Exception:
            continue
    return result


ROW_META_KEYS = {
    "index", "concept", "label", "level", "abstract", "dimension",
    "is_breakdown", "dimension_axis", "dimension_member",
    "dimension_member_label", "dimension_label", "balance", "weight",
    "preferred_sign", "parent_concept", "parent_abstract_concept",
}


def compact_statement_row(record: dict[str, Any]) -> dict[str, Any]:
    # INTENTIONAL: retain every detailed row once. candidate replaces the
    # duplicated all_rows + filtered rows arrays from the previous artifact.
    row = {key: record.get(key) for key in ROW_META_KEYS if record.get(key) is not None}
    values = {
        key: safe_value(value) for key, value in record.items()
        if key not in ROW_META_KEYS and value is not None
    }
    if values:
        row["values"] = values
    searchable = " ".join(str(value) for value in record.values() if value is not None)
    row["candidate"] = bool(ROW_PATTERN.search(searchable))
    return row


def statement_candidates(statement: Any) -> dict[str, Any]:
    if statement is None:
        return {"available": False, "row_count": 0, "candidate_row_count": 0, "rows": [], "error": "Statement unavailable"}
    try:
        frame = statement.to_dataframe(view="detailed").reset_index()
        rows = [
            compact_statement_row({str(key): safe_value(value) for key, value in record.items()})
            for record in frame.to_dict(orient="records")
        ]
        return {
            "available": True,
            "row_count": len(rows),
            "candidate_row_count": sum(1 for row in rows if row["candidate"]),
            "rows": rows,
        }
    except Exception as exc:
        return {"available": False, "row_count": 0, "candidate_row_count": 0,
                "rows": [], "error": f"{type(exc).__name__}: {exc}"}


def _row_amount(row: dict[str, Any]) -> float | None:
    for value in row.get("values", {}).values():
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
            return float(value)
    return None


def build_ebit_bridge(income_statement: dict[str, Any]) -> dict[str, Any]:
    rows = income_statement.get("rows", [])

    def find(pattern: str, label_pattern: str | None = None,
             exclude_pattern: str | None = None) -> dict[str, Any] | None:
        concept_re = re.compile(pattern, re.IGNORECASE)
        label_re = re.compile(label_pattern, re.IGNORECASE) if label_pattern else None
        exclude_re = re.compile(exclude_pattern, re.IGNORECASE) if exclude_pattern else None
        matches = [
            row for row in rows
            if not row.get("abstract") and not row.get("dimension")
            and concept_re.search(str(row.get("concept", "")))
            and (label_re is None or label_re.search(str(row.get("label", ""))))
            and (exclude_re is None or not exclude_re.search(str(row.get("concept", ""))))
            and _row_amount(row) is not None
        ]
        return matches[0] if matches else None

    used_concepts: dict[str, str] = {}

    def item(name: str, pattern: str, treatment: str,
             label_pattern: str | None = None,
             exclude_pattern: str | None = None) -> dict[str, Any] | None:
        row = find(pattern, label_pattern, exclude_pattern)
        if row is None:
            return None
        concept = str(row.get("concept", ""))
        # INTENTIONAL: one XBRL concept can only fill one bridge category.
        # Prevent broad taxonomy patterns from assigning a row twice.
        if concept in used_concepts:
            return None
        used_concepts[concept] = name
        return {"item": name, "concept": concept, "label": row.get("label"),
                "amount": _row_amount(row), "treatment": treatment,
                "parent": row.get("parent_concept")}

    revenue = item(
        "revenue",
        r"(?:^|_)(?:RevenueFromContractWithCustomerExcludingAssessedTax|Revenues|Revenue)$",
        "anchor",
    )
    pretax = item(
        "pretax_income",
        r"(?:^|_)IncomeLossFromContinuingOperationsBeforeIncomeTaxes(?:ExtraordinaryItemsNoncontrollingInterest|MinorityInterestAndIncomeLossFromEquityMethodInvestments)?$",
        "reconciliation_anchor",
    )

    category_patterns = [
        ("cost_of_revenue", r"(?:^|_)(?:CostOfGoodsAndServicesSold|CostOfRevenue)$", "operating_candidate", None, None),
        ("selling_general_admin", r"(?:^|_)SellingGeneralAndAdministrativeExpense$", "operating_candidate", None, None),
        ("research_development", r"(?:^|_)ResearchAndDevelopmentExpense$", "operating_candidate", None, None),
        ("restructuring", r"(?:^|_)RestructuringCostsAndAssetImpairmentCharges$", "operating_candidate_review", None, None),
        ("financing_and_other", r"(?:^|_)FinancingInterestExpense$", "ambiguous_review", None, None),
        # Prefer the distinct interest-expense row by its statement label.
        # Exclude FinancingInterestExpense even though its concept contains
        # the suffix "InterestExpense".
        ("interest_expense", r"(?:^|_)(?:InterestIncomeExpenseNet|InterestExpense)$",
         "non_operating_candidate", r"^Interest expense$", r"FinancingInterestExpense"),
        # INTENTIONAL: EdgarTools may expose this as a generic NonoperatingIncomeExpense concept.
        # Match the human-readable label independently of the taxonomy suffix, because
        # issuer presentation labels can be more specific than the XBRL concept name.
        ("pension_non_service", r".*", "non_operating_candidate", r"pension|postretirement|non.?service", None),
        ("other_expense", r"(?:^|_)OtherNonrecurringIncomeExpense$", "ambiguous_review", r"other expense", None),
    ]
    expenses = [
        entry for name, pattern, treatment, label_pattern, exclude_pattern in category_patterns
        if (entry := item(name, pattern, treatment, label_pattern, exclude_pattern))
    ]
    by_name = {entry["item"]: entry for entry in expenses}
    required = ["cost_of_revenue", "selling_general_admin", "research_development"]
    if revenue is None or pretax is None or any(name not in by_name for name in required):
        return {
            "status": "insufficient_rows", "revenue": revenue, "pretax_income": pretax,
            "expense_candidates": expenses,
            "unmatched_required": [name for name in (["revenue", "pretax_income"] if revenue is None or pretax is None else []) + required if name not in (["revenue"] if revenue else []) + (["pretax_income"] if pretax else []) + list(by_name)],
            "note": "Required non-dimensional statement rows were not all identified; no EBIT candidate calculated.",
        }

    # INTENTIONAL: these alternative scenarios are diagnostic only. Rows with
    # uncertain presentation are not silently assigned to operating/non-operating.
    core_names = required + (["restructuring"] if "restructuring" in by_name else [])
    core_total = sum(by_name[name]["amount"] for name in core_names)
    financing = by_name.get("financing_and_other", {}).get("amount", 0.0)
    interest = by_name.get("interest_expense", {}).get("amount", 0.0)
    pension_entry = by_name.get("pension_non_service")
    pension = pension_entry["amount"] if pension_entry else 0.0
    other = by_name.get("other_expense", {}).get("amount", 0.0)
    # INTENTIONAL: do not silently treat a missing pension/non-operating row as zero.
    # Keep the arithmetic visible, but mark the scenario incomplete and expose the gap.
    missing_adjustments = [name for name in ("interest_expense", "pension_non_service", "other_expense") if name not in by_name]
    scenarios = []
    for scenario, include_financing in [
        ("financing_cost_treated_as_operating", True),
        ("financing_cost_treated_as_non_operating", False),
    ]:
        candidate = revenue["amount"] - core_total - (financing if include_financing else 0.0)
        nonop_adjustments = interest + pension + other + (0.0 if include_financing else financing)
        reconstructed = candidate - nonop_adjustments
        scenarios.append({
            "scenario": scenario,
            "candidate_operating_income": round(candidate, 2),
            "assumption": ("Cost of financing and other is operating" if include_financing else "Cost of financing and other is non-operating") + "; assumes pension/postretirement and other expense are non-operating, and restructuring is operating",
            "classification_assumptions": {
                "financing_and_other": "operating" if include_financing else "non_operating",
                "interest_expense": "non_operating",
                "pension_non_service": "non_operating",
                "other_expense": "non_operating_review_required",
                "restructuring": "operating_review_required",
            },
            "non_operating_adjustments": round(nonop_adjustments, 2),
            "reconstructed_pretax_income": round(reconstructed, 2),
            "reported_pretax_income": pretax["amount"],
            "reconciliation_difference": round(reconstructed - pretax["amount"], 2),
            "reconciles_within_1": abs(reconstructed - pretax["amount"]) <= 1.0 if not missing_adjustments else None,
            "missing_adjustments": missing_adjustments,
            "status": "review_required" if not missing_adjustments else "missing_adjustment_rows",
        })
    return {
        "status": "review_required", "revenue": revenue, "pretax_income": pretax,
        "operating_expense_candidates": [by_name[name] for name in core_names],
        "ambiguous_expense_candidates": [by_name[name] for name in ("financing_and_other", "other_expense") if name in by_name],
        "non_operating_candidates": [by_name[name] for name in ("interest_expense", "pension_non_service") if name in by_name],
        "missing_adjustments": missing_adjustments,
        "scenarios": scenarios,
        "guardrail": "Reconciliation does not prove classification. Review filing presentation and notes; never promote this candidate automatically into production EBIT.",
    }


def statement_fact_amount(
    statements: dict[str, Any], statement_name: str, concept_suffix: str,
    label_pattern: str, period: str,
) -> float | None:
    statement = statements.get(statement_name) or {}
    label_re = re.compile(label_pattern, re.IGNORECASE)
    matches = [
        row for row in statement.get("rows", [])
        if row.get("dimension") is False
        and not row.get("abstract")
        and str(row.get("concept", "")).endswith(concept_suffix)
        and label_re.search(str(row.get("label", "")))
    ]
    # INTENTIONAL: filing review facts require an exact statement label and
    # fiscal-period key. Never pick the first annual column or a dimensional row.
    if len(matches) != 1:
        return None
    values = matches[0].get("values") or {}
    for key, value in values.items():
        if str(key).startswith(period) and isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
    return None



def balance_sheet_review(
    statements: dict[str, Any], period: str,
    current_debt_concept: str, noncurrent_debt_concept: str,
) -> dict[str, Any]:
    current_assets = statement_fact_amount(
        statements, "balance_sheet", "AssetsCurrent", r"^Total current assets$", period,
    )
    current_liabilities = statement_fact_amount(
        statements, "balance_sheet", "LiabilitiesCurrent", r"^Total current liabilities$", period,
    )
    cash = statement_fact_amount(
        statements, "balance_sheet", "CashAndCashEquivalentsAtCarryingValue",
        r"^Cash and cash equivalents$", period,
    )
    ppe = statement_fact_amount(
        statements, "balance_sheet", "PropertyPlantAndEquipmentNet",
        r"^Property and equipment", period,
    )
    current_debt = statement_fact_amount(
        statements, "balance_sheet", current_debt_concept, r"^(?:Current portion of long-term debt|Debt)$", period,
    )
    noncurrent_debt = statement_fact_amount(
        statements, "balance_sheet", noncurrent_debt_concept, r"^(?:Long-term debt|Debt)$", period,
    )
    values = {
        "current_assets": current_assets,
        "current_liabilities": current_liabilities,
        "cash_and_cash_equivalents_excluding_restricted_cash": cash,
        "net_property_plant_and_equipment": ppe,
        "current_debt": current_debt,
        "noncurrent_debt": noncurrent_debt,
    }
    if any(value is None for value in values.values()):
        return {
            "status": "review_required",
            "inputs": values,
            "reason": "One or more exact, non-dimensional balance-sheet facts were not found for the selected fiscal period.",
        }
    total_debt = current_debt + noncurrent_debt
    working_capital = current_assets - current_liabilities
    invested_capital = working_capital + ppe
    return {
        "status": "review_only",
        "inputs": values,
        "total_debt_excluding_leases": round(total_debt, 2),
        "net_debt_excluding_leases": round(total_debt - cash, 2),
        "working_capital": round(working_capital, 2),
        "invested_capital_current_assets_less_current_liabilities_plus_net_ppe": round(invested_capital, 2),
        "guardrail": "Balance-sheet inputs are review-only. Lease liabilities and short-term investments are not included in this simple debt/cash comparison; confirm the production EV policy separately.",
    }

def balance_sheet_fact_review(statements: dict[str, Any], period: str) -> dict[str, Any]:
    """Expose issuer balance-sheet candidates without silently selecting accounting inputs."""
    statement = statements.get("balance_sheet") or {}
    rows = statement.get("rows", [])
    categories = {
        "cash_unrestricted_candidates": {
            "label": re.compile(r"cash and cash equivalents|^cash$", re.I),
            "concept": re.compile(r"CashAndCashEquivalentsAtCarryingValue|CashAndCashEquivalents$", re.I),
            "exclude": re.compile(r"\brestricted\b", re.I),
        },
        "cash_restricted_candidates": {
            "label": re.compile(r"restricted cash", re.I),
            "concept": re.compile(r"RestrictedCash", re.I),
        },
        "current_assets_candidates": {
            "label": re.compile(r"^total current assets$", re.I),
            "concept": re.compile(r"(?:^|_)AssetsCurrent$", re.I),
        },
        "current_liabilities_candidates": {
            "label": re.compile(r"^total current liabilities$", re.I),
            "concept": re.compile(r"(?:^|_)LiabilitiesCurrent$", re.I),
        },
        "net_ppe_candidates": {
            "label": re.compile(r"^(?:property|plant|fixed assets|rental property)", re.I),
            "concept": re.compile(r"PropertyPlantAndEquipment(?:Net)?$", re.I),
        },
        "current_debt_candidates": {
            "label": re.compile(r"current portion of .*debt|current maturities|debt,? current|short.?term borrowings|notes payable and short.?term borrowings", re.I),
            "concept": re.compile(r"(?:LongTermDebtCurrent|DebtCurrent|ShortTermBorrowings|CurrentBorrowings)$", re.I),
        },
        "noncurrent_debt_candidates": {
            "label": re.compile(r"^long.?term debt$|^debt,? noncurrent$|^interest-bearing loans and borrowings$|^non.?current borrowings$", re.I),
            "concept": re.compile(r"(?:LongTermDebtNoncurrent|LongTermDebt|LongtermBorrowings|NoncurrentBorrowings)$", re.I),
        },
        "current_lease_liability_candidates": {
            "label": re.compile(r"^(?!non.?current).*current.*lease liabilities?|^(?!non.?current).*lease liabilities?.*current", re.I),
            "concept": re.compile(r"(?:OperatingLeaseLiabilityCurrent|FinanceLeaseLiabilityCurrent|(?:^|_)CurrentLeaseLiabilities)$", re.I),
        },
        "noncurrent_lease_liability_candidates": {
            "label": re.compile(r"non.?current.*lease liabilities?|lease liabilities?.*non.?current", re.I),
            "concept": re.compile(r"(?:OperatingLeaseLiabilityNoncurrent|FinanceLeaseLiabilityNoncurrent|NoncurrentLeaseLiabilities)$", re.I),
        },
    }
    result: dict[str, Any] = {}
    for category, rules in categories.items():
        candidates = []
        for row in rows:
            label = str(row.get("label", "")).strip()
            concept = str(row.get("concept", ""))
            # INTENTIONAL: consolidated non-dimensional facts only. Dimensional
            # breakdowns are retained in statement rows but never mixed into totals.
            if row.get("dimension") is not False or row.get("abstract"):
                continue
            label_match = bool(rules["label"].search(label))
            concept_match = bool(rules["concept"].search(concept))
            if not (label_match or concept_match):
                continue
            if rules.get("exclude") and (rules["exclude"].search(label) or rules["exclude"].search(concept)):
                continue
            values = row.get("values") or {}
            value = values.get(period)
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                continue
            candidates.append({
                "concept": concept,
                "label": label,
                "fiscal_period": period,
                "value": value,
            })
        result[category] = {
            "status": "unique_candidate" if len(candidates) == 1 else (
                "ambiguous_candidates" if candidates else "not_found"
            ),
            "candidate_count": len(candidates),
            "candidates": candidates,
        }
    unresolved = [
        key for key, value in result.items()
        if value["status"] != "unique_candidate"
    ]
    # INTENTIONAL: label and taxonomy matching only surfaces candidates. It does
    # not resolve aggregate-vs-component debt, lease scope, restricted cash, or
    # issuer-specific PP&E overlap. No candidate is promoted into production.
    return {
        "status": "review_only" if not unresolved else "review_required",
        "fiscal_period": period,
        "categories": result,
        "unresolved_categories": unresolved,
        "guardrail": "Candidate extraction only. No value is selected for EV, invested capital, Earnings Yield or ROC. Review reporting currency, restricted cash, debt scope, leases, PP&E overlap and issuer presentation before use.",
    }


def filing_specific_review(
    symbol: str, filing: dict[str, Any], bridge: dict[str, Any],
    statements: dict[str, Any],
) -> dict[str, Any] | None:
    accession = str(filing.get("accession_number") or filing.get("accession_no") or filing.get("accession") or "")
    period = str(filing.get("period_of_report") or filing.get("report_date") or "")

    # INTENTIONAL: issuer/accession-specific review notes are manually scoped.
    # These are not reusable XBRL mappings and never feed production calculations.
    if symbol == "HRB" and accession == "0000012659-26-000026":
        revenue = statement_fact_amount(
            statements, "income_statement", "RevenueFromContractWithCustomerExcludingAssessedTax",
            r"^Revenues$", period,
        )
        operating_expenses = statement_fact_amount(
            statements, "income_statement", "CostsAndExpenses", r"^Total operating expenses$", period,
        )
        pretax = statement_fact_amount(
            statements, "income_statement",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
            r"^Income from continuing operations before income taxes$", period,
        )
        other_income = statement_fact_amount(
            statements, "income_statement", "OtherNonoperatingIncomeExpense",
            r"^Other income \(expense\), net$", period,
        )
        interest_signed = statement_fact_amount(
            statements, "income_statement", "InterestExpenseDebt",
            r"^Interest expense on borrowings$", period,
        )
        inputs = {
            "reported_revenue": revenue,
            "reported_total_operating_expenses": operating_expenses,
            "reported_pretax_income": pretax,
            "reported_other_income_expense_net": other_income,
            "reported_interest_expense_signed": interest_signed,
        }
        if any(value is None for value in inputs.values()):
            return {
                "status": "review_required", "filing_accession": accession,
                "source_context": "FY2026 Form 10-K, consolidated statement of income",
                "inputs": inputs,
                "reason": "One or more exact, non-dimensional statement facts were not found for the selected fiscal period.",
            }
        revenue_less_expenses = revenue - operating_expenses
        pretax_reconciliation = pretax - other_income - interest_signed
        return {
            "status": "review_only",
            "method": "statement_subtotal_reconstructed",
            "automation_status": "manual_review_only",
            "filing_accession": accession,
            "fiscal_period": period,
            "source_context": "FY2026 Form 10-K, consolidated statement of income and MD&A operating expense summary",
            **inputs,
            "ebit_candidate": round(revenue_less_expenses, 2),
            "cross_checks": {
                "revenue_less_total_operating_expenses": round(revenue_less_expenses, 2),
                "pretax_less_other_nonoperating_income_and_signed_interest": round(pretax_reconciliation, 2),
                "difference_between_methods": round(revenue_less_expenses - pretax_reconciliation, 2),
                "reconciles_within_1": abs(revenue_less_expenses - pretax_reconciliation) <= 1.0,
            },
            "formula": "reported revenue - reported total operating expenses",
            "classification_note": "The direct OperatingIncomeLoss row was not surfaced in EdgarTools, but the filing presents total operating expenses separately from other income (expense), net and interest expense. The operating subtotal is independently cross-checked from pretax income less non-operating income and signed interest expense. This is a filing-specific reconstruction, not a general tag mapping.",
            "balance_sheet_review": balance_sheet_review(statements, period, "LongTermDebtCurrent", "LongTermDebtNoncurrent"),
            "guardrail": "Filing-specific manual review only. Do not generalize this extraction or promote it into production fundamentals or rankings.",
        }

    if symbol == "ADBE" and accession == "0000796343-26-000003":
        direct_operating_income = statement_fact_amount(
            statements, "income_statement", "OperatingIncomeLoss", r"Operating income", period,
        )
        pretax = statement_fact_amount(
            statements, "income_statement",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
            r"^Income before income taxes$", period,
        )
        nonoperating_net = statement_fact_amount(
            statements, "income_statement", "NonoperatingIncomeExpense",
            r"^Total non-operating income \(expense\), net$", period,
        )
        inputs = {
            "reported_direct_operating_income": direct_operating_income,
            "reported_pretax_income": pretax,
            "reported_nonoperating_income_expense_net": nonoperating_net,
        }
        if any(value is None for value in inputs.values()):
            return {
                "status": "review_required", "filing_accession": accession,
                "source_context": "FY2025 Form 10-K, consolidated statement of income",
                "inputs": inputs,
                "reason": "One or more exact, non-dimensional statement facts were not found for the selected fiscal period.",
            }
        pretax_less_nonoperating = pretax - nonoperating_net
        return {
            "status": "review_only",
            "method": "direct_reported_operating_income",
            "automation_status": "direct_fact_control_only",
            "filing_accession": accession,
            "fiscal_period": period,
            "source_context": "FY2025 Form 10-K, consolidated statement of income and Note 18",
            **inputs,
            "ebit_candidate": round(direct_operating_income, 2),
            "cross_checks": {
                "pretax_less_nonoperating_income_expense": round(pretax_less_nonoperating, 2),
                "difference_from_direct_operating_income": round(direct_operating_income - pretax_less_nonoperating, 2),
                "reconciles_within_1": abs(direct_operating_income - pretax_less_nonoperating) <= 1.0,
            },
            "formula": "directly reported OperatingIncomeLoss; cross-checked as pretax income - net non-operating income",
            "classification_note": "The filing presents GAAP operating income directly and separately reports interest expense, investment gains and other non-operating income. This is the control case for direct operating-income extraction.",
            "balance_sheet_review": balance_sheet_review(statements, period, "DebtCurrent", "LongTermDebt"),
            "guardrail": "Filing-specific validation only. Do not treat this as approval of any broad taxonomy mapping or production update.",
        }

    # INTENTIONAL: the PBI note below is restricted to its exact 2025 10-K.
    # The filing allocates part of total interest expense into Cost of financing and other.
    if symbol != "PBI" or accession != "0001628280-26-009650":
        return None
    pretax_entry = bridge.get("pretax_income") or {}
    pretax_amount = pretax_entry.get("amount")
    if not isinstance(pretax_amount, (int, float)):
        return {"status": "review_required", "filing_accession": accession,
                "reason": "The filing-specific interest review requires a recognized pretax-income anchor."}
    reported_interest = 101_460_000.0
    consolidated_financing_cost = 61_503_000.0
    segment_financing_cost_ex_interest = 13_807_000.0
    allocated_finance_interest = consolidated_financing_cost - segment_financing_cost_ex_interest
    total_interest = reported_interest + allocated_finance_interest
    return {
        "status": "review_only",
        "method": "filing_specific_interest_reconciliation",
        "automation_status": "manual_review_only",
        "filing_accession": accession,
        "source_context": "2025 Form 10-K, Item 7 Segment Results and consolidated statement of operations",
        "reported_interest_expense_net": reported_interest,
        "consolidated_cost_of_financing_and_other": consolidated_financing_cost,
        "SendTech_segment_cost_of_financing_and_other_ex_allocated_interest": segment_financing_cost_ex_interest,
        "allocated_finance_interest_embedded_in_cost_of_financing": allocated_finance_interest,
        "total_interest_expense_for_EBIT_reconciliation": total_interest,
        "reported_pretax_income": float(pretax_amount),
        "ebit_candidate": round(float(pretax_amount + total_interest), 2),
        "formula": "reported pretax income + consolidated interest expense, including finance interest allocated into cost of financing",
        "classification_note": "The filing states that a portion of total interest expense is allocated to finance interest expense within Cost of financing and other. Therefore that full expense line must not be classified wholly as operating or wholly as non-operating. The $47.696M allocated component is inferred from consolidated financing cost less the segment cost excluding allocated finance interest.",
        "guardrail": "Filing-specific manual review only. Do not generalize these values or this extraction to other issuers/periods, and do not write production fundamentals or rankings.",
    }

def extract_company(symbol: str) -> dict[str, Any]:
    result: dict[str, Any] = {"symbol": symbol, "status": "error"}
    try:
        company = Company(symbol)
        # INTENTIONAL: mirror the annual filing families used by the SEC pipeline.
        # Foreign issuers commonly file 20-F or 40-F rather than domestic 10-K.
        annual_filings = []
        filing_lookup_errors = []
        for form in ("10-K", "20-F", "40-F"):
            try:
                annual_filings.extend(list(company.get_filings(form=form, amendments=False)))
            except Exception as lookup_error:
                filing_lookup_errors.append(f"{form}: {type(lookup_error).__name__}: {lookup_error}")
        if not annual_filings:
            detail = "; ".join(filing_lookup_errors) or "no matching annual filing"
            raise RuntimeError(f"No 10-K, 20-F or 40-F filing returned by EdgarTools ({detail})")
        filing = max(
            annual_filings,
            key=lambda item: str(getattr(item, "filing_date", "") or ""),
        )

        filing_obj = filing.obj()
        financials = getattr(filing_obj, "financials", None)
        financials_source = f"selected_{filing_metadata(filing).get('form', 'annual')}_filing"
        if financials is None:
            # INTENTIONAL FALLBACK: expose this clearly; don't silently claim
            # that a company-level financials object belongs to this accession.
            financials = company.get_financials()
            financials_source = "company_latest_annual_fallback"

        if financials is None:
            raise RuntimeError("EdgarTools returned no financial statements")

        result.update({
            "status": "extracted",
            "filing": filing_metadata(filing),
            "financials_source": financials_source,
            "statements": {
                "income_statement": statement_candidates(financials.income_statement()),
                "balance_sheet": statement_candidates(financials.balance_sheet()),
                "cash_flow_statement": statement_candidates(financials.cash_flow_statement()),
            },
            "ebit_bridge": None,
            "filing_specific_review": None,
            "review_notes": [
                "Each detailed statement row appears once; candidate=true marks rows matching the broad label filter.",
                "The EBIT bridge is assumption-based review output only; reconciliation does not prove accounting classification.",
                "No EBIT, debt, invested-capital, Earnings Yield, or ROC value is approved automatically.",
                "Confirm the statement fiscal period, filing form and accession before comparing values.",
                "Annual filing selection considers 10-K, 20-F and 40-F; interim 10-Q/6-K filings are intentionally excluded.",
                "Dimensional breakdowns and consolidated totals must not be added together without checking the filing presentation.",
                "Multiple PP&E concepts are shown separately; the script does not assume they are additive or non-overlapping.",
            ],
        })
        # INTENTIONAL: bridge candidates never enter production SEC ingestion,
        # ratios, eligibility decisions or Magic Formula ranking.
        result["ebit_bridge"] = build_ebit_bridge(result["statements"]["income_statement"])
        fiscal_period = str(result["filing"].get("period_of_report") or "")
        result["filing_specific_review"] = filing_specific_review(
            symbol, result["filing"], result["ebit_bridge"], result["statements"]
        )
        # INTENTIONAL: generalized balance-sheet candidates cover every extracted
        # issuer, including IFRS filers. This remains review-only and never feeds D1.
        result["balance_sheet_fact_review"] = balance_sheet_fact_review(
            result["statements"], fiscal_period
        )
        # INTENTIONAL: expose only an exact, consolidated OperatingIncomeLoss
        # fact for this annual period. This is diagnostic, not production EBIT.
        direct_operating_income = statement_fact_amount(
            result["statements"], "income_statement", "OperatingIncomeLoss",
            r"operating income|income.*from operations|operating profit|earnings from operations",
            fiscal_period,
        )
        result["direct_operating_income_review"] = {
            "status": "review_only" if direct_operating_income is not None else "review_required",
            "method": "direct_reported_operating_income" if direct_operating_income is not None else None,
            "automation_status": "direct_fact_review_only",
            "fiscal_period": fiscal_period,
            "ebit_candidate": direct_operating_income,
            "guardrail": "Exact non-dimensional OperatingIncomeLoss statement fact only; review fiscal period, currency, classification and filing before use. Never writes production ratios or rankings.",
        }
        if symbol == "SNDK":
            # INTENTIONAL: annotate the separation context; do not adjust reported EBIT.
            result["review_notes"].append(
                "Review pre/post-spin comparability: the issuer became independent on 2025-02-21; pre-spin historical statements were derived from WDC records."
            )
        if result["filing"].get("form") == "20-F" and direct_operating_income is None:
            # INTENTIONAL: absence of a US-GAAP OperatingIncomeLoss concept is
            # not zero. Review the issuer's IFRS presentation separately.
            result["review_notes"].append(
                "20-F statement extraction succeeded, but no direct US-GAAP OperatingIncomeLoss fact was surfaced; inspect IFRS line items and classification rather than treating EBIT as zero."
            )
    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
        # INTENTIONAL: an MFI OTC/foreign ticker may not be an SEC registrant.
        # Record this as a coverage outcome, not a failure of other issuers.
        if type(exc).__name__ == "CompanyNotFoundError":
            result["status"] = "not_found_in_sec_company_index"
    return result


def main() -> int:
    identity = os.environ.get("EDGAR_IDENTITY", "Magic Screen research support@binalah.co")
    set_identity(identity)

    raw_symbols = os.environ.get("BAKEOFF_SYMBOLS", ",".join(DEFAULT_SYMBOLS))
    symbols = tuple(dict.fromkeys(
        item.strip().upper() for item in raw_symbols.split(",") if item.strip()
    ))
    if not symbols or any(not re.fullmatch(r"[A-Z0-9.-]{1,12}", symbol) for symbol in symbols):
        raise ValueError("BAKEOFF_SYMBOLS must be a comma-separated list of valid ticker symbols")

    report = {
        "service": "Magic Screen EdgarTools bakeoff",
        "symbol_input": raw_symbols,
        "symbol_input_source": "workflow_dispatch_or_environment" if os.environ.get("BAKEOFF_SYMBOLS") else "default_control_cases",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "edgartools_version": None,
        "symbols": list(symbols),
        "production_data_modified": False,
        "companies": [],
    }
    try:
        from importlib.metadata import version
        report["edgartools_version"] = version("edgartools")
    except Exception:
        pass

    report["companies"] = [extract_company(symbol) for symbol in symbols]
    output = Path(os.environ.get("OUTPUT_PATH", "edgartools-bakeoff.json"))
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")

    for company in report["companies"]:
        print(f"{company['symbol']}: {company['status']}")
        if company.get("error"):
            print(f"  ERROR: {company['error']}")
        else:
            for name, statement in company["statements"].items():
                print(
                    f"  {name}: {statement.get('row_count', 0)} full rows, "
                    f"{statement.get('candidate_row_count', 0)} label candidates"
                )
            print(f"  filing metadata: {json.dumps(company.get('filing', {}), default=str)}")

    extracted = sum(item["status"] == "extracted" for item in report["companies"])
    coverage_gaps = sum(item["status"] == "not_found_in_sec_company_index" for item in report["companies"])
    unexpected_errors = sum(item["status"] == "error" for item in report["companies"])
    print(f"Summary: {extracted} extracted, {coverage_gaps} not in SEC company index, {unexpected_errors} unexpected errors")
    print(f"JSON report written to {output}")
    # INTENTIONAL: expected SEC coverage gaps stay visible but do not invalidate
    # successful extractions; unexpected errors still fail the workflow.
    return 1 if unexpected_errors else 0


if __name__ == "__main__":
    sys.exit(main())
