#!/usr/bin/env python3
"""Regression checks for review-only balance-sheet candidate classification."""
import unittest
from io import BytesIO
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from edgartools_bakeoff import filing_note_review, DIRECT_OPERATING_INCOME_LABEL_PATTERN, direct_operating_income_fact, balance_sheet_fact_review, balance_sheet_reconciliation_review, currency_normalization_review, enterprise_value_scope_review, filing_specific_currency_override, filing_specific_review, FRANKFURTER_RATE_CACHE, fetch_frankfurter_rate, mfi_market_cap_usd_millions, invested_capital_review, manual_enterprise_value_scenario_review, non_sec_issuer_review_case, reporting_currency_unit_review, roc_review, statement_fact_amount, extract_company


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


class BalanceSheetReconciliationTests(unittest.TestCase):
    def review(self, *rows):
        return balance_sheet_reconciliation_review(
            {"balance_sheet": {"rows": list(rows)}}, PERIOD
        )

    def test_us_gaap_reported_totals_reconcile(self):
        result = self.review(
            row("us-gaap_Assets", "Assets", 500),
            row("us-gaap_LiabilitiesAndStockholdersEquity", "Liabilities and stockholders' equity", 500),
        )
        self.assertEqual(result["status"], "reconciled")
        self.assertEqual(result["difference_assets_less_liabilities_and_equity"], 0)

    def test_ifrs_equity_and_liabilities_total_is_supported(self):
        result = self.review(
            row("ifrs-full_Assets", "Assets", 750),
            row("ifrs-full_EquityAndLiabilities", "Equity and liabilities", 749.95),
        )
        self.assertEqual(result["status"], "reconciled")
        self.assertAlmostEqual(result["difference_assets_less_liabilities_and_equity"], 0.05)

    def test_material_balance_sheet_difference_is_reported(self):
        result = self.review(
            row("us-gaap_Assets", "Assets", 500),
            row("us-gaap_LiabilitiesAndStockholdersEquity", "Liabilities and stockholders' equity", 490),
        )
        self.assertEqual(result["status"], "difference")
        self.assertEqual(result["difference_assets_less_liabilities_and_equity"], 10)

    def test_duplicate_reported_totals_are_ambiguous(self):
        result = self.review(
            row("us-gaap_Assets", "Assets", 500),
            row("issuer_Assets", "Total assets", 500),
            row("us-gaap_LiabilitiesAndStockholdersEquity", "Liabilities and stockholders' equity", 500),
        )
        self.assertEqual(result["status"], "ambiguous_inputs")
        self.assertIsNone(result["difference_assets_less_liabilities_and_equity"])

    def test_dimensional_totals_are_excluded(self):
        dimensional = row("issuer_Assets", "Assets", 500)
        dimensional["dimension"] = True
        result = self.review(
            dimensional,
            row("us-gaap_Assets", "Assets", 500),
            row("us-gaap_LiabilitiesAndStockholdersEquity", "Liabilities and stockholders' equity", 500),
        )
        self.assertEqual(result["status"], "reconciled")
        self.assertEqual(result["candidate_counts"]["total_assets"], 1)

    def test_period_mismatch_is_insufficient_not_zero(self):
        old_period = row("us-gaap_Assets", "Assets", 500)
        old_period["values"] = {"2024-12-31": 500}
        result = self.review(
            old_period,
            row("us-gaap_LiabilitiesAndStockholdersEquity", "Liabilities and stockholders' equity", 500),
        )
        self.assertEqual(result["status"], "insufficient_inputs")
        self.assertIsNone(result["assets"])

    def test_missing_total_is_not_derived_from_components(self):
        result = self.review(
            row("us-gaap_Assets", "Assets", 500),
            row("us-gaap_Liabilities", "Liabilities", 300),
            row("us-gaap_StockholdersEquity", "Stockholders' equity", 200),
        )
        self.assertEqual(result["status"], "insufficient_inputs")
        self.assertIsNone(result["liabilities_and_equity"])

    def test_rounding_tolerance_is_relative_to_statement_scale(self):
        result = self.review(
            row("us-gaap_Assets", "Assets", 1_000_000),
            row("us-gaap_LiabilitiesAndStockholdersEquity", "Liabilities and stockholders' equity", 999_950),
        )
        self.assertEqual(result["status"], "reconciled")
        self.assertEqual(result["tolerance"], 100)


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


    def test_partial_market_cap_override_never_falls_back_to_pinned_values(self):
        with patch.dict(
            "os.environ",
            {
                "MFI_PRICE_DATE": "2026-11-19",
                "MFI_MARKET_CAPS_JSON": '{"EGHSF": 650.0}',
            },
            clear=False,
        ):
            self.assertEqual(mfi_market_cap_usd_millions("EGHSF"), 650.0)
            self.assertIsNone(mfi_market_cap_usd_millions("ALEC"))


    def test_unsupported_edgar_ticker_keeps_dynamic_mfi_market_cap(self):
        class CompanyNotFoundError(Exception):
            pass

        with patch.dict(
            "os.environ",
            {
                "MFI_PRICE_DATE": "2026-11-19",
                "MFI_MARKET_CAPS_JSON": '{"AFMJF": 953.85}',
                "MFI_MARKET_CAPS_SOURCE": "active_universe_snapshot",
                "MFI_MARKET_CAP_SNAPSHOT_AS_OF": "2026-11-21T08:00:00Z",
            },
            clear=False,
        ):
            with patch("edgartools_bakeoff.Company", side_effect=CompanyNotFoundError("not in SEC index")):
                result = extract_company("AFMJF")
        self.assertEqual(result["provider_status"], "unsupported_provider")
        self.assertEqual(result["mfi_market_cap_input"]["value_usd_millions"], 953.85)
        self.assertEqual(result["mfi_market_cap_input"]["price_date"], "2026-11-19")

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



class FilingSpecificEBITReviewTests(unittest.TestCase):
    def period_row(self, concept, label, value, period):
        return {
            "concept": concept,
            "label": label,
            "values": {period: value},
            "dimension": False,
            "abstract": False,
        }

    def test_hrb_reconstruction_requires_all_exact_period_facts_and_cross_checks(self):
        period = "2026-06-30"
        statements = {
            "income_statement": {
                "rows": [
                    self.period_row("us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", 3_945_392_000, period),
                    self.period_row("us-gaap_CostsAndExpenses", "Total operating expenses", 3_037_706_000, period),
                    self.period_row("us-gaap_IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "Income from continuing operations before income taxes", 853_888_000, period),
                    self.period_row("us-gaap_OtherNonoperatingIncomeExpense", "Other income (expense), net", 26_813_000, period),
                    self.period_row("us-gaap_InterestExpenseDebt", "Interest expense on borrowings", -80_611_000, period),
                ]
            }
        }
        result = filing_specific_review(
            "HRB",
            {"accession_number": "0000012659-26-000026", "period_of_report": period},
            {},
            statements,
        )
        self.assertEqual(result["status"], "review_only")
        self.assertEqual(result["ebit_candidate"], 907_686_000)
        self.assertTrue(result["cross_checks"]["reconciles_within_1"])
        self.assertEqual(result["cross_checks"]["difference_between_methods"], 0)
        self.assertEqual(result["automation_status"], "manual_review_only")

    def test_hrb_reconstruction_is_not_reused_for_another_accession(self):
        result = filing_specific_review(
            "HRB",
            {"accession_number": "another-accession", "period_of_report": "2026-06-30"},
            {},
            {},
        )
        self.assertIsNone(result)

    def test_sghc_ifrs_reconstruction_uses_signed_operating_rows_and_exact_accession(self):
        period = "2025-12-31"
        statements = {
            "income_statement": {
                "rows": [
                    self.period_row("ifrs-full_Revenue", "Revenue", 1_000_000_000, period),
                    self.period_row("ifrs-full_SalesAndMarketingExpense", "Direct and marketing expenses", -500_000_000, period),
                    self.period_row("ifrs-full_GeneralAndAdministrativeExpense", "General and administrative expenses", -100_000_000, period),
                    self.period_row("ifrs-full_DepreciationAndAmortisationExpense", "Depreciation and amortization expense", -20_000_000, period),
                    self.period_row("ifrs-full_ImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss", "Impairment of assets", -10_000_000, period),
                    self.period_row("ifrs-full_MiscellaneousOtherOperatingIncome", "Other operating income", -13_000_000, period),
                    self.period_row("ifrs-full_FinanceIncome", "Finance income", 5_000_000, period),
                    self.period_row("ifrs-full_FinanceCosts", "Finance expense", -8_000_000, period),
                    self.period_row("ifrs-full_GainsLossesOnFinancialLiabilitiesAtFairValueThroughProfitOrLossDesignatedAsUponInitialRecognition", "Change in fair value of options", 1_000_000, period),
                    self.period_row("ifrs-full_ShareOfProfitLossOfAssociatesAccountedForUsingEquityMethod", "Share of post-tax profit of equity accounted investments", 1_000_000, period),
                    self.period_row("ifrs-full_ProfitLossBeforeTax", "Profit before taxation", 356_000_000, period),
                ]
            }
        }
        result = filing_specific_review(
            "SGHC",
            {"accession_number": "0001628280-26-025609", "period_of_report": period},
            {},
            statements,
        )
        self.assertEqual(result["status"], "review_only")
        self.assertEqual(result["method"], "ifrs_statement_subtotal_reconstructed")
        self.assertEqual(result["ebit_candidate"], 357_000_000)
        self.assertEqual(result["cross_checks"]["difference_to_reported_profit_before_taxation"], 0)
        self.assertTrue(result["cross_checks"]["reconciles_within_1"])
        self.assertEqual(result["automation_status"], "manual_review_only")

    def test_sghc_reconstruction_is_not_reused_for_another_accession(self):
        result = filing_specific_review(
            "SGHC",
            {"accession_number": "another-accession", "period_of_report": "2025-12-31"},
            {},
            {},
        )
        self.assertIsNone(result)

    def test_pbi_interest_reconciliation_is_exact_accession_manual_review_only(self):
        bridge = {"pretax_income": {"amount": 192_524_000}}
        result = filing_specific_review(
            "PBI",
            {"accession_number": "0001628280-26-009650", "period_of_report": PERIOD},
            bridge,
            {},
        )
        self.assertEqual(result["status"], "review_only")
        self.assertEqual(result["ebit_candidate"], 341_680_000)
        self.assertEqual(result["total_interest_expense_for_EBIT_reconciliation_net_of_interest_income"], 149_156_000)
        self.assertEqual(result["allocated_finance_interest_embedded_in_cost_of_financing"], 47_696_000)
        self.assertEqual(result["interest_income_included_in_reported_net_interest_expense"], 8_000_000)
        self.assertEqual(result["fiscal_period"], PERIOD)
        self.assertTrue(result["cross_checks"]["reconciles_with_reported_components"])
        self.assertEqual(result["cross_checks"]["pretax_plus_interest_net_of_interest_income"], 341_680_000)
        self.assertEqual(result["automation_status"], "manual_review_only")

    def test_pbi_reconstruction_is_not_reused_for_another_accession(self):
        result = filing_specific_review(
            "PBI",
            {"accession_number": "another-accession", "period_of_report": PERIOD},
            {"pretax_income": {"amount": 192_524_000}},
            {},
        )
        self.assertIsNone(result)


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

    def test_ifrs_current_and_noncurrent_borrowings_are_separated(self):
        categories = self.review(
            row("ifrs-full_ShorttermBorrowings", "Short-term borrowings", 4_000_000),
            row("ifrs-full_LongtermBorrowings", "Interest-bearing loans and borrowings", 17_000_000),
            row("ifrs-full_Borrowings", "Borrowings", 21_000_000),
        )
        current = categories["current_debt_candidates"]
        noncurrent = categories["noncurrent_debt_candidates"]
        self.assertEqual(current["candidate_count"], 1)
        self.assertEqual(current["candidates"][0]["value"], 4_000_000)
        self.assertEqual(noncurrent["candidate_count"], 1)
        self.assertEqual(noncurrent["candidates"][0]["value"], 17_000_000)
        self.assertFalse(current["automatic_aggregation"])
        self.assertFalse(noncurrent["automatic_aggregation"])

    def test_generic_long_term_debt_concept_is_not_assumed_noncurrent(self):
        categories = self.review(
            row("us-gaap_LongTermDebt", "Long-term debt", 120_000_000),
            row("us-gaap_LongTermDebtNoncurrent", "Long-term debt, noncurrent", 90_000_000),
        )
        debt = categories["noncurrent_debt_candidates"]
        self.assertEqual(debt["candidate_count"], 1)
        self.assertEqual(debt["candidates"][0]["concept"], "us-gaap_LongTermDebtNoncurrent")
        self.assertEqual(debt["resolution_hint"], "single_candidate_requires_policy_review")

    def test_generic_custom_long_term_debt_tag_is_not_assumed_noncurrent(self):
        categories = self.review(
            row("custom_LongTermDebt", "Long-term debt", 120_000_000),
        )
        debt = categories["noncurrent_debt_candidates"]
        self.assertEqual(debt["candidate_count"], 0)
        self.assertEqual(debt["status"], "not_found")

    def test_other_long_term_liabilities_are_not_assumed_conventional_debt(self):
        categories = self.review(
            row("us-gaap_OtherLongTermDebtNoncurrent", "Other long-term liabilities", 91_000),
        )
        debt = categories["noncurrent_debt_candidates"]
        self.assertEqual(debt["candidate_count"], 0)
        self.assertEqual(debt["status"], "not_found")

    def test_multiple_current_debt_instruments_are_not_automatically_summed(self):
        categories = self.review(
            row("us-gaap_LoansPayableCurrent", "Bank borrowings, current", 9_000_000),
            row("us-gaap_NotesPayableCurrent", "Related-party notes payable, current", 0),
        )
        debt = categories["current_debt_candidates"]
        self.assertEqual(debt["status"], "ambiguous_candidates")
        self.assertEqual(debt["candidate_count"], 2)
        self.assertEqual(
            debt["resolution_hint"],
            "multiple_distinct_instrument_candidates_manual_review_no_automatic_sum",
        )
        self.assertFalse(debt["automatic_aggregation"])
        self.assertEqual(sum(item["value"] for item in debt["candidates"]), 9_000_000)

    def test_distinct_debt_instruments_with_shared_parent_are_not_marked_overlap(self):
        first = row("us-gaap_LoansPayableCurrent", "Bank borrowings, current", 9_000_000)
        second = row("us-gaap_NotesPayableCurrent", "Related-party notes payable, current", 0)
        first["parent_concept"] = "us-gaap_LiabilitiesCurrent"
        second["parent_concept"] = "us-gaap_LiabilitiesCurrent"
        categories = self.review(first, second)
        debt = categories["current_debt_candidates"]
        self.assertEqual(
            debt["resolution_hint"],
            "multiple_distinct_instrument_candidates_manual_review_no_automatic_sum",
        )
        self.assertFalse(debt["automatic_aggregation"])

    def test_actual_parent_child_debt_facts_are_flagged_for_overlap_review(self):
        first = row("us-gaap_LongTermDebtNoncurrent", "Long-term debt, noncurrent", 100)
        second = row("custom_LongTermLoansPayable", "Bank borrowings, non-current", 100)
        second["parent_concept"] = "us-gaap_LongTermDebtNoncurrent"
        categories = self.review(first, second)
        debt = categories["noncurrent_debt_candidates"]
        self.assertEqual(
            debt["resolution_hint"],
            "possible_duplicate_or_parent_child_overlap_manual_review_no_automatic_sum",
        )
        self.assertFalse(debt["automatic_aggregation"])

    def test_same_concept_debt_rows_are_flagged_for_overlap_review(self):
        first = row("us-gaap_LongTermDebtNoncurrent", "Long-term debt, noncurrent", 100)
        second = row("us-gaap_LongTermDebtNoncurrent", "Long-term debt, noncurrent", 100)
        second["parent_concept"] = "us-gaap_Liabilities"
        categories = self.review(first, second)
        debt = categories["noncurrent_debt_candidates"]
        self.assertEqual(debt["candidate_count"], 2)
        self.assertEqual(
            debt["resolution_hint"],
            "possible_duplicate_or_parent_child_overlap_manual_review_no_automatic_sum",
        )
        self.assertEqual(debt["candidates"][1]["parent_concept"], "us-gaap_Liabilities")

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

    def test_invested_capital_surfaces_negative_working_capital_offset(self):
        result = invested_capital_review({
            "categories": {
                "current_assets_candidates": {
                    "status": "unique_candidate",
                    "candidates": [{"value": 2_117_873_000}],
                },
                "current_liabilities_candidates": {
                    "status": "unique_candidate",
                    "candidates": [{"value": 2_623_325_000}],
                },
                "net_ppe_candidates": {
                    "status": "unique_candidate",
                    "candidates": [{"value": 522_197_000}],
                },
            }
        })
        self.assertEqual(result["value"], 16_745_000)
        diagnostics = result["denominator_diagnostics"]
        self.assertEqual(diagnostics["working_capital"], -505_452_000)
        self.assertAlmostEqual(
            diagnostics["negative_working_capital_offset_ratio"], 0.967936, places=5
        )
        self.assertTrue(
            diagnostics["negative_working_capital_offsets_at_least_90pct_of_net_ppe"]
        )
        self.assertTrue(
            diagnostics["near_zero_positive_denominator_from_negative_working_capital"]
        )
        self.assertTrue(
            diagnostics["negative_working_capital_offsets_at_least_95pct_of_net_ppe"]
        )
        self.assertFalse(
            diagnostics["negative_working_capital_offsets_at_least_99pct_of_net_ppe"]
        )
        self.assertAlmostEqual(
            diagnostics["invested_capital_as_pct_of_net_ppe"], 3.2064, places=3
        )
        self.assertEqual(diagnostics["net_ppe_only_reference_denominator"], 522_197_000)
        self.assertTrue(diagnostics["net_ppe_only_is_sensitivity_not_alternative_policy"])

    def test_invested_capital_does_not_flag_positive_working_capital_as_offset(self):
        result = invested_capital_review({
            "categories": {
                "current_assets_candidates": {
                    "status": "unique_candidate",
                    "candidates": [{"value": 150}],
                },
                "current_liabilities_candidates": {
                    "status": "unique_candidate",
                    "candidates": [{"value": 100}],
                },
                "net_ppe_candidates": {
                    "status": "unique_candidate",
                    "candidates": [{"value": 60}],
                },
            }
        })
        diagnostics = result["denominator_diagnostics"]
        self.assertEqual(result["value"], 110)
        self.assertIsNone(diagnostics["negative_working_capital_offset_ratio"])
        self.assertFalse(
            diagnostics["negative_working_capital_offsets_at_least_90pct_of_net_ppe"]
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

    def test_unqualified_ifrs_borrowings_label_is_not_assumed_noncurrent(self):
        categories = self.review(
            row("issuer_InterestBearingLoansAndBorrowings", "Interest-bearing loans and borrowings", 100),
        )
        self.assertEqual(
            categories["current_debt_candidates"]["candidate_count"], 0
        )
        self.assertEqual(
            categories["noncurrent_debt_candidates"]["candidate_count"], 0
        )
        self.assertEqual(
            categories["aggregate_debt_candidates"]["candidate_count"], 0
        )

    def test_ifrs_longterm_borrowings_concept_is_noncurrent_with_generic_label(self):
        categories = self.review(
            row("ifrs-full_LongtermBorrowings", "Interest-bearing loans and borrowings", 17),
        )
        self.assertEqual(
            categories["current_debt_candidates"]["candidate_count"], 0
        )
        self.assertEqual(
            categories["noncurrent_debt_candidates"]["candidate_count"], 1
        )
        self.assertEqual(
            categories["noncurrent_debt_candidates"]["candidates"][0]["concept"],
            "ifrs-full_LongtermBorrowings",
        )

    def test_explicit_payables_are_classified_but_multiple_instruments_remain_ambiguous(self):
        categories = self.review(
            row("us-gaap_LoansPayableCurrent", "Bank and other borrowings, current", 9_099_046),
            row("us-gaap_NotesPayableCurrent", "Notes payables, current - related parties", 0),
            row("us-gaap_LongTermLoansPayable", "Bank and other borrowings, non-current", 33_734_438),
            row("us-gaap_LongTermNotesPayable", "Notes payables, non-current - related parties", 0),
        )
        current = categories["current_debt_candidates"]
        noncurrent = categories["noncurrent_debt_candidates"]
        self.assertEqual(current["candidate_count"], 2)
        self.assertEqual(noncurrent["candidate_count"], 2)
        self.assertEqual(
            {x["concept"] for x in current["candidates"]},
            {"us-gaap_LoansPayableCurrent", "us-gaap_NotesPayableCurrent"},
        )
        self.assertEqual(
            {x["concept"] for x in noncurrent["candidates"]},
            {"us-gaap_LongTermLoansPayable", "us-gaap_LongTermNotesPayable"},
        )

    def test_credit_line_and_convertible_debt_maturity_concepts(self):
        categories = self.review(
            row("us-gaap_ConvertibleDebtCurrent", "Current portion of convertible senior notes", 199_680_000),
            row("us-gaap_LinesOfCreditCurrent", "Venture debt, current portion", 6_235_000),
            row("us-gaap_LongTermLineOfCredit", "Revolving credit facility", 385_000_000),
            row("us-gaap_LongTermLineOfCredit", "Venture debt, net of current portion", 3_473_000),
        )
        self.assertEqual(
            categories["current_debt_candidates"]["candidate_count"], 2
        )
        self.assertEqual(
            categories["noncurrent_debt_candidates"]["candidate_count"], 2
        )
        noncurrent_labels = {
            x["label"] for x in categories["noncurrent_debt_candidates"]["candidates"]
        }
        self.assertIn("Venture debt, net of current portion", noncurrent_labels)

    def test_current_and_noncurrent_debt_categories_do_not_overlap(self):
        categories = self.review(
            row("us-gaap_LongTermDebtCurrent", "Current portion of long-term debt", 15),
            row("us-gaap_LongTermDebtNoncurrent", "Long-term debt, noncurrent", 85),
            row("issuer_DebtCurrent", "Debt, current", 12),
            row("issuer_NoncurrentBorrowings", "Noncurrent borrowings", 80),
            row("issuer_LongTermDebt", "Long-term debt", 75),
            row("issuer_DebtCurrentWithMisleadingLabel", "Long-term debt, net of current portion", 70),
        )
        current = categories["current_debt_candidates"]["candidates"]
        noncurrent = categories["noncurrent_debt_candidates"]["candidates"]
        current_concepts = {x["concept"] for x in current}
        noncurrent_concepts = {x["concept"] for x in noncurrent}
        self.assertEqual(
            current_concepts,
            {"us-gaap_LongTermDebtCurrent", "issuer_DebtCurrent"},
        )
        self.assertEqual(
            noncurrent_concepts,
            {"us-gaap_LongTermDebtNoncurrent", "issuer_NoncurrentBorrowings"},
        )
        self.assertFalse(current_concepts & noncurrent_concepts)

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


class FilingNoteReviewTests(unittest.TestCase):
    def test_extracts_bounded_topic_matched_note_evidence(self):
        class Notes:
            def __init__(self):
                self.focus = None

            def to_markdown(self, focus=None):
                self.focus = focus
                return """# Note 8 - Debt
The company maintains a revolving credit facility.
Borrowings outstanding were $125 million at year end.
Unused capacity was $75 million.

# Note 12 - Equity
The consolidated subsidiaries include a noncontrolling interest.
The carrying amount of noncontrolling interest was $8 million.
"""

        notes = Notes()
        result = filing_note_review(type("FilingObject", (), {"notes": notes})())
        self.assertEqual(notes.focus, ["Debt", "Cash", "Lease", "Equity", "Financing", "Commitments", "Contingencies", "Related Party", "Operating", "Revenue", "Property", "Pension", "Acquisition", "Impairment", "Intangible"])
        self.assertEqual(result["status"], "candidates_found")
        self.assertEqual(result["candidate_count"], 2)
        by_title = {item["title"]: item for item in result["candidates"]}
        self.assertIn("debt_scope", by_title["Note 8 - Debt"]["topics"])
        self.assertIn("nci_scope", by_title["Note 12 - Equity"]["topics"])
        self.assertLessEqual(len(by_title["Note 8 - Debt"]["excerpt"]), 1200)

    def test_failed_sale_leaseback_note_requires_distinct_ordinary_and_financing_schedules(self):
        markdown = """# Note 9 - Leases
Future minimum lease payments under leases which are included in our consolidated balance sheet are as follows:
Present value of future minimum lease payments 61,339
Failed Sale-Leaseback
A financing obligation liability was recognized.
The Company will not recognize rent expense related to the leased asset.
Instead, monthly rent payments under the lease agreement will be recorded as interest expense and a reduction of the outstanding liability.
Future minimum lease payments for failed sale-leaseback financing transactions as of December 31, 2025 are as follows:
Sale Leaseback Payments 154,067
"""
        result = filing_note_review(type("FilingObject", (), {
            "notes": type("Notes", (), {"to_markdown": lambda self, focus=None: markdown})()
        })())
        reconciliation = result["lease_financing_reconciliation"]
        self.assertEqual(reconciliation["status"], "financing_treatment_supported")
        self.assertEqual(len(reconciliation["matched_signals"]), 6)
        self.assertIn("ordinary_lease_schedule_limited_to_reported_lease_liabilities",
                      reconciliation["schedule_separation_evidence"])
        self.assertIn("failed_sale_leaseback_has_separate_payment_schedule",
                      reconciliation["schedule_separation_evidence"])

    def test_failed_sale_leaseback_does_not_resolve_overlap_without_separate_schedules(self):
        markdown = """# Note 9 - Leases
Failed Sale-Leaseback
A financing obligation liability was recognized.
The Company will not recognize rent expense related to the leased asset.
Instead, monthly rent payments under the lease agreement will be recorded as interest expense and a reduction of the outstanding liability.
"""
        result = filing_note_review(type("FilingObject", (), {
            "notes": type("Notes", (), {"to_markdown": lambda self, focus=None: markdown})()
        })())
        self.assertEqual(result["lease_financing_reconciliation"]["status"], "insufficient_evidence")

    def test_failed_sale_leaseback_does_not_resolve_overlap_without_all_signals(self):
        markdown = """# Note 9 - Leases
Failed Sale-Leaseback
A financing obligation liability was recognized.
"""
        result = filing_note_review(type("FilingObject", (), {
            "notes": type("Notes", (), {"to_markdown": lambda self, focus=None: markdown})()
        })())
        self.assertEqual(result["lease_financing_reconciliation"]["status"], "insufficient_evidence")

    def test_missing_structured_notes_is_transparent(self):
        result = filing_note_review(object())
        self.assertEqual(result["status"], "not_available")
        self.assertEqual(result["candidate_count"], 0)

    def test_note_parser_failure_does_not_fallback_to_full_filing(self):
        class BrokenNotes:
            def to_markdown(self, focus=None):
                raise RuntimeError("notes parser unavailable")

        result = filing_note_review(type("FilingObject", (), {"notes": BrokenNotes()})())
        self.assertEqual(result["status"], "extraction_error")
        self.assertEqual(result["candidates"], [])


    def test_extracts_new_ebit_invested_capital_and_other_ev_note_topics(self):
        markdown = """# Note 10 - Operating Results
The company recorded restructuring and impairment charges in operating income.
# Note 11 - Property
Right-of-use assets and rental equipment are separately presented.
# Note 12 - Financing
The company has contingent consideration and pension liabilities.
"""
        result = filing_note_review(type("FilingObject", (), {
            "notes": type("Notes", (), {"to_markdown": lambda self, focus=None: markdown})()
        })())
        by_title = {item["title"]: item for item in result["candidates"]}
        self.assertIn("ebit_scope", by_title["Note 10 - Operating Results"]["topics"])
        self.assertIn("invested_capital_scope", by_title["Note 11 - Property"]["topics"])
        self.assertIn("financing_scope", by_title["Note 12 - Financing"]["topics"])
