#!/usr/bin/env python3
"""Validate coverage and classic ordinal-rank invariants in a US MFI preview."""
from __future__ import annotations
import json
import sys
from pathlib import Path
from typing import Any


def _ordinal_ranks(rows: list[dict[str, Any]], key: str) -> dict[str, float]:
    ordered = sorted(rows, key=lambda row: (-float(row[key]), str(row["symbol"]).upper()))
    result: dict[str, float] = {}
    index = 0
    while index < len(ordered):
        end = index + 1
        while end < len(ordered) and float(ordered[end][key]) == float(ordered[index][key]):
            end += 1
        average_rank = ((index + 1) + end) / 2
        for row in ordered[index:end]:
            result[str(row["symbol"]).upper()] = average_rank
        index = end
    return result


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
    for row in eligible:
        symbol = str(row.get("symbol", "")).upper()
        if row.get("ebit_status") != "direct_reported_candidate_review_only":
            errors.append(f"{symbol}: filing-specific EBIT reconstruction must remain manual-review-only and unranked")
        if "invested_capital_negative_working_capital_offset_high_risk_manual_review" in (row.get("review_flags") or []):
            errors.append(f"{symbol}: high-risk near-zero invested-capital denominator must withhold ROC and ranking")
    if summary.get("eligible") != len(eligible):
        errors.append("eligible summary does not reconcile")
    unsupported = [row for row in rows if row.get("provider_status") == "unsupported_provider"]
    if any(row.get("eligibility_status") != "excluded_provider_unsupported" or row.get("magic_formula_rank") is not None for row in unsupported):
        errors.append("unsupported providers must remain visible but unranked with an explicit status")
    if summary.get("unsupported_provider") != len(unsupported):
        errors.append("unsupported-provider coverage count does not reconcile")
    ranked = [row for row in rows if row.get("magic_formula_rank") is not None]
    if summary.get("ranked") != len(ranked):
        errors.append("ranked summary does not reconcile")
    # "excluded" means not included in the final ranked output. It includes
    # otherwise-eligible rows when the minimum cohort size is not reached.
    if summary.get("excluded") != len(rows) - len(ranked):
        errors.append("excluded-from-ranking summary does not reconcile")
    minimum = int(report.get("minimum_eligible_cohort", 5))
    if len(eligible) >= minimum:
        if len(ranked) != len(eligible):
            errors.append("every eligible row must be ranked once the minimum cohort is met")
        for row in eligible:
            symbol = str(row.get("symbol", "")).upper()
            for key in ("earnings_yield", "return_on_capital"):
                value = row.get(key)
                if not isinstance(value, (int, float)) or not __import__("math").isfinite(value):
                    errors.append(f"{symbol}: missing or invalid {key} on eligible row")
        valid_metrics = all(isinstance(row.get(key), (int, float)) for row in eligible for key in ("earnings_yield", "return_on_capital"))
        if valid_metrics:
            ey_ranks = _ordinal_ranks(eligible, "earnings_yield")
            roc_ranks = _ordinal_ranks(eligible, "return_on_capital")
            scores: dict[str, float] = {}
            for row in eligible:
                symbol = str(row["symbol"]).upper()
                expected_ey, expected_roc = ey_ranks[symbol], roc_ranks[symbol]
                if not isinstance(row.get("earnings_yield_rank"), (int, float)) or abs(row["earnings_yield_rank"] - expected_ey) > 1e-9:
                    errors.append(f"{symbol}: earnings-yield ordinal rank is incorrect")
                if not isinstance(row.get("return_on_capital_rank"), (int, float)) or abs(row["return_on_capital_rank"] - expected_roc) > 1e-9:
                    errors.append(f"{symbol}: return-on-capital ordinal rank is incorrect")
                expected_score = expected_ey + expected_roc
                scores[symbol] = expected_score
                if not isinstance(row.get("magic_formula_score"), (int, float)) or abs(row["magic_formula_score"] - expected_score) > 1e-9:
                    errors.append(f"{symbol}: combined score is not the ordinal rank sum")
            ordered = sorted(eligible, key=lambda row: (scores[str(row["symbol"]).upper()], str(row["symbol"]).upper()))
            expected_final: dict[str, int] = {}
            previous_score: float | None = None
            previous_rank = 0
            for index, row in enumerate(ordered):
                score = scores[str(row["symbol"]).upper()]
                if previous_score is None or score != previous_score:
                    previous_rank = index + 1
                expected_final[str(row["symbol"]).upper()] = previous_rank
                previous_score = score
            for row in eligible:
                symbol = str(row["symbol"]).upper()
                if row.get("magic_formula_rank") != expected_final[symbol]:
                    errors.append(f"{symbol}: final competition rank is incorrect")
            if [row.get("magic_formula_rank") for row in ranked] != sorted(row.get("magic_formula_rank") for row in ranked):
                errors.append("ranked rows are not ordered best-first")
    elif ranked:
        errors.append("numeric ranks must be withheld below the minimum eligible cohort")
    for row in rows:
        if row.get("magic_formula_rank") is None and (row.get("earnings_yield_rank") is not None or row.get("return_on_capital_rank") is not None or row.get("magic_formula_score") is not None):
            errors.append(f"{row.get('symbol')}: unranked row retained partial numeric ranks")
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
