#!/usr/bin/env python3
"""Test-only EdgarTools extraction for Magic Screen's SEC fundamentals bakeoff.

INTENTIONAL: this script only reads SEC filings and writes a local JSON artifact.
It never calls Magic Screen APIs, writes D1, calculates production ratios, or ranks stocks.
"""
from __future__ import annotations

import json
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
    """Convert pandas/numpy/date values into JSON-safe primitives."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
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
        return {"available": False, "rows": [], "error": "Statement unavailable"}
    try:
        frame = statement.to_dataframe(view="detailed")
        # Keep the original row labels/concepts and period columns. This is a
        # review artifact, not an automatic accounting-tag mapping.
        frame = frame.reset_index()
        rows: list[dict[str, Any]] = []
        for record in frame.to_dict(orient="records"):
            clean = {str(key): safe_value(value) for key, value in record.items()}
            searchable = " ".join(str(value) for value in clean.values() if value is not None)
            if ROW_PATTERN.search(searchable):
                rows.append(clean)
        return {"available": True, "candidate_row_count": len(rows), "rows": rows}
    except Exception as exc:
        return {"available": False, "rows": [], "error": f"{type(exc).__name__}: {exc}"}


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
                "Candidate rows are selected by label text for human review only.",
                "No EBIT, debt, invested-capital, Earnings Yield, or ROC value is approved automatically.",
                "Confirm the statement fiscal period and filing accession before comparing values.",
                "A missing candidate row means only that this label filter did not find it; inspect the full filing before treating a fact as absent.",
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
                print(f"  {name}: {statement.get('candidate_row_count', 0)} candidate rows")
            print(f"  filing metadata: {json.dumps(company.get('filing', {}), default=str)}")

    print(f"JSON report written to {output}")
    return 0 if all(item["status"] == "extracted" for item in report["companies"]) else 1


if __name__ == "__main__":
    sys.exit(main())
