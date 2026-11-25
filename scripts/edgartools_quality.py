#!/usr/bin/env python3
"""Assess structural quality of normalized EdgarTools evidence.

This is a diagnostic report, not an accounting audit or production-data gate.
It never changes normalized metrics or production fundamentals.
"""
from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CORE_METRICS = {
    "income_statement": {"revenue", "operatingIncome", "netIncome"},
    "balance_sheet": {"totalAssets", "totalLiabilities"},
}
EXPECTED_METRICS = {
    "income_statement": {
        "revenue", "operatingIncome", "operatingExpenses", "netIncome",
        "incomeTaxExpense", "interestExpense",
    },
    "balance_sheet": {
        "cashAndEquivalents", "currentAssets", "currentLiabilities",
        "currentDebt", "longTermDebt", "accountsReceivable", "inventory",
        "propertyPlantEquipment", "totalAssets", "totalLiabilities",
    },
    # No cash-flow canonical tags are mapped yet. Do not report zero coverage
    # as a failure until those mappings are deliberately introduced.
    "cash_flow_statement": set(),
}
ALLOWED_STATEMENTS = set(EXPECTED_METRICS)
EXPECTED_PERIOD_TYPE = {
    "income_statement": "duration",
    "cash_flow_statement": "duration",
    "balance_sheet": "instant",
}


def valid_date(value: Any) -> bool:
    if not isinstance(value, str) or not DATE_RE.fullmatch(value):
        return False
    try:
        date.fromisoformat(value)
        return True
    except ValueError:
        return False


def assess_company(company: dict[str, Any]) -> dict[str, Any]:
    symbol = company.get("symbol") or "UNKNOWN"
    metrics = company.get("metrics") if isinstance(company.get("metrics"), list) else []
    warnings: list[str] = []
    errors: list[str] = []
    seen: set[tuple] = set()
    by_statement: dict[str, list[dict[str, Any]]] = defaultdict(list)
    metric_names: dict[str, set[str]] = defaultdict(set)
    periods: dict[str, set[str]] = defaultdict(set)
    currency_by_statement: dict[str, set[str]] = defaultdict(set)
    invalid_values = 0
    invalid_periods = 0
    duplicate_count = 0

    for index, metric in enumerate(metrics):
        if not isinstance(metric, dict):
            errors.append(f"metric_record_not_object:{index}")
            continue
        statement = metric.get("statement")
        name = metric.get("metric")
        period_end = metric.get("period_end")
        period_type = metric.get("period_type")
        key = (statement, name, period_end, period_type)
        if key in seen:
            duplicate_count += 1
            errors.append(f"duplicate_metric_key:{statement}:{name}:{period_end}")
        seen.add(key)

        if statement not in ALLOWED_STATEMENTS:
            errors.append(f"unknown_statement:{statement}")
            continue
        by_statement[statement].append(metric)
        if isinstance(name, str):
            metric_names[statement].add(name)
        if not valid_date(period_end):
            invalid_periods += 1
            errors.append(f"invalid_period_end:{statement}:{name}:{period_end}")
        else:
            periods[statement].add(period_end)
        if period_type != EXPECTED_PERIOD_TYPE[statement]:
            errors.append(f"period_type_mismatch:{statement}:{name}:{period_type}")
        value = metric.get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            invalid_values += 1
            errors.append(f"invalid_numeric_value:{statement}:{name}")
        currency = metric.get("currency")
        if currency is not None:
            if not isinstance(currency, str) or not re.fullmatch(r"[A-Z]{3}", currency):
                errors.append(f"invalid_currency_code:{statement}:{name}")
            else:
                currency_by_statement[statement].add(currency)

    if company.get("provider_status") != "supported":
        warnings.append(f"provider_status:{company.get('provider_status')}")
    if not isinstance(company.get("accession"), str) or not company.get("accession"):
        errors.append("missing_filing_accession")
    if not valid_date(company.get("fiscal_period")):
        warnings.append("missing_or_invalid_fiscal_period")
    if not metrics:
        warnings.append("no_normalized_metrics")

    coverage = {}
    for statement in sorted(ALLOWED_STATEMENTS):
        expected = EXPECTED_METRICS[statement]
        present = metric_names[statement]
        if not expected:
            coverage[statement] = {
                "status": "not_assessed",
                "reason": "No canonical metric mappings configured for this statement yet.",
                "expected_metrics": 0,
                "present_metrics": len(present),
                "missing_metrics": [],
                "coverage_pct": None,
                "period_count": len(periods[statement]),
            }
            continue
        missing = sorted(expected - present)
        core_missing = sorted(CORE_METRICS.get(statement, set()) - present)
        coverage[statement] = {
            "status": "warning" if missing else "complete",
            "expected_metrics": len(expected),
            "present_metrics": len(expected & present),
            "missing_metrics": missing,
            "core_missing_metrics": core_missing,
            "coverage_pct": round(100 * len(expected & present) / len(expected), 1),
            "period_count": len(periods[statement]),
        }
        if core_missing:
            warnings.append(f"missing_core_metrics:{statement}:{','.join(core_missing)}")
        elif missing:
            warnings.append(f"missing_optional_metrics:{statement}:{','.join(missing)}")

    # Compare only period end dates, never add or annualise duration values.
    duration_ends = periods["income_statement"]
    cashflow_ends = periods["cash_flow_statement"]
    instant_ends = periods["balance_sheet"]
    if duration_ends and instant_ends and max(duration_ends) != max(instant_ends):
        warnings.append("latest_income_and_balance_period_end_mismatch")
    if duration_ends and cashflow_ends and max(duration_ends) != max(cashflow_ends):
        warnings.append("latest_income_and_cashflow_period_end_mismatch")

    currency_sets = {key: sorted(value) for key, value in currency_by_statement.items()}
    if any(len(value) > 1 for value in currency_sets.values()):
        warnings.append("mixed_currency_codes_within_statement")
    if not any(currency_sets.values()):
        unit_currency_status = "unknown"
        warnings.append("currency_and_scale_not_verified")
    else:
        unit_currency_status = "partially_reported"
        warnings.append("currency_or_scale_requires_review")

    # Existing extraction rows do not reliably carry unit scale. Magnitude-based
    # USD/thousands/millions inference would be unsafe, especially for 20-F/40-F.
    quality_status = "insufficient_data" if not metrics else ("warning" if warnings or errors else "pass")
    return {
        "symbol": symbol,
        "provider_status": company.get("provider_status"),
        "accession": company.get("accession"),
        "form": company.get("form"),
        "fiscal_period": company.get("fiscal_period"),
        "quality_status": quality_status,
        "unit_currency_status": unit_currency_status,
        "summary": {
            "metric_records": len(metrics),
            "unique_metric_keys": len(seen),
            "duplicate_keys": duplicate_count,
            "invalid_values": invalid_values,
            "invalid_periods": invalid_periods,
            "currency_codes_by_statement": currency_sets,
            "period_ends_by_statement": {
                key: sorted(value) for key, value in periods.items()
            },
        },
        "coverage": coverage,
        "warnings": sorted(set(warnings)),
        "errors": sorted(set(errors)),
    }


def build_report(report: dict[str, Any]) -> dict[str, Any]:
    companies = report.get("companies") if isinstance(report.get("companies"), list) else []
    results = [assess_company(company) for company in companies if isinstance(company, dict)]
    counts = Counter(item["quality_status"] for item in results)
    return {
        "service": "Magic Folio EdgarTools data quality report",
        "schema_version": 1,
        "production_data_modified": False,
        "normalized_source_generated_at": report.get("source_report_generated_at"),
        "mapping_version": report.get("mapping_version"),
        "companies_assessed": len(results),
        "summary": {
            "pass": counts.get("pass", 0),
            "warning": counts.get("warning", 0),
            "insufficient_data": counts.get("insufficient_data", 0),
        },
        "limitations": [
            "Structural and coverage checks only; not an accounting audit.",
            "Currency and numeric scale are not inferred from value magnitude.",
            "Cash-flow coverage is not assessed until canonical cash-flow mappings exist.",
            "Missing optional line items may be legitimate issuer-specific reporting differences.",
        ],
        "companies": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="edgartools-normalized.json")
    parser.add_argument("--output", default="edgartools-quality.json")
    args = parser.parse_args()
    source = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if source.get("service") != "Magic Folio EdgarTools normalized analytics evidence":
        raise SystemExit("Input is not an EdgarTools normalized analytics report.")
    if source.get("production_data_modified") is not False:
        raise SystemExit("Normalized report failed production immutability guardrail.")
    report = build_report(source)
    Path(args.output).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\\n", encoding="utf-8")
    summary = report["summary"]
    print(
        "EdgarTools quality assessment: "
        f"{summary['pass']} pass, {summary['warning']} warning, "
        f"{summary['insufficient_data']} insufficient data"
    )
    print("Diagnostic only; no metrics were changed and no production data was modified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
