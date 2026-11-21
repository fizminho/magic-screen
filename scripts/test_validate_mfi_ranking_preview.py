import unittest
from validate_mfi_ranking_preview import validate


def row(symbol, provider="supported", eligible=False, rank=None, ey=None, roc=None, score=None, ey_value=None, roc_value=None):
    return {"symbol": symbol, "provider_status": provider, "ranking_eligible": eligible,
            "eligibility_status": "excluded_provider_unsupported" if provider == "unsupported_provider" else ("eligible" if eligible else "excluded_accounting_or_valuation_review"),
            "magic_formula_rank": rank, "earnings_yield_rank": ey, "return_on_capital_rank": roc,
            "magic_formula_score": score, "earnings_yield": ey_value, "return_on_capital": roc_value,
            "ebit_status": "direct_reported_candidate_review_only", "review_flags": []}


class RankingPreviewTests(unittest.TestCase):
    def report(self, rows, eligible, ranked, unsupported=0, minimum=5):
        return {"minimum_eligible_cohort": minimum, "summary": {"universe": len(rows), "eligible": eligible,
                "ranked": ranked, "excluded": len(rows)-ranked, "unsupported_provider": unsupported},
                "rankings": rows, "production_write": False, "production_fundamentals_changed": False, "rankings_changed": False}

    def test_unsupported_visible_but_excluded(self):
        self.assertEqual(validate(self.report([row("AAA", "unsupported_provider")], 0, 0, 1)), [])

    def test_ordinal_rank_sum_required(self):
        item = row("AAA", eligible=True, rank=1, ey=1, roc=1, score=2, ey_value=0.2, roc_value=0.3)
        self.assertEqual(validate(self.report([item], 1, 1, minimum=1)), [])

    def test_percentile_average_rejected(self):
        item = row("AAA", eligible=True, rank=1, ey=1, roc=1, score=1.5, ey_value=0.2, roc_value=0.3)
        errors = validate(self.report([item], 1, 1, minimum=1))
        self.assertTrue(any("ordinal rank sum" in error for error in errors))

    def test_metric_ties_use_average_occupied_ordinal_positions(self):
        rows = [
            row("AAA", eligible=True, rank=1, ey=1, roc=1, score=2, ey_value=0.30, roc_value=0.40),
            row("BBB", eligible=True, rank=2, ey=2.5, roc=2, score=4.5, ey_value=0.20, roc_value=0.30),
            row("CCC", eligible=True, rank=3, ey=2.5, roc=3, score=5.5, ey_value=0.20, roc_value=0.20),
            row("DDD", eligible=True, rank=4, ey=4, roc=4, score=8, ey_value=0.10, roc_value=0.10),
        ]
        self.assertEqual(validate(self.report(rows, 4, 4, minimum=4)), [])

    def test_combined_score_ties_share_competition_rank(self):
        rows = [
            row("AAA", eligible=True, rank=1, ey=1, roc=2, score=3, ey_value=0.30, roc_value=0.20),
            row("BBB", eligible=True, rank=1, ey=2, roc=1, score=3, ey_value=0.20, roc_value=0.30),
            row("CCC", eligible=True, rank=3, ey=3, roc=3, score=6, ey_value=0.10, roc_value=0.10),
        ]
        self.assertEqual(validate(self.report(rows, 3, 3, minimum=3)), [])

    def test_incorrect_metric_rank_is_rejected(self):
        rows = [
            row("AAA", eligible=True, rank=1, ey=2, roc=1, score=3, ey_value=0.30, roc_value=0.10),
            row("BBB", eligible=True, rank=2, ey=1, roc=2, score=3, ey_value=0.20, roc_value=0.20),
        ]
        errors = validate(self.report(rows, 2, 2, minimum=2))
        self.assertTrue(any("ordinal rank is incorrect" in error for error in errors))

    def test_unsupported_count_must_reconcile(self):
        errors = validate(self.report([row("AAA", "unsupported_provider")], 0, 0, 0))
        self.assertTrue(any("coverage count" in error for error in errors))


    def test_eligible_below_minimum_is_counted_as_not_ranked(self):
        rows = [
            row("AAA", eligible=True, ey_value=0.30, roc_value=0.40),
            row("BBB", eligible=True, ey_value=0.20, roc_value=0.30),
            row("CCC", eligible=True, ey_value=0.10, roc_value=0.20),
            row("DDD", eligible=True, ey_value=0.05, roc_value=0.10),
        ]
        report = self.report(rows, 4, 0, minimum=5)
        self.assertEqual(validate(report), [])

    def test_excluded_count_uses_ranked_cohort_not_eligibility(self):
        rows = [
            row("AAA", eligible=True, rank=1, ey=1, roc=1, score=2, ey_value=0.30, roc_value=0.40),
            row("BBB", eligible=True, rank=2, ey=2, roc=2, score=4, ey_value=0.20, roc_value=0.30),
            row("CCC", eligible=False),
        ]
        report = self.report(rows, 2, 2, minimum=2)
        self.assertEqual(validate(report), [])

    def test_filing_specific_ebit_reconstruction_cannot_be_ranked(self):
        item = row("HRB", eligible=True, rank=1, ey=1, roc=1, score=2, ey_value=0.2, roc_value=0.3)
        item["ebit_status"] = "filing_specific_reconstruction_review_only"
        errors = validate(self.report([item], 1, 1, minimum=1))
        self.assertTrue(any("filing-specific EBIT reconstruction" in error for error in errors))

    def test_high_risk_invested_capital_denominator_cannot_be_ranked(self):
        item = row("OTEX", eligible=True, rank=1, ey=1, roc=1, score=2, ey_value=0.2, roc_value=0.3)
        item["review_flags"] = ["invested_capital_negative_working_capital_offset_high_risk_manual_review"]
        errors = validate(self.report([item], 1, 1, minimum=1))
        self.assertTrue(any("high-risk near-zero" in error for error in errors))

    def test_lease_scope_presence_is_disclosed_not_a_hard_blocker(self):
        lease_flags = [
            "right_of_use_assets_present_review_invested_capital_scope",
            "lease_liabilities_present_review_debt_and_invested_capital_treatment",
            "lease_liabilities_separate_from_conventional_debt_require_policy_decision",
        ]
        for flag in lease_flags:
            with self.subTest(flag=flag):
                item = row("AAA", eligible=True, rank=1, ey=1, roc=1, score=2, ey_value=0.2, roc_value=0.3)
                item["review_flags"] = [flag]
                self.assertEqual(validate(self.report([item], 1, 1, minimum=1)), [])

    def test_unresolved_accounting_scope_flags_cannot_be_ranked(self):
        blocked_flags = [
            "restricted_or_combined_cash_present_review_enterprise_value_cash_input",
            "unrestricted_cash_not_uniquely_identified",
            "restricted_cash_or_short_term_investments_require_cash_scope_review",
            "noncontrolling_interest_present_review_enterprise_value_scope",
            "noncontrolling_interest_requires_enterprise_value_adjustment_review",
            "company_perimeter_mismatch_requires_manual_review",
            "nondebt_financing_obligation_requires_enterprise_value_scope_review",
            "separate_financing_obligation_requires_enterprise_value_policy_decision",
        ]
        for flag in blocked_flags:
            with self.subTest(flag=flag):
                item = row("AAA", eligible=True, rank=1, ey=1, roc=1, score=2, ey_value=0.2, roc_value=0.3)
                item["review_flags"] = [flag]
                errors = validate(self.report([item], 1, 1, minimum=1))
                self.assertTrue(any("unresolved lease, cash, NCI or financing scope" in error for error in errors))

    def test_production_write_must_remain_false(self):
        report = self.report([], 0, 0)
        report["production_write"] = True
        self.assertTrue(any("production_write" in error for error in validate(report)))


if __name__ == "__main__":
    unittest.main()
