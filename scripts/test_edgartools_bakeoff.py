#!/usr/bin/env python3
"""Regression checks for review-only balance-sheet candidate classification."""
import unittest
from io import BytesIO
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from edgartools_bakeoff import DIRECT_OPERATING_INCOME_LABEL_PATTERN, direct_operating_income_fact, balance_sheet_fact_review, currency_normalization_review, enterprise_value_scope_review, filing_specific_currency_override, filing_specific_review, FRANKFURTER_RATE_CACHE, fetch_frankfurter_rate, mfi_market_cap_usd_millions, invested_capital_review, manual_enterprise_value_scenario_review, non_sec_issuer_review_case, reporting_currency_unit_review, roc_review, statement_fact_amount, extract_company


PERIOD = "2025-12-31"


def row(concept, label, value, standard_concept=None):
    values = {PERIOD: value}
    if standard_concept:
        values["standard_concept"] = standard_concept
    return {
        "concept": concept,
        "label": label,
        "dimension": False,
        "abstract": False,
        "values": values,
    }


class CurrencyNormalizationTests(unittest.TestCase):
    def test_reporting_currency_uses_exact_accession_and_period_units(self):
        companyfacts = {
            "facts": {
                "us-gaap": {
                    "Revenue": {
                        "units": {
                            "CAD": [
                                {"accn": "0000000001-25-000001", "end": "2025-12-31", "form": "10-K"},
                                {"accn": "0000000001-25-000001", "end": "2025-12-31", "form": "10-K"},
                            ],
                            "USD": [
                                {"accn": "0000000001-24-000001", "end": "2025-12-31", "form": "10-K"},
                            ],
                        }
                    },
                    "Assets": {
                        "units": {
                            "CAD": [
                                {"accn": "0000000001-25-000001", "end": "2025-12-31", "form": "10-K"},
                                {"accn": "0000000001-25-000001", "end": "2025-12-31", "form": "10-K"},
                            ]
                        }
                    },
                }
            }
        }
        result = reporting_currency_unit_review(
            companyfacts, "0000000001-25-000001", "2025-12-31"
        )
        self.assertEqual(result["status"], "identified_from_accession_facts")
        self.assertEqual(result["currency"], "CAD")
        self.assertEqual(result["unit_counts"]["CAD"], 4)
        self.assertEqual(result["review_flags"], [])

    def test_secondary_currency_units_are_flagged_without_overriding_dominant_unit(self):
        companyfacts = {
            "facts": {
                "us-gaap": {
                    "Revenue": {
                        "units": {
                            "USD": [{"accn": "A", "end": PERIOD}] * 5,
                            "JPY": [{"accn": "A", "end": PERIOD}],
                        }
                    }
                }
            }
        }
        result = reporting_currency_unit_review(companyfacts, "A", PERIOD)
        self.assertEqual(result["currency"], "USD")
        self.assertIn("secondary_currency_unit_observations_present", result["review_flags"])

    def test_sghc_currency_override_is_exact_accession_only(self):
        result = filing_specific_currency_override("SGHC", "0001628280-26-025609")
        self.assertEqual(result["currency"], "USD")
        self.assertIsNone(filing_specific_currency_override("SGHC", "another-accession"))
        self.assertIsNone(filing_specific_currency_override("OTHER", "0001628280-26-025609"))

    def test_tied_currency_units_are_not_guessed(self):
        companyfacts = {
            "facts": {
                "us-gaap": {
                    "Revenue": {
                        "units": {
                            "CAD": [{"accn": "A", "end": PERIOD}] * 3,
                            "USD": [{"accn": "A", "end": PERIOD}] * 3,
                        }
                    }
                }
            }
        }
        result = reporting_currency_unit_review(companyfacts, "A", PERIOD)
        self.assertEqual(result["status"], "currency_unit_ambiguous")
        self.assertIsNone(result["currency"])

    @patch("edgartools_bakeoff.urlopen")
    def test_fx_fetch_pins_ecb_provider_and_uses_latest_rate_on_or_before_quote_date(self, mocked_urlopen):
        key = ("USD", "CAD", "2026-11-18")
        FRANKFURTER_RATE_CACHE.pop(key, None)
        payload = [
            {"date": "2026-11-17", "base": "USD", "quote": "CAD", "rate": 1.4280},
            # INTENTIONAL: never select a rate published after the requested valuation date.
            {"date": "2026-11-19", "base": "USD", "quote": "CAD", "rate": 1.4400},
        ]
        mocked_urlopen.return_value = BytesIO(__import__("json").dumps(payload).encode("utf-8"))

        result = fetch_frankfurter_rate("USD", "CAD", "2026-11-18")

        request = mocked_urlopen.call_args.args[0]
        parsed_url = urlparse(request.full_url)
        query = parse_qs(parsed_url.query)
        self.assertEqual(parsed_url.path, "/v2/providers/ecb/rates")
        self.assertEqual(query["base"], ["USD"])
        self.assertEqual(query["quotes"], ["CAD"])
        self.assertEqual(query["to"], ["2026-11-18"])
        self.assertEqual(result["date"], "2026-11-17")
        self.assertEqual(result["rate"], 1.4280)
        self.assertTrue(result["is_previous_business_day"])
        self.assertEqual(result["source_attribution"], "Source: ECB statistics")

    @patch("edgartools_bakeoff.urlopen")
    def test_fx_fetch_does_not_fall_forward_when_no_prior_observation(self, mocked_urlopen):
        key = ("USD", "CAD", "2026-11-18")
        FRANKFURTER_RATE_CACHE.pop(key, None)
        payload = [
            {"date": "2026-11-19", "base": "USD", "quote": "CAD", "rate": 1.4400},
        ]
        mocked_urlopen.return_value = BytesIO(__import__("json").dumps(payload).encode("utf-8"))

        result = fetch_frankfurter_rate("USD", "CAD", "2026-11-18")

        self.assertEqual(result["status"], "rate_not_found")
        self.assertNotIn("rate", result)

    def test_usd_market_cap_converts_to_reporting_currency_at_quote_date(self):
        result = currency_normalization_review(
            "CAD",
            100_000_000,
            "2026-11-18",
            {
                "status": "rate_available",
                "base": "USD",
                "quote": "CAD",
                "rate": 1.4,
                "date": "2026-11-18",
                "requested_date": "2026-11-18",
            },
        )
        self.assertEqual(result["status"], "market_cap_converted_review_only")
        self.assertEqual(result["market_cap_in_reporting_currency"], 140_000_000)
        self.assertEqual(result["fx_rate_review"]["date"], "2026-11-18")

    def test_same_currency_does_not_require_fx(self):
        result = currency_normalization_review("USD", 100_000_000, "2026-11-18")
        self.assertEqual(result["status"], "market_cap_same_currency")
        self.assertEqual(result["market_cap_in_reporting_currency"], 100_000_000)
        self.assertEqual(result["fx_rate_review"]["rate"], 1.0)

    def test_mfi_market_cap_snapshot_values_are_available_for_cohort(self):
        self.assertEqual(mfi_market_cap_usd_millions("EGHSF"), 643.04)
        self.assertEqual(mfi_market_cap_usd_millions("AFMJF"), 991.59)
        self.assertEqual(mfi_market_cap_usd_millions("ADBE"), None)

    def test_new_price_date_does_not_reuse_pinned_market_cap_snapshot(self):
        with patch.dict("os.environ", {"MFI_PRICE_DATE": "2026-11-19"}, clear=False):
            with patch.dict("os.environ", {"MFI_MARKET_CAPS_JSON": ""}, clear=False):
                self.assertIsNone(mfi_market_cap_usd_millions("EGHSF"))

    def test_explicit_market_cap_override_can_be_used_with_new_price_date(self):
        with patch.dict(
            "os.environ",
            {
                "MFI_PRICE_DATE": "2026-11-19",
                "MFI_MARKET_CAPS_JSON": '{"EGHSF": 650.0}',
            },
            clear=False,
        ):
            self.assertEqual(mfi_market_cap_usd_millions("EGHSF"), 650.0)

    def test_enghouse_usd_market_cap_converts_to_cad_at_mfi_price_date(self):
        market_cap_usd = mfi_market_cap_usd_millions("EGHSF") * 1_000_000
        result = currency_normalization_review(
            "CAD",
            market_cap_usd,
            "2026-11-18",
            {
                "status": "rate_available",
                "base": "USD",
                "quote": "CAD",
                "rate": 1.4296,
                "date": "2026-11-18",
            },
        )
        self.assertEqual(result["status"], "market_cap_converted_review_only")
        self.assertEqual(result["market_cap_in_reporting_currency"], 919_289_984.0)

    def test_missing_market_cap_never_fabricates_ev_input(self):
        result = currency_normalization_review(
            "CAD", None, "2026-11-18",
            {"status": "rate_available", "rate": 1.4, "date": "2026-11-18"},
        )
        self.assertEqual(result["status"], "fx_rate_available_market_cap_missing")
        self.assertIsNone(result["market_cap_in_reporting_currency"])


class ManualEnterpriseValueScenarioTests(unittest.TestCase):
    def test_alphamin_scenarios_show_nci_and_lease_sensitivity(self):
        result = manual_enterprise_value_scenario_review(
            991_590_000,
            273_665_327,
            -15_519_161,
            65_738_168,
            3_557_959,
            "USD",
        )
        self.assertEqual(result["status"], "review_only_sensitivity")
        scenarios = {item["name"]: item for item in result["scenarios"]}
        self.assertEqual(scenarios["conventional_debt_only"]["enterprise_value"], 976_070_839)
        self.assertEqual(scenarios["plus_noncontrolling_interest"]["enterprise_value"], 1_041_809_007)
        self.assertEqual(scenarios["plus_nci_and_lease_liabilities"]["enterprise_value"], 1_045_366_966)
        self.assertAlmostEqual(
            scenarios["plus_nci_and_lease_liabilities"]["earnings_yield_percent"],
            26.1789,
            places=4,
        )

    def test_enghouse_scenarios_use_cad_converted_market_cap(self):
        result = manual_enterprise_value_scenario_review(
            919_289_984,
            84_862_000,
            -269_061_000,
            0,
            11_141_000,
            "CAD",
        )
        self.assertEqual(result["status"], "review_only_sensitivity")
        scenarios = {item["name"]: item for item in result["scenarios"]}
        self.assertEqual(scenarios["conventional_debt_only"]["enterprise_value"], 650_228_984)
        self.assertEqual(scenarios["plus_lease_liabilities"]["enterprise_value"], 661_369_984)
        self.assertAlmostEqual(
            scenarios["plus_lease_liabilities"]["earnings_yield_percent"],
            12.8312,
            places=4,
        )

    def test_unknown_nci_and_lease_inputs_are_not_assumed_zero(self):
        result = manual_enterprise_value_scenario_review(
            1_000_000, 100_000, 50_000, currency="USD",
        )
        scenarios = {item["name"] for item in result["scenarios"]}
        self.assertEqual(scenarios, {"conventional_debt_only"})
        self.assertIsNone(result["noncontrolling_interest_candidate"])
        self.assertIsNone(result["lease_liabilities_candidate"])
        self.assertEqual(
            set(result["omitted_scenarios_due_to_unknown_inputs"]),
            {"noncontrolling_interest", "lease_liabilities"},
        )

    def test_explicit_zero_nci_is_distinct_from_unknown_nci(self):
        result = manual_enterprise_value_scenario_review(
            1_000_000, 100_000, 50_000, 0, None, "USD",
        )
        scenarios = {item["name"] for item in result["scenarios"]}
        self.assertIn("plus_noncontrolling_interest", scenarios)
        self.assertNotIn("plus_lease_liabilities", scenarios)

    def test_missing_inputs_do_not_generate_enterprise_value(self):
        result = manual_enterprise_value_scenario_review(None, 100, 0, currency="CAD")
        self.assertEqual(result["status"], "inputs_incomplete")
        self.assertEqual(result["scenarios"], [])


class NonSecIssuerReviewTests(unittest.TestCase):
    def test_alphamin_manual_review_preserves_nci_and_exploration_scope(self):
        result = non_sec_issuer_review_case("AFMJF")
        self.assertEqual(result["status"], "review_only_non_sec_source")
        self.assertEqual(result["currency"], "USD")
        self.assertEqual(result["ebit_candidate"], 273_665_327)
        self.assertEqual(result["invested_capital_candidate"], 435_962_673)
        self.assertEqual(result["conventional_gross_debt_candidate"], 40_569_087)
        self.assertEqual(result["noncontrolling_interest"], 65_738_168)
        self.assertEqual(result["conventional_net_debt_plus_nci_candidate"], 50_219_007)
        self.assertAlmostEqual(result["candidate_roc"], 62.7727, places=4)
        self.assertAlmostEqual(
            result["candidate_roc_including_exploration_assets"], 59.7334, places=4
        )

    def test_enghouse_manual_review_reconciles_ifrs_ebit_and_flags_cad_fx(self):
        result = non_sec_issuer_review_case("EGHSF")
        self.assertEqual(result["status"], "review_only_non_sec_source")
        self.assertEqual(result["currency"], "CAD")
        self.assertEqual(result["ebit_candidate"], 84_862_000)
        self.assertEqual(result["pretax_reconciliation"]["difference"], 0)
        self.assertEqual(result["conventional_gross_debt_candidate"], 0)
        self.assertEqual(result["current_lease_liabilities"], 5_197_000)
        self.assertIn(
            "financial_statements_are_cad_while_mfi_market_cap_is_usd_fx_conversion_required",
            result["review_flags"],
        )

class EdgarToolsProviderCoverageTests(unittest.TestCase):
    def test_non_sec_issuer_is_tagged_unsupported_without_manual_fallback(self):
        class CompanyNotFoundError(Exception):
            pass

        with patch("edgartools_bakeoff.Company", side_effect=CompanyNotFoundError("not in SEC index")):
            with patch("edgartools_bakeoff.non_sec_issuer_review_case") as manual_fallback:
                result = extract_company("AFMJF")

        self.assertEqual(result["provider_status"], "unsupported_provider")
        self.assertEqual(result["provider"], "EdgarTools")
        self.assertIn("fallback is intentionally deferred", result["provider_reason"])
        self.assertNotIn("non_sec_issuer_review", result)
        manual_fallback.assert_not_called()


class DirectOperatingIncomeLabelTests(unittest.TestCase):
    def test_negative_operating_loss_labels_are_direct_facts(self):
        statements = {
            "income_statement": {
                "rows": [
                    row("us-gaap_OperatingIncomeLoss", "Loss from operations", -156_007_000),
                ]
            }
        }
        value = statement_fact_amount(
            statements,
            "income_statement",
            "OperatingIncomeLoss",
            DIRECT_OPERATING_INCOME_LABEL_PATTERN,
            PERIOD,
        )
        self.assertEqual(value, -156_007_000)

    def test_operating_earnings_loss_label_is_direct_fact(self):
        statements = {
            "income_statement": {
                "rows": [
                    row("us-gaap_OperatingIncomeLoss", "Operating earnings (loss)", -805_778_000),
                ]
            }
        }
        value = statement_fact_amount(
            statements,
            "income_statement",
            "OperatingIncomeLoss",
            DIRECT_OPERATING_INCOME_LABEL_PATTERN,
            PERIOD,
        )
        self.assertEqual(value, -805_778_000)


    def test_ifrs_operating_profit_is_direct_candidate(self):
        result = direct_operating_income_fact(
            {"income_statement": {"rows": [
                row("ifrs-full_OperatingProfitLoss", "Operating profit", 357_000_000),
            ]}},
            PERIOD,
        )
        self.assertEqual(result["status"], "unique_candidate")
        self.assertEqual(result["candidate"]["concept"], "ifrs-full_OperatingProfitLoss")
        self.assertEqual(result["candidate"]["value"], 357_000_000)

    def test_ifrs_profit_from_operating_activities_is_direct_candidate(self):
        result = direct_operating_income_fact(
            {"income_statement": {"rows": [
                row(
                    "ifrs-full_ProfitLossFromOperatingActivities",
                    "Profit (loss) from operating activities",
                    125_500_000,
                ),
            ]}},
            PERIOD,
        )
        self.assertEqual(result["status"], "unique_candidate")
        self.assertEqual(result["candidate"]["value"], 125_500_000)

    def test_multiple_direct_operating_profit_rows_remain_ambiguous(self):
        result = direct_operating_income_fact(
            {"income_statement": {"rows": [
                row("us-gaap_OperatingIncomeLoss", "Operating income", 100),
                row("ifrs-full_OperatingProfitLoss", "Operating profit", 100),
            ]}},
            PERIOD,
        )
        self.assertEqual(result["status"], "ambiguous")
        self.assertIsNone(result["candidate"])

    def test_dimensional_operating_profit_is_not_selected(self):
        dimensional = row("ifrs-full_OperatingProfitLoss", "Operating profit", 100)
        dimensional["dimension"] = True
        result = direct_operating_income_fact(
            {"income_statement": {"rows": [dimensional]}},
            PERIOD,
        )
        self.assertEqual(result["status"], "not_found")
        self.assertIsNone(result["candidate"])


class BalanceSheetFactReviewTests(unittest.TestCase):
    def review(self, *rows):
        return balance_sheet_fact_review(
            {"balance_sheet": {"rows": list(rows)}}, PERIOD
        )["categories"]

    def test_ifrs_borrowings_and_current_noncurrent_leases(self):
        categories = self.review(
            row("ifrs-full_LongtermBorrowings", "Interest-bearing loans and borrowings", 17_000_000),
            row("ifrs-full_CurrentLeaseLiabilities", "Lease liabilities", 5_000_000),
            row("ifrs-full_NoncurrentLeaseLiabilities", "Lease liabilities", 59_000_000),
        )
        self.assertEqual(
            categories["noncurrent_debt_candidates"]["status"], "unique_candidate"
        )
        self.assertEqual(
            categories["current_lease_liability_candidates"]["candidate_count"], 1
        )
        self.assertEqual(
            categories["noncurrent_lease_liability_candidates"]["candidate_count"], 1
        )

    def test_noncurrent_lease_label_is_not_counted_as_current(self):
        categories = self.review(
            row("custom_LeaseLiabilities", "Lease liabilities, noncurrent", 59_000_000),
        )
        self.assertEqual(
            categories["current_lease_liability_candidates"]["candidate_count"], 0
        )
        self.assertEqual(
            categories["noncurrent_lease_liability_candidates"]["candidate_count"], 1
        )

    def test_current_lease_label_is_classified_as_current(self):
        categories = self.review(
            row("custom_CurrentLeaseLiabilities", "Lease liabilities, current", 5_000_000),
        )
        self.assertEqual(
            categories["current_lease_liability_candidates"]["candidate_count"], 1
        )
        self.assertEqual(
            categories["noncurrent_lease_liability_candidates"]["candidate_count"], 0
        )

    def test_cash_with_footnote_label_remains_unrestricted_candidate(self):
        categories = self.review(
            row(
                "us-gaap_CashAndCashEquivalentsAtCarryingValue",
                "Cash and cash equivalents (includes amounts reported at fair value)",
                284_887_000,
            )
        )
        self.assertEqual(
            categories["cash_unrestricted_candidates"]["candidate_count"], 1
        )

    def test_noncontrolling_interest_balance_sheet_candidate_is_detected(self):
        result = balance_sheet_fact_review(
            {
                "balance_sheet": {
                    "rows": [
                        row(
                            "us-gaap_NoncontrollingInterestInConsolidatedEntity",
                            "Noncontrolling interest",
                            65_738_168,
                        )
                    ]
                }
            },
            PERIOD,
        )
        category = result["categories"]["noncontrolling_interest_candidates"]
        self.assertEqual(category["candidate_count"], 1)
        self.assertEqual(category["candidates"][0]["value"], 65_738_168)

    def test_ifrs_restricted_cash_concept_without_restricted_label(self):
        categories = self.review(
            row(
                "ifrs-full_CurrentRestrictedCashAndCashEquivalents",
                "Amounts segregated for users",
                12_000_000,
            )
        )
        self.assertEqual(
            categories["cash_unrestricted_candidates"]["candidate_count"], 0
        )
        self.assertEqual(
            categories["cash_restricted_candidates"]["candidate_count"], 1
        )

    def test_combined_restricted_cash_is_not_unrestricted_cash(self):
        categories = self.review(
            row(
                "us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
                "Cash, cash equivalents and restricted cash",
                3_705_000_000,
            )
        )
        self.assertEqual(
            categories["cash_unrestricted_candidates"]["candidate_count"], 0
        )
        self.assertEqual(
            categories["cash_combined_or_investment_candidates"]["candidate_count"], 1
        )

    def test_rental_equipment_is_separate_from_standard_ppe(self):
        categories = self.review(
            row(
                "us-gaap_PropertyPlantAndEquipmentNet",
                "Property, plant and equipment, net",
                185_913_000,
            ),
            row(
                "pbi_RentalPropertyAndEquipmentNet",
                "Rental property and equipment, net",
                24_054_000,
            ),
        )
        self.assertEqual(categories["net_ppe_candidates"]["candidate_count"], 1)
        self.assertEqual(
            categories["rental_equipment_net_candidates"]["candidate_count"], 1
        )

    def test_sghc_ifrs_ebit_reconstruction_reconciles_to_pretax(self):
        filing = {
            "accession_number": "0001628280-26-025609",
            "period_of_report": PERIOD,
        }
        statements = {
            "income_statement": {
                "rows": [
                    row("ifrs-full_Revenue", "Revenue", 2_231_000_000),
                    row("ifrs-full_SalesAndMarketingExpense", "Direct and marketing expenses", -1_565_000_000),
                    row("ifrs-full_GeneralAndAdministrativeExpense", "General and administrative expenses", -176_000_000),
                    row("ifrs-full_DepreciationAndAmortisationExpense", "Depreciation and amortization expense", -74_000_000),
                    row("ifrs-full_ImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss", "Impairment of assets", -68_000_000),
                    row("ifrs-full_MiscellaneousOtherOperatingIncome", "Other operating income", 9_000_000),
                    row("ifrs-full_FinanceIncome", "Finance income", 11_000_000),
                    row("ifrs-full_FinanceCosts", "Finance expense", -11_000_000),
                    row("ifrs-full_GainsLossesOnFinancialLiabilitiesAtFairValueThroughProfitOrLossDesignatedAsUponInitialRecognition", "Change in fair value of options", 0),
                    row("ifrs-full_ShareOfProfitLossOfAssociatesAccountedForUsingEquityMethod", "Share of post-tax profit of equity accounted investments", -1_000_000),
                    row("ifrs-full_ProfitLossBeforeTax", "Profit before taxation", 356_000_000),
                ]
            }
        }
        result = filing_specific_review("SGHC", filing, {}, statements)
        self.assertEqual(result["status"], "review_only")
        self.assertEqual(result["method"], "ifrs_statement_subtotal_reconstructed")
        self.assertEqual(result["ebit_candidate"], 357_000_000)
        self.assertTrue(result["cross_checks"]["reconciles_within_1"])
        self.assertEqual(
            result["cross_checks"]["difference_to_reported_profit_before_taxation"], 0
        )

    def test_invested_capital_flags_finance_lease_rou_embedded_in_ppe(self):
        categories = self.review(
            row("us-gaap_AssetsCurrent", "Total current assets", 500),
            row("us-gaap_LiabilitiesCurrent", "Total current liabilities", 200),
            row(
                "us-gaap_PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization",
                "Property, plant and equipment, net",
                100,
            ),
            row("us-gaap_OperatingLeaseRightOfUseAsset", "Operating lease right of use asset", 50),
        )
        result = invested_capital_review({"categories": categories})
        self.assertEqual(result["value"], 400)
        self.assertEqual(
            result["scope_review"]["ppe_includes_finance_lease_rou_candidate_count"], 1
        )
        self.assertIn(
            "finance_lease_right_of_use_assets_embedded_in_net_ppe_require_scope_review",
            result["scope_flags"],
        )

    def test_invested_capital_reports_rental_and_rou_scope(self):
        result = invested_capital_review({
            "categories": {
                "current_assets_candidates": {
                    "status": "unique_candidate",
                    "candidates": [{"value": 100}],
                },
                "current_liabilities_candidates": {
                    "status": "unique_candidate",
                    "candidates": [{"value": 40}],
                },
                "net_ppe_candidates": {
                    "status": "unique_candidate",
                    "candidates": [{"value": 60}],
                },
                "rental_equipment_net_candidates": {"candidate_count": 1},
                "right_of_use_asset_candidates": {"candidate_count": 2},
                "current_lease_liability_candidates": {"candidate_count": 1},
                "noncurrent_lease_liability_candidates": {"candidate_count": 1},
            }
        })
        self.assertEqual(result["value"], 120)
        self.assertEqual(result["scope_review"]["rental_equipment_candidate_count"], 1)
        self.assertEqual(result["scope_review"]["right_of_use_asset_candidate_count"], 2)
        self.assertEqual(len(result["scope_flags"]), 3)

    def test_roc_preview_flags_separate_rental_ppe_and_financing(self):
        balance_review = {
            "categories": {
                "rental_equipment_net_candidates": {"candidate_count": 1},
                "right_of_use_asset_candidates": {"candidate_count": 2},
                "nondebt_financing_obligation_candidates": {"candidate_count": 1},
                "current_lease_liability_candidates": {"candidate_count": 2},
                "noncurrent_lease_liability_candidates": {"candidate_count": 2},
                "cash_restricted_candidates": {"candidate_count": 1},
                "cash_combined_or_investment_candidates": {"candidate_count": 1},
            }
        }
        result = roc_review(
            {"status": "review_only", "ebit_candidate": 196_000_000},
            {"status": "calculated_review_only", "value": 642_370_000},
            balance_review,
        )
        self.assertEqual(result["status"], "review_required_scope_flags")
        self.assertIsNone(result["roc"])
        self.assertAlmostEqual(result["candidate_roc"], 30.512, places=3)
        self.assertEqual(len(result["review_flags"]), 5)

    def test_filing_specific_ifrs_ebit_produces_separate_roc_candidate(self):
        result = roc_review(
            {"status": "review_required", "ebit_candidate": None},
            {"status": "calculated_review_only", "value": 418_000_000},
            {
                "categories": {
                    "right_of_use_asset_candidates": {"candidate_count": 1},
                    "current_lease_liability_candidates": {"candidate_count": 1},
                    "noncurrent_lease_liability_candidates": {"candidate_count": 1},
                }
            },
            {
                "status": "review_only",
                "method": "ifrs_statement_subtotal_reconstructed",
                "automation_status": "manual_review_only",
                "ebit_candidate": 357_000_000,
            },
        )
        self.assertEqual(result["status"], "review_required_scope_flags")
        self.assertIsNone(result["roc"])
        self.assertAlmostEqual(result["candidate_roc"], 85.4067, places=4)
        self.assertEqual(result["ebit_source"], "ifrs_statement_subtotal_reconstructed")
        self.assertIn(
            "right_of_use_assets_present_review_invested_capital_scope",
            result["review_flags"],
        )

    def test_filing_specific_ebit_never_becomes_approved_roc_without_scope_flags(self):
        result = roc_review(
            {"status": "review_required", "ebit_candidate": None},
            {"status": "calculated_review_only", "value": 100_000_000},
            {"categories": {}},
            {
                "status": "review_only",
                "method": "filing_specific_interest_reconciliation",
                "automation_status": "manual_review_only",
                "ebit_candidate": 50_000_000,
            },
        )
        self.assertEqual(result["status"], "review_required_filing_specific_ebit")
        self.assertIsNone(result["roc"])
        self.assertEqual(result["candidate_roc"], 50.0)

    def test_ev_selection_policy_makes_cash_and_debt_rules_explicit(self):
        result = enterprise_value_scope_review({
            "categories": {
                "current_debt_candidates": {"candidate_count": 1, "candidates": [{"value": 25}]},
                "noncurrent_debt_candidates": {"candidate_count": 1, "candidates": [{"value": 125}]},
                "cash_unrestricted_candidates": {"candidate_count": 1, "candidates": [{"value": 20}]},
                "cash_restricted_candidates": {"candidate_count": 1},
                "short_term_investment_candidates": {"candidate_count": 1},
                "cash_combined_or_investment_candidates": {"candidate_count": 1},
                "current_lease_liability_candidates": {"candidate_count": 1},
                "noncurrent_lease_liability_candidates": {"candidate_count": 1},
                "noncontrolling_interest_candidates": {"candidate_count": 1},
                "nondebt_financing_obligation_candidates": {"candidate_count": 1},
            }
        })
        policy = result["selection_policy_review"]
        self.assertEqual(policy["conventional_debt"]["included_candidate"], 150)
        self.assertEqual(policy["unrestricted_cash"]["included_candidate"], 20)
        self.assertEqual(policy["restricted_cash"]["treatment"], "excluded_pending_policy")
        self.assertEqual(policy["short_term_investments"]["treatment"], "excluded_pending_liquidity_and_policy_review")
        self.assertEqual(policy["combined_cash_restricted_cash_or_investment_totals"]["treatment"], "excluded_to_prevent_scope_overlap")
        self.assertEqual(policy["lease_liabilities"]["treatment"], "excluded_from_conventional_debt_bridge_pending_policy")
        self.assertEqual(policy["noncontrolling_interest"]["treatment"], "excluded_from_base_bridge_pending_consolidated_ebit_alignment_review")
        self.assertEqual(policy["separate_financing_obligations"]["treatment"], "excluded_from_conventional_debt_bridge_pending_instrument_review")
        self.assertEqual(policy["approval_status"], "review_only_no_production_ev_or_earnings_yield")

    def test_ev_selection_policy_withholds_ambiguous_aggregate_debt(self):
        result = enterprise_value_scope_review({
            "categories": {
                "current_debt_candidates": {"candidate_count": 1, "candidates": [{"value": 25}]},
                "noncurrent_debt_candidates": {"candidate_count": 1, "candidates": [{"value": 125}]},
                "aggregate_debt_candidates": {"candidate_count": 2, "candidates": [{"value": 150}, {"value": 151}]},
                "cash_unrestricted_candidates": {"candidate_count": 1, "candidates": [{"value": 20}]},
            }
        })
        policy = result["selection_policy_review"]
        self.assertIsNone(policy["conventional_debt"]["included_candidate"])
        self.assertEqual(policy["conventional_debt"]["status"], "withheld_aggregate_debt_present")
        self.assertIsNone(result["conventional_net_debt_candidate"])

    def test_enterprise_value_scope_keeps_missing_debt_unknown(self):
        result = enterprise_value_scope_review({
            "categories": {
                "cash_unrestricted_candidates": {
                    "candidate_count": 1,
                    "candidates": [{"value": 513_200_000}],
                },
                "noncurrent_debt_candidates": {
                    "candidate_count": 1,
                    "candidates": [{"value": 17_000_000}],
                },
            }
        })
        self.assertIsNone(result["current_debt_candidate"])
        self.assertIsNone(result["conventional_gross_debt_candidate"])
        self.assertIsNone(result["conventional_net_debt_candidate"])
        self.assertIn(
            "current_debt_not_uniquely_identified_not_assumed_zero",
            result["review_flags"],
        )

    def test_aggregate_debt_reconciliation_reports_matching_components(self):
        result = enterprise_value_scope_review({
            "categories": {
                "current_debt_candidates": {
                    "candidate_count": 1, "candidates": [{"value": 25}],
                },
                "noncurrent_debt_candidates": {
                    "candidate_count": 1, "candidates": [{"value": 125}],
                },
                "aggregate_debt_candidates": {
                    "candidate_count": 1, "candidates": [{"value": 150}],
                },
            }
        })
        self.assertEqual(
            result["debt_reconciliation_review"]["status"], "reconciles_within_1"
        )
        self.assertEqual(
            result["debt_reconciliation_review"]["difference"], 0
        )

    def test_aggregate_debt_reconciliation_exposes_mismatch(self):
        result = enterprise_value_scope_review({
            "categories": {
                "current_debt_candidates": {
                    "candidate_count": 1, "candidates": [{"value": 25}],
                },
                "noncurrent_debt_candidates": {
                    "candidate_count": 1, "candidates": [{"value": 120}],
                },
                "aggregate_debt_candidates": {
                    "candidate_count": 1, "candidates": [{"value": 150}],
                },
            }
        })
        self.assertEqual(
            result["debt_reconciliation_review"]["status"], "does_not_reconcile"
        )
        self.assertEqual(
            result["debt_reconciliation_review"]["difference"], 5
        )

    def test_aggregate_debt_prevents_component_sum(self):
        result = enterprise_value_scope_review({
            "categories": {
                "current_debt_candidates": {
                    "candidate_count": 1, "candidates": [{"value": 25}],
                },
                "noncurrent_debt_candidates": {
                    "candidate_count": 1, "candidates": [{"value": 125}],
                },
                "aggregate_debt_candidates": {
                    "candidate_count": 1, "candidates": [{"value": 150}],
                },
                "cash_unrestricted_candidates": {
                    "candidate_count": 1, "candidates": [{"value": 20}],
                },
            }
        })
        self.assertIsNone(result["conventional_gross_debt_candidate"])
        self.assertIsNone(result["conventional_net_debt_candidate"])
        self.assertIn(
            "aggregate_debt_total_present_do_not_add_to_current_and_noncurrent_components",
            result["review_flags"],
        )

    def test_noncontrolling_interest_is_an_ev_scope_flag(self):
        result = enterprise_value_scope_review({
            "categories": {
                "current_debt_candidates": {
                    "candidate_count": 1,
                    "candidates": [{"value": 10}],
                },
                "noncurrent_debt_candidates": {
                    "candidate_count": 1,
                    "candidates": [{"value": 90}],
                },
                "cash_unrestricted_candidates": {
                    "candidate_count": 1,
                    "candidates": [{"value": 25}],
                },
                "noncontrolling_interest_candidates": {"candidate_count": 1},
            }
        })
        self.assertIn(
            "noncontrolling_interest_requires_enterprise_value_adjustment_review",
            result["review_flags"],
        )

    def test_enterprise_value_scope_reports_separate_lease_and_financing(self):
        result = enterprise_value_scope_review({
            "categories": {
                "current_debt_candidates": {
                    "candidate_count": 1,
                    "candidates": [{"value": 10}],
                },
                "noncurrent_debt_candidates": {
                    "candidate_count": 1,
                    "candidates": [{"value": 90}],
                },
                "cash_unrestricted_candidates": {
                    "candidate_count": 1,
                    "candidates": [{"value": 25}],
                },
                "current_lease_liability_candidates": {"candidate_count": 1},
                "noncurrent_lease_liability_candidates": {"candidate_count": 1},
                "nondebt_financing_obligation_candidates": {"candidate_count": 1},
            }
        })
        self.assertEqual(result["conventional_gross_debt_candidate"], 100)
        self.assertEqual(result["conventional_net_debt_candidate"], 75)
        self.assertEqual(result["separate_financing_obligation_candidate_count"], 1)
        self.assertIn(
            "lease_liabilities_separate_from_conventional_debt_require_policy_decision",
            result["review_flags"],
        )
        self.assertIn(
            "separate_financing_obligation_requires_enterprise_value_policy_decision",
            result["review_flags"],
        )

    def test_aggregate_debt_total_is_separate_from_components(self):
        categories = self.review(
            row("custom_TotalDebt", "Total debt", 150_000_000),
            row("us-gaap_LongTermDebtCurrent", "Current portion of long-term debt", 25_000_000),
            row("us-gaap_LongTermDebtNoncurrent", "Long-term debt", 125_000_000),
        )
        self.assertEqual(
            categories["aggregate_debt_candidates"]["candidate_count"], 1
        )
        self.assertEqual(categories["current_debt_candidates"]["candidate_count"], 1)
        self.assertEqual(categories["noncurrent_debt_candidates"]["candidate_count"], 1)

    def test_sale_leaseback_financing_is_not_misclassified_as_debt(self):
        categories = self.review(
            row(
                "prdo_SaleLeaseBackFinancing",
                "Sale lease-back financing",
                56_992_000,
            )
        )
        self.assertEqual(categories["current_debt_candidates"]["candidate_count"], 0)
        self.assertEqual(categories["noncurrent_debt_candidates"]["candidate_count"], 0)
        self.assertEqual(
            categories["nondebt_financing_obligation_candidates"]["candidate_count"], 1
        )

    def test_restricted_cash_variants_are_classified_separately(self):
        categories = self.review(
            row("ifrs-full_RestrictedCashAndCashEquivalents", "Restricted cash and cash equivalents", 12_000_000),
            row("ifrs-full_CashAndCashEquivalents", "Cash and cash equivalents", 90_000_000),
        )
        self.assertEqual(
            categories["cash_restricted_candidates"]["candidate_count"], 1
        )
        self.assertEqual(
            categories["cash_unrestricted_candidates"]["candidate_count"], 1
        )

    def test_short_term_investments_are_not_unrestricted_cash(self):
        categories = self.review(
            row("us-gaap_CashAndCashEquivalentsAtCarryingValue", "Cash and cash equivalents", 90_000_000),
            row("us-gaap_ShortTermInvestments", "Short-term investments", 25_000_000),
        )
        self.assertEqual(
            categories["cash_unrestricted_candidates"]["candidate_count"], 1
        )
        self.assertEqual(
            categories["short_term_investment_candidates"]["candidate_count"], 1
        )

    def test_noncurrent_lease_liabilities_never_enter_current_category(self):
        categories = self.review(
            row("us-gaap_OperatingLeaseLiabilityNoncurrent", "Operating lease liabilities, net of current portion", 40),
            row("us-gaap_FinanceLeaseLiabilityNoncurrent", "Finance lease liabilities, non- current portion", 20),
            row("us-gaap_OperatingLeaseLiabilityCurrent", "Operating lease liabilities, current", 10),
        )
        self.assertEqual(
            categories["current_lease_liability_candidates"]["candidate_count"], 1
        )
        self.assertEqual(
            categories["noncurrent_lease_liability_candidates"]["candidate_count"], 2
        )
        current_concepts = {
            x["concept"] for x in categories["current_lease_liability_candidates"]["candidates"]
        }
        self.assertEqual(current_concepts, {"us-gaap_OperatingLeaseLiabilityCurrent"})

    def test_combined_cash_and_investment_total_is_not_short_term_investment(self):
        categories = self.review(
            row("us-gaap_AvailableForSaleSecuritiesDebtSecuritiesCurrent", "Short-term investments", 100),
            row(
                "issuer_CashCashEquivalentsRestrictedCashAndShortTermInvestments",
                "Total cash and cash equivalents, restricted cash and short-term investments",
                200,
            ),
            row("us-gaap_MarketableSecuritiesNoncurrent", "Marketable securities, non-current", 30),
        )
        self.assertEqual(
            categories["short_term_investment_candidates"]["candidate_count"], 1
        )
        self.assertEqual(
            categories["cash_combined_or_investment_candidates"]["candidate_count"], 1
        )

    def test_restricted_cash_and_unrestricted_cash_are_separate(self):
        categories = self.review(
            row("us-gaap_CashAndCashEquivalentsAtCarryingValue", "Cash and cash equivalents, unrestricted", 110_970_000),
            row("us-gaap_RestrictedCashCurrent", "Restricted cash", 21_310_000),
            row("us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Total cash, cash equivalents and restricted cash", 132_280_000),
        )
        self.assertEqual(
            categories["cash_unrestricted_candidates"]["candidate_count"], 1
        )
        self.assertEqual(
            categories["cash_restricted_candidates"]["candidate_count"], 1
        )
        self.assertEqual(
            categories["cash_combined_or_investment_candidates"]["candidate_count"], 1
        )


if __name__ == "__main__":
    unittest.main()
