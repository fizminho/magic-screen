import unittest
from validate_fundamentals_reconciliation import validate

def report_fixture():
    row={"symbol":"TEST","status":"comparable","metrics_comparable":True,"period_match":True,
      "legacy":{"status":"calculated","accession_available":False,"metrics":{"ebit":10}},
      "edgartools":{"provider_status":"supported","metrics":{"ebit":10}},
      "mismatch_reasons":[],"input_deltas":{"ebit":{"delta":0}},"metric_deltas":{"earnings_yield_percentage_points":0},
      "has_input_differences":False,"production_approved":False,"production_write":False}
    return {"summary":{"universe":1,"legacy_calculated":1,"edgartools_supported":1,"period_matched":1,"period_mismatched":0,
      "metrics_comparable":1,"rows_with_input_differences":0},"rows":[row],"production_fundamentals_changed":False,"rankings_changed":False,"production_write":False}

class ReconciliationValidatorTests(unittest.TestCase):
    def test_valid_report(self): self.assertEqual(validate(report_fixture()),[])
    def test_rejects_production_write(self):
        r=report_fixture();r["production_write"]=True
        self.assertTrue(any("production_write=false" in e for e in validate(r)))
    def test_period_mismatch_has_no_deltas(self):
        r=report_fixture();x=r["rows"][0];x.update({"period_match":False,"metrics_comparable":False,"status":"period_mismatch","mismatch_reasons":["fiscal_period_mismatch"],"input_deltas":None,"metric_deltas":None})
        r["summary"].update({"period_matched":0,"period_mismatched":1,"metrics_comparable":0})
        self.assertEqual(validate(r),[])
    def test_unsupported_provider_cannot_be_comparable(self):
        r=report_fixture();r["rows"][0]["edgartools"]["provider_status"]="unsupported_provider"
        self.assertTrue(any("unsupported provider" in e for e in validate(r)))
    def test_duplicate_symbols_rejected(self):
        r=report_fixture();r["rows"].append(dict(r["rows"][0]));r["summary"]["universe"]=2
        self.assertTrue(any("duplicate symbols" in e for e in validate(r)))

if __name__=="__main__": unittest.main()
