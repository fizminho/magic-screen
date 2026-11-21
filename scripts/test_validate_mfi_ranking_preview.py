import unittest
from validate_mfi_ranking_preview import validate


def row(symbol, provider="supported", eligible=False, rank=None, ey=None, roc=None, score=None, ey_value=None, roc_value=None):
    return {"symbol": symbol, "provider_status": provider, "ranking_eligible": eligible,
            "eligibility_status": "excluded_provider_unsupported" if provider == "unsupported_provider" else ("eligible" if eligible else "excluded_accounting_or_valuation_review"),
            "magic_formula_rank": rank, "earnings_yield_rank": ey, "return_on_capital_rank": roc,
            "magic_formula_score": score, "earnings_yield": ey_value, "return_on_capital": roc_value}


class RankingPreviewTests(unittest.TestCase):
    def report(self, rows, eligible, ranked, unsupported=0, minimum=5):
        return {"minimum_eligible_cohort": minimum, "summary": {"universe": len(rows), "eligible": eligible,
                "ranked": ranked, "excluded": len(rows)-eligible, "unsupported_provider": unsupported},
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

    def test_metric_ranks_and_competition_ties_are_recomputed(self):
        rows = [
            row("AAA", eligible=True, rank=1, ey=1, roc=2, score=3, ey_value=0.30, roc_value=0.10),
            row("BBB", eligible=True, rank=1, ey=2, roc=1, score=3, ey_value=0.20, roc_value=0.20),
            row("CCC", eligible=True, rank=3, ey=2.5, roc=3, score=5.5, ey_value=0.20, roc_value=0.05),
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

    def test_production_write_must_remain_false(self):
        report = self.report([], 0, 0)
        report["production_write"] = True
        self.assertTrue(any("production_write" in error for error in validate(report)))


if __name__ == "__main__":
    unittest.main()
