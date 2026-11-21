import unittest
from assess_us_mfi_policy_cohort import assess, render_markdown


def fixtures():
    queue = {
        "summary": {"total": 2},
        "production_write": False,
        "production_fundamentals_changed": False,
        "rankings_changed": False,
        "items": [
            {"symbol": "AAA", "priority": "P1", "provider_status": "supported",
             "ebit_status": "direct_reported_candidate_review_only",
             "invested_capital_status": "positive_denominator_candidate_review_only",
             "debt_status": "identified_from_unique_current_and_noncurrent_components",
             "issue_count": 2, "issues": ["cash_scope_review"]},
            {"symbol": "BBB", "priority": "P2", "provider_status": "unsupported",
             "ebit_status": "review_required", "invested_capital_status": "review_required",
             "debt_status": "incomplete_or_ambiguous_debt_inputs",
             "issue_count": 3, "issues": ["provider_unsupported"]},
        ],
    }
    ranking = {"rankings": [
        {"symbol": "AAA", "eligibility_status": "eligible", "magic_formula_rank": 1,
         "production_approved": False},
        {"symbol": "BBB", "eligibility_status": "excluded_provider_unsupported",
         "production_approved": False},
    ]}
    policy = {"policy_id": "test", "status": "proposed_owner_approval_required",
              "production_controls": {"production_approved": False}}
    return queue, ranking, policy


class CohortAssessmentTests(unittest.TestCase):
    def test_full_coverage_and_no_production_approval(self):
        q, r, p = fixtures()
        result = assess(q, r, p)
        self.assertEqual(result["validation_errors"], [])
        self.assertEqual(result["summary"]["universe"], 2)
        self.assertEqual(result["summary"]["shadow_eligible"], 1)
        self.assertEqual(result["summary"]["production_approved"], 0)
        self.assertFalse(result["production_write"])

    def test_missing_or_duplicate_symbol_fails(self):
        q, r, p = fixtures()
        q["items"][1]["symbol"] = "AAA"
        result = assess(q, r, p)
        self.assertTrue(any("duplicate" in e for e in result["validation_errors"]))

    def test_production_approval_guardrail_fails(self):
        q, r, p = fixtures()
        p["production_controls"]["production_approved"] = True
        result = assess(q, r, p)
        self.assertTrue(any("immutability" in e for e in result["validation_errors"]))

    def test_generic_cash_and_nci_candidate_buckets_are_not_overstated(self):
        q, r, p = fixtures()
        q["items"][0]["issues"] += ["flag:balance_sheet:cash_restricted_candidates", "flag:balance_sheet:noncontrolling_interest_candidates"]
        result = assess(q, r, p)
        row = next(x for x in result["issuer_assessments"] if x["symbol"] == "AAA")
        self.assertFalse(any("cash classification" in x for x in row["blockers"]))
        self.assertFalse(any("NCI" in x for x in row["blockers"]))

    def test_specific_cash_flag_is_a_blocker(self):
        q, r, p = fixtures()
        q["items"][0]["issues"].append("flag:restricted_or_combined_cash_present_review_enterprise_value_cash_input")
        result = assess(q, r, p)
        row = next(x for x in result["issuer_assessments"] if x["symbol"] == "AAA")
        self.assertTrue(any("cash classification" in x for x in row["blockers"]))

    def test_high_risk_invested_capital_offset_is_a_blocker(self):
        q, r, p = fixtures()
        q["items"][0]["issues"].append("invested_capital_negative_working_capital_offset_high_risk_manual_review")
        result = assess(q, r, p)
        row = next(x for x in result["issuer_assessments"] if x["symbol"] == "AAA")
        self.assertTrue(any("ROC and ranking withheld" in x for x in row["blockers"]))

    def test_report_keeps_candidate_as_review_only(self):
        q, r, p = fixtures()
        report = render_markdown(assess(q, r, p))
        self.assertIn("not accounting approval", report)
        self.assertIn("AAA", report)


if __name__ == "__main__":
    unittest.main()
