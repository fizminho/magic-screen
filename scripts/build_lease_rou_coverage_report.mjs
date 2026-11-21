import fs from "node:fs";
function valueAt(row, period) {
  const v = row?.values?.[period];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
export function buildLeaseRouCoverage(extraction, universe = null) {
  const universeSymbols = Array.isArray(universe?.symbols) ? new Set(universe.symbols) : null;
  const issuers = (extraction?.companies ?? []).filter(c => c && typeof c.symbol === "string").map(c => {
    const period = c.filing?.period_of_report ?? c.filing?.report_date ?? null;
    const currency = c.reporting_currency_review?.currency ?? c.reporting_currency ?? "unknown";
    const rou = [], leases = [], embedded = [], unclassified = [];
    for (const r of c.statements?.balance_sheet?.rows ?? []) {
      if (!r || r.dimension === true || r.is_breakdown === true || r.abstract === true) continue;
      const concept = String(r.concept ?? ""), label = String(r.label ?? "");
      const text = (concept + " " + label).toLowerCase();
      const item = { concept, label, value: period ? valueAt(r, period) : null, fiscal_period: period,
        row_index: Number.isInteger(r.index) ? r.index : null, currency };
      if (/PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAsset/i.test(concept)) {
        embedded.push({ ...item, disposition: "embedded_in_net_ppe_do_not_add_again" }); continue;
      }
      if (/right.?of.?use asset|rightofuseasset|rightofuseassets/i.test(text)) {
        rou.push({ ...item, lease_type: /finance/i.test(text) ? "finance" : /operat/i.test(text) ? "operating" : "unspecified" }); continue;
      }
      if (/lease liabilities|lease liability|lease obligations|lease obligation/i.test(text) || /LeaseLiabilit|LeaseObligation/i.test(concept)) {
        const type = /finance/i.test(text) ? "finance" : /operat/i.test(text) ? "operating" : "unspecified";
        const maturity = /noncurrent|long.term|net of current|less current/i.test(text) ? "noncurrent" : /current/i.test(text) ? "current" : "unspecified";
        const row = { ...item, lease_type: type, maturity }; leases.push(row);
        if (type === "unspecified" || maturity === "unspecified") unclassified.push(row);
      }
    }
    return { symbol:c.symbol, company_name:c.filing?.company ?? null, provider_status:c.provider_status ?? null,
      accession:c.filing?.accession_number ?? c.filing?.accession_no ?? null, fiscal_period:period,
      form:c.filing?.form ?? null, currency, rou_assets:rou, lease_liabilities:leases,
      embedded_rou_in_net_ppe:embedded, unclassified_lease_liabilities:unclassified };
  }).sort((a,b)=>a.symbol.localeCompare(b.symbol));
  const supported = issuers.filter(x=>x.provider_status==="supported");
  const rou = supported.flatMap(x=>x.rou_assets), leases=supported.flatMap(x=>x.lease_liabilities), embedded=supported.flatMap(x=>x.embedded_rou_in_net_ppe);
  return { generated_at:new Date().toISOString(), primary_provider:extraction?.primary_provider ?? null,
    summary:{ active_universe_issuers:issuers.length, supported_active_issuers:supported.length,
      unsupported_active_issuers:issuers.filter(x=>x.provider_status==="unsupported_provider").length,
      issuers_with_separately_reported_rou_assets:supported.filter(x=>x.rou_assets.length).length,
      issuers_with_lease_liability_rows:supported.filter(x=>x.lease_liabilities.length).length,
      issuers_with_rou_embedded_in_net_ppe:supported.filter(x=>x.embedded_rou_in_net_ppe.length).length,
      rou_asset_rows:rou.length, lease_liability_rows:leases.length, embedded_rou_in_net_ppe_rows:embedded.length,
      missing_rou_amount_rows:rou.filter(x=>x.value===null).length,
      missing_lease_liability_amount_rows:leases.filter(x=>x.value===null).length,
      unclassified_lease_liability_rows:supported.reduce((n,x)=>n+x.unclassified_lease_liabilities.length,0) },
    issuers, production_write:false, production_approved:false, production_fundamentals_changed:false, rankings_changed:false,
    guardrail:"Filing-period-bound evidence coverage only. Missing values remain unknown. ROU assets embedded in combined PP&E concepts are not counted separately. No lease/ROU formula, EV, ROC or ranking is approved or changed." };
}
export function renderLeaseRouCoverageMarkdown(report) {
  const lines=["# US MFI lease and ROU evidence coverage","","Generated: "+report.generated_at,"",
    "Evidence inventory only. Amounts remain in each filing's reported currency and units.","",
    "## Coverage summary","","| Measure | Count |","|---|---:|"];
  for(const [k,v] of Object.entries(report.summary)) lines.push("| "+k.replaceAll("_"," ")+" | "+v+" |");
  lines.push("","## Issuer-level evidence","","| Symbol | Period | Currency | ROU rows | Lease-liability rows | Embedded ROU in PP&E | Unclassified lease rows |","|---|---|---|---:|---:|---:|---:|");
  for(const x of report.issuers) lines.push("| "+[x.symbol,x.fiscal_period??"unknown",x.currency,x.rou_assets.length,x.lease_liabilities.length,x.embedded_rou_in_net_ppe.length,x.unclassified_lease_liabilities.length].join(" | ")+" |");
  lines.push("","## Detailed evidence","");
  for(const x of report.issuers) {
    if(!x.rou_assets.length&&!x.lease_liabilities.length&&!x.embedded_rou_in_net_ppe.length) continue;
    lines.push("### "+x.symbol+" ("+(x.fiscal_period??"period unknown")+")","","| Type | Classification | Maturity | Amount | Concept / label | Row |","|---|---|---|---:|---|---:|");
    for(const r of x.rou_assets) lines.push("| ROU asset | "+r.lease_type+" | n/a | "+(r.value??"unknown")+" | "+r.concept+" / "+r.label+" | "+(r.row_index??"?")+" |");
    for(const r of x.lease_liabilities) lines.push("| Lease liability | "+r.lease_type+" | "+r.maturity+" | "+(r.value??"unknown")+" | "+r.concept+" / "+r.label+" | "+(r.row_index??"?")+" |");
    for(const r of x.embedded_rou_in_net_ppe) lines.push("| Embedded ROU | finance / combined PP&E | n/a | "+(r.value??"unknown")+" | "+r.concept+" / "+r.label+" | "+(r.row_index??"?")+" |");
    lines.push("");
  }
  lines.push("production_write=false; production_approved=false; production_fundamentals_changed=false; rankings_changed=false.","");
  lines.push("## Guardrails","","- Missing rows or amounts are unknown, not zero.","- Rows use the selected annual filing period only.",
    "- Dimensional breakdowns are excluded.","- Combined PP&E / finance-lease ROU concepts are flagged to prevent double counting.",
    "- Do not add ROU assets alone. Any lease-inclusive ROC/EV scenario needs matching EBIT and liability treatment and remains sensitivity-only.",
    "",report.guardrail,"");
  return lines.join("\n");
}
if (process.argv[1] && import.meta.url === new URL("file://"+process.argv[1]).href) {
  const input=process.argv[2]??"edgartools-bakeoff.json", jsonOut=process.argv[3]??"lease-rou-coverage.json", mdOut=process.argv[4]??"lease-rou-coverage.md", universePath=process.argv[5];
  const universe=universePath && fs.existsSync(universePath) ? JSON.parse(fs.readFileSync(universePath,"utf8")) : null;
  const report=buildLeaseRouCoverage(JSON.parse(fs.readFileSync(input,"utf8")), universe);
  fs.writeFileSync(jsonOut,JSON.stringify(report,null,2)+"\n");
  fs.writeFileSync(mdOut,renderLeaseRouCoverageMarkdown(report)+"\n");
  console.log("Built lease/ROU evidence coverage for "+report.summary.supported_active_issuers+" supported issuers; production unchanged.");
}
