#!/usr/bin/env python3
"""Read-only US MFI lease/cash policy sensitivity report."""
from __future__ import annotations
import argparse,json
from pathlib import Path
from typing import Any

def num(v:Any)->bool: return isinstance(v,(int,float)) and not isinstance(v,bool)
def ordinal(v:dict[str,float])->dict[str,float]:
 o=sorted(v,key=lambda s:(-v[s],s)); out={}; i=0
 while i<len(o):
  j=i+1
  while j<len(o) and v[o[j]]==v[o[i]]: j+=1
  for s in o[i:j]: out[s]=((i+1)+j)/2
  i=j
 return out
def lease_adjustment(x:dict[str,Any]|None)->dict[str,Any]:
 if not x:return {"status":"lease_evidence_unavailable","liability_total":None,"liability_current":None,"rou_total":None}
 all_leases=x.get("accounting_framework")=="IFRS" or x.get("lease_accounting_model")=="IFRS16_single_lessee_model"
 ls=[r for r in x.get("lease_liabilities",[]) if all_leases or r.get("lease_type")=="finance"]
 rs=[r for r in x.get("rou_assets",[]) if all_leases or r.get("lease_type")=="finance"]
 if not ls and not rs:return {"status":"no_debt_like_lease_adjustment_under_proposed_policy","liability_total":0.0,"liability_current":0.0,"rou_total":0.0}
 if any(not num(r.get("value")) for r in ls+rs):return {"status":"incomplete_lease_amounts","liability_total":None,"liability_current":None,"rou_total":None}
 return {"status":"calculated_framework_aware_candidate","liability_total":sum(r["value"] for r in ls),
 "liability_current":sum(r["value"] for r in ls if r.get("maturity")=="current"),"rou_total":sum(r["value"] for r in rs)}
def scenario(rows:list[dict[str,Any]],key:str,minimum:int)->dict[str,Any]:
 out=[]
 for x in rows:
  ev=x[key].get("enterprise_value"); ic=x[key].get("invested_capital"); e=x["ebit"]
  if all(num(v) for v in (ev,ic,e)) and ev>0 and ic>0:out.append({"symbol":x["symbol"],"earnings_yield":e/ev,"return_on_capital":e/ic})
 ready=len(out)>=minimum
 if ready:
  ey=ordinal({x["symbol"]:x["earnings_yield"] for x in out}); roc=ordinal({x["symbol"]:x["return_on_capital"] for x in out})
  for x in out:x.update({"earnings_yield_rank":ey[x["symbol"]],"return_on_capital_rank":roc[x["symbol"]],"combined_score":ey[x["symbol"]]+roc[x["symbol"]]})
  prev=None; rank=0
  for i,x in enumerate(sorted(out,key=lambda z:(z["combined_score"],z["symbol"]))):
   if prev is None or x["combined_score"]!=prev:rank=i+1
   x["scenario_rank"]=rank;prev=x["combined_score"]
 else:
  for x in out:x.update({"earnings_yield_rank":None,"return_on_capital_rank":None,"combined_score":None,"scenario_rank":None})
 return {"scenario":key,"rows":out,"cohort_size":len(out),"ranking_calculated":ready,
 "ranking_blocker":None if ready else f"Only {len(out)} eligible candidates; minimum is {minimum}.","sensitivity_only":True,"production_write":False}
def build(p:dict[str,Any],q:dict[str,Any],l:dict[str,Any])->dict[str,Any]:
 qm={x["symbol"]:x for x in q.get("items",[])}; lm={x["symbol"]:x for x in l.get("issuers",[])}
 cand=[]; exposures=[]
 for r in p.get("rankings",[]):
  s=r.get("symbol"); adj=lease_adjustment(lm.get(s)); ev,ic,e=r.get("enterprise_value_candidate"),r.get("invested_capital_candidate"),r.get("ebit_candidate")
  if r.get("ranking_eligible") is True and all(num(v) for v in (ev,ic,e)):
   base={"enterprise_value":float(ev),"invested_capital":float(ic)}; lease=dict(base)
   if adj["status"]=="calculated_framework_aware_candidate":
    lease["enterprise_value"]+=adj["liability_total"]
    lease["invested_capital"]+=adj["liability_current"]+adj["rou_total"]
   elif adj["status"]!="no_debt_like_lease_adjustment_under_proposed_policy":lease={"enterprise_value":None,"invested_capital":None}
   cand.append({"symbol":s,"ebit":float(e),"current_candidate_policy":base,"framework_aware_lease_policy":lease,"unrestricted_cash_only":dict(base)})
  cr=(qm.get(s,{ }).get("filing_ev_scope_note_review") or {}).get("cash_policy_dimensions") or {}
  portfolio=cr.get("portfolio_composition") or {}; li=lm.get(s) or {}
  exposures.append({"symbol":s,"eligibility_status":r.get("eligibility_status"),"lease_framework":li.get("accounting_framework"),
   "lease_accounting_model":li.get("lease_accounting_model"),"lease_adjustment_status":adj["status"],
   "debt_like_lease_liability_candidate":adj["liability_total"],"current_debt_like_lease_liability_candidate":adj["liability_current"],
   "separate_rou_asset_candidate":adj["rou_total"],"embedded_rou_rows_not_added":len(li.get("embedded_rou_in_net_ppe") or []),
   "reported_marketable_portfolio_millions":portfolio.get("reported_total_millions"),"cash_like_amount_promoted":0})
 minimum=int(p.get("minimum_eligible_cohort") or 5)
 return {"as_of":p.get("as_of"),"minimum_eligible_cohort":minimum,"eligible_candidate_count":len(cand),
 "eligible_candidate_symbols":[x["symbol"] for x in cand],
 "scenarios":[scenario(cand,k,minimum) for k in ("current_candidate_policy","framework_aware_lease_policy","unrestricted_cash_only")],
 "issuer_policy_exposures":exposures,
 "cash_policy":{"baseline":"Unrestricted cash and cash equivalents only.","marketable_securities":"No portfolio total promoted; original maturity, convertibility, value risk and restriction evidence required.","restricted_cash_and_customer_escrow":"Excluded."},
 "lease_policy":{"US_GAAP_operating":"Exclude lease liability from EV and separate ROU from IC; operating rent remains in EBIT.",
 "US_GAAP_finance":"Add finance liabilities to EV; add current liabilities back to IC and separate finance ROU once.",
 "IFRS16":"Add recognized liabilities to EV; add current liabilities back to IC and separate ROU once.",
 "embedded_ROU":"Never add separately when already in net PP&E.",
 "assumption":"Baseline EV excludes leases; baseline IC subtracts current liabilities including current lease liabilities."},
 "guardrail":"Read-only policy sensitivity. No approval, resolver override or production change.",
 "production_write":False,"production_fundamentals_changed":False,"rankings_changed":False}
def render(r:dict[str,Any])->str:
 lines=["# US MFI lease and cash policy sensitivity","",f"As of: {r.get('as_of')}",f"Eligible candidates: {r['eligible_candidate_count']} (minimum: {r['minimum_eligible_cohort']})",""]
 for s in r["scenarios"]:
  lines += [f"## {s['scenario'].replace('_',' ').title()}",f"Candidates: {s['cohort_size']}; ranking calculated: {s['ranking_calculated']}",s["ranking_blocker"] or "Minimum cohort met.","","| Symbol | EY | ROC | Rank |","|---|---:|---:|---:|"]
  for x in s["rows"]:
   ey="n/a" if x["earnings_yield"] is None else f"{x['earnings_yield']:.2%}"; roc="n/a" if x["return_on_capital"] is None else f"{x['return_on_capital']:.2%}"
   lines.append(f"| {x['symbol']} | {ey} | {roc} | {x['scenario_rank'] if x['scenario_rank'] is not None else 'not ranked'} |")
  lines.append("")
 lines += ["## Issuer policy exposure","","| Symbol | Framework | Lease liability | Current liability | ROU | Cash-like promoted |","|---|---|---:|---:|---:|---:|"]
 for x in r["issuer_policy_exposures"]:
  f=lambda v:"unknown" if v is None else f"{v/1e6:.3f}m"
  lines.append(f"| {x['symbol']} | {x['lease_framework'] or 'unknown'} | {f(x['debt_like_lease_liability_candidate'])} | {f(x['current_debt_like_lease_liability_candidate'])} | {f(x['separate_rou_asset_candidate'])} | 0 |")
 lines += ["","- Portfolio totals are not cash equivalents without instrument-level proof.","- Restricted cash and customer escrow are excluded.","- Embedded ROU is not added twice.","- Current financing lease liabilities are reclassified out of operating working capital before adding ROU.","- Rankings are withheld below the minimum eligible cohort.","",r["guardrail"],""]
 return "\n".join(lines)
def main()->int:
 a=argparse.ArgumentParser();a.add_argument("--preview",type=Path,default=Path("edgartools-mfi-ranking-preview.json"));a.add_argument("--queue",type=Path,default=Path("accounting-review-queue.json"));a.add_argument("--leases",type=Path,default=Path("lease-rou-coverage.json"));a.add_argument("--json-out",type=Path,default=Path("mfi-ranking-sensitivity.json"));a.add_argument("--markdown-out",type=Path,default=Path("mfi-ranking-sensitivity.md"));x=a.parse_args()
 r=build(json.loads(x.preview.read_text()),json.loads(x.queue.read_text()),json.loads(x.leases.read_text()));x.json_out.write_text(json.dumps(r,indent=2)+"\n");x.markdown_out.write_text(render(r))
 print(f"Built 3 read-only policy scenarios for {r['eligible_candidate_count']} eligible candidates; production unchanged.");return 0
if __name__=="__main__":raise SystemExit(main())
