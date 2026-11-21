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
        self.assertEqual(result["category_counts"]["restricted_cash"], 1)
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
        self.assertEqual(by_category["restricted_cash"][0]["policy_status"],
                         "exclude_from_unrestricted_cash_pending_policy")
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

if __name__ == "__main__":
    unittest.main()
