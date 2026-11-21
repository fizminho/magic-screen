#!/usr/bin/env python3
"""Validate end-to-end US MFI universe, extraction, ingestion and resolver coverage."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from typing import Any


def validate_pipeline(
    universe: dict[str, Any],
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
    for name in ("universe", "extraction", "ingestion", "resolver", "ranking"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    reports = {name: json.loads(Path(getattr(args, name)).read_text()) for name in ("universe", "extraction", "ingestion", "resolver", "ranking")}
    errors = validate_pipeline(**reports)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"Validated full US MFI pipeline: {reports['universe']['count']} active issuers, {reports['ingestion']['ingested']} ingested company records, {reports['ranking']['summary']['ranked']} ranked, {reports['ranking']['summary']['excluded']} not ranked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
