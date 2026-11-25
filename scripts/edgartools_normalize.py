#!/usr/bin/env python3
"""Normalize EdgarTools statement rows to Magic Folio SEC CompanyFacts keys.

Shadow-only: this module does not write to D1 or production fundamentals.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

PERIOD_RE = re.compile(r"^(\\d{4}-\\d{2}-\\d{2})(?: \\((FY|Q[1-4])\\))?$")

# Keep these keys and tag aliases aligned with worker/lib/sec-companyfacts.mjs.
METRIC_TAGS = {
    "revenue": {"RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"},
    "operatingIncome": {"OperatingIncomeLoss"},
    "operatingExpenses": {"OperatingExpenses", "OperatingCostsAndExpenses", "CostsAndExpenses"},
    "netIncome": {"NetIncomeLoss"},
    "incomeTaxExpense": {"IncomeTaxExpenseBenefit"},
    "interestExpense": {"InterestExpenseNonOperating", "InterestAndDebtExpense"},
    "cashAndEquivalents": {"CashAndCashEquivalentsAtCarryingValue"},
    "currentAssets": {"AssetsCurrent"},
    "currentLiabilities": {"LiabilitiesCurrent"},
    "currentDebt": {"LongTermDebtCurrent", "LongTermDebtAndFinanceLeaseObligationsCurrent", "ShortTermBorrowings"},
    "longTermDebt": {"LongTermDebtNoncurrent", "LongTermDebtAndFinanceLeaseObligationsNoncurrent", "LongTermDebt"},
    "accountsReceivable": {"AccountsReceivableNetCurrent"},
    "inventory": {"InventoryNet"},
    "propertyPlantEquipment": {"PropertyPlantAndEquipmentNet"},
    "totalAssets": {"Assets"},
    "totalLiabilities": {"Liabilities"},
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
            for column, value in row.items():
                match = PERIOD_RE.fullmatch(column)
                if not match or not isinstance(value, (int, float)) or isinstance(value, bool):
                    continue
                period_end, fiscal_label = match.groups()
                period_type = "duration" if statement_name != "balance_sheet" else "instant"
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


def compare_companyfacts(normalized: dict[str, Any], sec_payload: dict[str, Any]) -> dict[str, Any]:
    """Compare normalized values with the app's parsed SEC CompanyFacts response shape."""
    accession = (normalized.get("filing") or {}).get("accession_number")
    sec_filing = next((x for x in sec_payload.get("facts", []) if x.get("accessionNumber") == accession), None)
    if not sec_filing:
        return {"status": "no_matching_accession", "accession": accession, "matched": 0, "mismatches": []}

    comparisons = []
    for statement in normalized.get("statements", {}).values():
        for period in statement.get("periods", []):
            for metric, item in period.get("metrics", {}).items():
                sec_fact = (sec_filing.get("facts") or {}).get(metric)
                if not sec_fact or sec_fact.get("end") != period["period_end"]:
                    continue
                sec_value = sec_fact.get("value")
                comparisons.append({
                    "metric": metric,
                    "period_end": period["period_end"],
                    "edgartools_value": item["value"],
                    "sec_companyfacts_value": sec_value,
                    "match": sec_value == item["value"],
                })
    mismatches = [x for x in comparisons if not x["match"]]
    return {
        "status": "compared",
        "accession": accession,
        "matched": len(comparisons),
        "mismatch_count": len(mismatches),
        "mismatches": mismatches,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="edgartools-shadow.json")
    parser.add_argument("--output", default="edgartools-normalized.json")
    parser.add_argument("--sec-companyfacts", help="Optional saved /api/sec/companyfacts response JSON")
    args = parser.parse_args()

    report = json.loads(Path(args.input).read_text(encoding="utf-8"))
    normalized = {
        "service": "Magic Folio EdgarTools normalized shadow evidence",
        "production_data_modified": False,
        "source_report_generated_at": report.get("generated_at"),
        "edgartools_version": report.get("edgartools_version"),
        "companies": [normalize_company(x) for x in report.get("companies", [])],
    }
    if args.sec_companyfacts:
        sec_payload = json.loads(Path(args.sec_companyfacts).read_text(encoding="utf-8"))
        for company in normalized["companies"]:
            company["sec_companyfacts_comparison"] = compare_companyfacts(company, sec_payload)

    Path(args.output).write_text(json.dumps(normalized, indent=2, ensure_ascii=False) + "\\n", encoding="utf-8")
    mapped = sum(
        len(period["metrics"])
        for company in normalized["companies"]
        for statement in company["statements"].values()
        for period in statement.get("periods", [])
    )
    print(f"Normalized {len(normalized['companies'])} companies; mapped {mapped} canonical SEC metrics.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
