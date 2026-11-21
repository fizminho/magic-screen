#!/usr/bin/env python3
"""Validate a read-only legacy-versus-EdgarTools reconciliation preview."""
from __future__ import annotations
import argparse, json
from pathlib import Path
from typing import Any

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
    expected={
      "legacy_calculated":sum((r.get("legacy") or {}).get("status")=="calculated" for r in rows),
      "edgartools_supported":sum((r.get("edgartools") or {}).get("provider_status")=="supported" for r in rows),
      "period_matched":sum(r.get("period_match") is True for r in rows),
      "period_mismatched":sum("fiscal_period_mismatch" in (r.get("mismatch_reasons") or []) for r in rows),
      "metrics_comparable":sum(r.get("metrics_comparable") is True for r in rows),
      "rows_with_input_differences":sum(r.get("has_input_differences") is True for r in rows),
    }
    for key,value in expected.items():
        if summary.get(key)!=value: errors.append(f"summary {key} does not reconcile to rows")
    for row in rows:
        symbol=str(row.get("symbol","UNKNOWN")); legacy=row.get("legacy") or {}; edgar=row.get("edgartools") or {}
        comparable=row.get("metrics_comparable") is True
        if row.get("production_approved") is not False or row.get("production_write") is not False: errors.append(f"{symbol}: row must remain review-only")
        if legacy.get("accession_available") is not False: errors.append(f"{symbol}: legacy accession availability must be explicit")
        if edgar.get("provider_status")=="unsupported_provider" and comparable: errors.append(f"{symbol}: unsupported provider cannot be directly comparable")
        if comparable:
            if row.get("period_match") is not True: errors.append(f"{symbol}: comparable row must have matching fiscal periods")
            if not isinstance(legacy.get("metrics"),dict) or not isinstance(edgar.get("metrics"),dict): errors.append(f"{symbol}: comparable row is missing metric sets")
            if not isinstance(row.get("input_deltas"),dict) or not isinstance(row.get("metric_deltas"),dict): errors.append(f"{symbol}: comparable row is missing deltas")
        elif row.get("metric_deltas") is not None or row.get("input_deltas") is not None:
            errors.append(f"{symbol}: non-comparable row must not publish metric deltas")
    return errors

def main()->int:
    parser=argparse.ArgumentParser();parser.add_argument("report",type=Path);args=parser.parse_args()
    report=json.loads(args.report.read_text());errors=validate(report)
    if errors:
        for error in errors: print(f"ERROR: {error}")
        return 1
    print("Validated read-only reconciliation:",report.get("summary",{}));return 0

if __name__=="__main__": raise SystemExit(main())
