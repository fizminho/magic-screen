import unittest

from build_accounting_review_queue import build_queue, classify, extract_ev_scope_evidence


class AccountingReviewQueueTests(unittest.TestCase):
    def test_combined_cash_and_restricted_cash_face_row_is_not_unrestricted_cash(self):
        evidence = extract_ev_scope_evidence({
            "symbol": "COMBINED",
            "filing": {"accession_number": "0000000000-26-000001"},
            "balance_sheet_fact_review": {"fiscal_period": "2025-12-31"},
            "statements": {"balance_sheet": {"rows": [{
                "concept": "us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
                "label": "Cash and cash equivalents, including restricted cash",
                "parent_concept": "us-gaap:AssetsCurrent",
                "values": {"2025-12-31": 125000000},
            }]}}
        })
        self.assertEqual(evidence["row_count"], 1)
        row = evidence["rows"][0]
        self.assertEqual(row["category"], "cash_and_restricted_cash_combined")
        self.assertIn("do_not_treat_as_unrestricted", row["policy_status"])
        self.assertFalse(row["production_approved"])
        self.assertFalse(row["resolver_input"])

    def test_separately_reported_restricted_cash_remains_restricted_category(self):
        evidence = extract_ev_scope_evidence({
            "symbol": "RESTRICTED",
            "filing": {"accession_number": "0000000000-26-000002"},
            "balance_sheet_fact_review": {"fiscal_period": "2025-12-31"},
            "statements": {"balance_sheet": {"rows": [{
                "concept": "us-gaap:RestrictedCashCurrent",
                "label": "Restricted cash",
                "parent_concept": "us-gaap:AssetsCurrent",
                "values": {"2025-12-31": 5000000},
            }]}}
        })
        self.assertEqual(evidence["rows"][0]["category"], "restricted_cash")

    def test_next_review_actions_are_actionable_and_preserve_unknowns(self):
        item = classify({
            "symbol": "UPWK",
            "provider_status": "supported",
            "ebit_status": "direct_reported_candidate_review_only",
            "invested_capital_status": "positive_denominator_candidate_review_only",
            "review_flags": ["negative_working_capital_offset_high_risk_manual_review", "nondebt_financing_obligation_requires_enterprise_value_scope_review"],
            "enterprise_value_candidate_review": {
                "conventional_debt_status": "identified_from_unique_current_and_noncurrent_components",
                "unrestricted_cash_candidate": 294356000,
            },
        })
        actions = item["next_review_actions"]
        self.assertTrue(any("negative-working-capital offset" in action for action in actions))
        self.assertTrue(any("unrestricted" in action.lower() for action in actions))
        self.assertTrue(any("financing obligations" in action.lower() for action in actions))
        self.assertFalse(item["production_write"])

    def test_unsupported_provider_action_does_not_suggest_fallback(self):
        item = classify({"symbol": "AFMJF", "provider_status": "unsupported_provider", "overall_status": "unsupported_provider"})
        self.assertEqual(len(item["next_review_actions"]), 1)
        self.assertIn("unapproved fallback", item["next_review_actions"][0])

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

    def test_missing_maturity_bucket_is_explicitly_unknown_not_zero(self):
        item = classify({
            "symbol": "SGHC",
            "provider_status": "supported",
            "balance_sheet_candidate_review": {
                "current_debt": {"status": "not_found", "candidate_count": 0},
                "noncurrent_debt": {"status": "unique_candidate", "candidate_count": 1},
            },
            "enterprise_value_candidate_review": {
                "conventional_debt_status": "incomplete_or_ambiguous_debt_inputs",
            },
        })
        gap = item["debt_resolution_gap"]
        self.assertEqual(gap["current"]["disposition"], "unknown_not_zero")
        self.assertEqual(gap["noncurrent"]["disposition"], "unique_candidate_review_only")
        self.assertFalse(gap["production_approved"])
        self.assertIn("not zero", gap["interpretation"])

    def test_ambiguous_maturity_bucket_is_not_automatically_aggregated(self):
        item = classify({
            "symbol": "SBC",
            "provider_status": "supported",
            "balance_sheet_candidate_review": {
                "current_debt": {"status": "ambiguous_candidates", "candidate_count": 2},
                "noncurrent_debt": {"status": "unique_candidate", "candidate_count": 1},
                "aggregate_debt": {"status": "unique_candidate", "candidate_count": 1},
            },
            "enterprise_value_candidate_review": {
                "conventional_debt_status": "incomplete_or_ambiguous_debt_inputs",
            },
        })
        gap = item["debt_resolution_gap"]
        self.assertEqual(gap["current"]["disposition"], "ambiguous_manual_review")
        self.assertEqual(gap["aggregate"]["disposition"], "unique_candidate_review_only")
        self.assertIn("must not be added", gap["interpretation"])
        self.assertFalse(gap["aggregate"]["production_approved"])

    def test_cash_scope_gaps_keep_missing_unknown_and_investments_separate(self):
        item = classify({
            "symbol": "UPWK",
            "provider_status": "supported",
            "balance_sheet_candidate_review": {
                "unrestricted_cash": {"status": "unique_candidate", "candidate_count": 1,
                                     "candidates": [{"value": 294356000}]},
                "restricted_cash": {"status": "unique_candidate", "candidate_count": 1,
                                    "candidates": [{"value": 3800000}]},
                "short_term_investments": {"status": "unique_candidate", "candidate_count": 1,
                                           "candidates": [{"value": 378425000}]},
            },
            "enterprise_value_candidate_review": {
                "unrestricted_cash_candidate": 294356000,
            },
        })
        cash = item["cash_scope_resolution"]
        self.assertEqual(cash["unrestricted_cash"]["disposition"], "unique_candidate_review_only")
        self.assertEqual(cash["restricted_cash"]["disposition"], "unique_candidate_review_only")
        self.assertEqual(cash["short_term_investments"]["disposition"], "unique_candidate_review_only")
        self.assertEqual(cash["short_term_investments"]["candidate_values"], [378425000])
        self.assertIn("remain separate", cash["interpretation"])
        self.assertFalse(cash["production_approved"])
        self.assertFalse(cash["cash_candidate_promoted"])

    def test_missing_cash_evidence_is_unknown_not_zero(self):
        item = classify({
            "symbol": "NO_CASH",
            "provider_status": "supported",
            "balance_sheet_candidate_review": {
                "unrestricted_cash": {"status": "not_found", "candidate_count": 0},
                "restricted_cash": {"status": "not_found", "candidate_count": 0},
                "short_term_investments": {"status": "not_found", "candidate_count": 0},
            },
            "enterprise_value_candidate_review": {},
        })
        cash = item["cash_scope_resolution"]
        self.assertEqual(cash["unrestricted_cash"]["disposition"], "unknown_not_zero")
        self.assertEqual(cash["restricted_cash"]["disposition"], "unknown_not_zero")
        self.assertIsNone(cash["candidate_cash_amount"])
        self.assertFalse(cash["cash_candidate_promoted"])

    def test_explicit_zero_cash_is_limited_to_the_reported_line(self):
        item = classify({
            "symbol": "ZERO_CASH",
            "provider_status": "supported",
            "balance_sheet_candidate_review": {
                "unrestricted_cash": {"status": "unique_candidate", "candidate_count": 1,
                                      "candidates": [{"value": 0}]},
                "restricted_cash": {"status": "not_found", "candidate_count": 0},
            },
            "enterprise_value_candidate_review": {},
        })
        cash = item["cash_scope_resolution"]
        self.assertTrue(cash["unrestricted_cash"]["explicit_zero_for_this_line_only"])
        self.assertEqual(cash["restricted_cash"]["disposition"], "unknown_not_zero")

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


    def test_queue_attaches_shadow_rank_context_without_changing_accounting_priority(self):
        report = {
            "resolver": "deterministic-preview-v1",
            "production_fundamentals_changed": False,
            "rankings_changed": False,
            "resolutions": [
                {"symbol": "ABC", "provider_status": "supported", "ebit_status": "review_required", "invested_capital_status": "review_required"},
                {"symbol": "XYZ", "provider_status": "unsupported_provider", "overall_status": "unsupported_provider"},
            ],
        }
        ranking = {
            "as_of": "2026-11-21T08:18:44Z",
            "methodology_version": "classic_mfi_ordinal_rank_sum_v1",
            "production_write": False, "rankings_changed": False,
            "rankings": [
                {"symbol": "ABC", "magic_formula_rank": 1, "magic_formula_score": 3, "earnings_yield": 0.12, "return_on_capital": 0.4, "eligibility_status": "eligible", "ranking_eligible": True, "production_approved": False},
                {"symbol": "XYZ", "magic_formula_rank": None, "magic_formula_score": None, "earnings_yield": None, "return_on_capital": None, "eligibility_status": "excluded_provider_unsupported", "ranking_eligible": False, "production_approved": False},
            ],
        }
        queue = build_queue(report, ranking_preview=ranking)
        by_symbol = {item["symbol"]: item for item in queue["items"]}
        self.assertEqual(by_symbol["ABC"]["priority"], "P1")
        self.assertEqual(by_symbol["ABC"]["mfi_shadow_ranking"]["rank"], 1)
        self.assertFalse(by_symbol["ABC"]["mfi_shadow_ranking"]["production_approved"])
        self.assertIsNone(by_symbol["XYZ"]["mfi_shadow_ranking"]["rank"])
        self.assertEqual(queue["summary"]["shadow_ranked_review_items"], 1)
        self.assertEqual(queue["summary"]["shadow_production_approved"], 0)
        self.assertFalse(queue["production_write"])

    def test_queue_rejects_mutable_ranking_preview(self):
        report = {"production_fundamentals_changed": False, "rankings_changed": False, "resolutions": [{"symbol": "ABC", "provider_status": "supported"}]}
        ranking = {"production_write": True, "rankings_changed": False, "rankings": []}
        with self.assertRaisesRegex(ValueError, "production immutability"):
            build_queue(report, ranking_preview=ranking)
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
                "balance_sheet_fact_review": {"fiscal_period": "2025-12-31",
                    "categories": {
                        "current_debt_candidates": {
                            "status": "ambiguous_candidates",
                            "candidate_count": 2,
                            "resolution_hint": "multiple_distinct_instrument_candidates_manual_review_no_automatic_sum",
                            "automatic_aggregation": False,
                            "candidates": [
                                {"concept": "us-gaap_LoansPayableCurrent", "parent_concept": "us-gaap_LiabilitiesCurrent", "value": 9_000_000, "fiscal_period": "2025-12-31"},
                                {"concept": "us-gaap_NotesPayableCurrent", "parent_concept": "us-gaap_LiabilitiesCurrent", "value": 0, "fiscal_period": "2025-12-31"},
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
        current_gap = item["debt_resolution_gap"]["current"]
        self.assertEqual(current_gap["disposition"], "ambiguous_manual_review")
        self.assertEqual(current_gap["filing_evidence_disposition"], "one_nonzero_plus_explicit_zero_instruments_review_only")
        self.assertEqual(current_gap["manual_nonzero_candidate_values"], [9_000_000])
        self.assertFalse(current_gap["automatic_aggregation"])
        self.assertFalse(current_gap["resolver_input"])
        self.assertFalse(current_gap["production_approved"])

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


    def test_queue_surfaces_filing_specific_ebit_only_for_exact_accession(self):
        preview = {
            "production_fundamentals_changed": False,
            "rankings_changed": False,
            "resolutions": [{
                "symbol": "HRB",
                "accession": "hrb-accession",
                "provider_status": "supported",
                "ebit_status": "review_required",
                "invested_capital_status": "positive_denominator_candidate_review_only",
                "enterprise_value_candidate_review": {},
            }],
        }
        raw = {
            "companies": [{
                "symbol": "HRB",
                "filing": {"accession_number": "hrb-accession"},
                "filing_specific_review": {
                    "status": "review_only",
                    "method": "statement_subtotal_reconstructed",
                    "filing_accession": "hrb-accession",
                    "ebit_candidate": 907686000,
                    "cross_checks": {"reconciles_within_1": True},
                },
                "balance_sheet_fact_review": {"categories": {}},
            }],
        }
        item = build_queue(preview, raw)["items"][0]
        self.assertEqual(item["filing_specific_ebit_review_source"],
                         "fresh_extraction_artifact_same_accession")
        self.assertEqual(item["filing_specific_ebit_review"]["ebit_candidate"], 907686000)
        self.assertIn("filing_specific_ebit_candidate_available_manual_review", item["issues"])
        assessment = item["candidate_vs_policy_assessment"]["filing_specific_ebit"]
        self.assertFalse(assessment["production_approved"])
        self.assertIn("manual_review", assessment["policy_status"])

    def test_queue_does_not_surface_filing_specific_ebit_from_mismatched_accession(self):
        preview = {
            "production_fundamentals_changed": False,
            "rankings_changed": False,
            "resolutions": [{
                "symbol": "HRB",
                "accession": "resolver-accession",
                "provider_status": "supported",
                "ebit_status": "review_required",
                "invested_capital_status": "review_required",
                "enterprise_value_candidate_review": {},
            }],
        }
        raw = {
            "companies": [{
                "symbol": "HRB",
                "filing": {"accession_number": "raw-accession"},
                "filing_specific_review": {
                    "status": "review_only",
                    "filing_accession": "raw-accession",
                    "ebit_candidate": 907686000,
                },
                "balance_sheet_fact_review": {"categories": {}},
            }],
        }
        item = build_queue(preview, raw)["items"][0]
        self.assertIsNone(item["filing_specific_ebit_review"])
        self.assertEqual(item["filing_specific_ebit_review_source"], "stored_resolver_preview")
        self.assertNotIn("filing_specific_ebit_candidate_available_manual_review", item["issues"])


    def test_debt_candidate_evidence_review_distinguishes_zero_lines_from_unknown(self):
        from build_accounting_review_queue import debt_candidate_evidence_review

        company = {
            "reporting_currency_review": {"currency": "USD"},
            "balance_sheet_fact_review": {
                "fiscal_period": "2025-12-31",
                "categories": {
                    "current_debt_candidates": {
                        "status": "ambiguous_candidates", "candidate_count": 2,
                        "candidates": [
                            {"concept": "us-gaap_NotesPayableCurrent", "label": "Short-term note payable",
                             "value": 0.0, "fiscal_period": "2025-12-31", "row_index": 19},
                            {"concept": "us-gaap_ConvertibleDebtCurrent", "label": "Convertible debt",
                             "value": 0.0, "fiscal_period": "2025-12-31", "row_index": 20},
                        ],
                    },
                    "noncurrent_debt_candidates": {"status": "not_found", "candidate_count": 0, "candidates": []},
                },
            },
        }
        review = debt_candidate_evidence_review(company)
        self.assertEqual(review["buckets"]["current"]["disposition"],
                         "all_reported_instrument_lines_explicit_zero_review_only")
        self.assertEqual(review["buckets"]["current"]["explicit_zero_candidate_count"], 2)
        self.assertEqual(review["buckets"]["noncurrent"]["disposition"], "unknown_not_zero")
        self.assertFalse(review["production_approved"])
        self.assertFalse(review["resolver_input"])

    def test_debt_candidate_evidence_review_one_nonzero_plus_explicit_zero_is_not_aggregated(self):
        from build_accounting_review_queue import debt_candidate_evidence_review

        company = {
            "balance_sheet_fact_review": {
                "fiscal_period": "2025-12-31",
                "categories": {
                    "current_debt_candidates": {
                        "status": "ambiguous_candidates", "candidate_count": 2,
                        "candidates": [
                            {"concept": "us-gaap_LoansPayableCurrent", "label": "Bank and other borrowings, current",
                             "value": 9099046.0, "fiscal_period": "2025-12-31", "row_index": 87},
                            {"concept": "us-gaap_NotesPayableCurrent", "label": "Notes payables, current - related parties",
                             "value": 0.0, "fiscal_period": "2025-12-31", "row_index": 88},
                        ],
                    },
                    "noncurrent_debt_candidates": {"status": "not_found", "candidate_count": 0, "candidates": []},
                },
            },
        }
        current = debt_candidate_evidence_review(company)["buckets"]["current"]
        self.assertEqual(current["disposition"], "one_nonzero_plus_explicit_zero_instruments_review_only")
        self.assertEqual(current["nonzero_candidate_count"], 1)
        self.assertEqual(current["explicit_zero_candidate_count"], 1)
        self.assertEqual(len(current["candidates"]), 2)
        self.assertFalse(current["automatic_aggregation"])

    def test_debt_candidate_evidence_review_does_not_mix_fiscal_periods(self):
        from build_accounting_review_queue import debt_candidate_evidence_review

        company = {
            "balance_sheet_fact_review": {
                "fiscal_period": "2025-12-31",
                "categories": {
                    "current_debt_candidates": {
                        "status": "unique_candidate", "candidate_count": 1,
                        "candidates": [
                            {"concept": "us-gaap_NotesPayableCurrent", "label": "Note payable",
                             "value": 123.0, "fiscal_period": "2024-12-31", "row_index": 4},
                        ],
                    },
                    "noncurrent_debt_candidates": {"status": "not_found", "candidate_count": 0, "candidates": []},
                },
            },
        }
        current = debt_candidate_evidence_review(company)["buckets"]["current"]
        self.assertEqual(current["disposition"], "unknown_not_zero")
        self.assertEqual(current["fiscal_period_candidate_count"], 0)

    def test_debt_scope_evidence_distinguishes_leases_financing_and_explicit_zero(self):
        from build_accounting_review_queue import extract_debt_scope_evidence

        company = {
            "filing": {"period_of_report": "2025-12-31"},
            "balance_sheet_fact_review": {"fiscal_period": "2025-12-31"},
            "statements": {"balance_sheet": {"rows": [
                {"concept": "us-gaap_LongTermDebtNoncurrent", "label": "Secured term loan",
                 "parent_concept": "us-gaap_Liabilities", "values": {"2025-12-31": 0}},
                {"concept": "us-gaap_OperatingLeaseLiabilityNoncurrent", "label": "Operating lease liabilities",
                 "parent_concept": "us-gaap_Liabilities", "values": {"2025-12-31": 500}},
                {"concept": "issuer_RoyaltyFinancingLiabilitiesNoncurrent", "label": "Royalty financing obligations",
                 "parent_concept": "us-gaap_Liabilities", "values": {"2025-12-31": 900}},
                {"concept": "us-gaap_NotesPayableCurrent", "label": "Short-term note payable",
                 "parent_concept": "us-gaap_LiabilitiesCurrent", "values": {"2025-12-31": 0}},
                {"concept": "us-gaap_NotesPayableCurrent", "label": "Notes payables, current - related parties",
                 "parent_concept": "us-gaap_LiabilitiesCurrent", "values": {"2025-12-31": 0}},
                {"concept": "us-gaap_OtherLongTermDebtNoncurrent", "label": "Other long-term liabilities",
                 "parent_concept": "us-gaap_Liabilities", "values": {"2025-12-31": 91}},
                {"concept": "us-gaap_LongTermDebtNoncurrent", "label": "Debt by subsidiary",
                 "parent_concept": "us-gaap_Liabilities", "dimension": True,
                 "values": {"2025-12-31": 999}},
                {"concept": "us-gaap_DebtSecuritiesAvailableForSaleNoncurrent", "label": "Debt securities",
                 "parent_concept": "us-gaap_Assets", "values": {"2025-12-31": 1000}},
            ]}},
        }
        evidence = extract_debt_scope_evidence(company)
        self.assertEqual(evidence["row_count"], 6)
        by_type = {row["classification"]: row for row in evidence["rows"]}
        self.assertTrue(by_type["conventional_debt_candidate"]["explicit_zero"])
        self.assertEqual(by_type["lease_liability"]["amount"], 500)
        self.assertEqual(by_type["separate_financing_obligation"]["amount"], 900)
        self.assertTrue(any(row["concept"] == "us-gaap_NotesPayableCurrent" and row["explicit_zero"]
                            for row in evidence["rows"]))
        self.assertTrue(any(row["concept"] == "us-gaap_OtherLongTermDebtNoncurrent"
                            and row["classification"] == "other_financing_or_liability_review"
                            for row in evidence["rows"]))
        self.assertFalse(evidence["production_approved"])

    def test_queue_enriches_debt_scope_evidence_only_for_matching_accession(self):
        preview = {
            "production_fundamentals_changed": False, "rankings_changed": False,
            "resolutions": [{"symbol": "TEST", "accession": "same",
                             "provider_status": "supported",
                             "enterprise_value_candidate_review": {}}],
        }
        raw = {"companies": [{
            "symbol": "TEST", "filing": {"accession_number": "same"},
            "balance_sheet_fact_review": {"fiscal_period": "2025-12-31", "categories": {}},
            "statements": {"balance_sheet": {"rows": [{
                "concept": "us-gaap_OperatingLeaseLiabilityCurrent",
                "label": "Operating lease liabilities",
                "parent_concept": "us-gaap_LiabilitiesCurrent",
                "values": {"2025-12-31": 123},
            }]}},
        }]}
        item = build_queue(preview, raw)["items"][0]
        self.assertEqual(item["debt_scope_evidence_source"], "fresh_extraction_artifact_same_accession")
        self.assertEqual(item["debt_scope_evidence"]["rows"][0]["amount"], 123)

        raw["companies"][0]["filing"]["accession_number"] = "different"
        item = build_queue(preview, raw)["items"][0]
        self.assertIsNone(item["debt_scope_evidence"])
        self.assertEqual(item["debt_scope_evidence_source"], "stored_resolver_preview")


    def test_mntn_and_spro_note_reviews_are_accession_bound(self):
        from build_accounting_review_queue import filing_debt_note_review

        mntn = filing_debt_note_review("MNTN", "0001891027-26-000019")
        self.assertEqual(mntn["method"], "convertible_note_settlement_and_revolver_zero_review")
        self.assertIn("Do not classify employee promissory notes receivable as company borrowing.", mntn["prohibited_inferences"])
        self.assertFalse(mntn["production_approved"])

        spro = filing_debt_note_review("SPRO", "0001193125-26-126192")
        self.assertEqual(spro["method"], "explicit_no_debt_and_lease_liability_scope_review")
        self.assertIn("Do not include lease liabilities or the 91k other long-term liability as conventional debt without separate policy/evidence.", spro["prohibited_inferences"])
        self.assertFalse(spro["resolver_input"])

        self.assertIsNone(filing_debt_note_review("MNTN", "wrong-accession"))
        self.assertIsNone(filing_debt_note_review("SPRO", "wrong-accession"))
    def test_filing_debt_note_review_is_accession_bound_and_never_promotes_debt(self):
        from build_accounting_review_queue import filing_debt_note_review

        review = filing_debt_note_review("SBC", "0001193125-26-127557")
        self.assertEqual(review["status"], "review_only")
        self.assertFalse(review["production_approved"])
        self.assertFalse(review["resolver_input"])
        self.assertFalse(review["debt_candidate_promoted"])
        self.assertEqual(review["evidence_scope"], "current_and_noncurrent_bank_borrowings_with_maturity_reconciliation")
        self.assertTrue(review["manual_review_questions"])
        self.assertTrue(review["prohibited_inferences"])
        self.assertIsNone(filing_debt_note_review("SBC", "different-accession"))
        self.assertIsNone(filing_debt_note_review("UNKNOWN", "0001193125-26-127557"))

    def test_queue_surfaces_filing_debt_note_review_only_for_exact_accession(self):
        preview = {
            "production_fundamentals_changed": False, "rankings_changed": False,
            "resolutions": [{"symbol": "PXED", "accession": "0001193125-26-445323",
                             "provider_status": "supported", "enterprise_value_candidate_review": {}}],
        }
        raw = {"companies": [{
            "symbol": "PXED", "filing": {"accession_number": "0001193125-26-445323"},
            "balance_sheet_fact_review": {"categories": {}},
        }]}
        queue = build_queue(preview, raw)
        item = queue["items"][0]
        self.assertEqual(item["filing_debt_note_review"]["method"], "revolving_credit_facility_note_review")
        self.assertEqual(queue["summary"]["filing_debt_note_manual_reviews_available"], 1)
        self.assertIn("filing_debt_note_review_available_manual_review", item["issues"])
        self.assertFalse(item["filing_debt_note_review"]["production_approved"])
        self.assertEqual(item["filing_debt_note_review"]["evidence_scope"], "named_revolver_undrawn_status_and_letter_of_credit")
        self.assertIn("Do not infer company-wide zero debt from the undrawn revolver.", item["filing_debt_note_review"]["prohibited_inferences"])
        self.assertFalse(item["production_write"])

        preview["resolutions"][0]["accession"] = "different-accession"
        item = build_queue(preview, raw)["items"][0]
        self.assertIsNone(item["filing_debt_note_review"])
        self.assertEqual(item["filing_debt_note_review_source"], "stored_resolver_preview")

    def test_queue_enriches_denominator_diagnostics_from_matching_accession(self):
        preview = {
            "production_fundamentals_changed": False, "rankings_changed": False,
            "resolutions": [{
                "symbol": "OTEX", "accession": "same-accession",
                "provider_status": "supported",
                "ebit_status": "direct_reported_candidate_review_only",
                "invested_capital_status": "positive_denominator_candidate_review_only",
                "enterprise_value_candidate_review": {},
            }],
        }
        diagnostics = {
            "working_capital": -505452000,
            "net_ppe": 522197000,
            "negative_working_capital_offset_ratio": 0.967934,
            "negative_working_capital_offsets_at_least_90pct_of_net_ppe": True,
            "near_zero_positive_denominator_from_negative_working_capital": True,
        }
        raw = {"companies": [{
            "symbol": "OTEX", "filing": {"accession_number": "same-accession"},
            "invested_capital_review": {"denominator_diagnostics": diagnostics},
            "balance_sheet_fact_review": {"categories": {}},
        }]}
        queue = build_queue(preview, raw)
        item = queue["items"][0]
        self.assertEqual(item["invested_capital_denominator_diagnostics"], diagnostics)
        self.assertEqual(item["invested_capital_denominator_diagnostics_source"],
                         "fresh_extraction_artifact_same_accession")
        self.assertEqual(queue["summary"]["negative_working_capital_offset_high_risk"], 1)
        self.assertEqual(item["priority"], "P1")
        self.assertIn("invested_capital_negative_working_capital_offset_high_risk_manual_review",
                      item["issues"])
        self.assertFalse(item["production_write"])

    def test_queue_does_not_mix_denominator_diagnostics_from_different_accessions(self):
        preview = {
            "production_fundamentals_changed": False, "rankings_changed": False,
            "resolutions": [{
                "symbol": "OTEX", "accession": "resolver-accession",
                "provider_status": "supported",
                "enterprise_value_candidate_review": {},
            }],
        }
        raw = {"companies": [{
            "symbol": "OTEX", "filing": {"accession_number": "different-accession"},
            "invested_capital_review": {"denominator_diagnostics": {
                "negative_working_capital_offsets_at_least_90pct_of_net_ppe": True,
            }},
            "balance_sheet_fact_review": {"categories": {}},
        }]}
        item = build_queue(preview, raw)["items"][0]
        self.assertIsNone(item["invested_capital_denominator_diagnostics"])
        self.assertEqual(item["invested_capital_denominator_diagnostics_source"],
                         "stored_resolver_preview")

    def test_top_five_ranked_issuer_note_reviews_are_accession_bound(self):
        from build_accounting_review_queue import filing_debt_note_review

        cases = {
            "OTEX": ("0001002638-26-000068", "5,770.369m"),
            "SNDK": ("0001628280-26-057406", "March 4, 2026"),
            "IRWD": ("0001104659-26-020489", "584.680m"),
            "QTTB": ("0001193125-26-099339", "9.708m"),
            "UPWK": ("0001627475-26-000012", "359.770m"),
        }
        for symbol, (accession, expected_text) in cases.items():
            with self.subTest(symbol=symbol):
                review = filing_debt_note_review(symbol, accession)
                self.assertIsNotNone(review)
                self.assertEqual(review["status"], "review_only")
                self.assertIn(expected_text, " ".join(review["observations"]))
                self.assertTrue(review["evidence_scope"])
                self.assertFalse(review["production_approved"])
                self.assertFalse(review["resolver_input"])
                self.assertFalse(review["debt_candidate_promoted"])
                self.assertIsNone(filing_debt_note_review(symbol, "0000000000-00-000000"))

    def test_curated_debt_review_classifications_separate_conventional_and_debt_like_evidence(self):
        from build_accounting_review_queue import (
            FILING_DEBT_REVIEW_CLASSIFICATIONS, FILING_DEBT_NOTE_REVIEWS,
            filing_debt_note_review,
        )

        self.assertTrue(set(FILING_DEBT_REVIEW_CLASSIFICATIONS).issubset(set(FILING_DEBT_NOTE_REVIEWS)))
        self.assertEqual(FILING_DEBT_REVIEW_CLASSIFICATIONS["BCRX"], "separate_royalty_financing_obligation")
        self.assertEqual(FILING_DEBT_REVIEW_CLASSIFICATIONS["PRDO"], "separate_sale_leaseback_financing_obligation")
        self.assertEqual(FILING_DEBT_REVIEW_CLASSIFICATIONS["VXRT"], "separate_future_royalty_financing_obligation")
        self.assertEqual(FILING_DEBT_REVIEW_CLASSIFICATIONS["SBC"], "conventional_borrowing_maturity_reconciliation")
        self.assertEqual(FILING_DEBT_REVIEW_CLASSIFICATIONS["OTEX"], "conventional_borrowing_maturity_reconciliation")
        self.assertEqual(FILING_DEBT_REVIEW_CLASSIFICATIONS["IRWD"], "conventional_borrowing_maturity_reconciliation")
        self.assertEqual(FILING_DEBT_REVIEW_CLASSIFICATIONS["QTTB"], "conventional_term_loan_maturity_schedule")
        self.assertEqual(FILING_DEBT_REVIEW_CLASSIFICATIONS["SNDK"], "named_instrument_zero_or_undrawn_facility")
        self.assertEqual(FILING_DEBT_REVIEW_CLASSIFICATIONS["UPWK"], "conventional_borrowing_current_maturity")
        self.assertEqual(FILING_DEBT_REVIEW_CLASSIFICATIONS["FHTX"], "face_statement_no_debt_line_note_review_incomplete")
        self.assertEqual(FILING_DEBT_REVIEW_CLASSIFICATIONS["NRIX"], "face_statement_no_debt_line_note_review_incomplete")
        for symbol, source in FILING_DEBT_NOTE_REVIEWS.items():
            with self.subTest(symbol=symbol):
                review = filing_debt_note_review(symbol, source["accession"])
                self.assertEqual(review["review_classification"], FILING_DEBT_REVIEW_CLASSIFICATIONS.get(symbol, "unclassified_manual_review"))
                self.assertFalse(review["production_approved"])
                self.assertFalse(review["resolver_input"])
                self.assertFalse(review["debt_candidate_promoted"])
                self.assertIsNone(filing_debt_note_review(symbol, "different-accession"))

    def test_every_curated_debt_note_review_is_scoped_and_non_promoting(self):
        from build_accounting_review_queue import FILING_DEBT_NOTE_REVIEWS, filing_debt_note_review

        self.assertGreaterEqual(len(FILING_DEBT_NOTE_REVIEWS), 1)
        for symbol, source_review in FILING_DEBT_NOTE_REVIEWS.items():
            with self.subTest(symbol=symbol):
                review = filing_debt_note_review(symbol, source_review["accession"])
                self.assertIsNotNone(review)
                self.assertTrue(review.get("accession"))
                self.assertTrue(review.get("evidence_scope"))
                self.assertTrue(review.get("manual_review_questions"))
                self.assertTrue(review.get("prohibited_inferences"))
                self.assertEqual(review.get("status"), "review_only")
                self.assertIs(review.get("production_approved"), False)
                self.assertIs(review.get("resolver_input"), False)
                self.assertIs(review.get("debt_candidate_promoted"), False)


    def test_ev_scope_evidence_classifies_cash_restricted_investments_leases_and_nci(self):
        from build_accounting_review_queue import extract_ev_scope_evidence

        company = {
            "filing": {"accession_number": "annual-accession", "period_of_report": "2025-12-31"},
            "balance_sheet_fact_review": {"fiscal_period": "2025-12-31"},
            "statements": {"balance_sheet": {"rows": [
                {"concept": "us-gaap_CashAndCashEquivalentsAtCarryingValue", "label": "Cash and cash equivalents",
                 "parent_concept": "us-gaap_AssetsCurrent", "values": {"2025-12-31": 100}},
                {"concept": "us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
                 "label": "Cash and cash equivalents", "parent_concept": "us-gaap_AssetsCurrent",
                 "values": {"2025-12-31": 20}},
                {"concept": "us-gaap_MarketableSecuritiesCurrent", "label": "Marketable securities",
                 "parent_concept": "us-gaap_AssetsCurrent", "values": {"2025-12-31": 30}},
                {"concept": "us-gaap_MarketableEquitySecurities", "label": "Marketable equity securities",
                 "parent_concept": "us-gaap_Assets", "values": {"2025-12-31": 40}},
                {"concept": "issuer_MarketableSecurities", "label": "Marketable securities",
                 "parent_concept": "us-gaap_AssetsCurrent", "values": {"2025-12-31": 35}},
                {"concept": "us-gaap_USGovernmentSecurities", "label": "U.S. Treasury securities",
                 "parent_concept": "us-gaap_AssetsCurrent", "values": {"2025-12-31": 22}},
                {"concept": "us-gaap_DebtSecuritiesAvailableForSaleExcludingAccruedInterestCurrent",
                 "label": "Marketable securities", "parent_concept": "us-gaap_AssetsCurrent",
                 "values": {"2025-12-31": 18}},
                {"concept": "us-gaap_EquityMethodInvestments", "label": "Equity method investments",
                 "parent_concept": "us-gaap_Assets", "values": {"2025-12-31": 25}},
                {"concept": "us-gaap_NotesReceivableNetCurrent", "label": "Notes receivable",
                 "parent_concept": "us-gaap_AssetsCurrent", "values": {"2025-12-31": 15}},
                {"concept": "issuer_CommercialPaperPayableCurrent", "label": "Commercial paper payable",
                 "parent_concept": "us-gaap_LiabilitiesCurrent", "values": {"2025-12-31": 10}},
                {"concept": "us-gaap_OperatingLeaseLiabilityCurrent", "label": "Operating lease liabilities",
                 "parent_concept": "us-gaap_LiabilitiesCurrent", "values": {"2025-12-31": 50}},
                {"concept": "us-gaap_LongTermDebtNoncurrent", "label": "Long-term debt",
                 "parent_concept": "us-gaap_Liabilities", "values": {"2025-12-31": 60}},
                {"concept": "us-gaap_NoncontrollingInterestInConsolidatedEntity",
                 "label": "Noncontrolling interests", "parent_concept": "us-gaap_StockholdersEquity",
                 "values": {"2025-12-31": 7}},
                {"concept": "us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
                 "label": "Total shareholders' equity", "parent_concept": "us-gaap_LiabilitiesAndStockholdersEquity",
                 "values": {"2025-12-31": 500}},
                {"concept": "us-gaap_CustomerFundsReceivable", "label": "Customer funds in escrow",
                 "parent_concept": "us-gaap_AssetsCurrent", "values": {"2025-12-31": 80}},
                {"concept": "us-gaap_CustomerFundsPayable", "label": "Customer funds payable",
                 "parent_concept": "us-gaap_LiabilitiesCurrent", "values": {"2025-12-31": 80}},
                {"concept": "us-gaap_CashAndCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
                 "label": "Restricted cash dimensional breakdown", "parent_concept": "us-gaap_Assets",
                 "dimension": True, "values": {"2025-12-31": 999}},
            ]}},
        }
        result = extract_ev_scope_evidence(company)
        by_category = {}
        for row in result["rows"]:
            by_category.setdefault(row["category"], []).append(row)
        self.assertEqual(result["category_counts"]["unrestricted_cash"], 1)
        self.assertEqual(result["category_counts"]["cash_and_restricted_cash_combined"], 1)
        self.assertNotIn("restricted_cash", result["category_counts"])
        self.assertEqual(result["category_counts"]["lease_liabilities"], 1)
        self.assertEqual(result["category_counts"]["conventional_debt"], 2)
        self.assertEqual(result["category_counts"]["noncontrolling_interests"], 1)
        self.assertEqual(result["category_counts"]["customer_escrow_assets_and_payables"], 2)
        self.assertEqual(result["category_counts"]["marketable_equity_securities"], 1)
        self.assertEqual(result["category_counts"]["marketable_debt_securities"], 2)
        self.assertEqual(result["category_counts"]["marketable_securities_unclassified"], 2)
        self.assertEqual(result["category_counts"]["equity_method_investments"], 1)
        self.assertEqual(result["category_counts"]["notes_receivable"], 1)
        debt_labels = [row["label"] for row in by_category["conventional_debt"]]
        self.assertIn("Commercial paper payable", debt_labels)
        self.assertTrue(all(row["accession"] == "annual-accession" for row in result["rows"]))
        self.assertTrue(all(row["production_approved"] is False and row["resolver_input"] is False
                            for row in result["rows"]))
        self.assertEqual(by_category["cash_and_restricted_cash_combined"][0]["policy_status"],
                         "combined_cash_scope_do_not_treat_as_unrestricted_without_note_reconciliation")
        self.assertFalse(result["production_approved"])
        self.assertFalse(result["resolver_input"])

    def test_ev_scope_evidence_is_attached_only_for_exact_accession(self):
        preview = {
            "production_fundamentals_changed": False, "rankings_changed": False,
            "resolutions": [{"symbol": "CASH", "accession": "same-accession",
                             "provider_status": "supported", "enterprise_value_candidate_review": {}}],
        }
        raw = {"companies": [{
            "symbol": "CASH", "filing": {"accession_number": "same-accession"},
            "balance_sheet_fact_review": {"fiscal_period": "2025-12-31", "categories": {}},
            "statements": {"balance_sheet": {"rows": [{
                "concept": "us-gaap_CashAndCashEquivalentsAtCarryingValue",
                "label": "Cash and cash equivalents", "parent_concept": "us-gaap_AssetsCurrent",
                "values": {"2025-12-31": 100},
            }]}},
        }]}
        item = build_queue(preview, raw)["items"][0]
        self.assertEqual(item["ev_scope_evidence_source"], "fresh_extraction_artifact_same_accession")
        self.assertEqual(item["ev_scope_evidence"]["rows"][0]["category"], "unrestricted_cash")

        raw["companies"][0]["filing"]["accession_number"] = "different-accession"
        item = build_queue(preview, raw)["items"][0]
        self.assertIsNone(item["ev_scope_evidence"])
        self.assertEqual(item["ev_scope_evidence_source"], "stored_resolver_preview")


    def test_curated_ev_scope_note_reviews_are_accession_bound_and_non_promoting(self):
        from build_accounting_review_queue import FILING_EV_SCOPE_NOTE_REVIEWS, filing_ev_scope_note_review

        expected = {
            "SGHC": "0001628280-26-025609",
            "FHTX": "0001628280-26-016814",
            "NRIX": "0001549595-26-000016",
            "PXED": "0001193125-26-445323",
            "STRA": "0001013934-26-000006",
            "ALEC": "0001193125-26-071593",
            "PLTK": "0001828016-26-000010",
            "ZVRA": "0001434647-26-000011",
            "UPWK": "0001627475-26-000012",
        }
        self.assertEqual(set(FILING_EV_SCOPE_NOTE_REVIEWS), set(expected))
        for symbol, accession in expected.items():
            with self.subTest(symbol=symbol):
                review = filing_ev_scope_note_review(symbol, accession)
                self.assertIsNotNone(review)
                self.assertEqual(review["status"], "review_only")
                self.assertTrue(review["observations"])
                self.assertTrue(review["limitations"])
                self.assertFalse(review["production_approved"])
                self.assertFalse(review["resolver_input"])
                self.assertFalse(review["cash_candidate_promoted"])
                self.assertIsNone(filing_ev_scope_note_review(symbol, "different-accession"))

    def test_cash_policy_tags_use_controlled_values_and_cover_all_reviewed_issuers(self):
        from build_accounting_review_queue import (
            FILING_EV_CASH_POLICY_TAGS, FILING_EV_SCOPE_NOTE_REVIEWS,
            filing_ev_scope_note_review,
        )

        self.assertEqual(set(FILING_EV_CASH_POLICY_TAGS), set(FILING_EV_SCOPE_NOTE_REVIEWS))
        allowed_maturity = {
            "on_demand", "not_applicable_cash_balance", "within_12_months",
            "3_to_12_months", "over_12_months", "1_to_2_years", "1_to_3_years",
            "1_to_5_years", "over_12_months_possible",
            "mixed_or_security_level_detail_required", "combined_cash_and_investment_schedule",
            "not_disclosed_in_review",
        }
        for symbol, source in FILING_EV_SCOPE_NOTE_REVIEWS.items():
            with self.subTest(symbol=symbol):
                review = filing_ev_scope_note_review(symbol, source["accession"])
                tags = review["cash_policy_dimensions"]
                self.assertTrue(tags["maturity_buckets"])
                self.assertTrue(tags["credit_quality"])
                self.assertTrue(tags["availability"])
                self.assertTrue(set(tags["maturity_buckets"]).issubset(allowed_maturity))
                self.assertFalse(review["production_approved"])
                self.assertFalse(review["resolver_input"])
                self.assertFalse(review["cash_candidate_promoted"])

    def test_cash_policy_summary_counts_tag_dimensions(self):
        from build_accounting_review_queue import build_queue

        preview = {"resolutions": [
            {"symbol": "UPWK", "accession": "0001627475-26-000012",
             "provider_status": "supported", "enterprise_value_candidate_review": {}},
        ]}
        raw = {"companies": [{
            "symbol": "UPWK", "filing": {"accession_number": "0001627475-26-000012"},
            "balance_sheet_fact_review": {"fiscal_period": "2025-12-31", "categories": {}},
            "statements": {"balance_sheet": {"rows": []}},
        }]}
        summary = build_queue(preview, raw)["summary"]
        self.assertEqual(summary["filing_ev_scope_policy_dimensions_complete"], 1)
        self.assertGreater(summary["cash_policy_unresolved_questions"], 0)
        self.assertIn("not_disclosed_in_review", summary["cash_policy_maturity_bucket_tags"])
        self.assertIn("not_disclosed_in_review", summary["cash_policy_credit_quality_tags"])

    def test_ev_cash_policy_dimensions_are_structured_and_complete(self):
        from build_accounting_review_queue import (
            FILING_EV_CASH_POLICY_DIMENSIONS, FILING_EV_SCOPE_NOTE_REVIEWS,
            filing_ev_scope_note_review,
        )

        self.assertEqual(set(FILING_EV_CASH_POLICY_DIMENSIONS), set(FILING_EV_SCOPE_NOTE_REVIEWS))
        required = {
            "instrument_types", "issuer_cash_equivalent_definition", "maturity_profile",
            "liquidity_evidence", "restriction_or_encumbrance",
            "provisional_mfi_treatment", "unresolved_questions",
            "maturity_buckets", "credit_quality", "availability", "portfolio_composition",
        }
        for symbol, source in FILING_EV_SCOPE_NOTE_REVIEWS.items():
            with self.subTest(symbol=symbol):
                review = filing_ev_scope_note_review(symbol, source["accession"])
                self.assertTrue(review["cash_policy_dimensions_complete"])
                self.assertEqual(set(review["cash_policy_dimensions"]), required)
                self.assertTrue(review["cash_policy_dimensions"]["instrument_types"])
                self.assertTrue(review["cash_policy_dimensions"]["unresolved_questions"])
                self.assertFalse(review["production_approved"])
                self.assertFalse(review["resolver_input"])
                self.assertFalse(review["cash_candidate_promoted"])

    def test_portfolio_composition_preserves_disclosed_amounts_and_unknowns(self):
        from build_accounting_review_queue import (
            FILING_EV_PORTFOLIO_COMPOSITION, FILING_EV_SCOPE_NOTE_REVIEWS,
            filing_ev_scope_note_review,
        )

        self.assertEqual(set(FILING_EV_PORTFOLIO_COMPOSITION), set(FILING_EV_SCOPE_NOTE_REVIEWS))
        for symbol, source in FILING_EV_SCOPE_NOTE_REVIEWS.items():
            with self.subTest(symbol=symbol):
                review = filing_ev_scope_note_review(symbol, source["accession"])
                composition = review["cash_policy_dimensions"]["portfolio_composition"]
                self.assertTrue(composition["portfolio_type"])
                self.assertTrue(composition["reconciliation_status"])
                self.assertFalse(review["production_approved"])
                self.assertFalse(review["resolver_input"])

        fhtx = FILING_EV_PORTFOLIO_COMPOSITION["FHTX"]
        self.assertAlmostEqual(sum(x["amount_millions"] for x in fhtx["components"]), 78.018, places=6)
        pltk = FILING_EV_PORTFOLIO_COMPOSITION["PLTK"]
        self.assertAlmostEqual(sum(x["amount_millions"] for x in pltk["components"]), 136.0, places=6)
        upwk = FILING_EV_PORTFOLIO_COMPOSITION["UPWK"]
        self.assertTrue(all(x["amount_millions"] is None for x in upwk["components"]))
        self.assertEqual(upwk["reported_total_millions"], 378.425)
        alec = FILING_EV_PORTFOLIO_COMPOSITION["ALEC"]
        self.assertTrue(all(x["scope"] == "combined_cash_equivalents_and_marketable_securities"
                            for x in alec["maturity_buckets"]))
        sghc = FILING_EV_PORTFOLIO_COMPOSITION["SGHC"]
        bank = next(x for x in sghc["components"] if x["instrument_type"] == "bank_balances")
        self.assertEqual(sum(x["amount_millions"] for x in bank["subcomponents"]), 160.0)
        self.assertEqual(sghc["reported_total_millions"], 513.0)

    def test_portfolio_composition_remains_accession_bound(self):
        from build_accounting_review_queue import filing_ev_scope_note_review

        self.assertIsNone(filing_ev_scope_note_review("FHTX", "different-accession"))

    def test_upwk_policy_dimensions_keep_marketable_securities_and_customer_escrow_separate(self):
        from build_accounting_review_queue import filing_ev_scope_note_review

        review = filing_ev_scope_note_review("UPWK", "0001627475-26-000012")
        dimensions = review["cash_policy_dimensions"]
        self.assertIn("378.425m marketable securities", dimensions["provisional_mfi_treatment"])
        self.assertIn("180.752m matched customer escrow", dimensions["provisional_mfi_treatment"])
        self.assertIn("maturity", dimensions["unresolved_questions"][0])

    def test_cash_policy_dimensions_do_not_attach_to_a_different_accession(self):
        from build_accounting_review_queue import filing_ev_scope_note_review

        self.assertIsNone(filing_ev_scope_note_review("UPWK", "0001627475-26-999999"))

    def test_queue_attaches_ev_scope_note_review_only_for_matching_accession(self):
        preview = {
            "production_fundamentals_changed": False, "rankings_changed": False,
            "resolutions": [{"symbol": "PXED", "accession": "0001193125-26-445323",
                             "provider_status": "supported", "enterprise_value_candidate_review": {}}],
        }
        raw = {"companies": [{
            "symbol": "PXED", "filing": {"accession_number": "0001193125-26-445323"},
            "balance_sheet_fact_review": {"fiscal_period": "2026-08-31", "categories": {}},
            "statements": {"balance_sheet": {"rows": []}},
        }]}
        item = build_queue(preview, raw)["items"][0]
        self.assertEqual(item["filing_ev_scope_note_review"]["status"], "review_only")
        self.assertFalse(item["filing_ev_scope_note_review"]["cash_candidate_promoted"])
        self.assertEqual(item["filing_ev_scope_note_review_source"],
                         "curated_primary_annual_filing_cash_investment_note_review_same_accession")

        raw["companies"][0]["filing"]["accession_number"] = "different-accession"
        item = build_queue(preview, raw)["items"][0]
        self.assertIsNone(item["filing_ev_scope_note_review"])
        self.assertEqual(item["filing_ev_scope_note_review_source"], "stored_resolver_preview")


    def test_sghc_cash_review_keeps_user_funds_and_restrictions_separate(self):
        from build_accounting_review_queue import filing_ev_scope_note_review

        review = filing_ev_scope_note_review("SGHC", "0001628280-26-025609")
        self.assertIsNotNone(review)
        self.assertIn("129m", " ".join(review["observations"]))
        self.assertIn("6m", " ".join(review["observations"]))
        self.assertIn("19m", " ".join(review["observations"]))
        self.assertIn("12m", " ".join(review["observations"]))
        self.assertFalse(review["production_approved"])
        self.assertFalse(review["resolver_input"])
        self.assertFalse(review["cash_candidate_promoted"])
        self.assertIsNone(filing_ev_scope_note_review("SGHC", "different-accession"))

    def test_sghc_on_demand_loan_remains_unresolved(self):
        from build_accounting_review_queue import filing_debt_note_review

        review = filing_debt_note_review("SGHC", "0001628280-26-025609")
        self.assertIsNotNone(review)
        self.assertIn("NGN", " ".join(review["observations"]))
        self.assertIn("unspecified", " ".join(review["observations"]))
        self.assertTrue(any("zero" in x for x in review["limitations"]))
        self.assertFalse(review["production_approved"])
        self.assertFalse(review["resolver_input"])
        self.assertFalse(review["debt_candidate_promoted"])

    def test_zvra_subsequent_debt_repayment_does_not_rewrite_annual_snapshot(self):
        from build_accounting_review_queue import filing_debt_note_review

        review = filing_debt_note_review("ZVRA", "0001434647-26-000011")
        self.assertIsNotNone(review)
        self.assertIn("March 12, 2026", " ".join(review["observations"]))
        self.assertIn("63.1m", " ".join(review["observations"]))
        self.assertIn("subsequent", review["interpretation"].lower())
        self.assertTrue(any("rewrite FY2025" in x for x in review["limitations"]))
        self.assertFalse(review["production_approved"])
        self.assertFalse(review["resolver_input"])
        self.assertFalse(review["debt_candidate_promoted"])


    def test_qttb_operating_income_quality_review_is_accession_bound_and_non_promoting(self):
        from build_accounting_review_queue import (
            FILING_OPERATING_INCOME_QUALITY_REVIEWS,
            filing_operating_income_quality_review,
        )

        source = FILING_OPERATING_INCOME_QUALITY_REVIEWS["QTTB"]
        review = filing_operating_income_quality_review("QTTB", "0001193125-26-099339")
        self.assertIsNotNone(review)
        self.assertEqual(review["reported_operating_income_millions"], 16.902)
        self.assertEqual(review["identified_nonrecurring_operating_revenue_millions"], 53.737)
        self.assertIn("customer refund liability", " ".join(review["observations"]))
        self.assertFalse(review["production_approved"])
        self.assertFalse(review["resolver_input"])
        self.assertFalse(review["ranking_input_changed"])
        self.assertIsNone(filing_operating_income_quality_review("QTTB", "different-accession"))

    def test_queue_attaches_qttb_operating_income_quality_review_without_changing_rank(self):
        preview = {
            "production_fundamentals_changed": False,
            "rankings_changed": False,
            "resolutions": [{
                "symbol": "QTTB",
                "accession": "0001193125-26-099339",
                "provider_status": "supported",
                "ebit_status": "direct_reported_candidate_review_only",
                "invested_capital_status": "positive_denominator_candidate_review_only",
                "enterprise_value_candidate_review": {
                    "conventional_debt_status": "identified_from_unique_current_and_noncurrent_components",
                    "unrestricted_cash_candidate": 48_297_000,
                },
            }],
        }
        ranking = {
            "production_write": False,
            "rankings_changed": False,
            "rankings": [{
                "symbol": "QTTB", "magic_formula_rank": 4, "magic_formula_score": 8,
                "earnings_yield": 0.10388, "return_on_capital": 0.37826,
                "eligibility_status": "eligible", "ranking_eligible": True,
                "production_approved": False,
            }],
        }
        raw = {"companies": [{
            "symbol": "QTTB",
            "filing": {"accession_number": "0001193125-26-099339"},
            "balance_sheet_fact_review": {"fiscal_period": "2025-12-31", "categories": {}},
            "statements": {"balance_sheet": {"rows": []}},
        }]}
        item = build_queue(preview, raw, ranking)["items"][0]
        self.assertEqual(item["filing_operating_income_quality_review"]["reported_operating_income_millions"], 16.902)
        self.assertEqual(item["mfi_shadow_ranking"]["rank"], 4)
        self.assertIn("filing_operating_income_quality_review_available_manual_review", item["issues"])
        self.assertTrue(any("nonrecurring" in action for action in item["next_review_actions"]))
        self.assertFalse(item["filing_operating_income_quality_review"]["production_approved"])
        self.assertFalse(item["production_write"])


    def test_vsnt_company_perimeter_review_is_accession_bound_and_non_promoting(self):
        from build_accounting_review_queue import (
            FILING_COMPANY_PERIMETER_REVIEWS,
            filing_company_perimeter_review,
        )

        review = filing_company_perimeter_review("VSNT", "0002067876-26-000010")
        self.assertIsNotNone(review)
        self.assertIn("combined historical financial statements", " ".join(review["observations"]))
        self.assertIn("January 2, 2026", " ".join(review["observations"]))
        self.assertFalse(review["production_approved"])
        self.assertFalse(review["resolver_input"])
        self.assertFalse(review["ranking_input_changed"])
        self.assertIsNone(filing_company_perimeter_review("VSNT", "different-accession"))

    def test_queue_promotes_vsnt_perimeter_mismatch_to_p1_without_changing_rank(self):
        preview = {
            "production_fundamentals_changed": False,
            "rankings_changed": False,
            "resolutions": [{
                "symbol": "VSNT",
                "accession": "0002067876-26-000010",
                "provider_status": "supported",
                "ebit_status": "direct_reported_candidate_review_only",
                "invested_capital_status": "positive_denominator_candidate_review_only",
                "enterprise_value_candidate_review": {
                    "conventional_debt_status": "incomplete_or_ambiguous_debt_inputs",
                    "unrestricted_cash_candidate": 55_000_000,
                },
            }],
        }
        ranking = {
            "production_write": False,
            "rankings_changed": False,
            "rankings": [{
                "symbol": "VSNT", "magic_formula_rank": None, "magic_formula_score": None,
                "earnings_yield": None, "return_on_capital": None,
                "eligibility_status": "excluded_accounting_review", "ranking_eligible": False,
                "production_approved": False,
            }],
        }
        raw = {"companies": [{
            "symbol": "VSNT",
            "filing": {"accession_number": "0002067876-26-000010"},
            "balance_sheet_fact_review": {"fiscal_period": "2025-12-31", "categories": {}},
            "statements": {"balance_sheet": {"rows": []}},
        }]}
        item = build_queue(preview, raw, ranking)["items"][0]
        self.assertEqual(item["priority"], "P1")
        self.assertIn("filing_company_perimeter_not_comparable_manual_review", item["issues"])
        self.assertTrue(any("post-separation" in action for action in item["next_review_actions"]))
        self.assertIsNone(item["mfi_shadow_ranking"]["rank"])
        self.assertFalse(item["filing_company_perimeter_review"]["production_approved"])
        self.assertFalse(item["production_write"])


    def test_curated_filing_reviews_attach_from_resolver_accession_without_raw_company(self):
        preview = {
            "production_fundamentals_changed": False,
            "rankings_changed": False,
            "resolutions": [{
                "symbol": "VSNT",
                "accession": "0002067876-26-000010",
                "provider_status": "supported",
                "ebit_status": "direct_reported_candidate_review_only",
                "invested_capital_status": "positive_denominator_candidate_review_only",
                "enterprise_value_candidate_review": {},
            }],
        }
        item = build_queue(preview)["items"][0]
        self.assertEqual(item["priority"], "P1")
        self.assertEqual(item["filing_company_perimeter_review"]["accession"], "0002067876-26-000010")
        self.assertIn("filing_company_perimeter_not_comparable_manual_review", item["issues"])
        self.assertEqual(
            item["filing_company_perimeter_review_source"],
            "curated_primary_annual_filing_company_perimeter_review_same_accession",
        )
        self.assertFalse(item["filing_company_perimeter_review"]["production_approved"])
        self.assertFalse(item["production_write"])


    def test_vxrt_sold_royalty_revenue_quality_review_is_accession_bound(self):
        from build_accounting_review_queue import filing_operating_income_quality_review

        review = filing_operating_income_quality_review("VXRT", "0001437749-26-008023")
        self.assertIsNotNone(review)
        self.assertEqual(review["reported_operating_income_millions"], 18.074)
        self.assertEqual(review["identified_nonrecurring_operating_revenue_millions"], 1.929)
        self.assertIn("4.521m", " ".join(review["observations"]))
        self.assertFalse(review["production_approved"])
        self.assertFalse(review["resolver_input"])
        self.assertIsNone(filing_operating_income_quality_review("VXRT", "wrong-accession"))

if __name__ == "__main__":
    unittest.main()
