#!/usr/bin/env python3
"""Extract latest annual issuer statements with EdgarTools into a raw shadow artifact.

This script does not calculate ratios, write production fundamentals, or rank securities.
"""
from __future__ import annotations
import json
import math
import os
import re
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
from typing import Any

from edgar import Company, set_identity

FORMS = ("10-K", "20-F", "40-F")
SYMBOL_RE = re.compile(r"^[A-Z0-9.-]{1,15}$")

def safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if hasattr(value, "item"):
        try: return safe(value.item())
        except Exception: pass
    if hasattr(value, "isoformat"):
        try: return value.isoformat()
        except Exception: pass
    try:
        import pandas as pd
        if pd.isna(value): return None
    except (ImportError, TypeError, ValueError):
        pass
    return str(value)

def metadata(filing: Any) -> dict[str, Any]:
    result = {}
    for key in ("accession_number", "filing_date", "period_of_report", "form", "company"):
        try:
            value = getattr(filing, key, None)
            if value is not None and not callable(value): result[key] = safe(value)
        except Exception:
            continue
    return result

def extract_statement(statement: Any) -> dict[str, Any]:
    if statement is None:
        return {"available": False, "row_count": 0, "rows": [], "error": "Statement unavailable"}
    try:
        frame = statement.to_dataframe(view="detailed").reset_index()
        rows = []
        for record in frame.to_dict(orient="records"):
            row = {str(key): safe(value) for key, value in record.items() if value is not None}
            rows.append(row)
            if len(rows) >= 500: break
        return {"available": True, "row_count": len(rows), "truncated": len(frame.index) > len(rows), "rows": rows}
    except Exception as exc:
        return {"available": False, "row_count": 0, "rows": [], "error": f"{type(exc).__name__}: {exc}"}

def extract(symbol: str) -> dict[str, Any]:
    result = {"symbol": symbol, "provider_status": "extraction_error", "provider": "EdgarTools"}
    try:
        company = Company(symbol)
        filings = []
        for form in FORMS:
            try: filings.extend(list(company.get_filings(form=form, amendments=False)))
            except Exception: continue
        if not filings:
            result.update(provider_status="unsupported_provider", error="No 10-K, 20-F or 40-F filing found")
            return result
        filing = max(filings, key=lambda item: str(getattr(item, "filing_date", "") or ""))
        obj = filing.obj()
        financials = getattr(obj, "financials", None)
        source = "selected_filing"
        if financials is None:
            financials = company.get_financials()
            source = "company_latest_financials_fallback"
        if financials is None:
            raise RuntimeError("EdgarTools returned no financial statements")
        result.update({
            "provider_status": "supported",
            "filing": metadata(filing),
            "financials_source": source,
            "statements": {
                "income_statement": extract_statement(financials.income_statement()),
                "balance_sheet": extract_statement(financials.balance_sheet()),
                "cash_flow_statement": extract_statement(financials.cash_flow_statement())
            },
            "guardrail": "Raw statement evidence only. No accounting approval, ratios, production writes, or rankings."
        })
    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"[:300]
        if type(exc).__name__ == "CompanyNotFoundError":
            result["provider_status"] = "unsupported_provider"
    return result

def main() -> int:
    identity = os.environ.get("EDGAR_IDENTITY", "").strip()
    if len(identity) < 12 or "@" not in identity or "\n" in identity or "\r" in identity:
        raise SystemExit("EDGAR_IDENTITY must contain the app name and a real contact email.")
    set_identity(identity)
    raw = os.environ.get("EDGARTOOLS_SYMBOLS", "")
    symbols = list(dict.fromkeys(x.strip().upper() for x in raw.split(",") if x.strip()))
    if not symbols or any(not SYMBOL_RE.fullmatch(x) for x in symbols):
        raise SystemExit("EDGARTOOLS_SYMBOLS must contain valid comma-separated US tickers.")
    report = {
        "service": "Magic Folio EdgarTools shadow extraction",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "edgartools_version": version("edgartools"),
        "primary_provider": "EdgarTools",
        "production_data_modified": False,
        "symbols": symbols,
        "companies": [extract(symbol) for symbol in symbols]
    }
    output = Path(os.environ.get("OUTPUT_PATH", "edgartools-shadow.json"))
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")
    supported = sum(x["provider_status"] == "supported" for x in report["companies"])
    unsupported = sum(x["provider_status"] == "unsupported_provider" for x in report["companies"])
    errors = sum(x["provider_status"] == "extraction_error" for x in report["companies"])
    print(f"EdgarTools shadow extraction: {supported} supported, {unsupported} unsupported, {errors} extraction errors")
    return 1 if errors else 0

if __name__ == "__main__":
    raise SystemExit(main())
