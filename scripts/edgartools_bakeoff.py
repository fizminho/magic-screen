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

SYMBOLS = ("HRB", "PBI", "ADBE")
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

    def find(pattern: str) -> dict[str, Any] | None:
        regex = re.compile(pattern, re.IGNORECASE)
        matches = [
            row for row in rows
            if not row.get("abstract") and not row.get("dimension")
            and regex.search(str(row.get("concept", ""))) and _row_amount(row) is not None
        ]
        return matches[0] if matches else None

    def item(name: str, pattern: str, treatment: str) -> dict[str, Any] | None:
        row = find(pattern)
        if row is None:
            return None
        return {"item": name, "concept": row.get("concept"), "label": row.get("label"),
                "amount": _row_amount(row), "treatment": treatment,
                "parent": row.get("parent_concept")}

    revenue = item("revenue", r"RevenueFromContractWithCustomerExcludingAssessedTax|^Revenues$", "anchor")
    if revenue is None:
        revenue = item("revenue", r"^Revenue$", "anchor")
    pretax = item("pretax_income", r"IncomeLossFromContinuingOperationsBeforeIncomeTaxes", "reconciliation_anchor")

    category_patterns = [
        ("cost_of_revenue", r"CostOfGoodsAndServicesSold|CostOfRevenue", "operating_candidate"),
        ("selling_general_admin", r"SellingGeneralAndAdministrativeExpense", "operating_candidate"),
        ("research_development", r"ResearchAndDevelopmentExpense", "operating_candidate"),
        ("restructuring", r"RestructuringCostsAndAssetImpairmentCharges|RestructuringCharges", "operating_candidate_review"),
        ("financing_and_other", r"FinancingInterestExpense", "ambiguous_review"),
        ("interest_expense", r"InterestIncomeExpenseNet|InterestExpense", "non_operating_candidate"),
        ("pension_non_service", r"NonoperatingIncomeExpense", "non_operating_candidate"),
        ("other_expense", r"OtherNonrecurringIncomeExpense", "ambiguous_review"),
    ]
    expenses = [entry for name, pattern, treatment in category_patterns
                if (entry := item(name, pattern, treatment))]
    by_name = {entry["item"]: entry for entry in expenses}
    required = ["cost_of_revenue", "selling_general_admin", "research_development"]
    if revenue is None or pretax is None or any(name not in by_name for name in required):
        return {"status": "insufficient_rows", "revenue": revenue, "pretax_income": pretax,
                "expense_candidates": expenses,
                "note": "Required non-dimensional rows were not all identified; no EBIT candidate calculated."}

    # INTENTIONAL: the EdgarTools statement values are treated as positive
    # expense magnitudes for these review scenarios only, never as production facts.
    core_names = required + (["restructuring"] if "restructuring" in by_name else [])
    core_total = sum(by_name[name]["amount"] for name in core_names)
    financing = by_name.get("financing_and_other", {}).get("amount", 0.0)
    nonop_names = ["interest_expense", "pension_non_service", "other_expense"]
    nonop_total = sum(by_name[name]["amount"] for name in nonop_names if name in by_name)
    scenarios = []
    for scenario, include_financing in [
        ("financing_cost_treated_as_operating", True),
        ("financing_cost_treated_as_non_operating", False),
    ]:
        candidate = revenue["amount"] - core_total - (financing if include_financing else 0.0)
        reconciliation = candidate - nonop_total - (0.0 if include_financing else financing)
        scenarios.append({
            "scenario": scenario,
            "candidate_operating_income": round(candidate, 2),
            "assumption": "Cost of financing and other is operating" if include_financing else "Cost of financing and other is non-operating",
            "non_operating_adjustments": nonop_total + (0.0 if include_financing else financing),
            "reconstructed_pretax_income": round(reconciliation, 2),
            "reported_pretax_income": pretax["amount"],
            "reconciles_within_1": abs(reconciliation - pretax["amount"]) <= 1.0,
            "status": "review_required",
        })
    return {
        "status": "review_required", "revenue": revenue, "pretax_income": pretax,
        "operating_expense_candidates": [by_name[name] for name in core_names],
        "ambiguous_expense_candidates": [by_name[name] for name in ("financing_and_other", "other_expense") if name in by_name],
        "non_operating_candidates": [by_name[name] for name in ("interest_expense", "pension_non_service") if name in by_name],
        "scenarios": scenarios,
        "guardrail": "Reconciliation does not prove classification. Review filing presentation and notes; never promote this candidate automatically into production EBIT.",
    }


def extract_company(symbol: str) -> dict[str, Any]:
    result: dict[str, Any] = {"symbol": symbol, "status": "error"}
    try:
        company = Company(symbol)
        filings = company.get_filings(form="10-K", amendments=False)
        filing = filings.latest()
        if filing is None:
            raise RuntimeError("No 10-K filing returned by EdgarTools")

        filing_obj = filing.obj()
        financials = getattr(filing_obj, "financials", None)
        financials_source = "selected_10k_filing"
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
            "review_notes": [
                "Each detailed statement row appears once; candidate=true marks rows matching the broad label filter.",
                "The EBIT bridge is assumption-based review output only; reconciliation does not prove accounting classification.",
                "No EBIT, debt, invested-capital, Earnings Yield, or ROC value is approved automatically.",
                "Confirm the statement fiscal period and filing accession before comparing values.",
                "Dimensional breakdowns and consolidated totals must not be added together without checking the filing presentation.",
                "Multiple PP&E concepts are shown separately; the script does not assume they are additive or non-overlapping.",
            ],
        })
        # INTENTIONAL: bridge candidates never enter production SEC ingestion,
        # ratios, eligibility decisions or Magic Formula ranking.
        result["ebit_bridge"] = build_ebit_bridge(result["statements"]["income_statement"])
    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
    return result


def main() -> int:
    identity = os.environ.get("EDGAR_IDENTITY", "Magic Screen research support@binalah.co")
    set_identity(identity)

    report = {
        "service": "Magic Screen EdgarTools bakeoff",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "edgartools_version": None,
        "symbols": list(SYMBOLS),
        "production_data_modified": False,
        "companies": [],
    }
    try:
        from importlib.metadata import version
        report["edgartools_version"] = version("edgartools")
    except Exception:
        pass

    report["companies"] = [extract_company(symbol) for symbol in SYMBOLS]
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

    print(f"JSON report written to {output}")
    return 0 if all(item["status"] == "extracted" for item in report["companies"]) else 1


if __name__ == "__main__":
    sys.exit(main())
