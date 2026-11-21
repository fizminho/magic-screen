import unittest
from build_mfi_sensitivity_report import build, lease_adjustment

class MfiSensitivityTests(unittest.TestCase):
 def test_ifrs16_includes_current_noncurrent_and_rou(self):
  x=lease_adjustment({"accounting_framework":"IFRS","lease_accounting_model":"IFRS16_single_lessee_model",
   "lease_liabilities":[{"value":5,"maturity":"current"},{"value":59,"maturity":"noncurrent"}],"rou_assets":[{"value":58}]})
  self.assertEqual((x["liability_total"],x["liability_current"],x["rou_total"]),(64,5,58))
 def test_operating_lease_excluded(self):
  x=lease_adjustment({"accounting_framework":"US_GAAP","lease_accounting_model":"ASC842_operating_finance_model",
   "lease_liabilities":[{"value":20,"maturity":"current","lease_type":"operating"}],"rou_assets":[{"value":18,"lease_type":"operating"}]})
  self.assertEqual((x["liability_total"],x["rou_total"]),(0,0))
 def test_finance_lease_reclassifies_current_liability_and_adds_rou_once(self):
  p={"minimum_eligible_cohort":5,"rankings":[{"symbol":"AAA","ranking_eligible":True,"ebit_candidate":100,"enterprise_value_candidate":500,"invested_capital_candidate":100}]}
  q={"items":[{"symbol":"AAA"}]};l={"issuers":[{"symbol":"AAA","accounting_framework":"US_GAAP","lease_accounting_model":"ASC842_operating_finance_model",
   "lease_liabilities":[{"value":10,"maturity":"current","lease_type":"finance"},{"value":20,"maturity":"noncurrent","lease_type":"finance"}],
   "rou_assets":[{"value":25,"lease_type":"finance"}],"embedded_rou_in_net_ppe":[]}]}
  r=build(p,q,l);base,adj=r["scenarios"][0]["rows"][0],r["scenarios"][1]["rows"][0]
  self.assertEqual(base["earnings_yield"],.2);self.assertAlmostEqual(adj["earnings_yield"],100/530);self.assertAlmostEqual(adj["return_on_capital"],100/135)
  self.assertFalse(r["scenarios"][1]["ranking_calculated"]);self.assertFalse(r["production_write"]);self.assertFalse(r["rankings_changed"])
 def test_portfolio_total_not_promoted_as_cash(self):
  p={"rankings":[{"symbol":"BBB","ranking_eligible":False}]};q={"items":[{"symbol":"BBB","filing_ev_scope_note_review":{"cash_policy_dimensions":{"portfolio_composition":{"reported_total_millions":900}}}}]}
  r=build(p,q,{"issuers":[]});self.assertEqual(r["issuer_policy_exposures"][0]["cash_like_amount_promoted"],0)
if __name__=="__main__":unittest.main()
