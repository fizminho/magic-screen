#!/usr/bin/env python3
"""Regression checks for review-only balance-sheet candidate classification."""
import unittest

from edgartools_bakeoff import DIRECT_OPERATING_INCOME_LABEL_PATTERN, balance_sheet_fact_review, enterprise_value_scope_review, filing_specific_review, roc_review, statement_fact_amount


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
