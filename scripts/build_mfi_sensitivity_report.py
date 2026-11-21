#!/usr/bin/env python3
"""Create review-only ranking sensitivities for the currently ranked shadow cohort."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from typing import Any


def ordinal(values: dict[str, float]) -> dict[str, float]:
    ordered = sorted(values, key=lambda symbol: (-values[symbol], symbol))
    result: dict[str, float] = {}
    index = 0
    while index < len(ordered):
        end = index + 1
        while end < len(ordered) and values[ordered[end]] == values[ordered[index]]:
            end += 1
        rank = ((index + 1) + end) / 2
        for symbol in ordered[index:end]:
            result[symbol] = rank
        index = end
    return result


def score_scenario(rows: list[dict[str, Any]], name: str, net_ppe_only: bool = False,
                   marketable_securities_cash_like: bool = False) -> dict[str, Any]:
    metrics: dict[str, dict[str, float]] = {}
    for row in rows:
        symbol = row["symbol"]
        ebit = float(row["ebit_candidate"])
        ev = float(row["enterprise_value_candidate"])
        invested = float(row["invested_capital_candidate"])
        queue = row["_queue"]
        if net_ppe_only:
            ppe = (queue.get("invested_capital_denominator_diagnostics") or {}).get("net_ppe_only_reference_denominator")
            if not isinstance(ppe, (int, float)) or ppe <= 0:
                continue
            invested = float(ppe)
        if marketable_securities_cash_like:
            review = queue.get("filing_ev_scope_note_review") or {}
            portfolio = (review.get("cash_policy_dimensions") or {}).get("portfolio_composition") or {}
            amount = portfolio.get("reported_total_millions")
            if isinstance(amount, (int, float)) and amount > 0:
                ev -= float(amount) * 1_000_000
        if ev <= 0 or invested <= 0:
            continue
        metrics[symbol] = {"earnings_yield": ebit / ev, "return_on_capital": ebit / invested}
    ey = ordinal({s: v["earnings_yield"] for s, v in metrics.items()})
    roc = ordinal({s: v["return_on_capital"] for s, v in metrics.items()})
    combined = {s: ey[s] + roc[s] for s in metrics}
    ordered = sorted(combined, key=lambda s: (combined[s], s))
    final_rank: dict[str, int] = {}
    previous: float | None = None
    previous_rank = 0
    for index, symbol in enumerate(ordered):
        if previous is None or combined[symbol] != previous:
            previous_rank = index + 1
        final_rank[symbol] = previous_rank
        previous = combined[symbol]
    return {
        "scenario": name,
        "sensitivity_only": True,
        "production_write": False,
        "rows": [
            {"symbol": s, **metrics[s], "earnings_yield_rank": ey[s],
             "return_on_capital_rank": roc[s], "combined_score": combined[s],
             "scenario_rank": final_rank[s]}
            for s in sorted(metrics, key=lambda symbol: (final_rank[symbol], symbol))
        ],
    }


def build(preview: dict[str, Any], queue_report: dict[str, Any]) -> dict[str, Any]:
    queue_by_symbol = {item["symbol"]: item for item in queue_report.get("items", [])}
    ranked = [row for row in preview.get("rankings", []) if row.get("magic_formula_rank") is not None]
    rows = []
    for row in ranked:
        symbol = row["symbol"]
        if symbol not in queue_by_symbol:
            continue
        if not all(isinstance(row.get(key), (int, float)) for key in
                   ("ebit_candidate", "enterprise_value_candidate", "invested_capital_candidate")):
            continue
        rows.append({**row, "_queue": queue_by_symbol[symbol]})
    scenarios = [
        score_scenario(rows, "current_candidate_policy"),
        score_scenario(rows, "net_ppe_only_denominator_sensitivity", net_ppe_only=True),
        score_scenario(rows, "marketable_securities_cash_like_sensitivity", marketable_securities_cash_like=True),
        score_scenario(rows, "combined_net_ppe_and_cash_like_sensitivity", net_ppe_only=True, marketable_securities_cash_like=True),
    ]
    return {
        "as_of": preview.get("as_of"),
        "cohort_symbols": [row["symbol"] for row in rows],
        "cohort_size": len(rows),
        "scenarios": scenarios,
        "guardrail": "All alternatives are sensitivity-only, not approved accounting policies. They do not change resolver inputs, production fundamentals or rankings.",
        "production_write": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# US MFI top-cohort ranking sensitivities",
        "",
        f"As of: {report.get('as_of')}",
        "",
        f"Current shadow cohort: {', '.join(report.get('cohort_symbols', [])) or 'none'}",
        "",
        "These scenarios are deliberately limited to the currently ranked shadow cohort. They are not alternative production formulas.",
        "",
    ]
    for scenario in report["scenarios"]:
        lines.extend([f"## {scenario['scenario'].replace('_', ' ').title()}", "",
                      "| Rank | Symbol | EY | ROC | EY rank | ROC rank | Combined |",
                      "|---:|---|---:|---:|---:|---:|---:|"])
        for row in scenario["rows"]:
            lines.append(f"| {row['scenario_rank']} | {row['symbol']} | {row['earnings_yield']:.2%} | {row['return_on_capital']:.2%} | {row['earnings_yield_rank']:g} | {row['return_on_capital_rank']:g} | {row['combined_score']:g} |")
        lines.append("")
    lines.extend([
        "## Interpretation guardrails",
        "",
        "- Net-PP&E-only denominator is a sensitivity, not an approved substitute for invested capital.",
        "- Marketable securities are treated as cash-like only in a scenario to show ranking sensitivity; issuer availability alone does not establish uniform cash-equivalent eligibility.",
        "- Restricted cash and matched customer escrow are not included in the cash-like scenario.",
        "- A large rank movement identifies a policy-sensitive issuer for manual review, not a reason to select the more favourable result.",
        "- No scenario is written to production.",
        "",
        report["guardrail"],
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", type=Path, default=Path("edgartools-mfi-ranking-preview.json"))
    parser.add_argument("--queue", type=Path, default=Path("accounting-review-queue.json"))
    parser.add_argument("--json-out", type=Path, default=Path("mfi-ranking-sensitivity.json"))
    parser.add_argument("--markdown-out", type=Path, default=Path("mfi-ranking-sensitivity.md"))
    args = parser.parse_args()
    report = build(json.loads(args.preview.read_text()), json.loads(args.queue.read_text()))
    args.json_out.write_text(json.dumps(report, indent=2) + "\n")
    args.markdown_out.write_text(render_markdown(report))
    print(f"Built {len(report['scenarios'])} sensitivity-only scenarios for {report['cohort_size']} shadow-ranked issuers; production unchanged.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
