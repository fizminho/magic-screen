import unittest

from build_accounting_review_queue import build_queue, classify


class AccountingReviewQueueTests(unittest.TestCase):
    def test_unsupported_provider_is_deferred(self):
        item = classify({"symbol": "AFMJF", "provider_status": "unsupported_provider",
                         "overall_status": "unsupported_provider"})
        self.assertEqual(item["priority"], "P3")
        self.assertIn("provider_unsupported_no_fallback", item["issues"])

    def test_missing_ebit_and_nonpositive_denominator_are_priority_one(self):
        item = classify({"symbol": "PBI", "provider_status": "supported",
                         "ebit_status": "review_required",
                         "invested_capital_status": "review_required",
                         "enterprise_value_candidate_review": {}})
        self.assertEqual(item["priority"], "P1")
        self.assertIsNone(item["unrestricted_cash_candidate"])

    def test_unique_core_candidates_but_missing_debt_and_cash_are_priority_two(self):
        item = classify({"symbol": "TEST", "provider_status": "supported",
                         "ebit_status": "direct_reported_candidate_review_only",
                         "invested_capital_status": "positive_denominator_candidate_review_only",
                         "enterprise_value_candidate_review": {
                             "conventional_debt_status": "incomplete_or_ambiguous_debt_inputs",
                             "unrestricted_cash_candidate": None,
                         }})
        self.assertEqual(item["priority"], "P2")

    def test_unknown_is_not_converted_to_zero(self):
        item = classify({"symbol": "TEST", "provider_status": "supported",
                         "ebit_status": "direct_reported_candidate_review_only",
                         "invested_capital_status": "positive_denominator_candidate_review_only",
                         "enterprise_value_candidate_review": {
                             "conventional_debt_status": "identified_from_unique_current_and_noncurrent_components",
                             "unrestricted_cash_candidate": None,
                         }})
        self.assertIsNone(item["unrestricted_cash_candidate"])
        self.assertIn("unrestricted_cash_not_uniquely_resolved", item["issues"])


    def test_unique_balance_sheet_candidates_are_not_exceptions(self):
        item = classify({
            "symbol": "CLEAN",
            "provider_status": "supported",
            "ebit_status": "direct_reported_candidate_review_only",
            "invested_capital_status": "positive_denominator_candidate_review_only",
            "enterprise_value_candidate_review": {
                "conventional_debt_status": "identified_from_unique_current_and_noncurrent_components",
                "unrestricted_cash_candidate": 100,
            },
            "balance_sheet_candidate_review": {
                "current_debt": {"status": "unique_candidate", "candidate_count": 1},
                "noncurrent_debt": {"status": "unique_candidate", "candidate_count": 1},
                "restricted_cash": {"status": "not_found", "candidate_count": 0},
                "current_lease_liabilities": {"status": "ambiguous_candidates", "candidate_count": 2},
            },
        })
        self.assertEqual(item["balance_sheet_exceptions"], ["current_lease_liabilities=ambiguous_candidates(2)"])
        self.assertFalse(item["production_write"])

    def test_queue_sorts_by_priority_and_preserves_read_only_flags(self):
        report = {"resolver": "deterministic-preview-v1",
                  "production_fundamentals_changed": False, "rankings_changed": False,
                  "resolutions": [
                      {"symbol": "ZED", "provider_status": "supported",
                       "ebit_status": "direct_reported_candidate_review_only",
                       "invested_capital_status": "positive_denominator_candidate_review_only",
                       "enterprise_value_candidate_review": {"conventional_debt_status": "ok",
                                                             "unrestricted_cash_candidate": 10}},
                      {"symbol": "ABC", "provider_status": "supported",
                       "ebit_status": "review_required", "invested_capital_status": "review_required"},
                  ]}
        queue = build_queue(report)
        self.assertEqual([x["symbol"] for x in queue["items"]], ["ABC", "ZED"])
        self.assertFalse(queue["production_fundamentals_changed"])
        self.assertFalse(queue["rankings_changed"])
        self.assertFalse(queue["production_write"])
        self.assertTrue(all(item["production_write"] is False for item in queue["items"]))


if __name__ == "__main__":
    unittest.main()
