#!/usr/bin/env python3
"""Validate the versioned proposed US MFI shadow accounting policy."""
from __future__ import annotations
import json, sys
from pathlib import Path
from typing import Any

REQUIRED_GATES = {
    "exceptional_EBIT_policy", "filing_specific_EBIT_bridges",
    "invested_capital_and_near_zero_threshold", "lease_and_ROU_symmetry",
    "other_financing_obligations", "NCI_perimeter",
    "marketable_securities_cash_like_test", "price_staleness_window",
    "legacy_reconciliation_or_explicit_replacement_approval",
    "production_monitoring_and_rollback",
}

def validate(policy: dict[str, Any]) -> list[str]:
    errors=[]
    if policy.get("policy_id") != "us_mfi_accounting_policy_v1_proposed": errors.append("unexpected policy_id")
    if policy.get("version") != 1: errors.append("version must be 1")
    if policy.get("market") != "US": errors.append("policy must be US-only")
    if policy.get("status") != "proposed_owner_approval_required": errors.append("policy must remain proposed pending owner approval")
    controls=policy.get("production_controls") or {}
    for key in ("production_write","production_fundamentals_changed","rankings_changed","production_approved"):
        if controls.get(key) is not False: errors.append(f"{key} must remain false")
    if controls.get("shadow_only") is not True: errors.append("policy must be shadow_only")
    filings=policy.get("filings") or {}
    if filings.get("forms") != ["10-K","20-F","40-F"]: errors.append("annual filing forms must be exactly 10-K, 20-F and 40-F")
    if filings.get("period") != "latest_annual_only" or filings.get("interim_substitution") is not False:
        errors.append("annual-only filing selection and no interim substitution are mandatory")
    ebit=policy.get("ebit") or {}
    if ebit.get("concept") != "consolidated_GAAP_operating_income": errors.append("EBIT must use consolidated GAAP operating income")
    if ebit.get("exceptional_item_adjustments") != "none_until_cohort_wide_policy_approved": errors.append("issuer-specific exceptional-item adjustments are prohibited pending cohort approval")
    if ebit.get("filing_specific_reconstructions") != "manual_review_only_not_resolver_input": errors.append("filing-specific EBIT reconstructions must remain manual review only")
    ic=policy.get("invested_capital") or {}
    if ic.get("formula") != "current_assets_minus_current_liabilities_plus_net_ppe": errors.append("unexpected invested-capital formula")
    if ic.get("rou_assets_added_alone") is not False or ic.get("issuer_specific_formula_switching") is not False:
        errors.append("ROU symmetry and one cohort-wide formula guardrails failed")
    if ic.get("negative_denominator") != "withhold_ROC_and_ranking": errors.append("negative denominator must withhold ROC/ranking")
    ev=policy.get("enterprise_value") or {}
    if ev.get("formula") != "market_cap_plus_conventional_gross_debt_minus_unrestricted_cash": errors.append("unexpected baseline EV formula")
    if ev.get("undrawn_facilities") is not False: errors.append("undrawn facilities cannot be debt")
    cash=policy.get("cash") or {}
    for key in ("restricted_cash","customer_funds","escrow_and_in_transit","notes_receivable"):
        if cash.get(key) is not False: errors.append(f"{key} cannot be deducted as unrestricted cash")
    if cash.get("missing_value") != "unknown_not_zero": errors.append("missing values must remain unknown, not zero")
    ranking=policy.get("ranking") or {}
    if ranking.get("minimum_approved_eligible_cohort") != 5 or ranking.get("below_minimum") != "withhold_final_ranking":
        errors.append("minimum approved cohort must be five; otherwise withhold final ranking")
    gates=set(policy.get("approval_gates") or [])
    if gates != REQUIRED_GATES: errors.append("approval gates are incomplete or unexpected")
    if not policy.get("non_goals"): errors.append("policy must declare non-goals")
    return errors

def main()->int:
    path=Path(sys.argv[1]) if len(sys.argv)>1 else Path("config/us-mfi-accounting-policy-v1-proposed.json")
    policy=json.loads(path.read_text(encoding="utf-8"))
    errors=validate(policy)
    if errors:
        for error in errors: print("ERROR:",error)
        return 1
    print("Validated proposed US MFI shadow policy; production approval and writes remain false.")
    return 0

if __name__=="__main__": raise SystemExit(main())
