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


def statement_candidates(statement: Any) -> dict[str, Any]:
    if statement is None:
        return {
            "available": False,
            "row_count": 0,
            "candidate_row_count": 0,
            "all_rows": [],
            "rows": [],
            "error": "Statement unavailable",
        }
    try:
        frame = statement.to_dataframe(view="detailed").reset_index()
        all_rows: list[dict[str, Any]] = []
        candidate_rows: list[dict[str, Any]] = []
        for record in frame.to_dict(orient="records"):
            clean = {str(key): safe_value(value) for key, value in record.items()}
            all_rows.append(clean)
            searchable = " ".join(str(value) for value in clean.values() if value is not None)
            if ROW_PATTERN.search(searchable):
                candidate_rows.append(clean)

        # INTENTIONAL: retain the full statement alongside the label-filtered
        # subset. Label filtering is useful for navigation but can hide EBIT
        # subtotals or issuer-specific labels. Neither collection is a mapping.
        return {
            "available": True,
            "row_count": len(all_rows),
            "candidate_row_count": len(candidate_rows),
            "all_rows": all_rows,
            "rows": candidate_rows,
        }
    except Exception as exc:
        return {
            "available": False,
            "row_count": 0,
            "candidate_row_count": 0,
            "all_rows": [],
            "rows": [],
            "error": f"{type(exc).__name__}: {exc}",
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

        metrics: Any = None
        metrics_error: str | None = None
        try:
            metrics = financials.get_financial_metrics(include_periods=True)
        except Exception as exc:
            metrics_error = f"{type(exc).__name__}: {exc}"

        result.update({
            "status": "extracted",
            "filing": filing_metadata(filing),
            "financials_source": financials_source,
            "metrics": safe_value(metrics),
            "metrics_error": metrics_error,
            "statements": {
                "income_statement": statement_candidates(financials.income_statement()),
                "balance_sheet": statement_candidates(financials.balance_sheet()),
                "cash_flow_statement": statement_candidates(financials.cash_flow_statement()),
            },
            "review_notes": [
                "Full statement rows are included so label filtering cannot hide an income-statement subtotal.",
                "The rows field remains a label-filtered convenience subset; all_rows is the complete detailed statement returned by EdgarTools.",
                "No EBIT, debt, invested-capital, Earnings Yield, or ROC value is approved automatically.",
                "Confirm the statement fiscal period and filing accession before comparing values.",
                "Dimensional breakdowns and consolidated totals must not be added together without checking the filing presentation.",
                "Multiple PP&E concepts are shown separately; the script does not assume they are additive or non-overlapping.",
            ],
        })
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
