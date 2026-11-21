#!/usr/bin/env python3
"""Prepare a complete, date-aligned market-cap map from the refreshed MFI universe."""
from __future__ import annotations
import argparse
import json
import math
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any


def _as_of_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def normalize_mfi_date(value: Any, year: int) -> str:
    raw = str(value or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        return date.fromisoformat(raw).isoformat()
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            pass
    if re.fullmatch(r"\d{1,2}/\d{1,2}", raw):
        month, day = (int(part) for part in raw.split("/"))
        return date(year, month, day).isoformat()
    raise ValueError(f"Unsupported MFI date format: {raw!r}")


def prepare_market_cap_inputs(universe: dict[str, Any], requested_price_date: str = "", has_custom_market_caps: bool = False) -> dict[str, Any]:
    symbols = universe.get("symbols")
    stocks = universe.get("stocks")
    refresh = universe.get("universe_refresh") or {}
    if universe.get("primary_provider") != "EdgarTools" or universe.get("market") != "US":
        raise ValueError("Expected an active US EdgarTools universe response")
    if not isinstance(symbols, list) or not symbols or len(symbols) != len(set(symbols)):
        raise ValueError("Universe symbols must be a non-empty unique list")
    if universe.get("count") != len(symbols):
        raise ValueError("Universe count does not match symbol list")
    if not isinstance(stocks, list) or len(stocks) != len(symbols):
        raise ValueError("Universe stock rows do not match symbol count")
    as_of_raw = refresh.get("asOf")
    if not isinstance(as_of_raw, str) or not as_of_raw:
        raise ValueError("Universe refresh is missing its snapshot as-of timestamp")
    as_of = _as_of_datetime(as_of_raw)
    price_date = normalize_mfi_date(refresh.get("priceDate"), as_of.year)
    quarter_date = normalize_mfi_date(refresh.get("quarterDate"), as_of.year)
    if requested_price_date and requested_price_date != price_date and not has_custom_market_caps:
        raise ValueError("A custom MFI price date requires a matching explicit market_caps_json map")
    stock_symbols = [str(row.get("symbol", "")).upper() for row in stocks]
    if len(stock_symbols) != len(set(stock_symbols)) or set(stock_symbols) != set(symbols):
        raise ValueError("Universe stock rows do not match the active symbol list")
    caps: dict[str, float] = {}
    for row in stocks:
        symbol = str(row.get("symbol", "")).upper()
        value = row.get("market_cap")
        if not isinstance(value, (int, float)) or not math.isfinite(float(value)) or float(value) <= 0:
            raise ValueError(f"{symbol}: active MFI market cap is missing or invalid")
        caps[symbol] = round(float(value) / 1_000_000, 8)
    return {
        "source": "active_universe_snapshot",
        "provider": "Magic Formula Investing",
        "currency": "USD",
        "unit": "USD millions",
        "as_of": as_of_raw,
        "price_date": price_date,
        "quarter_date": quarter_date,
        "count": len(symbols),
        "symbols": sorted(symbols),
        "market_caps_usd_millions": caps,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--universe", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--github-output", default="")
    parser.add_argument("--requested-price-date", default="")
    parser.add_argument("--has-custom-market-caps", action="store_true")
    args = parser.parse_args()
    universe = json.loads(Path(args.universe).read_text())
    result = prepare_market_cap_inputs(universe, args.requested_price_date, args.has_custom_market_caps)
    Path(args.output).write_text(json.dumps(result, indent=2) + "\n")
    if args.github_output:
        caps_json = json.dumps(result["market_caps_usd_millions"], separators=(",", ":"))
        with Path(args.github_output).open("a") as output:
            output.write(f"market_caps_json={caps_json}\n")
            output.write(f"price_date={result['price_date']}\n")
            output.write(f"quarter_date={result['quarter_date']}\n")
            output.write(f"snapshot_as_of={result['as_of']}\n")
    print(f"Prepared {result['count']} market caps from the active MFI snapshot dated {result['price_date']}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
