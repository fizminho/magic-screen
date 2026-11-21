import unittest
from validate_edgartools_pipeline import validate_pipeline


class EdgarToolsPipelineValidationTests(unittest.TestCase):
    def fixture(self):
        universe = {"primary_provider": "EdgarTools", "market": "US", "count": 2, "symbols": ["AAA", "BBB"]}
        market_cap_inputs = {"source": "active_universe_snapshot", "as_of": "2026-11-21T08:00:00Z",
                             "price_date": "2026-11-19", "quarter_date": "2026-09-30", "count": 2,
                             "symbols": ["AAA", "BBB"], "market_caps_usd_millions": {"AAA": 100.0, "BBB": 200.0}}
        extraction = {
            "primary_provider": "EdgarTools", "production_data_modified": False,
            "mfi_price_date": "2026-11-19",
            "mfi_market_cap_snapshot": {"input_source": "active_universe_snapshot", "as_of": "2026-11-21T08:00:00Z",
                                        "price_date": "2026-11-19", "quarter_date": "2026-09-30"},
            "companies": [
                {"symbol": "AAA", "provider_status": "supported", "filing": {"accession_number": "0001", "period_of_report": "2025-12-31"},
                 "mfi_market_cap_input": {"value_usd_millions": 100.0, "price_date": "2026-11-19", "source": "active_universe_snapshot"}},
                {"symbol": "BBB", "provider_status": "unsupported_provider",
                 "mfi_market_cap_input": {"value_usd_millions": 200.0, "price_date": "2026-11-19", "source": "active_universe_snapshot"}},
                {"symbol": "ADBE", "provider_status": "supported", "filing": {"accession_number": "0002", "period_of_report": "2025-11-28"},
                 "mfi_market_cap_input": {"value_usd_millions": None, "price_date": "2026-11-19", "source": "active_universe_snapshot"}},
            ],
        }
        ingestion = {"received": 3, "ingested": 3, "unsupported_provider": ["BBB"],
                     "production_fundamentals_changed": False, "rankings_changed": False}
        resolver = {"summary": {"active_universe": 2, "supported": 1, "unsupported_provider": 1, "awaiting_evidence": 0},
                    "production_fundamentals_changed": False, "rankings_changed": False}
        ranking = {"summary": {"universe": 2, "eligible": 0, "ranked": 0, "excluded": 2,
                               "unsupported_provider": 1, "filing_evidence_unavailable": 0},
                   "production_write": False, "production_fundamentals_changed": False, "rankings_changed": False}
        return universe, market_cap_inputs, extraction, ingestion, resolver, ranking

    def test_valid_full_pipeline(self):
        self.assertEqual(validate_pipeline(*self.fixture()), [])

    def test_partial_ingestion_is_rejected(self):
        reports = list(self.fixture())
        reports[3]["ingested"] = 2
        self.assertTrue(any("ingestion count" in error for error in validate_pipeline(*reports)))

    def test_missing_universe_evidence_is_rejected(self):
        reports = list(self.fixture())
        reports[4]["summary"]["awaiting_evidence"] = 1
        self.assertTrue(any("awaiting evidence" in error for error in validate_pipeline(*reports)))

    def test_extraction_must_cover_universe_and_regression_control(self):
        reports = list(self.fixture())
        reports[2]["companies"] = reports[2]["companies"][:2]
        self.assertTrue(any("extraction symbols" in error for error in validate_pipeline(*reports)))

    def test_unsupported_provider_must_reconcile(self):
        reports = list(self.fixture())
        reports[3]["unsupported_provider"] = []
        self.assertTrue(any("unsupported-provider list" in error for error in validate_pipeline(*reports)))


    def test_stale_market_cap_date_is_rejected(self):
        reports = list(self.fixture())
        reports[2]["mfi_market_cap_snapshot"]["price_date"] = "2026-11-18"
        self.assertTrue(any("does not match MFI price date" in error for error in validate_pipeline(*reports)))

    def test_market_cap_must_match_active_universe_snapshot(self):
        reports = list(self.fixture())
        reports[2]["companies"][0]["mfi_market_cap_input"]["value_usd_millions"] = 101.0
        self.assertTrue(any("does not match active-universe snapshot" in error for error in validate_pipeline(*reports)))

    def test_market_cap_missing_for_active_ticker_is_rejected(self):
        reports = list(self.fixture())
        reports[2]["companies"][1]["mfi_market_cap_input"]["value_usd_millions"] = None
        self.assertTrue(any("market cap is missing" in error for error in validate_pipeline(*reports)))

    def test_pinned_regression_snapshot_cannot_pass_full_universe_gate(self):
        reports = list(self.fixture())
        reports[2]["mfi_market_cap_snapshot"]["input_source"] = "pinned_regression_snapshot"
        self.assertTrue(any("must not use a pinned" in error for error in validate_pipeline(*reports)))

    def test_resolver_and_ranking_must_preserve_production(self):
        reports = list(self.fixture())
        reports[5]["production_write"] = True
        self.assertTrue(any("ranking production immutability" in error for error in validate_pipeline(*reports)))


if __name__ == "__main__":
    unittest.main()
