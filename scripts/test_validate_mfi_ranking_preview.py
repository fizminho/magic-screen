import unittest
from validate_mfi_ranking_preview import validate


def row(symbol, provider="supported", eligible=False, rank=None, ey=None, roc=None, score=None):
    return {"symbol": symbol, "provider_status": provider, "ranking_eligible": eligible,
            "eligibility_status": "excluded_provider_unsupported" if provider == "unsupported_provider" else ("eligible" if eligible else "excluded_accounting_or_valuation_review"),
            "magic_formula_rank": rank, "earnings_yield_rank": ey, "return_on_capital_rank": roc, "magic_formula_score": score}


class RankingPreviewTests(unittest.TestCase):
    def report(self, rows, eligible, ranked, unsupported=0, minimum=5):
        return {"minimum_eligible_cohort": minimum, "summary": {"universe": len(rows), "eligible": eligible,
                "ranked": ranked, "excluded": len(rows)-eligible, "unsupported_provider": unsupported},
                "rankings": rows, "production_write": False, "production_fundamentals_changed": False, "rankings_changed": False}

    def test_unsupported_visible_but_excluded(self):
        self.assertEqual(validate(self.report([row("AAA", "unsupported_provider")], 0, 0, 1)), [])

    def test_ordinal_rank_sum_required(self):
        self.assertEqual(validate(self.report([row("AAA", eligible=True, rank=1, ey=1, roc=2, score=3)], 1, 1, minimum=1)), [])

    def test_percentile_average_rejected(self):
        errors = validate(self.report([row("AAA", eligible=True, rank=1, ey=1, roc=2, score=1.5)], 1, 1, minimum=1))
        self.assertTrue(any("ordinal rank sum" in error for error in errors))

    def test_unsupported_count_must_reconcile(self):
        errors = validate(self.report([row("AAA", "unsupported_provider")], 0, 0, 0))
        self.assertTrue(any("coverage count" in error for error in errors))

    def test_production_write_must_remain_false(self):
        report = self.report([], 0, 0)
        report["production_write"] = True
        self.assertTrue(any("production_write" in error for error in validate(report)))


if __name__ == "__main__":
    unittest.main()
