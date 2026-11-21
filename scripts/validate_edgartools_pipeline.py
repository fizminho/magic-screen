#!/usr/bin/env python3
"""Validate end-to-end US MFI universe, extraction, ingestion and resolver coverage."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from typing import Any


def validate_pipeline(
    universe: dict[str, Any],
    market_cap_inputs: dict[str, Any],
    extraction: dict[str, Any],
    ingestion: dict[str, Any],
    resolver: dict[str, Any],
    ranking: dict[str, Any],
) -> list[str]:
    errors: list[str] = []
    symbols = universe.get("symbols")
    if universe.get("primary_provider") != "EdgarTools" or universe.get("market") != "US":
        errors.append("universe must identify EdgarTools and US market")
    if not isinstance(symbols, list) or not symbols:
        return errors + ["universe symbols must be a non-empty array"]
    if universe.get("count") != len(symbols):
        errors.append("universe count does not match symbols")
    if len(symbols) != len(set(symbols)):
        errors.append("universe contains duplicate symbols")

    companies = extraction.get("companies")
    if extraction.get("primary_provider") != "EdgarTools" or extraction.get("production_data_modified") is not False:
        errors.append("extraction provider or production immutability guardrail failed")
    if not isinstance(companies, list):
        return errors + ["extraction companies must be an array"]
    company_symbols = [str(company.get("symbol", "")).upper() for company in companies]
    if len(company_symbols) != len(set(company_symbols)):
        errors.append("extraction contains duplicate company symbols")
    expected_symbols = set(symbols) | {"ADBE"}
    if set(company_symbols) != expected_symbols:
        errors.append("extraction symbols do not equal active universe plus ADBE regression control")
    unsupported = sorted(
        str(company.get("symbol", "")).upper()
        for company in companies
        if company.get("provider_status") == "unsupported_provider"
    )
    for company in companies:
        status = company.get("provider_status")
        if status not in {"supported", "unsupported_provider", "extraction_error"}:
            errors.append(f"{company.get('symbol')}: invalid provider status")
        if status == "supported":
            filing = company.get("filing") or {}
            if not (filing.get("accession_number") or filing.get("accession")):
                errors.append(f"{company.get('symbol')}: supported filing has no accession")
            if not (filing.get("period_of_report") or filing.get("period")):
                errors.append(f"{company.get('symbol')}: supported filing has no fiscal period")

    snapshot = extraction.get("mfi_market_cap_snapshot") or {}
    input_source = snapshot.get("input_source")
    if extraction.get("mfi_price_date") != snapshot.get("price_date"):
        errors.append("extraction market-cap snapshot date does not match MFI price date")
    if input_source == "active_universe_snapshot":
        cap_map = market_cap_inputs.get("market_caps_usd_millions") or {}
        if market_cap_inputs.get("source") != "active_universe_snapshot":
            errors.append("active-universe market-cap inputs have the wrong source")
        if market_cap_inputs.get("price_date") != snapshot.get("price_date"):
            errors.append("active-universe market-cap date does not match extraction")
        if market_cap_inputs.get("as_of") != snapshot.get("as_of"):
            errors.append("active-universe market-cap as-of timestamp does not match extraction")
        if set(market_cap_inputs.get("symbols") or []) != set(symbols) or set(cap_map) != set(symbols):
            errors.append("active-universe market-cap map does not cover every active symbol")
        for symbol in symbols:
            company = next((item for item in companies if str(item.get("symbol", "")).upper() == symbol), None)
            market_input = (company or {}).get("mfi_market_cap_input") or {}
            value = market_input.get("value_usd_millions")
            expected = cap_map.get(symbol)
            if not isinstance(value, (int, float)) or value <= 0:
                errors.append(f"{symbol}: active-universe market cap is missing from extraction")
            elif not isinstance(expected, (int, float)) or abs(float(value) - float(expected)) > 0.000001:
                errors.append(f"{symbol}: extracted market cap does not match active-universe snapshot")
            if market_input.get("price_date") != snapshot.get("price_date"):
                errors.append(f"{symbol}: market-cap input uses a different quote date")
            if market_input.get("source") != "active_universe_snapshot":
                errors.append(f"{symbol}: market-cap input source is not the active universe")
    elif input_source == "workflow_override":
        for symbol in symbols:
            company = next((item for item in companies if str(item.get("symbol", "")).upper() == symbol), None)
            market_input = (company or {}).get("mfi_market_cap_input") or {}
            value = market_input.get("value_usd_millions")
            if not isinstance(value, (int, float)) or value <= 0:
                errors.append(f"{symbol}: workflow market-cap override is missing or incomplete")
            if market_input.get("price_date") != snapshot.get("price_date"):
                errors.append(f"{symbol}: workflow market-cap override date does not match extraction")
    else:
        errors.append("full-universe extraction must not use a pinned regression market-cap snapshot")

    expected_count = len(companies)
    if ingestion.get("received") != expected_count or ingestion.get("ingested") != expected_count:
        errors.append("raw ingestion count does not match extracted company count")
    if sorted(ingestion.get("unsupported_provider", [])) != unsupported:
        errors.append("ingestion unsupported-provider list does not match extraction")
    if ingestion.get("production_fundamentals_changed") is not False or ingestion.get("rankings_changed") is not False:
        errors.append("ingestion production immutability guardrails failed")

    resolver_summary = resolver.get("summary") or {}
    if resolver_summary.get("active_universe") != len(symbols):
        errors.append("resolver active universe does not match refreshed universe")
    if resolver_summary.get("awaiting_evidence") != 0:
        errors.append("resolver still has active-universe issuers awaiting evidence")
    if resolver_summary.get("supported", 0) + resolver_summary.get("unsupported_provider", 0) != len(symbols):
        errors.append("resolver provider coverage does not reconcile to active universe")
    if resolver.get("production_fundamentals_changed") is not False or resolver.get("rankings_changed") is not False:
        errors.append("resolver production immutability guardrails failed")

    ranking_summary = ranking.get("summary") or {}
    if ranking_summary.get("universe") != len(symbols):
        errors.append("ranking universe does not match refreshed universe")
    if ranking_summary.get("unsupported_provider") != resolver_summary.get("unsupported_provider"):
        errors.append("ranking unsupported-provider count does not match resolver")
    if ranking_summary.get("filing_evidence_unavailable") != resolver_summary.get("awaiting_evidence"):
        errors.append("ranking filing-evidence count does not match resolver")
    ranked = ranking_summary.get("ranked")
    if not isinstance(ranked, int) or ranking_summary.get("excluded") != len(symbols) - ranked:
        errors.append("ranking excluded count does not reconcile to ranked output")
    if ranking.get("production_write") is not False or ranking.get("production_fundamentals_changed") is not False or ranking.get("rankings_changed") is not False:
        errors.append("ranking production immutability guardrails failed")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    for name in ("universe", "market-cap-inputs", "extraction", "ingestion", "resolver", "ranking"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    reports = {
        "universe": json.loads(Path(args.universe).read_text()),
        "market_cap_inputs": json.loads(Path(args.market_cap_inputs).read_text()),
        "extraction": json.loads(Path(args.extraction).read_text()),
        "ingestion": json.loads(Path(args.ingestion).read_text()),
        "resolver": json.loads(Path(args.resolver).read_text()),
        "ranking": json.loads(Path(args.ranking).read_text()),
    }
    errors = validate_pipeline(**reports)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"Validated full US MFI pipeline: {reports['universe']['count']} active issuers, {reports['ingestion']['ingested']} ingested company records, {reports['ranking']['summary']['ranked']} ranked, {reports['ranking']['summary']['excluded']} not ranked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
