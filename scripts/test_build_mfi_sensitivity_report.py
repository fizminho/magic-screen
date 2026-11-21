import unittest
from build_mfi_sensitivity_report import build


class MfiSensitivityTests(unittest.TestCase):
    def preview(self):
        return {"as_of": "2026-11-21", "rankings": [
            {"symbol": "AAA", "magic_formula_rank": 1, "ebit_candidate": 100, "enterprise_value_candidate": 500, "invested_capital_candidate": 100},
            {"symbol": "BBB", "magic_formula_rank": 2, "ebit_candidate": 80, "enterprise_value_candidate": 400, "invested_capital_candidate": 200},
        ]}

    def queue(self):
        return {"items": [
            {"symbol": "AAA", "invested_capital_denominator_diagnostics": {"net_ppe_only_reference_denominator": 50}},
            {"symbol": "BBB", "filing_ev_scope_note_review": {"cash_policy_dimensions": {"portfolio_composition": {"reported_total_millions": 0.0001}}}},
        ]}

    def test_builds_four_sensitivity_scenarios_without_production_write(self):
        result = build(self.preview(), self.queue())
        self.assertEqual(len(result["scenarios"]), 4)
        self.assertTrue(all(item["sensitivity_only"] for item in result["scenarios"]))
        self.assertFalse(result["production_write"])
        self.assertEqual(result["scenarios"][0]["rows"][0]["symbol"], "AAA")

    def test_net_ppe_sensitivity_uses_reference_denominator(self):
        result = build(self.preview(), self.queue())
        aaa = next(row for row in result["scenarios"][1]["rows"] if row["symbol"] == "AAA")
        self.assertAlmostEqual(aaa["return_on_capital"], 2.0)

    def test_cash_like_sensitivity_does_not_promote_missing_values(self):
        result = build(self.preview(), self.queue())
        bbb = next(row for row in result["scenarios"][2]["rows"] if row["symbol"] == "BBB")
        self.assertAlmostEqual(bbb["earnings_yield"], 80 / (400 - 100))


if __name__ == "__main__":
    unittest.main()
