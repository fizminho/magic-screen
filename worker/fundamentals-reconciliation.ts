type MetricSet = { ebit:number; invested_capital:number; gross_debt:number; unrestricted_cash:number; enterprise_value:number; earnings_yield:number; return_on_capital:number; };
function finiteNumber(value:unknown):number|null { return typeof value==="number" && Number.isFinite(value)?value:null; }
function calculateMetrics(ebit:unknown,investedCapital:unknown,grossDebt:unknown,unrestrictedCash:unknown,marketCap:unknown):MetricSet|null {
  const values=[finiteNumber(ebit),finiteNumber(investedCapital),finiteNumber(grossDebt),finiteNumber(unrestrictedCash),finiteNumber(marketCap)];
  if(values.some(value=>value===null)) return null;
  const [e,invested,debt,cash,cap]=values as number[];
  if(invested<=0 || debt<0 || cash<0 || cap<=0) return null;
  const enterpriseValue=cap+debt-cash;
  if(!Number.isFinite(enterpriseValue)||enterpriseValue<=0) return null;
  return {ebit:e,invested_capital:invested,gross_debt:debt,unrestricted_cash:cash,enterprise_value:enterpriseValue,earnings_yield:e/enterpriseValue,return_on_capital:e/invested};
}

function inputDelta(legacy:number,edgar:number){return {legacy,edgartools:edgar,delta:edgar-legacy};}
function materiallyDifferent(values:Array<{delta:number}|null>):boolean{return values.some(value=>value!==null&&Math.abs(value.delta)>0.01);}
export function buildFundamentalsReconciliationPreview(rows:any[],asOf:string|null=null){
  const reconciliations=rows.map((row:any)=>{
    const edgar=row.edgar??{};
    const legacyStatus=String(row.legacy_status??"missing");
    const legacyPeriod=typeof row.legacy_fiscal_period==="string"?row.legacy_fiscal_period:null;
    const edgarPeriod=typeof edgar.fiscal_period==="string"?edgar.fiscal_period:null;
    const periodMatch=Boolean(legacyPeriod&&edgarPeriod&&legacyPeriod===edgarPeriod);
    const currentMarketCap=finiteNumber(row.current_market_cap);
    const legacyMarketCap=finiteNumber(row.legacy_market_cap);
    const legacyEbit=finiteNumber(row.legacy_ebit);
    const legacyGrossDebt=finiteNumber(row.legacy_total_debt);
    const legacyCash=finiteNumber(row.legacy_cash);
    const legacyInvestedCapital=finiteNumber(row.legacy_current_assets)!==null&&finiteNumber(row.legacy_current_liabilities)!==null&&finiteNumber(row.legacy_net_ppe)!==null
      ?Number(row.legacy_current_assets)-Number(row.legacy_current_liabilities)+Number(row.legacy_net_ppe):null;
    const legacyMetrics=legacyStatus==="calculated"?calculateMetrics(row.legacy_ebit,legacyInvestedCapital,row.legacy_total_debt,row.legacy_cash,currentMarketCap):null;
    const evReview=edgar.enterprise_value_candidate_review??{};
    const edgarInputsComplete=edgar.provider_status==="supported"&&edgar.reporting_currency==="USD"
      &&["direct_reported_candidate_review_only","filing_specific_reconstruction_review_only"].includes(String(edgar.ebit_status))
      &&edgar.invested_capital_status==="positive_denominator_candidate_review_only"
      &&evReview.conventional_debt_status==="identified_from_unique_current_and_noncurrent_components";
    const edgarMetrics=edgarInputsComplete?calculateMetrics(edgar.ebit_candidate,edgar.invested_capital_candidate,evReview.conventional_gross_debt_candidate,evReview.unrestricted_cash_candidate,currentMarketCap):null;
    const edgarEbit=finiteNumber(edgar.ebit_candidate);
    const edgarInvestedCapital=finiteNumber(edgar.invested_capital_candidate);
    const edgarGrossDebt=finiteNumber(evReview.conventional_gross_debt_candidate);
    const edgarCash=finiteNumber(evReview.unrestricted_cash_candidate);
    const partialInputDeltas=periodMatch?{
      ebit:legacyEbit!==null&&edgarEbit!==null?inputDelta(legacyEbit,edgarEbit):null,
      invested_capital:legacyInvestedCapital!==null&&edgarInvestedCapital!==null?inputDelta(legacyInvestedCapital,edgarInvestedCapital):null,
      gross_debt:legacyGrossDebt!==null&&edgarGrossDebt!==null?inputDelta(legacyGrossDebt,edgarGrossDebt):null,
      unrestricted_cash:legacyCash!==null&&edgarCash!==null?inputDelta(legacyCash,edgarCash):null,
    }:null;
    const partialDeltaValues=partialInputDeltas?[partialInputDeltas.ebit,partialInputDeltas.invested_capital,partialInputDeltas.gross_debt,partialInputDeltas.unrestricted_cash].filter((value:any)=>value!==null):[];
    const hasPartialInputDifferences=materiallyDifferent(partialDeltaValues);
    const mismatchReasons:string[]=[];
    if(legacyStatus!=="calculated") mismatchReasons.push("legacy_fundamentals_not_calculated");
    if(!legacyPeriod) mismatchReasons.push("legacy_fiscal_period_missing");
    if(!edgarPeriod) mismatchReasons.push("edgartools_fiscal_period_missing");
    if(legacyPeriod&&edgarPeriod&&!periodMatch) mismatchReasons.push("fiscal_period_mismatch");
    if(currentMarketCap===null||currentMarketCap<=0) mismatchReasons.push("current_market_cap_unavailable");
    if(legacyStatus==="calculated"&&legacyMetrics===null) mismatchReasons.push("legacy_metric_inputs_incomplete_or_invalid");
    if(edgar.provider_status!=="supported") mismatchReasons.push("edgartools_provider_not_supported");
    if(edgar.provider_status==="supported"&&!edgarInputsComplete) mismatchReasons.push("edgartools_accounting_inputs_incomplete");
    if(edgarInputsComplete&&edgarMetrics===null) mismatchReasons.push("edgartools_metric_inputs_incomplete_or_invalid");
    const metricsComparable=periodMatch&&legacyMetrics!==null&&edgarMetrics!==null;
    let status="comparable";
    if(legacyStatus!=="calculated") status="legacy_not_calculated";
    else if(!periodMatch) status="period_mismatch";
    else if(legacyMetrics===null) status="legacy_inputs_incomplete";
    else if(edgar.provider_status!=="supported") status="edgartools_unsupported_or_missing";
    else if(edgarMetrics===null) status="edgartools_inputs_incomplete";
    const inputDeltas=metricsComparable?{
      ebit:inputDelta(legacyMetrics!.ebit,edgarMetrics!.ebit),
      invested_capital:inputDelta(legacyMetrics!.invested_capital,edgarMetrics!.invested_capital),
      gross_debt:inputDelta(legacyMetrics!.gross_debt,edgarMetrics!.gross_debt),
      unrestricted_cash:inputDelta(legacyMetrics!.unrestricted_cash,edgarMetrics!.unrestricted_cash),
    }:null;
    const metricDeltas=metricsComparable?{
      enterprise_value:inputDelta(legacyMetrics!.enterprise_value,edgarMetrics!.enterprise_value),
      earnings_yield_percentage_points:(edgarMetrics!.earnings_yield-legacyMetrics!.earnings_yield)*100,
      return_on_capital_percentage_points:(edgarMetrics!.return_on_capital-legacyMetrics!.return_on_capital)*100,
    }:null;
    const inputDeltaValues=inputDeltas?[inputDeltas.ebit,inputDeltas.invested_capital,inputDeltas.gross_debt,inputDeltas.unrestricted_cash]:[];
    const reviewFlags=Array.isArray(edgar.review_flags)?[...edgar.review_flags]:[];
    if(legacyStatus!=="calculated") reviewFlags.push("legacy_fundamentals_not_calculated");
    if(legacyPeriod&&edgarPeriod&&!periodMatch) reviewFlags.push("legacy_edgartools_period_mismatch");
    if(legacyMarketCap!==null&&currentMarketCap!==null&&Math.abs(legacyMarketCap-currentMarketCap)>0.01) reviewFlags.push("legacy_market_cap_differs_from_current_snapshot");
    return {
      symbol:String(row.symbol??"UNKNOWN"),company_name:row.company_name??null,status,metrics_comparable:metricsComparable,period_match:periodMatch,
      legacy:{status:legacyStatus,source:row.legacy_source??null,fiscal_period:legacyPeriod,filed_at:row.legacy_filed_at??null,accession_available:false,
        ebit:legacyEbit,invested_capital:legacyInvestedCapital,gross_debt:legacyGrossDebt,cash:legacyCash,
        market_cap_at_calculation:legacyMarketCap,stored_earnings_yield:finiteNumber(row.legacy_stored_earnings_yield),
        stored_return_on_capital:finiteNumber(row.legacy_stored_return_on_capital),metrics:legacyMetrics},
      edgartools:{provider_status:edgar.provider_status??null,accession:edgar.accession??null,fiscal_period:edgarPeriod,form:edgar.filing_form??null,
        reporting_currency:edgar.reporting_currency??null,ebit_status:edgar.ebit_status??null,invested_capital_status:edgar.invested_capital_status??null,
        ebit_candidate:edgarEbit,invested_capital_candidate:edgarInvestedCapital,gross_debt_candidate:edgarGrossDebt,unrestricted_cash_candidate:edgarCash,
        review_flags:reviewFlags,metrics:edgarMetrics},
      current_market_cap:currentMarketCap,market_cap_updated_at:row.market_cap_updated_at??null,mismatch_reasons:mismatchReasons,
      input_deltas:inputDeltas,metric_deltas:metricDeltas,partial_input_deltas:partialInputDeltas,
      has_input_differences:materiallyDifferent(inputDeltaValues),has_partial_input_differences:hasPartialInputDifferences,
      production_approved:false,production_write:false,
    };
  });
  const count=(status:string)=>reconciliations.filter((row:any)=>row.status===status).length;
  const supportedRows=reconciliations.filter((row:any)=>row.edgartools.provider_status==="supported");
  const fieldCoverage=(rows:any[],field:string)=>rows.filter((row:any)=>row[field]!==null&&row[field]!==undefined).length;
  return {source:"legacy_stock_fundamentals_vs_edgartools_shadow",as_of:asOf,summary:{
    universe:reconciliations.length,legacy_calculated:reconciliations.filter((row:any)=>row.legacy.status==="calculated").length,
    edgartools_supported:reconciliations.filter((row:any)=>row.edgartools.provider_status==="supported").length,
    period_matched:reconciliations.filter((row:any)=>row.period_match).length,
    period_mismatched:reconciliations.filter((row:any)=>row.mismatch_reasons.includes("fiscal_period_mismatch")).length,
    metrics_comparable:reconciliations.filter((row:any)=>row.metrics_comparable).length,
    rows_with_input_differences:reconciliations.filter((row:any)=>row.has_input_differences).length,
    partial_input_comparison_rows:reconciliations.filter((row:any)=>row.partial_input_deltas&&Object.values(row.partial_input_deltas).some((value:any)=>value!==null)).length,
    rows_with_partial_input_differences:reconciliations.filter((row:any)=>row.has_partial_input_differences).length,
    legacy_debt_missing_supported:supportedRows.filter((row:any)=>row.legacy.gross_debt===null).length,
    legacy_field_coverage:{
      ebit:fieldCoverage(supportedRows.map((row:any)=>row.legacy),"ebit"),
      invested_capital:fieldCoverage(supportedRows.map((row:any)=>row.legacy),"invested_capital"),
      gross_debt:fieldCoverage(supportedRows.map((row:any)=>row.legacy),"gross_debt"),
      cash:fieldCoverage(supportedRows.map((row:any)=>row.legacy),"cash"),
    },
    edgartools_field_coverage:{
      ebit:fieldCoverage(supportedRows.map((row:any)=>row.edgartools),"ebit_candidate"),
      invested_capital:fieldCoverage(supportedRows.map((row:any)=>row.edgartools),"invested_capital_candidate"),
      gross_debt:fieldCoverage(supportedRows.map((row:any)=>row.edgartools),"gross_debt_candidate"),
      cash:fieldCoverage(supportedRows.map((row:any)=>row.edgartools),"unrestricted_cash_candidate"),
    },
    legacy_not_calculated:count("legacy_not_calculated"),legacy_inputs_incomplete:count("legacy_inputs_incomplete"),
    edgartools_unsupported_or_missing:count("edgartools_unsupported_or_missing"),edgartools_inputs_incomplete:count("edgartools_inputs_incomplete"),
  },rows:reconciliations,production_fundamentals_changed:false,rankings_changed:false,production_write:false,
  guardrail:"Read-only reconciliation. Both sides use the current market-cap snapshot for metric comparison; fiscal-period mismatches are never treated as directly comparable. No production values, ratios, eligibility or rankings are written."};
}
