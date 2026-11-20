#!/usr/bin/env python3
"""Build a deterministic, review-only accounting exception queue from Worker preview JSON."""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path
from typing import Any


def candidate_confidence(status: str, count: Any) -> str:
    """Describe evidence uniqueness without implying accounting-policy approval."""
    if status in ("unique", "unique_candidate") and count == 1:
        return "unique_candidate"
    if status in ("ambiguous", "ambiguous_candidates") or (isinstance(count, int) and count > 1):
        return "ambiguous_candidates"
    if status in ("not_found", "not_identified"):
        return "no_candidate_identified"
    return "unresolved"


BALANCE_POLICY_STATUS = {
    "current_debt": "pending_conventional_debt_policy_and_EV_approval",
    "noncurrent_debt": "pending_conventional_debt_policy_and_EV_approval",
    "aggregate_debt": "pending_aggregate_debt_policy_and_reconciliation",
    "unrestricted_cash": "pending_cash_scope_and_EV_approval",
    "restricted_cash": "excluded_pending_restricted_cash_policy",
    "short_term_investments": "excluded_pending_liquidity_and_cash_equivalent_policy",
    "current_lease_liabilities": "excluded_pending_lease_policy",
    "noncurrent_lease_liabilities": "excluded_pending_lease_policy",
}


def classify(row: dict[str, Any]) -> dict[str, Any]:
    symbol = str(row.get("symbol") or "UNKNOWN")
    flags = [str(x) for x in row.get("review_flags", [])]
    ebit = str(row.get("ebit_status") or "not_resolved")
    invested = str(row.get("invested_capital_status") or "not_resolved")
    ev = row.get("enterprise_value_candidate_review") or {}
    debt = str(ev.get("conventional_debt_status") or "not_resolved")
    cash = ev.get("unrestricted_cash_candidate")
    provider = str(row.get("provider_status") or "awaiting_evidence")
    issues: list[str] = []

    if provider == "unsupported_provider" or row.get("overall_status") == "unsupported_provider":
        tier = "P3"
        issues.append("provider_unsupported_no_fallback")
    elif row.get("overall_status") == "awaiting_evidence" or provider == "awaiting_evidence":
        tier = "P1"
        issues.append("awaiting_filing_evidence")
    else:
        if ebit != "direct_reported_candidate_review_only":
            issues.append("direct_ebit_unresolved_or_ambiguous")
        else:
            issues.append("direct_ebit_candidate_requires_accounting_approval")
        if invested != "positive_denominator_candidate_review_only":
            issues.append("invested_capital_unresolved_or_nonpositive")
        else:
            issues.append("invested_capital_candidate_requires_scope_approval")
        if debt != "identified_from_unique_current_and_noncurrent_components":
            issues.append("conventional_debt_not_uniquely_resolved")
        if cash is None:
            issues.append("unrestricted_cash_not_uniquely_resolved")
        if ebit != "direct_reported_candidate_review_only" or invested != "positive_denominator_candidate_review_only":
            tier = "P1"
        elif debt != "identified_from_unique_current_and_noncurrent_components" or cash is None:
            tier = "P2"
        else:
            tier = "P3"

    if flags:
        issues.extend("flag:" + flag for flag in flags)
    balance = row.get("balance_sheet_candidate_review") or {}
    category_summary: list[str] = []
    balance_assessments: dict[str, Any] = {}
    for name, detail in sorted(balance.items()):
        detail = detail or {}
        status = str(detail.get("status") or "not_found")
        count = detail.get("candidate_count", 0)
        confidence = candidate_confidence(status, count)
        balance_assessments[name] = {
            "candidate_status": status,
            "candidate_count": count,
            "classification_confidence": confidence,
            "policy_status": BALANCE_POLICY_STATUS.get(name, "pending_accounting_policy_review"),
            "production_approved": False,
        }
        if confidence not in ("unique_candidate", "no_candidate_identified"):
            category_summary.append(f"{name}={status}({count})")

    debt_instrument_evidence = {
        name: (balance.get(name) or {})
        for name in (
            "current_debt",
            "noncurrent_debt",
            "aggregate_debt",
        )
    }
    assessment = {
        "ebit": {
            "candidate_status": ebit,
            "classification_confidence": "unique_candidate" if ebit == "direct_reported_candidate_review_only" else "unresolved",
            "policy_status": "pending_operating_income_and_Magic_Formula_EBIT_approval",
            "production_approved": False,
        },
        "invested_capital": {
            "candidate_status": invested,
            "classification_confidence": "unique_positive_candidate" if invested == "positive_denominator_candidate_review_only" else "unresolved",
            "policy_status": "pending_invested_capital_scope_approval",
            "production_approved": False,
        },
        "balance_sheet": balance_assessments,
        "enterprise_value": {
            "candidate_status": ev.get("status") or "not_resolved",
            "debt_classification_status": debt,
            "approval_status": ev.get("approval_status") or "review_only_no_production_ev_or_earnings_yield",
            "production_approved": False,
        },
    }
    return {
        "symbol": symbol,
        "priority": tier,
        "provider_status": provider,
        "ebit_status": ebit,
        "invested_capital_status": invested,
        "debt_status": debt,
        "unrestricted_cash_candidate": cash,
        "candidate_roc": row.get("candidate_roc"),
        "reporting_currency": row.get("reporting_currency"),
        "issue_count": len(issues),
        "issues": issues,
        "balance_sheet_exceptions": category_summary,
        "debt_instrument_evidence": debt_instrument_evidence,
        "candidate_vs_policy_assessment": assessment,
        "production_write": False,
    }

def build_queue(
    report: dict[str, Any],
    raw_evidence: dict[str, Any] | None = None,
) -> dict[str, Any]:
    raw_by_symbol = {
        str(company.get("symbol")): company
        for company in (raw_evidence or {}).get("companies", [])
        if company.get("symbol")
    }
    rows = []
    raw_category_names = {
        "current_debt": "current_debt_candidates",
        "noncurrent_debt": "noncurrent_debt_candidates",
        "aggregate_debt": "aggregate_debt_candidates",
    }
    for resolution in report.get("resolutions", []):
        item = classify(resolution)
        raw_company = raw_by_symbol.get(item["symbol"])
        raw_accession = (
            (raw_company or {}).get("filing", {}).get("accession_number")
            or (raw_company or {}).get("filing", {}).get("accession_no")
        )
        # Only enrich when the extracted filing is exactly the same accession
        # as the Worker preview. This prevents mixing different filing periods.
        if raw_company and raw_accession and raw_accession == resolution.get("accession"):
            categories = (raw_company.get("balance_sheet_fact_review") or {}).get("categories", {})
            item["debt_instrument_evidence"] = {
                name: categories.get(raw_name, {
                    "status": "not_found",
                    "candidate_count": 0,
                    "resolution_hint": "no_candidate_identified",
                    "automatic_aggregation": False,
                    "candidates": [],
                })
                for name, raw_name in raw_category_names.items()
            }
            item["debt_instrument_evidence_source"] = "fresh_extraction_artifact_same_accession"
            reconciliation = raw_company.get("balance_sheet_reconciliation_review")
            item["balance_sheet_reconciliation_review"] = reconciliation
            item["balance_sheet_reconciliation_evidence_source"] = (
                "fresh_extraction_artifact_same_accession" if reconciliation else "not_available"
            )
            filing_review = raw_company.get("filing_specific_review")
            filing_review_accession = (filing_review or {}).get("filing_accession")
            if filing_review and filing_review_accession == raw_accession:
                item["filing_specific_ebit_review"] = filing_review
                item["filing_specific_ebit_review_source"] = "fresh_extraction_artifact_same_accession"
                if filing_review.get("status") == "review_only" and isinstance(
                    filing_review.get("ebit_candidate"), (int, float)
                ):
                    item["issues"].append("filing_specific_ebit_candidate_available_manual_review")
                    item["issue_count"] = len(item["issues"])
                item["candidate_vs_policy_assessment"]["filing_specific_ebit"] = {
                    "candidate_status": filing_review.get("status"),
                    "method": filing_review.get("method"),
                    "candidate_value": filing_review.get("ebit_candidate"),
                    "policy_status": "pending_filing_specific_manual_review_and_EBIT_policy_approval",
                    "production_approved": False,
                }
            else:
                item["filing_specific_ebit_review"] = None
                item["filing_specific_ebit_review_source"] = "not_available"
            reconciliation_status = str((reconciliation or {}).get("status") or "not_available")
            if reconciliation_status not in ("reconciled", "not_available"):
                item["issues"].append("balance_sheet_reconciliation_" + reconciliation_status)
                item["priority"] = "P1"
                item["issue_count"] = len(item["issues"])
        else:
            item["debt_instrument_evidence_source"] = "stored_resolver_preview"
            item["balance_sheet_reconciliation_review"] = None
            item["balance_sheet_reconciliation_evidence_source"] = "stored_resolver_preview"
            item["filing_specific_ebit_review"] = None
            item["filing_specific_ebit_review_source"] = "stored_resolver_preview"
        rows.append(item)
    order = {"P1": 0, "P2": 1, "P3": 2}
    rows.sort(key=lambda row: (order.get(row["priority"], 9), row["symbol"]))
    counts = Counter(row["priority"] for row in rows)
    return {
        "source": "Magic Screen EdgarTools deterministic resolver preview",
        "resolver": report.get("resolver"),
        "generated_from_preview": report.get("generated_at"),
        "production_fundamentals_changed": report.get("production_fundamentals_changed"),
        "rankings_changed": report.get("rankings_changed"),
        "production_write": False,
        "summary": {
            "total": len(rows),
            "priority_1": counts.get("P1", 0),
            "priority_2": counts.get("P2", 0),
            "priority_3": counts.get("P3", 0),
            "balance_sheet_reconciliation": dict(Counter(
                str((row.get("balance_sheet_reconciliation_review") or {}).get("status") or "not_available")
                for row in rows
            )),
            "filing_specific_ebit_manual_review_available": sum(
                1 for row in rows if row.get("filing_specific_ebit_review")
                and isinstance(row["filing_specific_ebit_review"].get("ebit_candidate"), (int, float))
            ),
        },
        "items": rows,
        "guardrail": "Triage only. Candidate values and classifications remain unapproved; missing values are unknown, never zero.",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="edgartools-resolver-preview.json")
    parser.add_argument("--raw-evidence", default="edgartools-bakeoff.json")
    parser.add_argument("--json-output", default="accounting-review-queue.json")
    parser.add_argument("--csv-output", default="accounting-review-queue.csv")
    args = parser.parse_args()

    report = json.loads(Path(args.input).read_text(encoding="utf-8"))
    raw_evidence = None
    raw_path = Path(args.raw_evidence)
    if raw_path.exists():
        raw_evidence = json.loads(raw_path.read_text(encoding="utf-8"))
    if not isinstance(report.get("resolutions"), list):
        raise SystemExit("Resolver preview JSON must contain a resolutions array.")
    if report.get("production_fundamentals_changed") is not False or report.get("rankings_changed") is not False:
        raise SystemExit("Refusing to build queue: preview did not confirm production/ranking immutability.")

    queue = build_queue(report, raw_evidence)
    Path(args.json_output).write_text(json.dumps(queue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    fields = [
        "symbol", "priority", "provider_status", "ebit_status", "invested_capital_status",
        "debt_status", "unrestricted_cash_candidate", "candidate_roc", "reporting_currency",
        "issue_count", "issues", "balance_sheet_exceptions", "debt_instrument_evidence",
        "debt_instrument_evidence_source", "balance_sheet_reconciliation_review",
        "balance_sheet_reconciliation_evidence_source", "filing_specific_ebit_review",
        "filing_specific_ebit_review_source", "candidate_vs_policy_assessment", "production_write",
    ]
    with Path(args.csv_output).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for item in queue["items"]:
            row = dict(item)
            row["issues"] = " | ".join(item["issues"])
            row["balance_sheet_exceptions"] = " | ".join(item["balance_sheet_exceptions"])
            row["debt_instrument_evidence"] = json.dumps(item["debt_instrument_evidence"], separators=(",", ":"))
            row["balance_sheet_reconciliation_review"] = json.dumps(
                item.get("balance_sheet_reconciliation_review"), separators=(",", ":")
            )
            row["filing_specific_ebit_review"] = json.dumps(
                item.get("filing_specific_ebit_review"), separators=(",", ":")
            )
            row["candidate_vs_policy_assessment"] = json.dumps(item["candidate_vs_policy_assessment"], separators=(",", ":"))
            writer.writerow(row)
    print("Accounting review queue:", json.dumps(queue["summary"], sort_keys=True))
    print("Review-only; production fundamentals and rankings were not changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
