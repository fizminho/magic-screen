import unittest

from edgartools_quality import assess_company, build_report


def metric(statement, name, period_type, period_end="2026-09-30", value=100):
    return {
        "statement": statement,
        "metric": name,
        "period_type": period_type,
        "period_end": period_end,
        "value": value,
        "currency": None,
    }


class QualityReportTests(unittest.TestCase):
    def test_core_coverage_and_unknown_units_are_reported_without_inference(self):
        company = {
            "symbol": "ABC",
            "provider_status": "supported",
            "accession": "0000000001-26-000001",
            "form": "10-K",
            "fiscal_period": "2026-09-30",
            "metrics": [
                metric("income_statement", "revenue", "duration"),
                metric("income_statement", "operatingIncome", "duration"),
                metric("income_statement", "netIncome", "duration"),
                metric("balance_sheet", "totalAssets", "instant"),
                metric("balance_sheet", "totalLiabilities", "instant"),
            ],
        }
        result = assess_company(company)
        self.assertEqual(result["quality_status"], "warning")
        self.assertEqual(result["unit_currency_status"], "unknown")
        self.assertEqual(result["coverage"]["income_statement"]["coverage_pct"], 50.0)
        self.assertEqual(result["coverage"]["cash_flow_statement"]["status"], "not_assessed")
        self.assertIn("currency_and_scale_not_verified", result["warnings"])

    def test_duplicate_and_invalid_period_are_flagged(self):
        row = metric("income_statement", "revenue", "duration", "2026-13-40")
        company = {
            "symbol": "ABC",
            "provider_status": "supported",
            "accession": "0000000001-26-000001",
            "form": "10-K",
            "fiscal_period": "2026-09-30",
            "metrics": [row, dict(row)],
        }
        result = assess_company(company)
        self.assertEqual(result["summary"]["duplicate_keys"], 1)
        self.assertEqual(result["summary"]["invalid_periods"], 2)
        self.assertTrue(any(x.startswith("duplicate_metric_key") for x in result["errors"]))
        self.assertTrue(any(x.startswith("invalid_period_end") for x in result["errors"]))

    def test_non_finite_values_and_period_type_mismatch_are_flagged(self):
        company = {
            "symbol": "ABC",
            "provider_status": "supported",
            "accession": "0000000001-26-000001",
            "form": "10-K",
            "fiscal_period": "2026-09-30",
            "metrics": [metric("balance_sheet", "totalAssets", "duration", value=float("inf"))],
        }
        result = assess_company(company)
        self.assertEqual(result["summary"]["invalid_values"], 1)
        self.assertTrue(any(x.startswith("period_type_mismatch") for x in result["errors"]))

    def test_empty_company_is_insufficient_data(self):
        result = assess_company({"symbol": "ABC", "provider_status": "extraction_error", "metrics": []})
        self.assertEqual(result["quality_status"], "insufficient_data")

    def test_report_keeps_production_immutable(self):
        report = build_report({
            "source_report_generated_at": "2026-11-25T02:00:00Z",
            "mapping_version": 2,
            "companies": [{"symbol": "ABC", "provider_status": "supported", "metrics": []}],
        })
        self.assertFalse(report["production_data_modified"])
        self.assertEqual(report["companies_assessed"], 1)


if __name__ == "__main__":
    unittest.main()
