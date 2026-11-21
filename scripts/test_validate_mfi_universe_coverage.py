import unittest
from validate_mfi_universe_coverage import validate


def fixture():
    universe = {"count": 2, "symbols": ["AAA", "BBB"], "stocks": [{"symbol": "AAA"}, {"symbol": "BBB"}],
                "selection": {"minimum_market_cap_millions": 50, "selected_count": 30},
                "universe_refresh": {"priceDate": "2026-11-18", "quarterDate": "2026-09-30", "asOf": "2026-11-21T08:00:00Z"}}
    extraction = {"mfi_market_cap_snapshot": {"price_date": "2026-11-18", "quarter_date": "2026-09-30", "as_of": "2026-11-21T08:00:00Z", "input_source": "active_universe_snapshot"},
                  "companies": [
                      {"symbol": "AAA", "provider_status": "supported", "filing": {"form": "10-K", "accession_number": "0000000000-26-000001", "period_of_report": "2025-12-31"}},
                      {"symbol": "BBB", "provider_status": "unsupported_provider"},
                      {"symbol": "ADBE", "provider_status": "supported", "filing": {"form": "10-K", "accession_number": "0000000000-26-000002", "period_of_report": "2025-11-28"}}]}
    resolver = {"summary": {"active_universe": 2}, "resolutions": [{"symbol": "AAA"}, {"symbol": "BBB"}],
                "production_fundamentals_changed": False, "rankings_changed": False}
    ranking = {"summary": {"universe": 2, "ranked": 0, "excluded": 2, "unsupported_provider": 1},
               "rankings": [{"symbol": "AAA"}, {"symbol": "BBB"}], "production_write": False,
               "production_fundamentals_changed": False, "rankings_changed": False}
    return universe, extraction, resolver, ranking


class UniverseCoverageTests(unittest.TestCase):
    def test_valid_full_universe_and_regression_control(self):
        self.assertEqual(validate(*fixture()), [])

    def test_missing_extracted_symbol_fails(self):
        u, e, r, m = fixture()
        e["companies"] = [row for row in e["companies"] if row["symbol"] != "BBB"]
        self.assertTrue(any("missing from extraction" in error for error in validate(u, e, r, m)))

    def test_resolver_must_match_active_universe(self):
        u, e, r, m = fixture()
        r["resolutions"].pop()
        self.assertTrue(any("resolver rows" in error for error in validate(u, e, r, m)))

    def test_interim_filing_rejected(self):
        u, e, r, m = fixture()
        e["companies"][0]["filing"]["form"] = "10-Q"
        self.assertTrue(any("not an annual" in error for error in validate(u, e, r, m)))

    def test_market_cap_price_date_must_match(self):
        u, e, r, m = fixture()
        e["mfi_market_cap_snapshot"]["price_date"] = "2026-11-19"
        self.assertTrue(any("price date" in error for error in validate(u, e, r, m)))


    def test_month_day_provider_quote_date_is_normalized(self):
        u, e, r, m = fixture()
        u["universe_refresh"]["priceDate"] = "11/19"
        u["universe_refresh"]["quarterDate"] = "09/30"
        e["mfi_market_cap_snapshot"]["price_date"] = "2026-11-19"
        e["mfi_market_cap_snapshot"]["quarter_date"] = "2026-09-30"
        self.assertEqual(validate(u, e, r, m), [])

    def test_snapshot_as_of_must_match_universe(self):
        u, e, r, m = fixture()
        e["mfi_market_cap_snapshot"]["as_of"] = "2026-11-20T08:00:00Z"
        self.assertTrue(any("timestamp" in error for error in validate(u, e, r, m)))

    def test_selection_settings_are_explicit(self):
        u, e, r, m = fixture()
        u["selection"]["minimum_market_cap_millions"] = 100
        self.assertTrue(any("$50m" in error for error in validate(u, e, r, m)))

    def test_production_flags_are_locked(self):
        u, e, r, m = fixture()
        m["production_write"] = True
        self.assertTrue(any("production_write" in error for error in validate(u, e, r, m)))


if __name__ == "__main__":
    unittest.main()
