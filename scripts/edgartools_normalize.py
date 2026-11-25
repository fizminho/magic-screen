#!/usr/bin/env python3
"""Build stable, analytics-ready metrics from EdgarTools filing statements.

The normalized output is isolated evidence. It is not a production fundamentals feed.
"""
from __future__ import annotations
import argparse, json, re
from pathlib import Path
from typing import Any

PERIOD_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})(?: \((FY|Q[1-4])\))?$")
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
STATEMENT_PERIODS = {"income_statement": "duration", "cash_flow_statement": "duration", "balance_sheet": "instant"}

def concept_tag(value: Any) -> str | None:
    return value.rsplit("_", 1)[-1] if isinstance(value, str) else None

def normalize_company(company: dict[str, Any]) -> dict[str, Any]:
    filing = company.get("filing") or {}
    records = []
    warnings = []
    for statement_name, statement in (company.get("statements") or {}).items():
        period_type = STATEMENT_PERIODS.get(statement_name)
        if not period_type or not statement.get("available"):
            continue
        for row in statement.get("rows") or []:
            if row.get("abstract") or row.get("dimension") or row.get("is_breakdown"):
                continue
            metric = TAG_TO_METRIC.get(concept_tag(row.get("concept")))
            if not metric or (metric == "cashAndEquivalents" and statement_name != "balance_sheet"):
                continue
            for column, value in row.items():
                match = PERIOD_RE.fullmatch(column)
                if not match or not isinstance(value, (int, float)) or isinstance(value, bool):
                    continue
                end, fiscal_label = match.groups()
                records.append({
                    "statement": statement_name,
                    "metric": metric,
                    "period_end": end,
                    "period_type": period_type,
                    "fiscal_label": fiscal_label,
                    "value": value,
                    # EdgarTools dataframe values do not expose a reliable currency unit.
                    # Never label foreign issuer values USD by assumption.
                    "currency": None,
                    "source_concept": row.get("concept"),
                    "source_label": row.get("label"),
                    "standard_concept": row.get("standard_concept"),
                    "balance": row.get("balance"),
                })
    # Deterministic de-duplication: prefer rows with a canonical standard_concept.
    selected = {}
    for item in records:
        key = (item["statement"], item["metric"], item["period_end"], item["period_type"])
        previous = selected.get(key)
        if previous is None or (not previous.get("standard_concept") and item.get("standard_concept")):
            selected[key] = item
        else:
            warnings.append(f"duplicate:{key[0]}:{key[1]}:{key[2]}")
    return {
        "symbol": company.get("symbol"),
        "provider_status": company.get("provider_status"),
        "accession": filing.get("accession_number"),
        "form": filing.get("form"),
        "filed_at": filing.get("filing_date"),
        "fiscal_period": filing.get("period_of_report"),
        "mapping_version": 2,
        "metrics": sorted(selected.values(), key=lambda x: (x["period_end"], x["statement"], x["metric"]), reverse=True),
        "warnings": sorted(set(warnings)),
    }

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="edgartools-shadow.json")
    parser.add_argument("--output", default="edgartools-normalized.json")
    args = parser.parse_args()
    report = json.loads(Path(args.input).read_text(encoding="utf-8"))
    companies = [normalize_company(x) for x in report.get("companies", [])]
    output = {
        "service": "Magic Folio EdgarTools normalized analytics evidence",
        "schema_version": 1,
        "mapping_version": 2,
        "production_data_modified": False,
        "source_report_generated_at": report.get("generated_at"),
        "edgartools_version": report.get("edgartools_version"),
        "companies": companies,
    }
    Path(args.output).write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    count = sum(len(x["metrics"]) for x in companies)
    print(f"Normalized {len(companies)} companies into {count} analytics metric records.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
