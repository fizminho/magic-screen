import unittest

from edgartools_normalize import compare_companyfacts, duration_matches


class EdgarToolsCompanyFactsComparisonTests(unittest.TestCase):
    def setUp(self):
        self.company = {
            "symbol": "AAPL",
            "filing": {
                "accession_number": "0000320193-26-000026",
                "form": "10-K",
            },
            "statements": {
                "income_statement": {
                    "periods": [{
                        "period_end": "2026-09-26",
                        "period_type": "duration",
                        "fiscal_label": "FY",
                        "metrics": {
                            "revenue": {
                                "value": 478834000000,
                                "source_concept": "us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax",
                            }
                        },
                    }]
                },
                "balance_sheet": {
                    "periods": [{
                        "period_end": "2026-09-26",
                        "period_type": "instant",
                        "fiscal_label": None,
                        "metrics": {
                            "totalAssets": {
                                "value": 404548000000,
                                "source_concept": "us-gaap_Assets",
                            }
                        },
                    }]
                },
            },
        }
        self.payload = {
            "facts": {
                "us-gaap": {
                    "RevenueFromContractWithCustomerExcludingAssessedTax": {
                        "units": {"USD": [
                            {"accn": "0000320193-26-000026", "form": "10-K", "start": "2026-07-01", "end": "2026-09-26", "val": 100},
                            {"accn": "0000320193-26-000026", "form": "10-K", "start": "2025-09-28", "end": "2026-09-26", "val": 478834000000},
                        ]}
                    },
                    "Assets": {
                        "units": {"USD": [
                            {"accn": "0000320193-26-000026", "form": "10-K", "end": "2026-09-26", "val": 404548000000}
                        ]}
                    },
                }
            }
        }

    def test_fiscal_year_selects_annual_duration_not_quarter(self):
        result = compare_companyfacts(self.company, self.payload)
        self.assertEqual(result["status"], "compared")
        self.assertEqual(result["matched"], 2)
        self.assertEqual(result["mismatch_count"], 0)

    def test_mismatch_is_reported(self):
        self.company["statements"]["income_statement"]["periods"][0]["metrics"]["revenue"]["value"] += 1
        result = compare_companyfacts(self.company, self.payload)
        self.assertEqual(result["mismatch_count"], 1)
        self.assertFalse(result["mismatches"][0]["match"])

    def test_duration_requires_start_and_end(self):
        self.assertFalse(duration_matches({"end": "2026-09-26"}, "FY"))
        self.assertTrue(duration_matches({"start": "2025-09-28", "end": "2026-09-26"}, "FY"))


if __name__ == "__main__":
    unittest.main()
