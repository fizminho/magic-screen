#!/usr/bin/env python3
"""Validate invariants in a read-only US MFI ranking preview artifact."""
from __future__ import annotations
import json
import sys
from pathlib import Path
from typing import Any


def validate(report: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    rows = report.get("rankings")
    if not isinstance(rows, list):
        return ["rankings must be an array"]
    symbols = [str(row.get("symbol", "")).upper() for row in rows]
    if any(not symbol for symbol in symbols):
        errors.append("every preview row must have a symbol")
    if len(symbols) != len(set(symbols)):
        errors.append("preview contains duplicate symbols")
    summary = report.get("summary") or {}
    if summary.get("universe") != len(rows):
        errors.append("summary universe does not match preview rows")
    eligible = [row for row in rows if row.get("ranking_eligible") is True]
    excluded = [row for row in rows if row.get("ranking_eligible") is not True]
    if summary.get("eligible") != len(eligible) or summary.get("excluded") != len(excluded):
        errors.append("eligible/excluded summary does not reconcile")
    unsupported = [row for row in rows if row.get("provider_status") == "unsupported_provider"]
    if any(row.get("eligibility_status") != "excluded_provider_unsupported" or row.get("magic_formula_rank") is not None for row in unsupported):
        errors.append("unsupported providers must remain visible but unranked with an explicit status")
    if summary.get("unsupported_provider") != len(unsupported):
        errors.append("unsupported-provider coverage count does not reconcile")
    ranked = [row for row in rows if row.get("magic_formula_rank") is not None]
    if summary.get("ranked") != len(ranked):
        errors.append("ranked summary does not reconcile")
    if len(eligible) >= int(report.get("minimum_eligible_cohort", 5)):
        for row in ranked:
            ranks = (row.get("earnings_yield_rank"), row.get("return_on_capital_rank"), row.get("magic_formula_score"))
            if not all(isinstance(value, (int, float)) for value in ranks):
                errors.append(f"{row.get('symbol')}: ranked row has missing ordinal ranks")
                continue
            if abs(ranks[2] - (ranks[0] + ranks[1])) > 1e-9:
                errors.append(f"{row.get('symbol')}: combined score is not the ordinal rank sum")
        if [row.get("magic_formula_rank") for row in ranked] != sorted(row.get("magic_formula_rank") for row in ranked):
            errors.append("ranked rows are not ordered by ascending (best-first) rank")
    elif ranked:
        errors.append("numeric ranks must be withheld below the minimum eligible cohort")
    for row in excluded:
        if row.get("magic_formula_rank") is not None:
            errors.append(f"{row.get('symbol')}: excluded row received a rank")
    for key in ("production_write", "production_fundamentals_changed", "rankings_changed"):
        if report.get(key) is not False:
            errors.append(f"{key} must remain false")
    return errors


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "edgartools-mfi-ranking-preview.json")
    report = json.loads(path.read_text())
    errors = validate(report)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"Validated {len(report['rankings'])} US universe rows; {report['summary']['ranked']} ranked, {report['summary']['excluded']} excluded, {report['summary']['unsupported_provider']} unsupported; production unchanged.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
