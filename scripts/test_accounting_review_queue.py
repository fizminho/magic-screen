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


    def test_unique_classification_does_not_mean_policy_approval(self):
        item = classify({
            "symbol": "LEASE",
            "provider_status": "supported",
            "ebit_status": "direct_reported_candidate_review_only",
            "invested_capital_status": "positive_denominator_candidate_review_only",
            "enterprise_value_candidate_review": {
                "status": "candidate_inputs_identified_review_only",
                "conventional_debt_status": "identified_from_unique_current_and_noncurrent_components",
                "approval_status": "review_only_no_production_ev_or_earnings_yield",
                "unrestricted_cash_candidate": 100,
            },
            "balance_sheet_candidate_review": {
                "current_debt": {"status": "unique_candidate", "candidate_count": 1},
                "current_lease_liabilities": {"status": "unique_candidate", "candidate_count": 1},
                "restricted_cash": {"status": "unique_candidate", "candidate_count": 1},
                "short_term_investments": {"status": "unique_candidate", "candidate_count": 1},
            },
        })
        assessment = item["candidate_vs_policy_assessment"]
        self.assertEqual(assessment["balance_sheet"]["current_debt"]["classification_confidence"], "unique_candidate")
        self.assertIn("pending_conventional_debt_policy", assessment["balance_sheet"]["current_debt"]["policy_status"])
        self.assertIn("excluded_pending_lease_policy", assessment["balance_sheet"]["current_lease_liabilities"]["policy_status"])
        self.assertIn("excluded_pending_restricted_cash_policy", assessment["balance_sheet"]["restricted_cash"]["policy_status"])
        self.assertFalse(assessment["balance_sheet"]["current_lease_liabilities"]["production_approved"])
        self.assertFalse(assessment["enterprise_value"]["production_approved"])

    def test_queue_preserves_debt_instrument_evidence_and_resolution_hints(self):
        item = classify({
            "symbol": "SBC",
            "provider_status": "supported",
            "balance_sheet_candidate_review": {
                "current_debt": {
                    "status": "ambiguous_candidates",
                    "candidate_count": 2,
                    "resolution_hint": "multiple_distinct_instrument_candidates_manual_review_no_automatic_sum",
                    "automatic_aggregation": False,
                    "candidates": [
                        {"concept": "us-gaap_LoansPayableCurrent", "label": "Bank borrowings, current", "value": 9_000_000},
                        {"concept": "us-gaap_NotesPayableCurrent", "label": "Related-party notes payable, current", "value": 0},
                    ],
                },
                "noncurrent_debt": {"status": "not_found", "candidate_count": 0},
                "aggregate_debt": {"status": "not_found", "candidate_count": 0},
            },
        })
        evidence = item["debt_instrument_evidence"]
        self.assertEqual(evidence["current_debt"]["candidate_count"], 2)
        self.assertEqual(
            evidence["current_debt"]["resolution_hint"],
            "multiple_distinct_instrument_candidates_manual_review_no_automatic_sum",
        )
        self.assertFalse(evidence["current_debt"]["automatic_aggregation"])
        self.assertEqual(evidence["current_debt"]["candidates"][1]["value"], 0)

    def test_queue_enriches_debt_evidence_from_matching_fresh_accession(self):
        preview = {
            "resolver": "test",
            "production_fundamentals_changed": False,
            "rankings_changed": False,
            "resolutions": [{
                "symbol": "SBC",
                "accession": "0001193125-26-127557",
                "provider_status": "supported",
                "ebit_status": "direct_reported_candidate_review_only",
                "invested_capital_status": "positive_denominator_candidate_review_only",
                "balance_sheet_candidate_review": {
                    "current_debt": {"status": "ambiguous_candidates", "candidate_count": 2},
                },
                "enterprise_value_candidate_review": {},
            }],
        }
        raw = {
            "companies": [{
                "symbol": "SBC",
                "filing": {"accession_number": "0001193125-26-127557"},
                "balance_sheet_fact_review": {
                    "categories": {
                        "current_debt_candidates": {
                            "status": "ambiguous_candidates",
                            "candidate_count": 2,
                            "resolution_hint": "multiple_distinct_instrument_candidates_manual_review_no_automatic_sum",
                            "automatic_aggregation": False,
                            "candidates": [
                                {"concept": "us-gaap_LoansPayableCurrent", "parent_concept": "us-gaap_LiabilitiesCurrent", "value": 9_000_000},
                                {"concept": "us-gaap_NotesPayableCurrent", "parent_concept": "us-gaap_LiabilitiesCurrent", "value": 0},
                            ],
                        },
                    },
                },
            }],
        }
        item = build_queue(preview, raw)["items"][0]
        self.assertEqual(item["debt_instrument_evidence_source"], "fresh_extraction_artifact_same_accession")
        self.assertEqual(
            item["debt_instrument_evidence"]["current_debt"]["resolution_hint"],
            "multiple_distinct_instrument_candidates_manual_review_no_automatic_sum",
        )
        self.assertFalse(item["debt_instrument_evidence"]["current_debt"]["automatic_aggregation"])

    def test_queue_does_not_mix_debt_evidence_from_different_accessions(self):
        preview = {
            "production_fundamentals_changed": False,
            "rankings_changed": False,
            "resolutions": [{
                "symbol": "SBC",
                "accession": "old-accession",
                "provider_status": "supported",
                "balance_sheet_candidate_review": {
                    "current_debt": {"status": "not_found", "candidate_count": 0},
                },
                "enterprise_value_candidate_review": {},
            }],
        }
        raw = {
            "companies": [{
                "symbol": "SBC",
                "filing": {"accession_number": "new-accession"},
                "balance_sheet_fact_review": {
                    "categories": {
                        "current_debt_candidates": {
                            "status": "unique_candidate",
                            "candidate_count": 1,
                            "candidates": [{"concept": "us-gaap_LoansPayableCurrent", "value": 9_000_000}],
                        },
                    },
                },
            }],
        }
        item = build_queue(preview, raw)["items"][0]
        self.assertEqual(item["debt_instrument_evidence_source"], "stored_resolver_preview")
        self.assertEqual(item["debt_instrument_evidence"]["current_debt"]["candidate_count"], 0)

    def test_ambiguous_classification_stays_ambiguous_and_unapproved(self):
        item = classify({
            "symbol": "AMB",
            "provider_status": "supported",
            "balance_sheet_candidate_review": {
                "noncurrent_debt": {"status": "ambiguous_candidates", "candidate_count": 2},
            },
        })
        assessment = item["candidate_vs_policy_assessment"]["balance_sheet"]["noncurrent_debt"]
        self.assertEqual(assessment["classification_confidence"], "ambiguous_candidates")
        self.assertFalse(assessment["production_approved"])



    def test_queue_enriches_reconciliation_from_matching_accession(self):
        preview = {
            "resolver": "test",
            "production_fundamentals_changed": False,
            "rankings_changed": False,
            "resolutions": [{
                "symbol": "BAD",
                "accession": "same-accession",
                "provider_status": "supported",
                "ebit_status": "direct_reported_candidate_review_only",
                "invested_capital_status": "positive_denominator_candidate_review_only",
                "enterprise_value_candidate_review": {},
            }],
        }
        raw = {
            "companies": [{
                "symbol": "BAD",
                "filing": {"accession_number": "same-accession"},
                "balance_sheet_reconciliation_review": {
                    "status": "difference",
                    "fiscal_period": "2025-12-31",
                    "difference_assets_less_liabilities_and_equity": 250000,
                },
                "balance_sheet_fact_review": {"categories": {}},
            }],
        }
        item = build_queue(preview, raw)["items"][0]
        self.assertEqual(item["balance_sheet_reconciliation_evidence_source"],
                         "fresh_extraction_artifact_same_accession")
        self.assertEqual(item["balance_sheet_reconciliation_review"]["status"], "difference")
        self.assertEqual(item["priority"], "P1")
        self.assertIn("balance_sheet_reconciliation_difference", item["issues"])

    def test_queue_does_not_mix_reconciliation_from_different_accessions(self):
        preview = {
            "production_fundamentals_changed": False,
            "rankings_changed": False,
            "resolutions": [{
                "symbol": "SAFE",
                "accession": "old-accession",
                "provider_status": "supported",
                "ebit_status": "direct_reported_candidate_review_only",
                "invested_capital_status": "positive_denominator_candidate_review_only",
                "enterprise_value_candidate_review": {},
            }],
        }
        raw = {
            "companies": [{
                "symbol": "SAFE",
                "filing": {"accession_number": "new-accession"},
                "balance_sheet_reconciliation_review": {"status": "difference"},
                "balance_sheet_fact_review": {"categories": {}},
            }],
        }
        item = build_queue(preview, raw)["items"][0]
        self.assertIsNone(item["balance_sheet_reconciliation_review"])
        self.assertEqual(item["balance_sheet_reconciliation_evidence_source"],
                         "stored_resolver_preview")
        self.assertNotIn("balance_sheet_reconciliation_difference", item["issues"])

    def test_reconciled_balance_sheet_does_not_create_exception(self):
        preview = {
            "production_fundamentals_changed": False,
            "rankings_changed": False,
            "resolutions": [{
                "symbol": "GOOD",
                "accession": "same-accession",
                "provider_status": "supported",
                "ebit_status": "direct_reported_candidate_review_only",
                "invested_capital_status": "positive_denominator_candidate_review_only",
                "enterprise_value_candidate_review": {},
            }],
        }
        raw = {
            "companies": [{
                "symbol": "GOOD",
                "filing": {"accession_number": "same-accession"},
                "balance_sheet_reconciliation_review": {"status": "reconciled"},
                "balance_sheet_fact_review": {"categories": {}},
            }],
        }
        queue = build_queue(preview, raw)
        item = queue["items"][0]
        self.assertEqual(item["balance_sheet_reconciliation_review"]["status"], "reconciled")
        self.assertNotIn("balance_sheet_reconciliation_difference", item["issues"])
        self.assertEqual(queue["summary"]["balance_sheet_reconciliation"], {"reconciled": 1})

if __name__ == "__main__":
    unittest.main()
