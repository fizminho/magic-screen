import unittest
from validate_edgartools_pipeline import validate_pipeline


class EdgarToolsPipelineValidationTests(unittest.TestCase):
    def fixture(self):
        universe = {"primary_provider": "EdgarTools", "market": "US", "count": 2, "symbols": ["AAA", "BBB"]}
        extraction = {
            "primary_provider": "EdgarTools", "production_data_modified": False,
            "companies": [
                {"symbol": "AAA", "provider_status": "supported", "filing": {"accession_number": "0001", "period_of_report": "2025-12-31"}},
                {"symbol": "BBB", "provider_status": "unsupported_provider"},
                {"symbol": "ADBE", "provider_status": "supported", "filing": {"accession_number": "0002", "period_of_report": "2025-11-28"}},
            ],
        }
        ingestion = {"received": 3, "ingested": 3, "unsupported_provider": ["BBB"],
                     "production_fundamentals_changed": False, "rankings_changed": False}
        resolver = {"summary": {"active_universe": 2, "supported": 1, "unsupported_provider": 1, "awaiting_evidence": 0},
                    "production_fundamentals_changed": False, "rankings_changed": False}
        ranking = {"summary": {"universe": 2, "eligible": 0, "ranked": 0, "excluded": 2,
                               "unsupported_provider": 1, "filing_evidence_unavailable": 0},
                   "production_write": False, "production_fundamentals_changed": False, "rankings_changed": False}
        return universe, extraction, ingestion, resolver, ranking

    def test_valid_full_pipeline(self):
        self.assertEqual(validate_pipeline(*self.fixture()), [])

    def test_partial_ingestion_is_rejected(self):
        reports = list(self.fixture())
        reports[2]["ingested"] = 2
        self.assertTrue(any("ingestion count" in error for error in validate_pipeline(*reports)))

    def test_missing_universe_evidence_is_rejected(self):
        reports = list(self.fixture())
        reports[3]["summary"]["awaiting_evidence"] = 1
        self.assertTrue(any("awaiting evidence" in error for error in validate_pipeline(*reports)))

    def test_extraction_must_cover_universe_and_regression_control(self):
        reports = list(self.fixture())
        reports[1]["companies"] = reports[1]["companies"][:2]
        self.assertTrue(any("extraction symbols" in error for error in validate_pipeline(*reports)))

    def test_unsupported_provider_must_reconcile(self):
        reports = list(self.fixture())
        reports[2]["unsupported_provider"] = []
        self.assertTrue(any("unsupported-provider list" in error for error in validate_pipeline(*reports)))

    def test_resolver_and_ranking_must_preserve_production(self):
        reports = list(self.fixture())
        reports[4]["production_write"] = True
        self.assertTrue(any("ranking production immutability" in error for error in validate_pipeline(*reports)))


if __name__ == "__main__":
    unittest.main()
