import test from "node:test";
import assert from "node:assert/strict";
import { buildLeaseRouCoverage, renderLeaseRouCoverageMarkdown } from "./build_lease_rou_coverage_report.mjs";
const row=(concept,label,value,index,extra={})=>({concept,label,index,dimension:false,values:{"2025-12-31":value},...extra});

test("classifies current/noncurrent operating and finance lease liabilities",()=>{
 const r=buildLeaseRouCoverage({companies:[{symbol:"PRDO",provider_status:"supported",filing:{period_of_report:"2025-12-31",accession_number:"a1"},
 statements:{balance_sheet:{rows:[
 row("us-gaap_OperatingLeaseRightOfUseAsset","Right of use assets, net - operating",43290000,18),
 row("us-gaap_FinanceLeaseRightOfUseAsset","Right of use assets, net - finance",10259000,19),
 row("us-gaap_OperatingLeaseLiabilityCurrent","Lease liabilities - operating",6032000,39),
 row("us-gaap_FinanceLeaseLiabilityCurrent","Lease liabilities - finance",5458000,40),
 row("us-gaap_OperatingLeaseLiabilityNoncurrent","Lease liabilities - operating",43752000,50),
 row("us-gaap_FinanceLeaseLiabilityNoncurrent","Lease liabilities - finance",6097000,51)
 ]}}}]});
 const x=r.issuers[0]; assert.equal(x.rou_assets.length,2); assert.equal(x.lease_liabilities.length,4);
 assert.equal(x.lease_liabilities[0].maturity,"current"); assert.equal(x.lease_liabilities[3].maturity,"noncurrent");
 assert.equal(x.lease_liabilities[0].lease_type,"operating"); assert.equal(r.production_write,false);
});
test("flags ROU embedded in combined PP&E without counting it separately",()=>{
 const r=buildLeaseRouCoverage({companies:[{symbol:"CRNC",provider_status:"supported",filing:{period_of_report:"2025-12-31"},statements:{balance_sheet:{rows:[
 row("us-gaap_PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization","Property and equipment, net",35761000,9),
 row("us-gaap_OperatingLeaseRightOfUseAsset","Operating lease right of use assets",16762000,15)
 ]}}}]});
 assert.equal(r.issuers[0].rou_assets.length,1); assert.equal(r.issuers[0].embedded_rou_in_net_ppe.length,1);
});
test("supports IFRS lease captions and excludes dimensional breakdowns",()=>{
 const r=buildLeaseRouCoverage({companies:[{symbol:"SGHC",provider_status:"supported",filing:{period_of_report:"2025-12-31"},statements:{balance_sheet:{rows:[
 row("ifrs-full_RightofuseAssets","Right-of-use assets",58000000,31),
 row("ifrs-full_CurrentLeaseLiabilities","Lease liabilities",5000000,84),
 row("ifrs-full_NoncurrentLeaseLiabilities","Lease liabilities",59000000,69),
 {...row("ifrs-full_RightofuseAssets","Leasehold property",10000000,32),dimension:true}
 ]}}}]});
 assert.equal(r.issuers[0].rou_assets.length,1); assert.equal(r.issuers[0].lease_liabilities.length,2);
 assert.equal(r.issuers[0].lease_liabilities.find(x=>x.maturity==="current").value,5000000);
});
test("missing selected-period values remain unknown, not zero",()=>{
 const r=buildLeaseRouCoverage({companies:[{symbol:"MISSING",provider_status:"supported",filing:{period_of_report:"2025-12-31"},statements:{balance_sheet:{rows:[
 {concept:"us-gaap_OperatingLeaseRightOfUseAsset",label:"Operating lease ROU asset",index:1,values:{"2024-12-31":9}}
 ]}}}]});
 assert.equal(r.issuers[0].rou_assets[0].value,null); assert.equal(r.summary.missing_rou_amount_rows,1);
});
test("markdown includes guardrails and issuer-level detail",()=>{
 const r=buildLeaseRouCoverage({companies:[{symbol:"TEST",provider_status:"supported",filing:{period_of_report:"2025-12-31"},statements:{balance_sheet:{rows:[
 row("us-gaap_OperatingLeaseLiabilityCurrent","Operating lease liability current",100,2)
 ]}}}]});
 const md=renderLeaseRouCoverageMarkdown(r); assert.match(md,/Missing rows or amounts are unknown/i);
 assert.match(md,/TEST/); assert.match(md,/production_write=false/);
});

test("scopes coverage counts to active universe and excludes regression controls",()=>{
 const extraction={companies:[
  {symbol:"PRDO",provider_status:"supported",filing:{period_of_report:"2025-12-31"},statements:{balance_sheet:{rows:[row("us-gaap_OperatingLeaseRightOfUseAsset","Operating lease ROU asset",100,1)]}}},
  {symbol:"ADBE",provider_status:"supported",filing:{period_of_report:"2025-11-28"},statements:{balance_sheet:{rows:[row("us-gaap_OperatingLeaseRightOfUseAsset","Operating lease ROU asset",200,1)]}}},
  {symbol:"AFMJF",provider_status:"unsupported_provider",filing:{},statements:{balance_sheet:{rows:[]}}}
 ]};
 const r=buildLeaseRouCoverage(extraction,{symbols:["PRDO","AFMJF"]});
 assert.deepEqual(r.issuers.map(x=>x.symbol),["AFMJF","PRDO"]);
 assert.equal(r.summary.active_universe_issuers,2);
 assert.equal(r.summary.extracted_supported_issuers,1);
 assert.equal(r.summary.out_of_universe_extraction_issuers,1);
 assert.deepEqual(r.out_of_universe_extraction_symbols,["ADBE"]);
});
