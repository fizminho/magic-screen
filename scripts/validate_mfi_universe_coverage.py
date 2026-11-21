#!/usr/bin/env python3
"""Cross-check dynamic MFI universe discovery against extraction and shadow outputs."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from typing import Any

ALLOWED_REGRESSION_CONTROLS = {"ADBE"}
ANNUAL_FORMS = {"10-K", "20-F", "40-F"}


def _symbols(values: Any, label: str) -> tuple[list[str], list[str]]:
    if not isinstance(values, list):
        return [], [f"{label} must be an array"]
    result = [str(value).strip().upper() for value in values]
    errors = []
    if any(not value for value in result):
        errors.append(f"{label} contains an empty symbol")
    if len(result) != len(set(result)):
        errors.append(f"{label} contains duplicate symbols")
    return result, errors


def validate(universe: dict[str, Any], extraction: dict[str, Any],
             resolver: dict[str, Any], ranking: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    active, found = _symbols(universe.get("symbols"), "universe.symbols")
    errors.extend(found)
    if universe.get("count") != len(active):
        errors.append("universe count does not match unique symbols")
    selection = universe.get("selection") or {}
    if selection.get("minimum_market_cap_millions") != 50:
        errors.append("MFI minimum market-cap setting is not the expected $50m")
    if selection.get("selected_count") != 30:
        errors.append("MFI selected-count setting is not the expected top 30")
    stocks, found = _symbols([row.get("symbol") for row in universe.get("stocks", [])], "universe.stocks")
    errors.extend(found)
    if set(stocks) != set(active):
        errors.append("universe stocks and symbols arrays do not match")

    companies = extraction.get("companies") or []
    extracted, found = _symbols([row.get("symbol") for row in companies], "extraction.companies")
    errors.extend(found)
    missing = sorted(set(active) - set(extracted))
    unexpected = sorted(set(extracted) - set(active) - ALLOWED_REGRESSION_CONTROLS)
    if missing:
        errors.append("active universe symbols missing from extraction: " + ", ".join(missing))
    if unexpected:
        errors.append("unexpected non-universe extraction symbols: " + ", ".join(unexpected))
    by_symbol = {str(row.get("symbol", "")).upper(): row for row in companies}
    for symbol in active:
        company = by_symbol.get(symbol)
        if not company:
            continue
        status = company.get("provider_status")
        if status == "supported":
            filing = company.get("filing") or {}
            if filing.get("form") not in ANNUAL_FORMS:
                errors.append(f"{symbol}: supported filing is not an annual 10-K/20-F/40-F")
            if not (filing.get("accession_number") or filing.get("accession_no") or filing.get("accession")):
                errors.append(f"{symbol}: supported filing has no accession")
            if not (filing.get("period_of_report") or filing.get("period")):
                errors.append(f"{symbol}: supported filing has no fiscal period")
        elif status not in {"unsupported_provider", "extraction_error"}:
            errors.append(f"{symbol}: missing or invalid provider status")

    resolver_rows = resolver.get("resolutions") or []
    resolver_symbols, found = _symbols([row.get("symbol") for row in resolver_rows], "resolver.resolutions")
    errors.extend(found)
    if set(resolver_symbols) != set(active):
        errors.append("resolver rows do not exactly match the active MFI universe")
    if (resolver.get("summary") or {}).get("active_universe") != len(active):
        errors.append("resolver active_universe summary does not match discovered universe")

    ranking_rows = ranking.get("rankings") or []
    ranking_symbols, found = _symbols([row.get("symbol") for row in ranking_rows], "ranking.rankings")
    errors.extend(found)
    if set(ranking_symbols) != set(active):
        errors.append("ranking rows do not exactly match the active MFI universe")
    summary = ranking.get("summary") or {}
    if summary.get("universe") != len(active):
        errors.append("ranking universe summary does not match discovered universe")
    active_set = set(active)
    unsupported = sum(1 for row in companies if row.get("symbol") in active_set and row.get("provider_status") == "unsupported_provider")
    if summary.get("unsupported_provider") != unsupported:
        errors.append("ranking unsupported-provider count does not match extraction coverage")

    market_snapshot = extraction.get("mfi_market_cap_snapshot") or {}
    price_date = market_snapshot.get("price_date")
    universe_price_date = (universe.get("universe_refresh") or {}).get("priceDate")
    if price_date and universe_price_date and price_date != universe_price_date:
        errors.append("extraction market-cap price date does not match discovered universe price date")

    for name, report in (("resolver", resolver), ("ranking", ranking)):
        for flag in ("production_fundamentals_changed", "rankings_changed"):
            if report.get(flag) is not False:
                errors.append(f"{name}.{flag} must remain false")
    if ranking.get("production_write") is not False:
        errors.append("ranking.production_write must remain false")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--universe", type=Path, required=True)
    parser.add_argument("--extraction", type=Path, required=True)
    parser.add_argument("--resolver", type=Path, required=True)
    parser.add_argument("--ranking", type=Path, required=True)
    args = parser.parse_args()
    reports = [json.loads(path.read_text()) for path in (args.universe, args.extraction, args.resolver, args.ranking)]
    errors = validate(*reports)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"Validated active US MFI universe: {reports[0]['count']} stocks; {reports[3]['summary']['ranked']} ranked, {reports[3]['summary']['excluded']} excluded; top 30 at $50m minimum. Production unchanged.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
