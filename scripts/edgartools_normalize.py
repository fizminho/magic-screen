#!/usr/bin/env python3
"""Normalize EdgarTools statement rows and compare them with official SEC CompanyFacts.

Shadow-only: this module does not write to D1 or production fundamentals.
"""
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

PERIOD_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})(?: \((FY|Q[1-4])\))?$")
SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_COMPANYFACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"

# Keep these keys and aliases aligned with worker/lib/sec-companyfacts.mjs.
METRIC_TAGS = {
    "revenue": ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
    "operatingIncome": ["OperatingIncomeLoss"],
    "operatingExpenses": ["OperatingExpenses", "OperatingCostsAndExpenses", "CostsAndExpenses"],
    "netIncome": ["NetIncomeLoss"],
    "incomeTaxExpense": ["IncomeTaxExpenseBenefit"],
    "interestExpense": ["InterestExpenseNonOperating", "InterestAndDebtExpense"],
    "cashAndEquivalents": ["CashAndCashEquivalentsAtCarryingValue"],
    "currentAssets": ["AssetsCurrent"],
    "currentLiabilities": ["LiabilitiesCurrent"],
    "currentDebt": ["LongTermDebtCurrent", "LongTermDebtAndFinanceLeaseObligationsCurrent", "ShortTermBorrowings"],
    "longTermDebt": ["LongTermDebtNoncurrent", "LongTermDebtAndFinanceLeaseObligationsNoncurrent", "LongTermDebt"],
    "accountsReceivable": ["AccountsReceivableNetCurrent"],
    "inventory": ["InventoryNet"],
    "propertyPlantEquipment": ["PropertyPlantAndEquipmentNet"],
    "totalAssets": ["Assets"],
    "totalLiabilities": ["Liabilities"],
}
TAG_TO_METRIC = {tag: key for key, tags in METRIC_TAGS.items() for tag in tags}


def concept_tag(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    return value.rsplit("_", 1)[-1]


def normalize_company(company: dict[str, Any]) -> dict[str, Any]:
    statements: dict[str, Any] = {}
    warnings: list[str] = []
    for statement_name, statement in (company.get("statements") or {}).items():
        if not statement.get("available"):
            statements[statement_name] = {"available": False, "periods": []}
            continue

        periods: dict[tuple[str, str], dict[str, Any]] = {}
        for row in statement.get("rows") or []:
            if row.get("abstract") or row.get("dimension") or row.get("is_breakdown"):
                continue
            metric = TAG_TO_METRIC.get(concept_tag(row.get("concept")))
            if not metric:
                continue
            if metric == "cashAndEquivalents" and statement_name != "balance_sheet":
                continue
            for column, value in row.items():
                match = PERIOD_RE.fullmatch(column)
                if not match or not isinstance(value, (int, float)) or isinstance(value, bool):
                    continue
                period_end, fiscal_label = match.groups()
                period_type = "instant" if statement_name == "balance_sheet" else "duration"
                key = (period_end, period_type)
                period = periods.setdefault(key, {
                    "period_end": period_end,
                    "period_type": period_type,
                    "fiscal_label": fiscal_label,
                    "metrics": {},
                })
                if metric in period["metrics"]:
                    warnings.append(f"{statement_name}:{period_end}:{metric}: duplicate mapping skipped")
                    continue
                period["metrics"][metric] = {
                    "value": value,
                    "unit": "USD",
                    "source_concept": row.get("concept"),
                    "source_label": row.get("label"),
                }

        statements[statement_name] = {
            "available": True,
            "periods": sorted(periods.values(), key=lambda x: x["period_end"], reverse=True),
        }

    return {
        "symbol": company.get("symbol"),
        "provider_status": company.get("provider_status"),
        "filing": company.get("filing"),
        "mapping_version": 1,
        "mapping_basis": "SEC CompanyFacts canonical keys and US-GAAP tag aliases",
        "statements": statements,
        "warnings": warnings,
    }


def sec_get_json(url: str, user_agent: str) -> Any:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": user_agent, "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_sec_companyfacts(symbols: list[str], user_agent: str) -> dict[str, dict[str, Any]]:
    if len(user_agent) < 12 or "@" not in user_agent or "\n" in user_agent or "\r" in user_agent:
        raise ValueError("SEC_EDGAR_IDENTITY must contain an app name and contact email.")
    ticker_data = sec_get_json(SEC_TICKERS_URL, user_agent)
    ticker_to_cik = {
        str(item.get("ticker", "")).upper(): str(item.get("cik_str", "")).zfill(10)
        for item in ticker_data.values()
        if isinstance(item, dict) and item.get("ticker") and item.get("cik_str") is not None
    }
    results: dict[str, dict[str, Any]] = {}
    for index, symbol in enumerate(symbols):
        cik = ticker_to_cik.get(symbol.upper())
        if not cik:
            results[symbol] = {"error": "ticker_not_found_in_sec_company_tickers"}
            continue
        try:
            if index:
                time.sleep(0.15)
            results[symbol] = sec_get_json(SEC_COMPANYFACTS_URL.format(cik=cik), user_agent)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            results[symbol] = {"error": f"sec_companyfacts_fetch_failed:{type(exc).__name__}"}
    return results


def duration_matches(fact: dict[str, Any], fiscal_label: str | None) -> bool:
    start = fact.get("start")
    end = fact.get("end")
    if not start or not end:
        return False
    try:
        from datetime import date
        days = (date.fromisoformat(end) - date.fromisoformat(start)).days
    except (TypeError, ValueError):
        return False
    if fiscal_label == "FY":
        return 300 <= days <= 400
    if fiscal_label and fiscal_label.startswith("Q"):
        return 70 <= days <= 110
    return True


def compare_companyfacts(normalized: dict[str, Any], sec_payload: dict[str, Any]) -> dict[str, Any]:
    """Compare normalized statement values to raw SEC CompanyFacts for the same accession."""
    accession = (normalized.get("filing") or {}).get("accession_number")
    if sec_payload.get("error"):
        return {"status": "fetch_error", "accession": accession, "error": sec_payload["error"], "matched": 0, "mismatch_count": 0, "comparisons": []}

    facts = sec_payload.get("facts", {}).get("us-gaap", {})
    comparisons: list[dict[str, Any]] = []
    missing: list[dict[str, str]] = []

    for statement in normalized.get("statements", {}).values():
        for period in statement.get("periods", []):
            for metric, item in period.get("metrics", {}).items():
                preferred_tag = concept_tag(item.get("source_concept"))
                tags = [preferred_tag] if preferred_tag in METRIC_TAGS.get(metric, []) else []
                tags.extend(tag for tag in METRIC_TAGS.get(metric, []) if tag not in tags)
                candidates: list[dict[str, Any]] = []
                for tag in tags:
                    entries = facts.get(tag, {}).get("units", {}).get("USD", [])
                    candidates = [
                        entry for entry in entries
                        if entry.get("accn") == accession
                        and entry.get("end") == period["period_end"]
                        and entry.get("form") == (normalized.get("filing") or {}).get("form")
                        and isinstance(entry.get("val"), (int, float))
                        and (
                            (period["period_type"] == "instant" and "start" not in entry)
                            or (period["period_type"] == "duration" and duration_matches(entry, period.get("fiscal_label")))
                        )
                    ]
                    if candidates:
                        break
                if not candidates:
                    missing.append({"metric": metric, "period_end": period["period_end"]})
                    continue
                # If duplicate contexts remain, prefer the longest duration for annual data.
                sec_fact = max(candidates, key=lambda x: x.get("start", ""))
                sec_value = sec_fact["val"]
                edgar_value = item["value"]
                difference = edgar_value - sec_value
                comparisons.append({
                    "metric": metric,
                    "period_end": period["period_end"],
                    "period_type": period["period_type"],
                    "edgartools_value": edgar_value,
                    "sec_companyfacts_value": sec_value,
                    "difference": difference,
                    "match": difference == 0,
                    "sec_tag": next((tag for tag in tags if sec_fact in facts.get(tag, {}).get("units", {}).get("USD", [])), None),
                })

    mismatches = [item for item in comparisons if not item["match"]]
    return {
        "status": "compared",
        "accession": accession,
        "matched": len(comparisons),
        "missing_in_sec_companyfacts": missing,
        "mismatch_count": len(mismatches),
        "comparisons": comparisons,
        "mismatches": mismatches,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="edgartools-shadow.json")
    parser.add_argument("--output", default="edgartools-normalized.json")
    parser.add_argument("--fetch-sec-companyfacts", action="store_true", help="Fetch official SEC CompanyFacts and compare each supported ticker.")
    parser.add_argument("--sec-edgar-identity", default=None, help="SEC User-Agent identity. Prefer SEC_EDGAR_IDENTITY environment variable.")
    args = parser.parse_args()

    report = json.loads(Path(args.input).read_text(encoding="utf-8"))
    companies = [normalize_company(x) for x in report.get("companies", [])]
    if args.fetch_sec_companyfacts:
        import os
        identity = args.sec_edgar_identity or os.environ.get("SEC_EDGAR_IDENTITY", "")
        symbols = [x["symbol"] for x in companies if x.get("provider_status") == "supported"]
        sec_payloads = fetch_sec_companyfacts(symbols, identity)
        for company in companies:
            if company.get("provider_status") == "supported":
                company["sec_companyfacts_comparison"] = compare_companyfacts(company, sec_payloads.get(company["symbol"], {"error": "missing_sec_companyfacts_payload"}))

    normalized = {
        "service": "Magic Folio EdgarTools normalized shadow evidence",
        "production_data_modified": False,
        "source_report_generated_at": report.get("generated_at"),
        "edgartools_version": report.get("edgartools_version"),
        "companies": companies,
    }
    Path(args.output).write_text(json.dumps(normalized, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    mapped = sum(
        len(period["metrics"])
        for company in normalized["companies"]
        for statement in company["statements"].values()
        for period in statement.get("periods", [])
    )
    compared = sum(
        company.get("sec_companyfacts_comparison", {}).get("matched", 0)
        for company in companies
    )
    print(f"Normalized {len(companies)} companies; mapped {mapped} canonical SEC metrics; compared {compared} values.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
