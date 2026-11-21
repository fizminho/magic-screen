#!/usr/bin/env python3
"""Apply the proposed US MFI policy as a read-only cohort assessment."""
import argparse
import json
from pathlib import Path


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def assess(queue, ranking, policy):
    items = queue.get("items") or []
    rows = []
    seen = set()
    ranking_by_symbol = {r.get("symbol"): r for r in ranking.get("rankings", [])}
    errors = []
    if len(items) != queue.get("summary", {}).get("total"):
        errors.append("queue total does not match item count")
    for item in items:
        symbol = item.get("symbol")
        if not symbol or symbol in seen:
            errors.append(f"missing or duplicate symbol: {symbol}")
            continue
        seen.add(symbol)
        rank = ranking_by_symbol.get(symbol, {})
        flags = [x for x in item.get("issues", []) if str(x).startswith("flag:")]
        blockers = []
        if item.get("provider_status") != "supported":
            blockers.append("provider evidence unavailable; excluded, no fallback")
        ebit = item.get("ebit_status", "unknown")
        if ebit == "filing_specific_reconstruction_review_only":
            blockers.append("filing-specific EBIT bridge requires manual approval")
        elif ebit != "direct_reported_candidate_review_only":
            blockers.append("reported consolidated EBIT unresolved")
        else:
            blockers.append("reported EBIT candidate still requires policy approval")
        invested = item.get("invested_capital_status", "unknown")
        if invested != "positive_denominator_candidate_review_only":
            blockers.append("invested-capital denominator unresolved or non-positive")
        else:
            blockers.append("positive denominator still requires scope and materiality approval")
        debt = item.get("debt_status", "unknown")
        if debt == "incomplete_or_ambiguous_debt_inputs":
            blockers.append("conventional debt / EV inputs incomplete or ambiguous")
        else:
            blockers.append("debt instrument and maturity tie-out remains review-only")
        # Generic XBRL candidate buckets are evidence hints, not automatic blockers.
        issue_set = set(item.get("issues", []))
        if any(x in issue_set for x in (
            "flag:restricted_or_combined_cash_present_review_enterprise_value_cash_input",
            "flag:unrestricted_cash_not_uniquely_identified",
            "flag:restricted_cash_or_short_term_investments_require_cash_scope_review",
        )):
            blockers.append("cash classification / unrestricted availability requires review")
        if any(x in issue_set for x in (
            "flag:noncontrolling_interest_present_review_enterprise_value_scope",
            "flag:noncontrolling_interest_requires_enterprise_value_adjustment_review",
            "flag:company_perimeter_mismatch_requires_manual_review",
        )):
            blockers.append("NCI or reporting-entity perimeter requires review")
        if any("right_of_use_assets_present_review" in x or "lease_liabilities_present_review" in x
               or "lease_liabilities_separate_from_conventional_debt" in x for x in issue_set):
            blockers.append("lease / ROU symmetry requires cohort-wide policy decision")
        debt_review = item.get("filing_debt_note_review") or {}
        ebit_review = item.get("filing_operating_income_quality_review") or {}
        perimeter_review = item.get("filing_company_perimeter_review") or {}
        rows.append({
            "symbol": symbol,
            "priority": item.get("priority"),
            "provider_status": item.get("provider_status"),
            "ebit_status": ebit,
            "invested_capital_status": invested,
            "debt_status": debt,
            "issue_count": item.get("issue_count", len(item.get("issues", []))),
            "shadow_eligible": rank.get("eligibility_status") == "eligible",
            "shadow_rank": rank.get("magic_formula_rank"),
            "production_approved": rank.get("production_approved", False),
            "blockers": list(dict.fromkeys(blockers)),
            "review_flags": flags,
            "debt_note_review_questions": debt_review.get("manual_review_questions", []),
            "operating_income_quality_review": ebit_review or None,
            "company_perimeter_review": perimeter_review or None,
        })
    controls = (
        queue.get("production_write") is False
        and queue.get("production_fundamentals_changed") is False
        and queue.get("rankings_changed") is False
        and policy.get("status") == "proposed_owner_approval_required"
        and policy.get("production_controls", {}).get("production_approved") is False
    )
    if not controls:
        errors.append("production immutability / proposed-policy guardrail failed")
    if len(rows) != len(ranking_by_symbol):
        errors.append("ranking and accounting queue symbol coverage differs")
    summary = {
        "universe": len(rows),
        "priority_1": sum(r["priority"] == "P1" for r in rows),
        "priority_2": sum(r["priority"] == "P2" for r in rows),
        "priority_3": sum(r["priority"] == "P3" for r in rows),
        "shadow_eligible": sum(r["shadow_eligible"] for r in rows),
        "provider_unsupported": sum(r["provider_status"] != "supported" for r in rows),
        "production_approved": sum(r["production_approved"] is True for r in rows),
        "blocked_or_review_required": len(rows),
    }
    return {
        "assessment_id": "us_mfi_policy_v1_cohort_assessment",
        "policy_id": policy.get("policy_id"),
        "policy_status": policy.get("status"),
        "summary": summary,
        "production_write": False,
        "production_fundamentals_changed": False,
        "rankings_changed": False,
        "validation_errors": errors,
        "issuer_assessments": sorted(rows, key=lambda r: (r["priority"] or "P9", r["symbol"])),
    }


def render_markdown(report):
    s = report["summary"]
    lines = [
        "# US MFI proposed policy v1: cohort assessment",
        "",
        "**Status:** review-only; proposed policy not approved.  ",
        "**Production writes / fundamentals / rankings changed:** no / no / no.",
        "",
        f"Universe: {s['universe']} | P1/P2/P3: {s['priority_1']}/{s['priority_2']}/{s['priority_3']} | "
        f"Shadow eligible: {s['shadow_eligible']} | Unsupported: {s['provider_unsupported']} | "
        f"Production approved: {s['production_approved']}",
        "",
        "## Issuer-by-issuer assessment",
        "",
        "| Symbol | Priority | Shadow | EBIT status | Invested capital | Debt / EV | Issues | Assessment blockers |",
        "|---|---|---:|---|---|---|---:|---|",
    ]
    for r in report["issuer_assessments"]:
        blockers = "; ".join(r["blockers"]).replace("|", "/")
        lines.append(
            f"| {r['symbol']} | {r['priority']} | "
            f"{'rank ' + str(r['shadow_rank']) if r['shadow_eligible'] else 'not ranked'} | "
            f"{r['ebit_status']} | {r['invested_capital_status']} | {r['debt_status']} | "
            f"{r['issue_count']} | {blockers} |"
        )
    lines += [
        "",
        "## Interpretation",
        "",
        "- No issuer is approved by this assessment. A candidate or a shadow rank is not accounting approval.",
        "- Direct reported EBIT still requires consolidated-scope and cohort-policy sign-off; filing-specific reconstructions remain manual-review-only.",
        "- Positive invested-capital candidates remain subject to asset-scope and near-zero materiality approval. Unresolved or non-positive denominators are not ranked.",
        "- Debt and cash candidates remain review-only until note-level carrying values, maturity buckets, unrestricted cash and double-counting checks are signed off.",
        "- Generic XBRL candidate buckets are not treated as issuer-specific blockers without an explicit review flag.",
        "- Unsupported issuers remain visible exclusions. Missing values are unknown, never zero.",
        "- VSNT remains excluded because its pre-separation combined annual statements are not comparable to post-separation market capitalization.",
        "",
        "## Required next decisions",
        "",
        "1. HRB and OTEX: approve or reject the EBIT bridge, invested-capital scope, debt/lease perimeter and near-zero denominator treatment.",
        "2. PBI and SGHC: resolve EBIT/currency and debt inputs before any valuation calculation.",
        "3. GTM, HPQ, HRMY, SSTK and XPOF: resolve negative or missing invested capital and cash/debt scope; keep ROC withheld.",
        "4. UPWK, IRWD and QTTB: complete cash, debt and filing-period sign-off for the currently ranked shadow cohort.",
        "5. Resolve cohort-wide lease/ROU, NCI, other financing obligations, marketable securities, quote staleness and legacy reconciliation gates.",
        "",
        "This report is a deterministic triage output from the accounting queue, ranking preview and proposed policy file. It does not change resolver inputs or production data.",
        "",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--queue", default="accounting-review-queue.json")
    parser.add_argument("--ranking", default="edgartools-mfi-ranking-preview.json")
    parser.add_argument("--policy", default="config/us-mfi-accounting-policy-v1-proposed.json")
    parser.add_argument("--json-out", default="us-mfi-policy-cohort-assessment.json")
    parser.add_argument("--md-out", default="us-mfi-policy-cohort-assessment.md")
    args = parser.parse_args()
    report = assess(load(args.queue), load(args.ranking), load(args.policy))
    Path(args.json_out).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    Path(args.md_out).write_text(render_markdown(report), encoding="utf-8")
    if report["validation_errors"]:
        raise SystemExit("; ".join(report["validation_errors"]))
    print("Policy cohort assessment:", json.dumps(report["summary"], sort_keys=True))
    print("Review-only; no production changes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
