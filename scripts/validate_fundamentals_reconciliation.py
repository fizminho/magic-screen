#!/usr/bin/env python3
"""Validate a read-only legacy-versus-EdgarTools reconciliation preview."""
from __future__ import annotations
import argparse, json
from pathlib import Path
from typing import Any

FIELD_MAP = {
    "ebit": ("ebit", "ebit_candidate"),
    "invested_capital": ("invested_capital", "invested_capital_candidate"),
    "gross_debt": ("gross_debt", "gross_debt_candidate"),
    "cash": ("cash", "unrestricted_cash_candidate"),
}

def validate(report: dict[str, Any]) -> list[str]:
    errors=[]
    rows=report.get("rows")
    if not isinstance(rows,list): return ["rows must be an array"]
    symbols=[str(row.get("symbol","")).upper() for row in rows]
    if any(not symbol for symbol in symbols): errors.append("every row must have a symbol")
    if len(symbols)!=len(set(symbols)): errors.append("reconciliation contains duplicate symbols")
    for field in ("production_fundamentals_changed","rankings_changed","production_write"):
        if report.get(field) is not False: errors.append(f"report must confirm {field}=false")
    summary=report.get("summary") or {}
    if summary.get("universe")!=len(rows): errors.append("summary universe does not match row count")
    supported=[r for r in rows if (r.get("edgartools") or {}).get("provider_status")=="supported"]
    expected={
      "legacy_calculated":sum((r.get("legacy") or {}).get("status")=="calculated" for r in rows),
      "edgartools_supported":len(supported),
      "period_matched":sum(r.get("period_match") is True for r in rows),
      "period_mismatched":sum("fiscal_period_mismatch" in (r.get("mismatch_reasons") or []) for r in rows),
      "metrics_comparable":sum(r.get("metrics_comparable") is True for r in rows),
      "rows_with_input_differences":sum(r.get("has_input_differences") is True for r in rows),
      "partial_input_comparison_rows":sum(bool(r.get("partial_input_deltas")) and any(v is not None for v in r["partial_input_deltas"].values()) for r in rows),
      "rows_with_partial_input_differences":sum(r.get("has_partial_input_differences") is True for r in rows),
      "legacy_debt_missing_supported":sum((r.get("legacy") or {}).get("gross_debt") is None for r in supported),
    }
    for key,value in expected.items():
        if summary.get(key)!=value: errors.append(f"summary {key} does not reconcile to rows")
    for output_name,(legacy_field,edgar_field) in FIELD_MAP.items():
        legacy_count=sum((r.get("legacy") or {}).get(legacy_field) is not None for r in supported)
        edgar_count=sum((r.get("edgartools") or {}).get(edgar_field) is not None for r in supported)
        if (summary.get("legacy_field_coverage") or {}).get(output_name)!=legacy_count:
            errors.append(f"legacy {output_name} field coverage does not reconcile")
        if (summary.get("edgartools_field_coverage") or {}).get(output_name)!=edgar_count:
            errors.append(f"EdgarTools {output_name} field coverage does not reconcile")
    for row in rows:
        symbol=str(row.get("symbol","UNKNOWN")); legacy=row.get("legacy") or {}; edgar=row.get("edgartools") or {}
        comparable=row.get("metrics_comparable") is True
        partial=row.get("partial_input_deltas")
        if row.get("production_approved") is not False or row.get("production_write") is not False:
            errors.append(f"{symbol}: row must remain review-only")
        if legacy.get("accession_available") is not False: errors.append(f"{symbol}: legacy accession availability must be explicit")
        if edgar.get("provider_status")=="unsupported_provider" and comparable:
            errors.append(f"{symbol}: unsupported provider cannot be directly comparable")
        if comparable:
            if row.get("period_match") is not True: errors.append(f"{symbol}: comparable row must have matching fiscal periods")
            if not isinstance(legacy.get("metrics"),dict) or not isinstance(edgar.get("metrics"),dict):
                errors.append(f"{symbol}: comparable row is missing metric sets")
            if not isinstance(row.get("input_deltas"),dict) or not isinstance(row.get("metric_deltas"),dict):
                errors.append(f"{symbol}: comparable row is missing deltas")
        elif row.get("metric_deltas") is not None or row.get("input_deltas") is not None:
            errors.append(f"{symbol}: non-comparable row must not publish full metric deltas")
        if partial is not None and row.get("period_match") is not True:
            errors.append(f"{symbol}: partial input deltas require matching fiscal periods")
        if row.get("has_partial_input_differences") is True and not isinstance(partial,dict):
            errors.append(f"{symbol}: partial difference flag requires partial input deltas")
    return errors

def main()->int:
    parser=argparse.ArgumentParser();parser.add_argument("report",type=Path);args=parser.parse_args()
    report=json.loads(args.report.read_text());errors=validate(report)
    if errors:
        for error in errors: print(f"ERROR: {error}")
        return 1
    print("Validated read-only reconciliation:",report.get("summary",{}));return 0

if __name__=="__main__": raise SystemExit(main())
