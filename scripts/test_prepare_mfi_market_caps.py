import unittest
from prepare_mfi_market_caps import normalize_mfi_date, prepare_market_cap_inputs


class PrepareMfiMarketCapsTests(unittest.TestCase):
    def fixture(self):
        return {
            "primary_provider": "EdgarTools", "market": "US", "count": 2, "symbols": ["AAA", "BBB"],
            "universe_refresh": {"asOf": "2026-11-21T08:00:00Z", "priceDate": "11/19", "quarterDate": "09/30"},
            "stocks": [
                {"symbol": "AAA", "market_cap": 953850000},
                {"symbol": "BBB", "market_cap": 258230000.0},
            ],
        }

    def test_provider_dates_are_normalized_with_snapshot_year(self):
        self.assertEqual(normalize_mfi_date("11/19", 2026), "2026-11-19")
        self.assertEqual(normalize_mfi_date("09/30", 2026), "2026-09-30")

    def test_market_caps_are_converted_from_usd_to_millions(self):
        result = prepare_market_cap_inputs(self.fixture())
        self.assertEqual(result["market_caps_usd_millions"], {"AAA": 953.85, "BBB": 258.23})
        self.assertEqual(result["price_date"], "2026-11-19")
        self.assertEqual(result["quarter_date"], "2026-09-30")

    def test_duplicate_or_missing_stock_rows_are_rejected(self):
        universe = self.fixture()
        universe["stocks"].append(universe["stocks"][0])
        with self.assertRaisesRegex(ValueError, "stock rows"):
            prepare_market_cap_inputs(universe)

    def test_missing_market_cap_is_rejected(self):
        universe = self.fixture()
        universe["stocks"][0]["market_cap"] = None
        with self.assertRaisesRegex(ValueError, "market cap"):
            prepare_market_cap_inputs(universe)

    def test_custom_quote_date_requires_matching_custom_map(self):
        with self.assertRaisesRegex(ValueError, "requires a matching"):
            prepare_market_cap_inputs(self.fixture(), "2026-11-18", False)
        result = prepare_market_cap_inputs(self.fixture(), "2026-11-18", True)
        self.assertEqual(result["price_date"], "2026-11-19")


if __name__ == "__main__":
    unittest.main()
