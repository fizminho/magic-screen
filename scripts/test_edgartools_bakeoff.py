#!/usr/bin/env python3
"""Regression checks for review-only balance-sheet candidate classification."""
import unittest

from edgartools_bakeoff import balance_sheet_fact_review


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
