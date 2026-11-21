import unittest
from validate_us_mfi_accounting_policy import validate

def fixture():
    return {
      "policy_id":"us_mfi_accounting_policy_v1_proposed","version":1,"market":"US",
      "status":"proposed_owner_approval_required",
      "production_controls":{"production_write":False,"production_fundamentals_changed":False,"rankings_changed":False,"production_approved":False,"shadow_only":True},
      "filings":{"forms":["10-K","20-F","40-F"],"period":"latest_annual_only","interim_substitution":False},
      "ebit":{"concept":"consolidated_GAAP_operating_income","exceptional_item_adjustments":"none_until_cohort_wide_policy_approved","filing_specific_reconstructions":"manual_review_only_not_resolver_input"},
      "invested_capital":{"formula":"current_assets_minus_current_liabilities_plus_net_ppe","rou_assets_added_alone":False,"issuer_specific_formula_switching":False,"negative_denominator":"withhold_ROC_and_ranking"},
      "enterprise_value":{"formula":"market_cap_plus_conventional_gross_debt_minus_unrestricted_cash","undrawn_facilities":False},
      "cash":{"restricted_cash":False,"customer_funds":False,"escrow_and_in_transit":False,"notes_receivable":False,"missing_value":"unknown_not_zero"},
      "ranking":{"minimum_approved_eligible_cohort":5,"below_minimum":"withhold_final_ranking"},
      "approval_gates":["exceptional_EBIT_policy","filing_specific_EBIT_bridges","invested_capital_and_near_zero_threshold","lease_and_ROU_symmetry","other_financing_obligations","NCI_perimeter","marketable_securities_cash_like_test","price_staleness_window","legacy_reconciliation_or_explicit_replacement_approval","production_monitoring_and_rollback"],
      "non_goals":["No production writes"]
    }

class ProposedPolicyTests(unittest.TestCase):
    def test_policy_is_valid(self): self.assertEqual(validate(fixture()),[])
    def test_rejects_production_approval(self):
        p=fixture();p["production_controls"]["production_approved"]=True
        self.assertTrue(any("production_approved" in e for e in validate(p)))
    def test_rejects_missing_as_zero(self):
        p=fixture();p["cash"]["missing_value"]="zero"
        self.assertTrue(any("unknown, not zero" in e for e in validate(p)))
    def test_rejects_interim_substitution(self):
        p=fixture();p["filings"]["interim_substitution"]=True
        self.assertTrue(any("annual-only" in e for e in validate(p)))
    def test_rejects_issuer_specific_ebit_adjustment(self):
        p=fixture();p["ebit"]["exceptional_item_adjustments"]="exclude_QTTB_only"
        self.assertTrue(any("issuer-specific" in e for e in validate(p)))
    def test_requires_all_owner_approval_gates(self):
        p=fixture();p["approval_gates"].pop()
        self.assertTrue(any("approval gates" in e for e in validate(p)))

if __name__=="__main__": unittest.main()
