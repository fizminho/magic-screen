#!/usr/bin/env python3
"""Test-only EdgarTools extraction for Magic Screen's SEC fundamentals bakeoff.

INTENTIONAL: this script only reads SEC filings and writes a local JSON artifact.
It never calls Magic Screen APIs, writes D1, calculates production ratios, or ranks stocks.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from pathlib import Path
from typing import Any

# INTENTIONAL: preserve both positive operating-profit and negative operating-loss labels.
DIRECT_OPERATING_INCOME_LABEL_PATTERN = r"(?:operating (?:income|loss|earnings|profit)|(?:income|loss|profit).*from operations|(?:income|loss|profit).*from operating activit(?:y|ies)|earnings from operations)"

from edgar import Company, set_identity

DEFAULT_SYMBOLS = ("HRB", "PBI", "ADBE", "AFMJF", "HPQ", "OTEX", "PRDO", "PLTK", "UPWK", "SNDK", "SGHC")

# INTENTIONAL: these USD market caps are the exact 2026-11-20 MFI snapshot
# (price date 2026-11-18), expressed in USD millions. ADBE is a historical
# control and intentionally has no MFI market-cap value in this cohort.
DEFAULT_MFI_MARKET_CAPS_MILLIONS = {
    "ALEC": 288.55, "AFMJF": 991.59, "BCRX": 1869.66, "BMBL": 795.92,
    "EGHSF": 643.04, "FHTX": 107.33, "HRB": 5880.36, "HRMY": 1944.22,
    "HPQ": 25879.98, "IRWD": 789.85, "MGTX": 812.19, "MNTN": 344.71,
    "NRIX": 1540.43, "OTEX": 5445.96, "PRDO": 1811.68, "PXED": 746.33,
    "PBI": 2065.32, "PLTK": 980.20, "QTTB": 202.48, "RGS": 50.60,
    "SNDK": 111775.70, "SBC": 643.16, "SSTK": 86.13, "SPRO": 50.82,
    "STRA": 1170.51, "SGHC": 5534.19, "UPWK": 1160.96, "VXRT": 86.21,
    "ZVRA": 551.60, "GTM": 861.38,
}
MFI_SNAPSHOT_AS_OF = "2026-11-20T09:14:01.782Z"
MFI_SNAPSHOT_PRICE_DATE = "2026-11-18"
MFI_SNAPSHOT_QUARTER_DATE = "2026-09-30"
ROW_PATTERN = re.compile(
    r"operating income|operating profit|income from operations|profit from operations|"
    r"earnings before interest|\bebit\b|property|plant|equipment|fixed assets|"
    r"depreciation|depletion|amortization|current assets|current liabilities|"
    r"cash and cash equivalents|cash equivalents|cash and bank|\bcash\b|"
    r"long.?term debt|short.?term debt|current portion of debt|borrowings|"
    r"loans payable|notes payable|finance lease|lease liabilities|interest expense",
    re.IGNORECASE,
)
METADATA_FIELDS = (
    "accession_number", "accession_no", "accession", "filing_date",
    "period_of_report", "report_date", "form", "company",
)


def safe_value(value: Any) -> Any:
    """Convert pandas/numpy/date/container values into JSON-safe primitives."""
    if value is None or isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {str(key): safe_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [safe_value(item) for item in value]
    if hasattr(value, "item"):
        try:
            return safe_value(value.item())
        except Exception:
            pass
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass
    try:
        import pandas as pd
        if pd.isna(value):
            return None
    except (ImportError, TypeError, ValueError):
        pass
    return str(value)


SEC_COMPANY_FACTS_CACHE: dict[str, dict[str, Any]] = {}
FRANKFURTER_RATE_CACHE: dict[tuple[str, str, str], dict[str, Any]] = {}


def mfi_market_cap_usd_millions(symbol: str) -> float | None:
    """Return the snapshot's USD market cap in millions, with an optional run override."""
    values = dict(DEFAULT_MFI_MARKET_CAPS_MILLIONS)
    raw_override = os.environ.get("MFI_MARKET_CAPS_JSON", "").strip()
    requested_price_date = os.environ.get("MFI_PRICE_DATE", MFI_SNAPSHOT_PRICE_DATE)
    # INTENTIONAL: never reuse an old market-cap snapshot with a newly selected
    # quote date. A new date requires a matching explicit market_caps_json map.
    if not raw_override and requested_price_date != MFI_SNAPSHOT_PRICE_DATE:
        return None
    if raw_override:
        parsed = json.loads(raw_override)
        if not isinstance(parsed, dict):
            raise ValueError("MFI_MARKET_CAPS_JSON must be a JSON object of ticker to USD market-cap millions")
        for ticker, amount in parsed.items():
            if not isinstance(ticker, str) or not isinstance(amount, (int, float)):
                raise ValueError("MFI_MARKET_CAPS_JSON values must be numeric USD millions")
            if not math.isfinite(float(amount)) or float(amount) < 0:
                raise ValueError(f"Invalid MFI market cap for {ticker}")
            values[ticker.upper()] = float(amount)
    return values.get(symbol.upper())


def sec_company_facts(cik: Any) -> dict[str, Any]:
    """Fetch accession-scoped SEC Company Facts once per CIK for currency-unit review."""
    cik_digits = re.sub(r"\D", "", str(cik or ""))
    if not cik_digits:
        raise ValueError("Missing SEC CIK")
    cik_key = cik_digits.zfill(10)
    if cik_key not in SEC_COMPANY_FACTS_CACHE:
        # INTENTIONAL: stay below SEC's 10-requests-per-second ceiling.
        time.sleep(0.12)
        url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik_key}.json"
        request = Request(
            url,
            headers={
                "User-Agent": os.environ.get(
                    "EDGAR_IDENTITY", "Magic Screen research support@binalah.co"
                ),
                "Accept": "application/json",
            },
        )
        with urlopen(request, timeout=30) as response:
            SEC_COMPANY_FACTS_CACHE[cik_key] = json.loads(response.read().decode("utf-8"))
    return SEC_COMPANY_FACTS_CACHE[cik_key]


def reporting_currency_unit_review(
    companyfacts: dict[str, Any], accession: str, fiscal_period: str
) -> dict[str, Any]:
    """Infer filing currency only from monetary ISO-unit facts in this exact accession."""
    counts: dict[str, int] = {}
    tags: dict[str, set[str]] = {}
    for taxonomy in (companyfacts.get("facts") or {}).values():
        for tag, fact in taxonomy.items():
            for unit, observations in (fact.get("units") or {}).items():
                if not re.fullmatch(r"[A-Z]{3}", str(unit)):
                    continue
                matching = [
                    item for item in observations
                    if item.get("accn") == accession
                    and item.get("end") == fiscal_period
                ]
                if matching:
                    counts[unit] = counts.get(unit, 0) + len(matching)
                    tags.setdefault(unit, set()).add(tag)
    if not counts:
        return {
            "status": "currency_unit_not_found",
            "currency": None,
            "unit_counts": {},
            "guardrail": "No ISO currency-unit facts were found for the exact accession and fiscal period. Do not infer USD from the issuer's US listing or filing form.",
        }
    ordered = sorted(counts.items(), key=lambda item: item[1], reverse=True)
    top_currency, top_count = ordered[0]
    second_count = ordered[1][1] if len(ordered) > 1 else 0
    if top_count < 3 or top_count <= second_count:
        return {
            "status": "currency_unit_ambiguous",
            "currency": None,
            "unit_counts": counts,
            "distinct_concepts_by_unit": {unit: len(values) for unit, values in tags.items()},
            "guardrail": "Currency units are tied or have too few accession-scoped observations. Do not choose a reporting currency automatically.",
        }
    return {
        "status": "identified_from_accession_facts",
        "currency": top_currency,
        "unit_counts": counts,
        "distinct_concepts_by_unit": {unit: len(values) for unit, values in tags.items()},
        "review_flags": (
            ["secondary_currency_unit_observations_present"]
            if len(counts) > 1 else []
        ),
        "guardrail": "Dominant ISO currency unit among standard SEC Company Facts matching this exact accession and fiscal period. Secondary units are retained as review flags; review issuer presentation before production use.",
    }


def filing_specific_currency_override(
    symbol: str, accession: str
) -> dict[str, Any] | None:
    # INTENTIONAL: the SGHC 20-F uses USD but its IFRS facts were not exposed
    # as ISO currency units in standard Company Facts. Restrict this override
    # to the exact issuer and accession already manually reviewed.
    if symbol == "SGHC" and accession == "0001628280-26-025609":
        return {
            "status": "identified_from_filing_specific_review",
            "currency": "USD",
            "evidence": "FY2025 Form 20-F consolidated financial statements are presented in US dollars",
            "review_flags": ["currency_identified_from_exact_filing_not_companyfacts_units"],
            "guardrail": "Issuer-specific currency override for this exact filing only. Do not generalize to other SGHC filings or other IFRS issuers.",
        }
    return None


def fetch_frankfurter_rate(
    base_currency: str, quote_currency: str, requested_date: str
) -> dict[str, Any]:
    """Fetch the latest daily reference rate on or before the requested valuation date."""
    base = base_currency.upper()
    quote = quote_currency.upper()
    key = (base, quote, requested_date)
    if key in FRANKFURTER_RATE_CACHE:
        return FRANKFURTER_RATE_CACHE[key]
    if base == quote:
        result = {
            "status": "same_currency",
            "base": base,
            "quote": quote,
            "rate": 1.0,
            "date": requested_date,
            "provider": "same-currency identity",
        }
        FRANKFURTER_RATE_CACHE[key] = result
        return result
    try:
        target = date.fromisoformat(requested_date)
        start = target - timedelta(days=7)
        params = urlencode({
            "from": start.isoformat(),
            "to": target.isoformat(),
            "base": base,
            "quotes": quote,
        })
        url = f"https://api.frankfurter.dev/v2/providers/ecb/rates?{params}"
        request = Request(url, headers={"Accept": "application/json"})
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
        rows = payload if isinstance(payload, list) else payload.get("data", [])
        matches = [
            row for row in rows
            if row.get("base") == base and row.get("quote") == quote
            and row.get("date") and row.get("date") <= requested_date
            and isinstance(row.get("rate"), (int, float))
        ]
        if not matches:
            result = {
                "status": "rate_not_found",
                "base": base,
                "quote": quote,
                "requested_date": requested_date,
                "provider": "ECB reference rates via Frankfurter",
                "source_attribution": "Source: ECB statistics",
            }
        else:
            selected = max(matches, key=lambda row: row["date"])
            result = {
                "status": "rate_available",
                "base": base,
                "quote": quote,
                "rate": float(selected["rate"]),
                "date": selected["date"],
                "requested_date": requested_date,
                "provider": "ECB reference rates via Frankfurter",
                "source_attribution": "Source: ECB statistics",
                "is_previous_business_day": selected["date"] != requested_date,
            }
    except Exception as exc:
        result = {
            "status": "rate_fetch_error",
            "base": base,
            "quote": quote,
            "requested_date": requested_date,
            "provider": "ECB reference rates via Frankfurter",
            "source_attribution": "Source: ECB statistics",
            "error": f"{type(exc).__name__}: {exc}",
        }
    FRANKFURTER_RATE_CACHE[key] = result
    return result


def currency_normalization_review(
    reporting_currency: str | None,
    market_cap_usd: float | None,
    mfi_price_date: str | None,
    fx_rate_review: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Convert USD MFI market cap to reporting currency using the quote-date FX rate."""
    reporting = (reporting_currency or "").upper() or None
    market_cap_currency = "USD"
    if not reporting:
        return {
            "status": "reporting_currency_unknown",
            "reporting_currency": None,
            "market_cap_currency": market_cap_currency,
            "market_cap_usd": market_cap_usd,
            "market_cap_in_reporting_currency": None,
            "mfi_price_date": mfi_price_date,
            "guardrail": "No market-cap conversion is attempted until the filing currency is identified.",
        }
    rate_review = fx_rate_review or {}
    same_currency = reporting == market_cap_currency
    if same_currency:
        rate_review = {
            "status": "same_currency",
            "base": "USD",
            "quote": "USD",
            "rate": 1.0,
            "date": mfi_price_date,
            "provider": "same-currency identity",
        }
    rate = rate_review.get("rate")
    if not isinstance(rate, (int, float)):
        return {
            "status": "fx_rate_unavailable",
            "reporting_currency": reporting,
            "market_cap_currency": market_cap_currency,
            "market_cap_usd": market_cap_usd,
            "market_cap_in_reporting_currency": None,
            "mfi_price_date": mfi_price_date,
            "fx_rate_review": rate_review,
            "guardrail": "Do not mix USD market capitalization with reporting-currency debt/cash. No fallback to latest FX is allowed when a quote-date rate is missing.",
        }
    converted_market_cap = (
        round(float(market_cap_usd) * float(rate), 2)
        if isinstance(market_cap_usd, (int, float)) else None
    )
    result_status = (
        ("same_currency_market_cap_missing" if converted_market_cap is None else "market_cap_same_currency")
        if same_currency else
        ("fx_rate_available_market_cap_missing" if converted_market_cap is None else "market_cap_converted_review_only")
    )
    return {
        "status": result_status,
        "reporting_currency": reporting,
        "market_cap_currency": market_cap_currency,
        "market_cap_usd": market_cap_usd,
        "market_cap_in_reporting_currency": converted_market_cap,
        "mfi_price_date": mfi_price_date,
        "fx_rate_review": rate_review,
        "conversion_formula": "USD market cap × reporting-currency units per USD at the MFI price date",
        "guardrail": "ECB reference-rate conversion only (Source: ECB statistics). Debt and cash remain in their filing currency and at their fiscal-period balance-sheet date. This is not an approved EV or Earnings Yield calculation.",
    }


def manual_enterprise_value_scenario_review(
    market_cap_reporting_currency: float | None,
    ebit_candidate: float | None,
    conventional_net_debt: float | None,
    noncontrolling_interest: float | None = None,
    lease_liabilities: float | None = None,
    currency: str | None = None,
) -> dict[str, Any]:
    """Show manual EV/EY scope sensitivities without selecting a production definition."""
    required = (market_cap_reporting_currency, ebit_candidate, conventional_net_debt)
    if any(not isinstance(value, (int, float)) for value in required):
        return {
            "status": "inputs_incomplete",
            "currency": currency,
            "scenarios": [],
            "guardrail": "No EV/Earnings Yield scenario is calculated until market cap, EBIT and conventional net debt are all available in the same currency.",
        }

    nci = float(noncontrolling_interest) if isinstance(noncontrolling_interest, (int, float)) else None
    leases = float(lease_liabilities) if isinstance(lease_liabilities, (int, float)) else None
    base_ev = float(market_cap_reporting_currency) + float(conventional_net_debt)
    definitions = [
        ("conventional_debt_only", base_ev, "Market cap plus conventional net debt; excludes NCI and lease liabilities."),
    ]
    if nci is not None:
        definitions.append(("plus_noncontrolling_interest", base_ev + nci,
            "Adds reported NCI to align consolidated EBIT with enterprise value."))
    if leases is not None:
        definitions.append(("plus_lease_liabilities", base_ev + leases,
            "Adds current and noncurrent lease liabilities to conventional EV."))
    if nci is not None and leases is not None:
        definitions.append(("plus_nci_and_lease_liabilities", base_ev + nci + leases,
            "Adds both NCI and lease liabilities to conventional EV."))
    scenarios = []
    for name, enterprise_value, treatment in definitions:
        earnings_yield = (
            round(float(ebit_candidate) / enterprise_value * 100, 4)
            if enterprise_value > 0 else None
        )
        scenarios.append({
            "name": name,
            "enterprise_value": round(enterprise_value, 2),
            "earnings_yield_percent": earnings_yield,
            "treatment": treatment,
        })
    return {
        "status": "review_only_sensitivity",
        "currency": currency,
        "market_cap": round(float(market_cap_reporting_currency), 2),
        "ebit_candidate": float(ebit_candidate),
        "conventional_net_debt_candidate": float(conventional_net_debt),
        "noncontrolling_interest_candidate": nci,
        "lease_liabilities_candidate": leases,
        "omitted_scenarios_due_to_unknown_inputs": [name for name, value in (("noncontrolling_interest", nci), ("lease_liabilities", leases)) if value is None],
        "scenarios": scenarios,
        "guardrail": "All scenarios are manual review sensitivities. A scenario is omitted when its required adjustment is unknown; missing NCI or lease liabilities are never assumed to be zero. No EV definition, EBIT classification, cash availability, debt scope or Earnings Yield is approved for production ranking.",
    }


def filing_metadata(filing: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for name in METADATA_FIELDS:
        try:
            value = getattr(filing, name, None)
            if value is not None and not callable(value):
                result[name] = safe_value(value)
        except Exception:
            continue
    return result


ROW_META_KEYS = {
    "index", "concept", "label", "level", "abstract", "dimension",
    "is_breakdown", "dimension_axis", "dimension_member",
    "dimension_member_label", "dimension_label", "balance", "weight",
    "preferred_sign", "parent_concept", "parent_abstract_concept",
}


def compact_statement_row(record: dict[str, Any]) -> dict[str, Any]:
    # INTENTIONAL: retain every detailed row once. candidate replaces the
    # duplicated all_rows + filtered rows arrays from the previous artifact.
    row = {key: record.get(key) for key in ROW_META_KEYS if record.get(key) is not None}
    values = {
        key: safe_value(value) for key, value in record.items()
        if key not in ROW_META_KEYS and value is not None
    }
    if values:
        row["values"] = values
    searchable = " ".join(str(value) for value in record.values() if value is not None)
    row["candidate"] = bool(ROW_PATTERN.search(searchable))
    return row


def statement_candidates(statement: Any) -> dict[str, Any]:
    if statement is None:
        return {"available": False, "row_count": 0, "candidate_row_count": 0, "rows": [], "error": "Statement unavailable"}
    try:
        frame = statement.to_dataframe(view="detailed").reset_index()
        rows = [
            compact_statement_row({str(key): safe_value(value) for key, value in record.items()})
            for record in frame.to_dict(orient="records")
        ]
        return {
            "available": True,
            "row_count": len(rows),
            "candidate_row_count": sum(1 for row in rows if row["candidate"]),
            "rows": rows,
        }
    except Exception as exc:
        return {"available": False, "row_count": 0, "candidate_row_count": 0,
                "rows": [], "error": f"{type(exc).__name__}: {exc}"}


def _row_amount(row: dict[str, Any]) -> float | None:
    for value in row.get("values", {}).values():
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
            return float(value)
    return None


def build_ebit_bridge(income_statement: dict[str, Any]) -> dict[str, Any]:
    rows = income_statement.get("rows", [])

    def find(pattern: str, label_pattern: str | None = None,
             exclude_pattern: str | None = None) -> dict[str, Any] | None:
        concept_re = re.compile(pattern, re.IGNORECASE)
        label_re = re.compile(label_pattern, re.IGNORECASE) if label_pattern else None
        exclude_re = re.compile(exclude_pattern, re.IGNORECASE) if exclude_pattern else None
        matches = [
            row for row in rows
            if not row.get("abstract") and not row.get("dimension")
            and concept_re.search(str(row.get("concept", "")))
            and (label_re is None or label_re.search(str(row.get("label", ""))))
            and (exclude_re is None or not exclude_re.search(str(row.get("concept", ""))))
            and _row_amount(row) is not None
        ]
        return matches[0] if matches else None

    used_concepts: dict[str, str] = {}

    def item(name: str, pattern: str, treatment: str,
             label_pattern: str | None = None,
             exclude_pattern: str | None = None) -> dict[str, Any] | None:
        row = find(pattern, label_pattern, exclude_pattern)
        if row is None:
            return None
        concept = str(row.get("concept", ""))
        # INTENTIONAL: one XBRL concept can only fill one bridge category.
        # Prevent broad taxonomy patterns from assigning a row twice.
        if concept in used_concepts:
            return None
        used_concepts[concept] = name
        return {"item": name, "concept": concept, "label": row.get("label"),
                "amount": _row_amount(row), "treatment": treatment,
                "parent": row.get("parent_concept")}

    revenue = item(
        "revenue",
        r"(?:^|_)(?:RevenueFromContractWithCustomerExcludingAssessedTax|Revenues|Revenue)$",
        "anchor",
    )
    pretax = item(
        "pretax_income",
        r"(?:^|_)IncomeLossFromContinuingOperationsBeforeIncomeTaxes(?:ExtraordinaryItemsNoncontrollingInterest|MinorityInterestAndIncomeLossFromEquityMethodInvestments)?$",
        "reconciliation_anchor",
    )

    category_patterns = [
        ("cost_of_revenue", r"(?:^|_)(?:CostOfGoodsAndServicesSold|CostOfRevenue)$", "operating_candidate", None, None),
        ("selling_general_admin", r"(?:^|_)SellingGeneralAndAdministrativeExpense$", "operating_candidate", None, None),
        ("research_development", r"(?:^|_)ResearchAndDevelopmentExpense$", "operating_candidate", None, None),
        ("restructuring", r"(?:^|_)RestructuringCostsAndAssetImpairmentCharges$", "operating_candidate_review", None, None),
        ("financing_and_other", r"(?:^|_)FinancingInterestExpense$", "ambiguous_review", None, None),
        # Prefer the distinct interest-expense row by its statement label.
        # Exclude FinancingInterestExpense even though its concept contains
        # the suffix "InterestExpense".
        ("interest_expense", r"(?:^|_)(?:InterestIncomeExpenseNet|InterestExpense)$",
         "non_operating_candidate", r"^Interest expense$", r"FinancingInterestExpense"),
        # INTENTIONAL: EdgarTools may expose this as a generic NonoperatingIncomeExpense concept.
        # Match the human-readable label independently of the taxonomy suffix, because
        # issuer presentation labels can be more specific than the XBRL concept name.
        ("pension_non_service", r".*", "non_operating_candidate", r"pension|postretirement|non.?service", None),
        ("other_expense", r"(?:^|_)OtherNonrecurringIncomeExpense$", "ambiguous_review", r"other expense", None),
    ]
    expenses = [
        entry for name, pattern, treatment, label_pattern, exclude_pattern in category_patterns
        if (entry := item(name, pattern, treatment, label_pattern, exclude_pattern))
    ]
    by_name = {entry["item"]: entry for entry in expenses}
    required = ["cost_of_revenue", "selling_general_admin", "research_development"]
    if revenue is None or pretax is None or any(name not in by_name for name in required):
        return {
            "status": "insufficient_rows", "revenue": revenue, "pretax_income": pretax,
            "expense_candidates": expenses,
            "unmatched_required": [name for name in (["revenue", "pretax_income"] if revenue is None or pretax is None else []) + required if name not in (["revenue"] if revenue else []) + (["pretax_income"] if pretax else []) + list(by_name)],
            "note": "Required non-dimensional statement rows were not all identified; no EBIT candidate calculated.",
        }

    # INTENTIONAL: these alternative scenarios are diagnostic only. Rows with
    # uncertain presentation are not silently assigned to operating/non-operating.
    core_names = required + (["restructuring"] if "restructuring" in by_name else [])
    core_total = sum(by_name[name]["amount"] for name in core_names)
    financing = by_name.get("financing_and_other", {}).get("amount", 0.0)
    interest = by_name.get("interest_expense", {}).get("amount", 0.0)
    pension_entry = by_name.get("pension_non_service")
    pension = pension_entry["amount"] if pension_entry else 0.0
    other = by_name.get("other_expense", {}).get("amount", 0.0)
    # INTENTIONAL: do not silently treat a missing pension/non-operating row as zero.
    # Keep the arithmetic visible, but mark the scenario incomplete and expose the gap.
    missing_adjustments = [name for name in ("interest_expense", "pension_non_service", "other_expense") if name not in by_name]
    scenarios = []
    for scenario, include_financing in [
        ("financing_cost_treated_as_operating", True),
        ("financing_cost_treated_as_non_operating", False),
    ]:
        candidate = revenue["amount"] - core_total - (financing if include_financing else 0.0)
        nonop_adjustments = interest + pension + other + (0.0 if include_financing else financing)
        reconstructed = candidate - nonop_adjustments
        scenarios.append({
            "scenario": scenario,
            "candidate_operating_income": round(candidate, 2),
            "assumption": ("Cost of financing and other is operating" if include_financing else "Cost of financing and other is non-operating") + "; assumes pension/postretirement and other expense are non-operating, and restructuring is operating",
            "classification_assumptions": {
                "financing_and_other": "operating" if include_financing else "non_operating",
                "interest_expense": "non_operating",
                "pension_non_service": "non_operating",
                "other_expense": "non_operating_review_required",
                "restructuring": "operating_review_required",
            },
            "non_operating_adjustments": round(nonop_adjustments, 2),
            "reconstructed_pretax_income": round(reconstructed, 2),
            "reported_pretax_income": pretax["amount"],
            "reconciliation_difference": round(reconstructed - pretax["amount"], 2),
            "reconciles_within_1": abs(reconstructed - pretax["amount"]) <= 1.0 if not missing_adjustments else None,
            "missing_adjustments": missing_adjustments,
            "status": "review_required" if not missing_adjustments else "missing_adjustment_rows",
        })
    return {
        "status": "review_required", "revenue": revenue, "pretax_income": pretax,
        "operating_expense_candidates": [by_name[name] for name in core_names],
        "ambiguous_expense_candidates": [by_name[name] for name in ("financing_and_other", "other_expense") if name in by_name],
        "non_operating_candidates": [by_name[name] for name in ("interest_expense", "pension_non_service") if name in by_name],
        "missing_adjustments": missing_adjustments,
        "scenarios": scenarios,
        "guardrail": "Reconciliation does not prove classification. Review filing presentation and notes; never promote this candidate automatically into production EBIT.",
    }


def statement_fact_amount(
    statements: dict[str, Any], statement_name: str, concept_suffix: str,
    label_pattern: str, period: str,
) -> float | None:
    statement = statements.get(statement_name) or {}
    label_re = re.compile(label_pattern, re.IGNORECASE)
    matches = [
        row for row in statement.get("rows", [])
        if row.get("dimension") is False
        and not row.get("abstract")
        and str(row.get("concept", "")).endswith(concept_suffix)
        and label_re.search(str(row.get("label", "")))
    ]
    # INTENTIONAL: filing review facts require an exact statement label and
    # fiscal-period key. Never pick the first annual column or a dimensional row.
    if len(matches) != 1:
        return None
    values = matches[0].get("values") or {}
    for key, value in values.items():
        if str(key).startswith(period) and isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
    return None



def direct_operating_income_fact(
    statements: dict[str, Any], period: str,
) -> dict[str, Any]:
    """Find one exact consolidated annual operating-profit row across US-GAAP and IFRS."""
    accepted_concepts = (
        "OperatingIncomeLoss",
        "OperatingProfitLoss",
        "ProfitLossFromOperatingActivities",
    )
    label_re = re.compile(DIRECT_OPERATING_INCOME_LABEL_PATTERN, re.IGNORECASE)
    matches = []
    invalid_period_rows = []
    for row in (statements.get("income_statement") or {}).get("rows", []):
        concept = str(row.get("concept", ""))
        if not concept.endswith(accepted_concepts):
            continue
        if row.get("dimension") is not False or row.get("abstract"):
            continue
        if not label_re.search(str(row.get("label", ""))):
            continue
        period_values = [
            (str(key), value)
            for key, value in (row.get("values") or {}).items()
            if str(key).startswith(period)
            and isinstance(value, (int, float))
            and not isinstance(value, bool)
        ]
        if len(period_values) != 1:
            invalid_period_rows.append({
                "concept": concept,
                "label": str(row.get("label", "")),
                "period_value_count": len(period_values),
            })
            continue
        matches.append({
            "concept": concept,
            "label": str(row.get("label", "")),
            "fiscal_period": period,
            "value": float(period_values[0][1]),
        })
    if len(matches) == 1 and not invalid_period_rows:
        return {"status": "unique_candidate", "candidate": matches[0]}
    if len(matches) > 1 or (matches and invalid_period_rows):
        return {
            "status": "ambiguous",
            "candidate": None,
            "candidates": matches + invalid_period_rows,
        }
    return {
        "status": "not_found",
        "candidate": None,
        "candidates": invalid_period_rows,
    }



def balance_sheet_review(
    statements: dict[str, Any], period: str,
    current_debt_concept: str, noncurrent_debt_concept: str,
) -> dict[str, Any]:
    current_assets = statement_fact_amount(
        statements, "balance_sheet", "AssetsCurrent", r"^Total current assets$", period,
    )
    current_liabilities = statement_fact_amount(
        statements, "balance_sheet", "LiabilitiesCurrent", r"^Total current liabilities$", period,
    )
    cash = statement_fact_amount(
        statements, "balance_sheet", "CashAndCashEquivalentsAtCarryingValue",
        r"^Cash and cash equivalents$", period,
    )
    ppe = statement_fact_amount(
        statements, "balance_sheet", "PropertyPlantAndEquipmentNet",
        r"^Property and equipment", period,
    )
    current_debt = statement_fact_amount(
        statements, "balance_sheet", current_debt_concept, r"^(?:Current portion of long-term debt|Debt)$", period,
    )
    noncurrent_debt = statement_fact_amount(
        statements, "balance_sheet", noncurrent_debt_concept, r"^(?:Long-term debt|Debt)$", period,
    )
    values = {
        "current_assets": current_assets,
        "current_liabilities": current_liabilities,
        "cash_and_cash_equivalents_excluding_restricted_cash": cash,
        "net_property_plant_and_equipment": ppe,
        "current_debt": current_debt,
        "noncurrent_debt": noncurrent_debt,
    }
    if any(value is None for value in values.values()):
        return {
            "status": "review_required",
            "inputs": values,
            "reason": "One or more exact, non-dimensional balance-sheet facts were not found for the selected fiscal period.",
        }
    total_debt = current_debt + noncurrent_debt
    working_capital = current_assets - current_liabilities
    invested_capital = working_capital + ppe
    return {
        "status": "review_only",
        "inputs": values,
        "total_debt_excluding_leases": round(total_debt, 2),
        "net_debt_excluding_leases": round(total_debt - cash, 2),
        "working_capital": round(working_capital, 2),
        "invested_capital_current_assets_less_current_liabilities_plus_net_ppe": round(invested_capital, 2),
        "guardrail": "Balance-sheet inputs are review-only. Lease liabilities and short-term investments are not included in this simple debt/cash comparison; confirm the production EV policy separately.",
    }

def balance_sheet_fact_review(statements: dict[str, Any], period: str) -> dict[str, Any]:
    """Expose issuer balance-sheet candidates without silently selecting accounting inputs."""
    statement = statements.get("balance_sheet") or {}
    rows = statement.get("rows", [])
    categories = {
        "cash_unrestricted_candidates": {
            "label": re.compile(r"cash and cash equivalents|^cash$", re.I),
            "concept": re.compile(r"CashAndCashEquivalentsAtCarryingValue|CashAndCashEquivalents$", re.I),
            "exclude_label": re.compile(r"\brestricted\b|short.?term investments", re.I),
            "exclude_concept": re.compile(r"RestrictedCash|CashCashEquivalentsRestrictedCash", re.I),
        },
        "cash_restricted_candidates": {
            "label": re.compile(r"^restricted cash$", re.I),
            "concept": re.compile(r"(?:RestrictedCashCurrent|RestrictedCashNoncurrent|CurrentRestrictedCashAndCashEquivalents)$", re.I),
        },
        "cash_combined_or_investment_candidates": {
            "label": re.compile(r"cash.*restricted cash|restricted cash.*cash|cash.*short.?term investments", re.I),
            "concept": re.compile(r"CashCashEquivalentsRestrictedCash|CashCashEquivalentsRestrictedCashAndShortTermInvestments", re.I),
        },
        "current_assets_candidates": {
            "label": re.compile(r"^total current assets$", re.I),
            "concept": re.compile(r"(?:^|_)AssetsCurrent$", re.I),
        },
        "current_liabilities_candidates": {
            "label": re.compile(r"^total current liabilities$", re.I),
            "concept": re.compile(r"(?:^|_)LiabilitiesCurrent$", re.I),
        },
        "net_ppe_candidates": {
            "label": re.compile(r"^(?:property,? plant and equipment|property and equipment|fixed assets)", re.I),
            "concept": re.compile(r"PropertyPlantAndEquipment(?:Net)?$", re.I),
            "exclude_label": re.compile(r"^rental property and equipment", re.I),
            "exclude_concept": re.compile(r"RentalPropertyAndEquipmentNet$", re.I),
        },
        "rental_equipment_net_candidates": {
            "label": re.compile(r"^rental property and equipment", re.I),
            "concept": re.compile(r"RentalPropertyAndEquipmentNet$", re.I),
        },
        "right_of_use_asset_candidates": {
            "label": re.compile(r"right.?of.?use assets?|operating lease assets|finance lease assets", re.I),
            "concept": re.compile(r"(?:OperatingLeaseRightOfUseAsset|FinanceLeaseRightOfUseAsset|RightofuseAssets)$", re.I),
        },
        "nondebt_financing_obligation_candidates": {
            "label": re.compile(r"sale lease.?back financing|construction financing|financing obligation", re.I),
            "concept": re.compile(r"(?:SaleLeaseBackFinancing|ConstructionFinancing|FinancingObligation)$", re.I),
        },
        "noncontrolling_interest_candidates": {
            "label": re.compile(r"non.?controlling interest|minority interest", re.I),
            "concept": re.compile(r"(?:NoncontrollingInterestInConsolidatedEntity|NoncontrollingInterests|MinorityInterest)$", re.I),
        },
        "current_debt_candidates": {
            "label": re.compile(r"current portion of .*debt|current maturities|debt,? current|short.?term borrowings|notes payable and short.?term borrowings", re.I),
            "concept": re.compile(r"(?:LongTermDebtCurrent|DebtCurrent|ShortTermBorrowings|CurrentBorrowings)$", re.I),
        },
        "noncurrent_debt_candidates": {
            "label": re.compile(r"^long.?term debt$|^debt,? noncurrent$|^interest-bearing loans and borrowings$|^non.?current borrowings$", re.I),
            "concept": re.compile(r"(?:LongTermDebtNoncurrent|LongTermDebt|LongtermBorrowings|NoncurrentBorrowings)$", re.I),
        },
        "current_lease_liability_candidates": {
            "label": re.compile(r"^(?!non.?current).*current.*lease liabilities?|^(?!non.?current).*lease liabilities?.*current", re.I),
            "concept": re.compile(r"(?:OperatingLeaseLiabilityCurrent|FinanceLeaseLiabilityCurrent|(?:^|_)CurrentLeaseLiabilities)$", re.I),
        },
        "noncurrent_lease_liability_candidates": {
            "label": re.compile(r"non.?current.*lease liabilities?|lease liabilities?.*non.?current", re.I),
            "concept": re.compile(r"(?:OperatingLeaseLiabilityNoncurrent|FinanceLeaseLiabilityNoncurrent|NoncurrentLeaseLiabilities)$", re.I),
        },
    }
    result: dict[str, Any] = {}
    for category, rules in categories.items():
        candidates = []
        for row in rows:
            label = str(row.get("label", "")).strip()
            concept = str(row.get("concept", ""))
            # INTENTIONAL: consolidated non-dimensional facts only. Dimensional
            # breakdowns are retained in statement rows but never mixed into totals.
            if row.get("dimension") is not False or row.get("abstract"):
                continue
            label_match = bool(rules["label"].search(label))
            concept_match = bool(rules["concept"].search(concept))
            # INTENTIONAL: "noncurrent" contains the substring "current".
            # Do not let a noncurrent lease label enter the current category.
            if category == "current_lease_liability_candidates" and re.search(r"\bnon.?current\b", label, re.I):
                label_match = False
            if not (label_match or concept_match):
                continue
            if ((rules.get("exclude_label") and rules["exclude_label"].search(label))
                    or (rules.get("exclude_concept") and rules["exclude_concept"].search(concept))):
                continue
            values = row.get("values") or {}
            value = values.get(period)
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                continue
            candidates.append({
                "concept": concept,
                "label": label,
                "fiscal_period": period,
                "value": value,
            })
        result[category] = {
            "status": "unique_candidate" if len(candidates) == 1 else (
                "ambiguous_candidates" if candidates else "not_found"
            ),
            "candidate_count": len(candidates),
            "candidates": candidates,
        }
    unresolved = [
        key for key, value in result.items()
        if value["status"] != "unique_candidate"
    ]
    # INTENTIONAL: label and taxonomy matching only surfaces candidates. It does
    # not resolve aggregate-vs-component debt, lease scope, restricted cash, or
    # issuer-specific PP&E overlap. No candidate is promoted into production.
    return {
        "status": "review_only" if not unresolved else "review_required",
        "fiscal_period": period,
        "categories": result,
        "unresolved_categories": unresolved,
        "guardrail": "Candidate extraction only. No value is selected for EV, invested capital, Earnings Yield or ROC. Review reporting currency, restricted cash, debt scope, leases, PP&E overlap and issuer presentation before use.",
    }



def invested_capital_review(balance_review: dict[str, Any]) -> dict[str, Any]:
    """Calculate the existing ROC denominator only when all three inputs are unique."""
    categories = balance_review.get("categories", {})
    required = (
        "current_assets_candidates",
        "current_liabilities_candidates",
        "net_ppe_candidates",
    )
    inputs: dict[str, float] = {}
    unresolved = []
    for name in required:
        category = categories.get(name, {})
        candidates = category.get("candidates", [])
        if category.get("status") != "unique_candidate" or len(candidates) != 1:
            unresolved.append(name)
            continue
        inputs[name] = float(candidates[0]["value"])
    if unresolved:
        return {
            "status": "review_required",
            "method": "current_assets_minus_current_liabilities_plus_net_ppe",
            "value": None,
            "inputs": inputs,
            "unresolved_inputs": unresolved,
            "guardrail": "No denominator is calculated unless current assets, current liabilities and net PP&E each have exactly one candidate. This review value never feeds production ROC or ranking.",
        }
    value = (
        inputs["current_assets_candidates"]
        - inputs["current_liabilities_candidates"]
        + inputs["net_ppe_candidates"]
    )
    return {
        "status": "calculated_review_only",
        "method": "current_assets_minus_current_liabilities_plus_net_ppe",
        "value": round(value, 2),
        "sign": "positive" if value > 0 else "negative" if value < 0 else "zero",
        "inputs": inputs,
        "unresolved_inputs": [],
        "guardrail": "Review-only denominator using unique label/concept candidates. This does not approve PP&E scope, EBIT, ROC, eligibility or ranking and never feeds production data.",
    }



def enterprise_value_scope_review(balance_review: dict[str, Any] | None) -> dict[str, Any]:
    """Summarize debt/cash candidates without claiming an approved enterprise value."""
    categories = (balance_review or {}).get("categories", {})

    def unique_value(name: str) -> float | None:
        category = categories.get(name, {})
        candidates = category.get("candidates", [])
        if category.get("candidate_count") != 1 or len(candidates) != 1:
            return None
        value = candidates[0].get("value")
        return float(value) if isinstance(value, (int, float)) else None

    current_debt = unique_value("current_debt_candidates")
    noncurrent_debt = unique_value("noncurrent_debt_candidates")
    unrestricted_cash = unique_value("cash_unrestricted_candidates")
    flags = []
    if current_debt is None:
        flags.append("current_debt_not_uniquely_identified_not_assumed_zero")
    if noncurrent_debt is None:
        flags.append("noncurrent_debt_not_uniquely_identified_not_assumed_zero")
    if unrestricted_cash is None:
        flags.append("unrestricted_cash_not_uniquely_identified")
    if any(categories.get(name, {}).get("candidate_count", 0) for name in (
        "current_lease_liability_candidates", "noncurrent_lease_liability_candidates",
    )):
        flags.append("lease_liabilities_separate_from_conventional_debt_require_policy_decision")
    if categories.get("nondebt_financing_obligation_candidates", {}).get("candidate_count", 0):
        flags.append("separate_financing_obligation_requires_enterprise_value_policy_decision")
    if categories.get("noncontrolling_interest_candidates", {}).get("candidate_count", 0):
        flags.append("noncontrolling_interest_requires_enterprise_value_adjustment_review")
    if any(categories.get(name, {}).get("candidate_count", 0) for name in (
        "cash_restricted_candidates", "cash_combined_or_investment_candidates",
    )):
        flags.append("restricted_cash_or_short_term_investments_require_cash_scope_review")

    gross_debt = None
    if current_debt is not None and noncurrent_debt is not None:
        gross_debt = round(current_debt + noncurrent_debt, 2)
    net_debt = None
    if gross_debt is not None and unrestricted_cash is not None:
        net_debt = round(gross_debt - unrestricted_cash, 2)

    # INTENTIONAL: completeness diagnostic only. Missing facts are unknown, never zero.
    return {
        "status": "review_required" if flags else "candidate_inputs_identified_review_only",
        "current_debt_candidate": current_debt,
        "noncurrent_debt_candidate": noncurrent_debt,
        "conventional_gross_debt_candidate": gross_debt,
        "unrestricted_cash_candidate": unrestricted_cash,
        "conventional_net_debt_candidate": net_debt,
        "lease_liabilities": {
            "current_candidate_count": categories.get("current_lease_liability_candidates", {}).get("candidate_count", 0),
            "noncurrent_candidate_count": categories.get("noncurrent_lease_liability_candidates", {}).get("candidate_count", 0),
        },
        "separate_financing_obligation_candidate_count": categories.get("nondebt_financing_obligation_candidates", {}).get("candidate_count", 0),
        "review_flags": flags,
        "guardrail": "Candidate debt/cash bridge only, not Enterprise Value. Lease liabilities, separate financing obligations, restricted cash and investments require explicit policy. Missing inputs are unknown, not zero. No production ratios or rankings are changed.",
    }


def roc_review(
    direct_ebit: dict[str, Any],
    invested_capital: dict[str, Any],
    balance_review: dict[str, Any] | None = None,
    filing_specific_ebit: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compute review-only ROC while preserving the source and scope of EBIT."""
    direct_value = direct_ebit.get("ebit_candidate")
    specific_value = (filing_specific_ebit or {}).get("ebit_candidate")
    ebit_source = "direct_reported_operating_income"
    ebit = direct_value
    is_filing_specific = False
    if direct_ebit.get("status") != "review_only" or not isinstance(direct_value, (int, float)):
        # INTENTIONAL: issuer-specific reconstructions are allowed only as
        # separately labelled research candidates, never as direct EBIT.
        if (
            (filing_specific_ebit or {}).get("status") == "review_only"
            and isinstance(specific_value, (int, float))
        ):
            ebit = specific_value
            ebit_source = str((filing_specific_ebit or {}).get("method") or "filing_specific_manual_review")
            is_filing_specific = True

    capital = invested_capital.get("value")
    categories = (balance_review or {}).get("categories", {})
    review_flags = []
    # INTENTIONAL: unresolved accounting-scope flags prevent a numerical
    # candidate from being presented as an approved diagnostic ROC.
    if categories.get("rental_equipment_net_candidates", {}).get("candidate_count", 0):
        review_flags.append("separate_rental_equipment_requires_invested_capital_scope_review")
    if categories.get("right_of_use_asset_candidates", {}).get("candidate_count", 0):
        review_flags.append("right_of_use_assets_present_review_invested_capital_scope")
    if categories.get("nondebt_financing_obligation_candidates", {}).get("candidate_count", 0):
        review_flags.append("nondebt_financing_obligation_requires_enterprise_value_scope_review")
    if categories.get("noncontrolling_interest_candidates", {}).get("candidate_count", 0):
        review_flags.append("noncontrolling_interest_present_review_enterprise_value_scope")
    if any(categories.get(name, {}).get("candidate_count", 0) for name in (
        "current_lease_liability_candidates", "noncurrent_lease_liability_candidates",
    )):
        review_flags.append("lease_liabilities_present_review_debt_and_invested_capital_treatment")
    if any(categories.get(name, {}).get("candidate_count", 0) for name in (
        "cash_restricted_candidates", "cash_combined_or_investment_candidates",
    )):
        review_flags.append("restricted_or_combined_cash_present_review_enterprise_value_cash_input")

    if not isinstance(ebit, (int, float)):
        return {
            "status": "review_required",
            "roc": None,
            "reason": "No direct or filing-specific EBIT candidate is available.",
            "review_flags": review_flags,
        }
    if invested_capital.get("status") != "calculated_review_only" or not isinstance(capital, (int, float)):
        return {
            "status": "review_required",
            "roc": None,
            "reason": "Invested-capital denominator is missing or ambiguous.",
            "ebit_source": ebit_source,
            "review_flags": review_flags,
        }
    if capital <= 0:
        return {
            "status": "not_calculated_nonpositive_invested_capital",
            "roc": None,
            "reason": "Nonpositive invested capital is not used as a ROC denominator.",
            "invested_capital": capital,
            "ebit": ebit,
            "ebit_source": ebit_source,
            "review_flags": review_flags,
        }

    candidate_roc = round((float(ebit) / float(capital)) * 100, 4)
    if review_flags or is_filing_specific:
        status = "review_required_scope_flags" if review_flags else "review_required_filing_specific_ebit"
        return {
            "status": status,
            "roc": None,
            "candidate_roc": candidate_roc,
            "ebit": ebit,
            "ebit_source": ebit_source,
            "invested_capital": capital,
            "method": "filing_specific_manual_review_ebit_over_reviewed_invested_capital" if is_filing_specific else "direct_operating_income_over_reviewed_invested_capital",
            "review_flags": review_flags,
            "guardrail": "Numerical ROC is a research candidate only. Filing-specific EBIT reconstructions and/or unresolved accounting-scope flags prevent it from being presented as calculated ROC.",
        }
    # INTENTIONAL: even unflagged ratios remain review-only, never production inputs.
    return {
        "status": "calculated_review_only",
        "roc": candidate_roc,
        "ebit": ebit,
        "ebit_source": ebit_source,
        "invested_capital": capital,
        "method": "direct_operating_income_over_reviewed_invested_capital",
        "review_flags": [],
        "guardrail": "Diagnostic ROC only. Direct EBIT and unique denominator candidates are not production-approved mappings; this result never feeds D1, eligibility or ranking.",
    }

def filing_specific_review(
    symbol: str, filing: dict[str, Any], bridge: dict[str, Any],
    statements: dict[str, Any],
) -> dict[str, Any] | None:
    accession = str(filing.get("accession_number") or filing.get("accession_no") or filing.get("accession") or "")
    period = str(filing.get("period_of_report") or filing.get("report_date") or "")

    # INTENTIONAL: issuer/accession-specific review notes are manually scoped.
    # These are not reusable XBRL mappings and never feed production calculations.
    if symbol == "HRB" and accession == "0000012659-26-000026":
        revenue = statement_fact_amount(
            statements, "income_statement", "RevenueFromContractWithCustomerExcludingAssessedTax",
            r"^Revenues$", period,
        )
        operating_expenses = statement_fact_amount(
            statements, "income_statement", "CostsAndExpenses", r"^Total operating expenses$", period,
        )
        pretax = statement_fact_amount(
            statements, "income_statement",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
            r"^Income from continuing operations before income taxes$", period,
        )
        other_income = statement_fact_amount(
            statements, "income_statement", "OtherNonoperatingIncomeExpense",
            r"^Other income \(expense\), net$", period,
        )
        interest_signed = statement_fact_amount(
            statements, "income_statement", "InterestExpenseDebt",
            r"^Interest expense on borrowings$", period,
        )
        inputs = {
            "reported_revenue": revenue,
            "reported_total_operating_expenses": operating_expenses,
            "reported_pretax_income": pretax,
            "reported_other_income_expense_net": other_income,
            "reported_interest_expense_signed": interest_signed,
        }
        if any(value is None for value in inputs.values()):
            return {
                "status": "review_required", "filing_accession": accession,
                "source_context": "FY2026 Form 10-K, consolidated statement of income",
                "inputs": inputs,
                "reason": "One or more exact, non-dimensional statement facts were not found for the selected fiscal period.",
            }
        revenue_less_expenses = revenue - operating_expenses
        pretax_reconciliation = pretax - other_income - interest_signed
        return {
            "status": "review_only",
            "method": "statement_subtotal_reconstructed",
            "automation_status": "manual_review_only",
            "filing_accession": accession,
            "fiscal_period": period,
            "source_context": "FY2026 Form 10-K, consolidated statement of income and MD&A operating expense summary",
            **inputs,
            "ebit_candidate": round(revenue_less_expenses, 2),
            "cross_checks": {
                "revenue_less_total_operating_expenses": round(revenue_less_expenses, 2),
                "pretax_less_other_nonoperating_income_and_signed_interest": round(pretax_reconciliation, 2),
                "difference_between_methods": round(revenue_less_expenses - pretax_reconciliation, 2),
                "reconciles_within_1": abs(revenue_less_expenses - pretax_reconciliation) <= 1.0,
            },
            "formula": "reported revenue - reported total operating expenses",
            "classification_note": "The direct OperatingIncomeLoss row was not surfaced in EdgarTools, but the filing presents total operating expenses separately from other income (expense), net and interest expense. The operating subtotal is independently cross-checked from pretax income less non-operating income and signed interest expense. This is a filing-specific reconstruction, not a general tag mapping.",
            "balance_sheet_review": balance_sheet_review(statements, period, "LongTermDebtCurrent", "LongTermDebtNoncurrent"),
            "guardrail": "Filing-specific manual review only. Do not generalize this extraction or promote it into production fundamentals or rankings.",
        }

    if symbol == "ADBE" and accession == "0000796343-26-000003":
        direct_operating_income = statement_fact_amount(
            statements, "income_statement", "OperatingIncomeLoss", r"Operating income", period,
        )
        pretax = statement_fact_amount(
            statements, "income_statement",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
            r"^Income before income taxes$", period,
        )
        nonoperating_net = statement_fact_amount(
            statements, "income_statement", "NonoperatingIncomeExpense",
            r"^Total non-operating income \(expense\), net$", period,
        )
        inputs = {
            "reported_direct_operating_income": direct_operating_income,
            "reported_pretax_income": pretax,
            "reported_nonoperating_income_expense_net": nonoperating_net,
        }
        if any(value is None for value in inputs.values()):
            return {
                "status": "review_required", "filing_accession": accession,
                "source_context": "FY2025 Form 10-K, consolidated statement of income",
                "inputs": inputs,
                "reason": "One or more exact, non-dimensional statement facts were not found for the selected fiscal period.",
            }
        pretax_less_nonoperating = pretax - nonoperating_net
        return {
            "status": "review_only",
            "method": "direct_reported_operating_income",
            "automation_status": "direct_fact_control_only",
            "filing_accession": accession,
            "fiscal_period": period,
            "source_context": "FY2025 Form 10-K, consolidated statement of income and Note 18",
            **inputs,
            "ebit_candidate": round(direct_operating_income, 2),
            "cross_checks": {
                "pretax_less_nonoperating_income_expense": round(pretax_less_nonoperating, 2),
                "difference_from_direct_operating_income": round(direct_operating_income - pretax_less_nonoperating, 2),
                "reconciles_within_1": abs(direct_operating_income - pretax_less_nonoperating) <= 1.0,
            },
            "formula": "directly reported OperatingIncomeLoss; cross-checked as pretax income - net non-operating income",
            "classification_note": "The filing presents GAAP operating income directly and separately reports interest expense, investment gains and other non-operating income. This is the control case for direct operating-income extraction.",
            "balance_sheet_review": balance_sheet_review(statements, period, "DebtCurrent", "LongTermDebt"),
            "guardrail": "Filing-specific validation only. Do not treat this as approval of any broad taxonomy mapping or production update.",
        }

    # INTENTIONAL: SGHC uses IFRS and its FY2025 statement does not
    # present a direct operating-profit subtotal. Reconstruct this one filing
    # from its exact signed statement rows; never generalize the mapping.
    if symbol == "SGHC" and accession == "0001628280-26-025609":
        facts = {
            "revenue": ("Revenue", r"^Revenue$"),
            "direct_and_marketing_expenses": ("SalesAndMarketingExpense", r"^Direct and marketing expenses$"),
            "general_and_administrative_expenses": ("GeneralAndAdministrativeExpense", r"^General and administrative expenses$"),
            "depreciation_and_amortization": ("DepreciationAndAmortisationExpense", r"^Depreciation and amortization expense$"),
            "impairment_of_assets": ("ImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss", r"^Impairment of assets$"),
            "other_operating_income": ("MiscellaneousOtherOperatingIncome", r"^Other operating income$"),
            "finance_income": ("FinanceIncome", r"^Finance income$"),
            "finance_expense": ("FinanceCosts", r"^Finance expense$"),
            "change_in_fair_value_of_options": ("GainsLossesOnFinancialLiabilitiesAtFairValueThroughProfitOrLossDesignatedAsUponInitialRecognition", r"^Change in fair value of options$"),
            "share_of_post_tax_profit_of_equity_accounted_investments": ("ShareOfProfitLossOfAssociatesAccountedForUsingEquityMethod", r"^Share of post-tax profit of equity accounted investments$"),
            "profit_before_taxation": ("ProfitLossBeforeTax", r"^Profit before taxation$"),
        }
        inputs = {
            name: statement_fact_amount(
                statements, "income_statement", suffix, label, period,
            )
            for name, (suffix, label) in facts.items()
        }
        missing = [name for name, value in inputs.items() if value is None]
        if missing:
            return {
                "status": "review_required",
                "method": "ifrs_statement_subtotal_reconstructed",
                "automation_status": "manual_review_only",
                "filing_accession": accession,
                "fiscal_period": period,
                "inputs": inputs,
                "missing_inputs": missing,
                "reason": "Exact consolidated IFRS statement rows were not all found for the selected fiscal period.",
            }
        operating_components = (
            "revenue",
            "direct_and_marketing_expenses",
            "general_and_administrative_expenses",
            "depreciation_and_amortization",
            "impairment_of_assets",
            "other_operating_income",
        )
        ebit = sum(float(inputs[name]) for name in operating_components)
        pretax_reconciliation = (
            ebit
            + float(inputs["finance_income"])
            + float(inputs["finance_expense"])
            + float(inputs["change_in_fair_value_of_options"])
            + float(inputs["share_of_post_tax_profit_of_equity_accounted_investments"])
        )
        return {
            "status": "review_only",
            "method": "ifrs_statement_subtotal_reconstructed",
            "automation_status": "manual_review_only",
            "filing_accession": accession,
            "fiscal_period": period,
            "source_context": "FY2025 Form 20-F, consolidated statement of profit or loss and Note 5",
            **inputs,
            "ebit_candidate": round(ebit, 2),
            "cross_checks": {
                "sum_of_operating_statement_components": round(ebit, 2),
                "operating_profit_plus_separately_presented_non_operating_items": round(pretax_reconciliation, 2),
                "reported_profit_before_taxation": round(float(inputs["profit_before_taxation"]), 2),
                "difference_to_reported_profit_before_taxation": round(pretax_reconciliation - float(inputs["profit_before_taxation"]), 2),
                "reconciles_within_1": abs(pretax_reconciliation - float(inputs["profit_before_taxation"])) <= 1.0,
            },
            "formula": "revenue + signed direct/marketing expenses + signed G&A + signed D&A + signed impairment + other operating income",
            "classification_note": "The 20-F does not present a direct operating-profit subtotal. Direct and marketing expenses include cost of revenues (Note 5). Finance income, finance expense, change in fair value of options and the share of post-tax profit of equity-accounted investments are kept outside the reconstructed operating subtotal and used only for the pretax reconciliation.",
            "guardrail": "Filing-specific IFRS manual review only. Do not generalize these concepts, labels or amounts to other issuers/periods, and do not promote this reconstruction into production fundamentals or rankings.",
        }

    # INTENTIONAL: the PBI note below is restricted to its exact 2025 10-K.
    # The filing allocates part of total interest expense into Cost of financing and other.
    if symbol != "PBI" or accession != "0001628280-26-009650":
        return None
    pretax_entry = bridge.get("pretax_income") or {}
    pretax_amount = pretax_entry.get("amount")
    if not isinstance(pretax_amount, (int, float)):
        return {"status": "review_required", "filing_accession": accession,
                "reason": "The filing-specific interest review requires a recognized pretax-income anchor."}
    reported_interest = 101_460_000.0
    consolidated_financing_cost = 61_503_000.0
    segment_financing_cost_ex_interest = 13_807_000.0
    allocated_finance_interest = consolidated_financing_cost - segment_financing_cost_ex_interest
    total_interest = reported_interest + allocated_finance_interest
    return {
        "status": "review_only",
        "method": "filing_specific_interest_reconciliation",
        "automation_status": "manual_review_only",
        "filing_accession": accession,
        "source_context": "2025 Form 10-K, Item 7 Segment Results and consolidated statement of operations",
        "reported_interest_expense_net": reported_interest,
        "consolidated_cost_of_financing_and_other": consolidated_financing_cost,
        "SendTech_segment_cost_of_financing_and_other_ex_allocated_interest": segment_financing_cost_ex_interest,
        "allocated_finance_interest_embedded_in_cost_of_financing": allocated_finance_interest,
        "total_interest_expense_for_EBIT_reconciliation": total_interest,
        "reported_pretax_income": float(pretax_amount),
        "ebit_candidate": round(float(pretax_amount + total_interest), 2),
        "formula": "reported pretax income + consolidated interest expense, including finance interest allocated into cost of financing",
        "classification_note": "The filing states that a portion of total interest expense is allocated to finance interest expense within Cost of financing and other. Therefore that full expense line must not be classified wholly as operating or wholly as non-operating. The $47.696M allocated component is inferred from consolidated financing cost less the segment cost excluding allocated finance interest.",
        "guardrail": "Filing-specific manual review only. Do not generalize these values or this extraction to other issuers/periods, and do not write production fundamentals or rankings.",
    }

def non_sec_issuer_review_case(symbol: str) -> dict[str, Any] | None:
    """Return tightly scoped manual annual-report cases for MFI OTC symbols absent from SEC index."""
    cases: dict[str, dict[str, Any]] = {
        "AFMJF": {
            "status": "review_only_non_sec_source",
            "issuer": "Alphamin Resources Corp.",
            "primary_listings": ["TSX Venture: AFM", "JSE AltX: APH"],
            "otc_symbol": "AFMJF",
            "source_type": "issuer_published_audited_consolidated_financial_statements",
            "source_url": "https://www.alphaminresources.com/wp-content/uploads/2026/03/Alpha_Financials_2025-Signed-incl-signed-audit-opinion-Final.pdf",
            "published_date": "2026-03-11",
            "fiscal_period": "2025-12-31",
            "currency": "USD",
            "accounting_framework": "IFRS",
            "audited": True,
            "revenue": 620_888_174,
            "ebit_candidate": 273_665_327,
            "ebit_method": "direct_reported_ifrs_operating_profit",
            "current_assets": 193_759_626,
            "current_liabilities": 82_315_662,
            "net_ppe": 324_518_709,
            "right_of_use_assets_included_in_net_ppe": 15_919_442,
            "exploration_and_evaluation_assets_separate": 22_181_982,
            "invested_capital_candidate": 435_962_673,
            "invested_capital_candidate_including_exploration_assets": 458_144_655,
            "candidate_roc": 62.7727,
            "candidate_roc_including_exploration_assets": 59.7334,
            "cash_and_cash_equivalents": 56_088_248,
            "current_bank_overdraft": 23_286_126,
            "current_related_party_debt": 3_241_751,
            "current_external_debt": 7_959_459,
            "noncurrent_related_party_debt": 0,
            "noncurrent_external_debt": 6_081_751,
            "conventional_gross_debt_candidate": 40_569_087,
            "conventional_net_debt_candidate": -15_519_161,
            "current_lease_liabilities": 2_386_503,
            "noncurrent_lease_liabilities": 1_171_456,
            "noncontrolling_interest": 65_738_168,
            "conventional_net_debt_plus_nci_candidate": 50_219_007,
            "ownership_scope_note": "The Group owns 84.14% of Alphamin Bisie Mining SA; consolidated operating profit includes the controlled subsidiary, while noncontrolling interest is material.",
            "review_flags": [
                "not_found_in_sec_company_index_manual_issuer_report_source",
                "right_of_use_assets_are_included_in_reported_plant_and_equipment",
                "separate_exploration_and_evaluation_assets_may_belong_in_invested_capital",
                "lease_liabilities_require_enterprise_value_policy_decision",
                "material_noncontrolling_interest_requires_enterprise_value_adjustment",
                "market_cap_and_usd_market_snapshot_not_attached_no_enterprise_value_calculated",
            ],
            "guardrail": "Manual issuer-report research only. Values are transcribed from the exact audited FY2025 statements; ROC and net-debt figures are candidates with scope flags, not production-approved mappings. No SEC ingestion, D1 write, ratios or ranking are changed.",
        },
        "EGHSF": {
            "status": "review_only_non_sec_source",
            "issuer": "Enghouse Systems Limited",
            "primary_listing": "TSX: ENGH",
            "otc_symbol": "EGHSF",
            "source_type": "issuer_published_audited_annual_report",
            "source_url": "https://www.enghouse.com/wp-content/uploads/2025/12/20251215-Q4-2025-Message-to-shareholders.pdf",
            "published_date": "2025-12-15",
            "fiscal_period": "2025-10-31",
            "currency": "CAD",
            "accounting_framework": "IFRS",
            "audited": True,
            "revenue": 498_878_000,
            "results_from_operating_activities": 114_354_000,
            "acquired_software_and_customer_relationship_amortization": -29_492_000,
            "ebit_candidate": 84_862_000,
            "ebit_method": "issuer_statement_operating_subtotal_less_acquired_intangible_amortization",
            "pretax_income": 91_539_000,
            "pretax_reconciliation": {
                "ebit_candidate": 84_862_000,
                "foreign_exchange_loss": -2_378_000,
                "lease_interest_expense": -505_000,
                "finance_income": 8_041_000,
                "finance_expenses": -98_000,
                "other_income": 1_617_000,
                "reported_pretax_income": 91_539_000,
                "difference": 0,
            },
            "current_assets": 375_067_000,
            "current_liabilities": 218_733_000,
            "net_ppe": 3_890_000,
            "right_of_use_assets_separate": 11_453_000,
            "invested_capital_candidate": 160_224_000,
            "invested_capital_candidate_including_right_of_use_assets": 171_677_000,
            "candidate_roc": 52.9646,
            "candidate_roc_including_right_of_use_assets": 49.4312,
            "cash_and_cash_equivalents": 269_061_000,
            "short_term_investments_separate": 25_000,
            "conventional_gross_debt_candidate": 0,
            "conventional_net_debt_candidate": -269_061_000,
            "current_lease_liabilities": 5_197_000,
            "noncurrent_lease_liabilities": 5_944_000,
            "noncontrolling_interest": 0,
            "ownership_scope_note": "The FY2025 MD&A describes the consolidated subsidiaries as wholly owned and states that the company has no outstanding external debt financing.",
            "review_flags": [
                "not_found_in_sec_company_index_manual_issuer_report_source",
                "right_of_use_assets_are_separate_from_property_and_equipment",
                "lease_liabilities_require_enterprise_value_policy_decision",
                "cash_and_short_term_investments_are_separately_reported",
                "financial_statements_are_cad_while_mfi_market_cap_is_usd_fx_conversion_required",
                "market_cap_and_usd_market_snapshot_not_attached_no_enterprise_value_calculated",
            ],
            "guardrail": "Manual issuer-report research only. EBIT is reconstructed by subtracting acquired-intangible amortization from the issuer's operating subtotal and reconciles to reported pretax income. ROC and net-debt figures remain candidates with scope flags; no SEC ingestion, D1 write, ratios or ranking is changed.",
        },
    }
    return cases.get(symbol)


def extract_company(symbol: str) -> dict[str, Any]:
    result: dict[str, Any] = {"symbol": symbol, "status": "error", "provider_status": "extraction_error"}
    try:
        company = Company(symbol)
        # INTENTIONAL: mirror the annual filing families used by the SEC pipeline.
        # Foreign issuers commonly file 20-F or 40-F rather than domestic 10-K.
        annual_filings = []
        filing_lookup_errors = []
        for form in ("10-K", "20-F", "40-F"):
            try:
                annual_filings.extend(list(company.get_filings(form=form, amendments=False)))
            except Exception as lookup_error:
                filing_lookup_errors.append(f"{form}: {type(lookup_error).__name__}: {lookup_error}")
        if not annual_filings:
            detail = "; ".join(filing_lookup_errors) or "no matching annual filing"
            raise RuntimeError(f"No 10-K, 20-F or 40-F filing returned by EdgarTools ({detail})")
        filing = max(
            annual_filings,
            key=lambda item: str(getattr(item, "filing_date", "") or ""),
        )

        filing_obj = filing.obj()
        financials = getattr(filing_obj, "financials", None)
        financials_source = f"selected_{filing_metadata(filing).get('form', 'annual')}_filing"
        if financials is None:
            # INTENTIONAL FALLBACK: expose this clearly; don't silently claim
            # that a company-level financials object belongs to this accession.
            financials = company.get_financials()
            financials_source = "company_latest_annual_fallback"

        if financials is None:
            raise RuntimeError("EdgarTools returned no financial statements")

        result.update({
            "status": "extracted",
            "provider_status": "supported",
            "provider": "EdgarTools",
            "filing": filing_metadata(filing),
            "financials_source": financials_source,
            "statements": {
                "income_statement": statement_candidates(financials.income_statement()),
                "balance_sheet": statement_candidates(financials.balance_sheet()),
                "cash_flow_statement": statement_candidates(financials.cash_flow_statement()),
            },
            "ebit_bridge": None,
            "filing_specific_review": None,
            "review_notes": [
                "Each detailed statement row appears once; candidate=true marks rows matching the broad label filter.",
                "The EBIT bridge is assumption-based review output only; reconciliation does not prove accounting classification.",
                "No EBIT, debt, invested-capital, Earnings Yield, or ROC value is approved automatically.",
                "Confirm the statement fiscal period, filing form and accession before comparing values.",
                "Annual filing selection considers 10-K, 20-F and 40-F; interim 10-Q/6-K filings are intentionally excluded.",
                "Dimensional breakdowns and consolidated totals must not be added together without checking the filing presentation.",
                "Multiple PP&E concepts are shown separately; the script does not assume they are additive or non-overlapping.",
            ],
        })
        # INTENTIONAL: bridge candidates never enter production SEC ingestion,
        # ratios, eligibility decisions or Magic Formula ranking.
        result["ebit_bridge"] = build_ebit_bridge(result["statements"]["income_statement"])
        fiscal_period = str(result["filing"].get("period_of_report") or "")
        result["filing_specific_review"] = filing_specific_review(
            symbol, result["filing"], result["ebit_bridge"], result["statements"]
        )
        # INTENTIONAL: generalized balance-sheet candidates cover every extracted
        # issuer, including IFRS filers. This remains review-only and never feeds D1.
        result["balance_sheet_fact_review"] = balance_sheet_fact_review(
            result["statements"], fiscal_period
        )
        # INTENTIONAL: preview the existing ROC denominator only when each
        # required balance-sheet component has one unique consolidated candidate.
        result["invested_capital_review"] = invested_capital_review(
            result["balance_sheet_fact_review"]
        )
        # INTENTIONAL: expose only an exact, consolidated OperatingIncomeLoss
        # fact for this annual period. This is diagnostic, not production EBIT.
        direct_operating_income = direct_operating_income_fact(
            result["statements"], fiscal_period,
        )
        direct_candidate = direct_operating_income.get("candidate")
        result["direct_operating_income_review"] = {
            "status": "review_only" if direct_candidate is not None else (
                "ambiguous" if direct_operating_income["status"] == "ambiguous" else "review_required"
            ),
            "method": "direct_reported_operating_income" if direct_candidate is not None else None,
            "automation_status": "direct_fact_review_only",
            "fiscal_period": fiscal_period,
            "concept": direct_candidate["concept"] if direct_candidate else None,
            "label": direct_candidate["label"] if direct_candidate else None,
            "ebit_candidate": direct_candidate["value"] if direct_candidate else None,
            "candidate_review": direct_operating_income,
            "guardrail": "Exact non-dimensional direct operating-income/profit statement fact from an accepted US-GAAP or IFRS concept only; review fiscal period, currency, classification and filing before use. Never writes production ratios or rankings.",
        }
        # INTENTIONAL: only direct annual EBIT plus a unique positive denominator
        # may produce a diagnostic ROC. This never feeds production calculations.
        result["roc_review"] = roc_review(
            result["direct_operating_income_review"],
            result["invested_capital_review"],
            result["balance_sheet_fact_review"],
            result.get("filing_specific_review"),
        )
        result["enterprise_value_scope_review"] = enterprise_value_scope_review(
            result["balance_sheet_fact_review"],
        )
        # INTENTIONAL: infer reporting currency from exact-accession SEC units,
        # never from listing country, ticker suffix or filing form.
        accession = str(result["filing"].get("accession_number") or "")
        cik = getattr(company, "cik", None)
        try:
            result["reporting_currency_review"] = reporting_currency_unit_review(
                sec_company_facts(cik), accession, fiscal_period
            )
        except Exception as currency_error:
            result["reporting_currency_review"] = {
                "status": "currency_lookup_error",
                "currency": None,
                "error": f"{type(currency_error).__name__}: {currency_error}",
            }
        if not result["reporting_currency_review"].get("currency"):
            filing_currency_override = filing_specific_currency_override(symbol, accession)
            if filing_currency_override is not None:
                result["reporting_currency_review"] = filing_currency_override
        reporting_currency = result["reporting_currency_review"].get("currency")
        mfi_price_date = os.environ.get("MFI_PRICE_DATE", MFI_SNAPSHOT_PRICE_DATE)
        market_cap_millions = mfi_market_cap_usd_millions(symbol)
        market_cap_usd = market_cap_millions * 1_000_000 if market_cap_millions is not None else None
        result["mfi_market_cap_input"] = {
            "value_usd_millions": market_cap_millions,
            "currency": "USD",
            "price_date": mfi_price_date,
            "snapshot_as_of": MFI_SNAPSHOT_AS_OF if mfi_price_date == MFI_SNAPSHOT_PRICE_DATE else None,
            "source": "Magic Formula Investing MFI screen snapshot",
        }
        fx_review = None
        if reporting_currency and reporting_currency != "USD":
            fx_review = fetch_frankfurter_rate("USD", reporting_currency, mfi_price_date)
        result["currency_normalization_review"] = currency_normalization_review(
            reporting_currency, market_cap_usd, mfi_price_date, fx_review
        )
        # INTENTIONAL: these accession-scoped notes preserve filing context
        # that broad XBRL label matching cannot safely infer or generalize.
        accession = str(result["filing"].get("accession_number") or "")
        if symbol == "PRDO" and accession == "0001193125-26-059331":
            result["review_notes"].append(
                "PRDO FY2025 10-K: the $56.992m sale lease-back financing liability is separately presented from conventional debt and lease liabilities. The filing describes it as a failed sale-leaseback transaction, reports $154.1m of future minimum payments due under that transaction, and separately reports operating/finance lease liabilities and right-of-use assets. Treat the diagnostic 30.512% ROC as scope-sensitive review output, not a production ratio."
            )
        if symbol == "PBI" and accession == "0001628280-26-009650":
            result["review_notes"].append(
                "PBI FY2025 10-K Note 8 separately details PP&E net of $185.913m and rental property/equipment net of $24.054m. The current denominator using standard PP&E is -$261.427m; including the separate rental-equipment asset would make it -$237.373m. Both are nonpositive, so PBI remains ineligible for a positive ROC denominator under this formula. The extractor keeps the asset classes separate and does not sum them automatically."
            )
        if symbol == "SNDK":
            # INTENTIONAL: annotate the separation context; do not adjust reported EBIT.
            result["review_notes"].append(
                "Review pre/post-spin comparability: the issuer became independent on 2025-02-21; pre-spin historical statements were derived from WDC records."
            )
        if result["filing"].get("form") == "20-F" and direct_candidate is None:
            # INTENTIONAL: absence of a US-GAAP OperatingIncomeLoss concept is
            # not zero. Review the issuer's IFRS presentation separately.
            result["review_notes"].append(
                "20-F statement extraction succeeded, but no direct US-GAAP OperatingIncomeLoss fact was surfaced; inspect IFRS line items and classification rather than treating EBIT as zero."
            )
    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
        # INTENTIONAL: an MFI OTC/foreign ticker may not be an SEC registrant.
        # Record this as a coverage outcome, not a failure of other issuers.
        if type(exc).__name__ == "CompanyNotFoundError":
            result["status"] = "not_found_in_sec_company_index"
            result["provider_status"] = "unsupported_provider"
            result["provider"] = "EdgarTools"
            result["provider_reason"] = "Issuer is not present in the EdgarTools SEC company index. Provider fallback is intentionally deferred."
    return result


def main() -> int:
    identity = os.environ.get("EDGAR_IDENTITY", "Magic Screen research support@binalah.co")
    set_identity(identity)

    raw_symbols = os.environ.get("BAKEOFF_SYMBOLS", ",".join(DEFAULT_SYMBOLS))
    symbols = tuple(dict.fromkeys(
        item.strip().upper() for item in raw_symbols.split(",") if item.strip()
    ))
    if not symbols or any(not re.fullmatch(r"[A-Z0-9.-]{1,12}", symbol) for symbol in symbols):
        raise ValueError("BAKEOFF_SYMBOLS must be a comma-separated list of valid ticker symbols")

    report = {
        "service": "Magic Screen EdgarTools bakeoff",
        "symbol_input": raw_symbols,
        "symbol_input_source": "workflow_dispatch_or_environment" if os.environ.get("BAKEOFF_SYMBOLS") else "default_control_cases",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mfi_price_date": os.environ.get("MFI_PRICE_DATE", MFI_SNAPSHOT_PRICE_DATE),
        "mfi_market_cap_snapshot": {
            "source": "Magic Formula Investing",
            "as_of": MFI_SNAPSHOT_AS_OF if os.environ.get("MFI_PRICE_DATE", MFI_SNAPSHOT_PRICE_DATE) == MFI_SNAPSHOT_PRICE_DATE else None,
            "price_date": os.environ.get("MFI_PRICE_DATE", MFI_SNAPSHOT_PRICE_DATE),
            "quarter_date": MFI_SNAPSHOT_QUARTER_DATE,
            "market_cap_unit": "USD millions",
            "override_supported": "MFI_MARKET_CAPS_JSON",
        },
        "fx_policy": "USD market cap is translated into filing currency at the MFI quote date using the ECB daily reference series via Frankfurter; the latest ECB observation on or before the quote date is selected within a bounded 7-day lookback. Reported debt/cash stay in filing currency at fiscal-period end; ROC remains a same-currency ratio. No EV/EY is approved by this review.",
        "edgartools_version": None,
        "symbols": list(symbols),
        "production_data_modified": False,
        "primary_provider": "EdgarTools",
        "provider_policy": "EdgarTools is primary. unsupported_provider tickers remain in the MFI universe and are not sent to a fallback provider; fallback selection is deferred.",
        "companies": [],
    }
    try:
        from importlib.metadata import version
        report["edgartools_version"] = version("edgartools")
    except Exception:
        pass

    report["companies"] = [extract_company(symbol) for symbol in symbols]
    output = Path(os.environ.get("OUTPUT_PATH", "edgartools-bakeoff.json"))
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")

    for company in report["companies"]:
        print(f"{company['symbol']}: {company['status']}")
        if company.get("error"):
            print(f"  ERROR: {company['error']}")
        else:
            for name, statement in company["statements"].items():
                print(
                    f"  {name}: {statement.get('row_count', 0)} full rows, "
                    f"{statement.get('candidate_row_count', 0)} label candidates"
                )
            print(f"  filing metadata: {json.dumps(company.get('filing', {}), default=str)}")

    extracted = sum(item["status"] == "extracted" for item in report["companies"])
    coverage_gaps = sum(item.get("provider_status") == "unsupported_provider" for item in report["companies"])
    unexpected_errors = sum(item["status"] == "error" for item in report["companies"])
    print(f"Summary: {extracted} extracted, {coverage_gaps} unsupported_provider, {unexpected_errors} unexpected errors")
    print(f"JSON report written to {output}")
    # INTENTIONAL: expected SEC coverage gaps stay visible but do not invalidate
    # successful extractions; unexpected errors still fail the workflow.
    return 1 if unexpected_errors else 0


if __name__ == "__main__":
    sys.exit(main())
