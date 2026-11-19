interface Env { DB: D1Database; ASSETS: Fetcher; APP_ENV?: string; UNIVERSE_SYNC_TOKEN?: string; MFI_SESSION_COOKIE?: string; }
const symbols: Record<string, {symbol:string;name:string;market:"MY"|"US";currency:string}[]> = {
  MY: [
    {symbol:"1155.KL",name:"Maybank",market:"MY",currency:"MYR"},{symbol:"1295.KL",name:"Public Bank",market:"MY",currency:"MYR"},
    {symbol:"1023.KL",name:"CIMB Group",market:"MY",currency:"MYR"},{symbol:"5183.KL",name:"Petronas Chemicals",market:"MY",currency:"MYR"},
    {symbol:"5347.KL",name:"Tenaga Nasional",market:"MY",currency:"MYR"},{symbol:"5819.KL",name:"Hong Leong Bank",market:"MY",currency:"MYR"},
    {symbol:"4863.KL",name:"Telekom Malaysia",market:"MY",currency:"MYR"},{symbol:"5225.KL",name:"IHH Healthcare",market:"MY",currency:"MYR"},
    {symbol:"1066.KL",name:"RHB Bank",market:"MY",currency:"MYR"},{symbol:"6888.KL",name:"Axiata Group",market:"MY",currency:"MYR"},
    {symbol:"6033.KL",name:"Petronas Gas",market:"MY",currency:"MYR"},{symbol:"4707.KL",name:"Nestle Malaysia",market:"MY",currency:"MYR"},
    {symbol:"8869.KL",name:"Press Metal",market:"MY",currency:"MYR"},{symbol:"1082.KL",name:"Hong Leong Financial",market:"MY",currency:"MYR"},
    {symbol:"6012.KL",name:"Maxis",market:"MY",currency:"MYR"},{symbol:"1961.KL",name:"IOI Corporation",market:"MY",currency:"MYR"},
    {symbol:"7277.KL",name:"Dialog Group",market:"MY",currency:"MYR"},{symbol:"5681.KL",name:"Petronas Dagangan",market:"MY",currency:"MYR"},
    {symbol:"5285.KL",name:"Sime Darby Plantation",market:"MY",currency:"MYR"},{symbol:"5211.KL",name:"Sunway",market:"MY",currency:"MYR"},
    {symbol:"1818.KL",name:"Bursa Malaysia",market:"MY",currency:"MYR"},{symbol:"5209.KL",name:"Farm Fresh",market:"MY",currency:"MYR"},
    {symbol:"5296.KL",name:"MR D.I.Y. Group",market:"MY",currency:"MYR"},{symbol:"5168.KL",name:"AMMB Holdings",market:"MY",currency:"MYR"},
    {symbol:"4197.KL",name:"Sime Darby",market:"MY",currency:"MYR"},{symbol:"5878.KL",name:"KPJ Healthcare",market:"MY",currency:"MYR"},
    {symbol:"5227.KL",name:"IGB Real Estate Investment Trust",market:"MY",currency:"MYR"},{symbol:"5398.KL",name:"Gamuda",market:"MY",currency:"MYR"},
    {symbol:"5288.KL",name:"UEM Sunrise",market:"MY",currency:"MYR"},{symbol:"5218.KL",name:"Vantris Energy",market:"MY",currency:"MYR"}
  ],
  US: [
    {symbol:"AAPL",name:"Apple",market:"US",currency:"USD"},{symbol:"MSFT",name:"Microsoft",market:"US",currency:"USD"},{symbol:"NVDA",name:"NVIDIA",market:"US",currency:"USD"},
    {symbol:"GOOGL",name:"Alphabet",market:"US",currency:"USD"},{symbol:"AMZN",name:"Amazon",market:"US",currency:"USD"},{symbol:"META",name:"Meta Platforms",market:"US",currency:"USD"},
    {symbol:"AVGO",name:"Broadcom",market:"US",currency:"USD"},{symbol:"TSM",name:"Taiwan Semiconductor ADR",market:"US",currency:"USD"},{symbol:"LLY",name:"Eli Lilly",market:"US",currency:"USD"},
    {symbol:"BRK-B",name:"Berkshire Hathaway",market:"US",currency:"USD"},{symbol:"JPM",name:"JPMorgan Chase",market:"US",currency:"USD"},
    {symbol:"V",name:"Visa",market:"US",currency:"USD"},{symbol:"MA",name:"Mastercard",market:"US",currency:"USD"},
    {symbol:"XOM",name:"Exxon Mobil",market:"US",currency:"USD"},{symbol:"COST",name:"Costco",market:"US",currency:"USD"},
    {symbol:"WMT",name:"Walmart",market:"US",currency:"USD"},{symbol:"ORCL",name:"Oracle",market:"US",currency:"USD"},
    {symbol:"CRM",name:"Salesforce",market:"US",currency:"USD"},{symbol:"NFLX",name:"Netflix",market:"US",currency:"USD"},
    {symbol:"AMD",name:"Advanced Micro Devices",market:"US",currency:"USD"},{symbol:"QCOM",name:"Qualcomm",market:"US",currency:"USD"},
    {symbol:"TXN",name:"Texas Instruments",market:"US",currency:"USD"},{symbol:"CAT",name:"Caterpillar",market:"US",currency:"USD"},
    {symbol:"MU",name:"Micron Technology",market:"US",currency:"USD"},{symbol:"KO",name:"Coca-Cola",market:"US",currency:"USD"},
    {symbol:"PG",name:"Procter & Gamble",market:"US",currency:"USD"},{symbol:"ABBV",name:"AbbVie",market:"US",currency:"USD"},
    {symbol:"ADBE",name:"Adobe",market:"US",currency:"USD"},{symbol:"INTU",name:"Intuit",market:"US",currency:"USD"},{symbol:"TSLA",name:"Tesla",market:"US",currency:"USD"}
  ]
};
const json = (data: unknown, status=200) => new Response(JSON.stringify(data), {status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*"}});
async function ensureSchema(env: Env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS stock_snapshot (
      symbol TEXT NOT NULL, market TEXT NOT NULL CHECK (market IN ('MY','US')), company_name TEXT NOT NULL, currency TEXT NOT NULL,
      price REAL, change_percent REAL, market_cap REAL, earnings_yield REAL, return_on_capital REAL, magic_formula_rank INTEGER,
      shariah_status TEXT NOT NULL DEFAULT 'unverified', shariah_source TEXT, shariah_as_of TEXT,
      data_status TEXT NOT NULL DEFAULT 'unavailable', provider TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (symbol,market)
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_stock_snapshot_market_rank ON stock_snapshot(market, magic_formula_rank)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS refresh_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, completed_at TEXT, status TEXT NOT NULL, message TEXT
    )`)
  ]);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS stock_master (symbol TEXT NOT NULL, market TEXT NOT NULL, company_name TEXT NOT NULL, currency TEXT NOT NULL, exchange TEXT, sector TEXT, listing_status TEXT NOT NULL DEFAULT 'active', source TEXT NOT NULL, source_updated_at TEXT NOT NULL, PRIMARY KEY(symbol,market))").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_stock_master_market_name ON stock_master(market,company_name)").run();
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sec_company_map (symbol TEXT PRIMARY KEY, cik TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS stock_fundamentals (
      symbol TEXT NOT NULL, market TEXT NOT NULL DEFAULT 'US', cik TEXT, ebit REAL, current_assets REAL,
      current_liabilities REAL, net_ppe REAL, total_debt REAL, cash REAL, market_cap REAL,
      earnings_yield REAL, return_on_capital REAL, fiscal_period TEXT, filed_at TEXT,
      status TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'SEC EDGAR Company Facts', updated_at TEXT NOT NULL,
      PRIMARY KEY(symbol,market)
    )`)
  ]);
  const now = new Date().toISOString();
  for (const market of ["MY","US"] as const) {
    const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM stock_master WHERE market=?").bind(market).first<{count:number}>();
    if (!existing?.count) {
      const seed = symbols[market].map(item =>
        env.DB.prepare("INSERT OR IGNORE INTO stock_master (symbol,market,company_name,currency,exchange,listing_status,source,source_updated_at) VALUES (?,?,?,?,?,'active','curated-starter-universe',?)")
          .bind(item.symbol,item.market,item.name,item.currency,market==="MY"?"BURSA":"NASDAQ/NYSE",now)
      );
      await env.DB.batch(seed);
    }
  }
}
async function refreshQuotes(env: Env, onlyMarket?: "MY" | "US") {
  await ensureSchema(env);
  const started = new Date().toISOString();
  const log = await env.DB.prepare("INSERT INTO refresh_log (started_at,status,message) VALUES (?, 'running', 'Yahoo Finance quote batch refresh')").bind(started).run();
  let updated=0, failed=0;
  const markets = onlyMarket ? [onlyMarket] : ["MY","US"];
  for (const market of markets) {
    const priority = symbols[market].map(item=>"\u0027"+item.symbol.replaceAll("\u0027","\u0027\u0027")+"\u0027").join(",");
    const candidates = await env.DB.prepare("SELECT m.symbol,m.market,m.company_name AS name,m.currency FROM stock_master m LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market=m.market WHERE m.market=? AND m.listing_status=\u0027active\u0027 ORDER BY CASE WHEN m.symbol IN ("+priority+") THEN 0 ELSE 1 END,CASE WHEN q.updated_at IS NULL THEN 0 ELSE 1 END,q.updated_at ASC,m.symbol ASC LIMIT 40").bind(market).all<any>();
    for (const item of candidates.results) {
      try {
        const url = "https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(item.symbol)+"?range=5d&interval=1d";
        const res = await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 MagicScreen/0.1"}});
        if (!res.ok) throw new Error("Quote provider HTTP "+res.status);
        const payload: any = await res.json();
        const result = payload?.chart?.result?.[0], meta = result?.meta, quote = result?.indicators?.quote?.[0];
        const closes = (quote?.close ?? []).filter((v:any)=>typeof v==="number");
        const price = typeof meta?.regularMarketPrice==="number" ? meta.regularMarketPrice : closes.at(-1) ?? null;
        // chartPreviousClose can refer to the close before the full 5-day chart range.
        // Prefer the previous-session close; otherwise use the penultimate daily candle.
        const previous = typeof meta?.previousClose==="number" ? meta.previousClose
          : typeof meta?.regularMarketPreviousClose==="number" ? meta.regularMarketPreviousClose
          : closes.length>1 ? closes.at(-2)
          : typeof meta?.chartPreviousClose==="number" ? meta.chartPreviousClose : null;
        const change = price!=null && previous!=null && previous>0 ? ((price-previous)/previous)*100 : null;
        if (price==null) throw new Error("No quote in provider response");
        await env.DB.prepare("INSERT INTO stock_snapshot (symbol,market,company_name,currency,price,change_percent,shariah_status,data_status,provider,updated_at) VALUES (?,?,?,?,?,?,'unverified','quote_only','Yahoo Finance',?) ON CONFLICT(symbol,market) DO UPDATE SET company_name=excluded.company_name,currency=excluded.currency,price=excluded.price,change_percent=excluded.change_percent,data_status=CASE WHEN earnings_yield IS NOT NULL AND return_on_capital IS NOT NULL THEN 'fundamentals_calculated' ELSE 'quote_only' END,provider=excluded.provider,updated_at=excluded.updated_at").bind(item.symbol,item.market,item.name,item.currency,price,change,new Date().toISOString()).run();
        updated++;
      } catch { failed++; }
    }
  }
  const cutoff = new Date(Date.now()-24*60*60*1000).toISOString();
  const remaining = await env.DB.prepare("SELECT COUNT(*) AS count FROM stock_master m LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market=m.market WHERE m.listing_status='active' AND (? IS NULL OR m.market=?) AND (q.updated_at IS NULL OR q.updated_at < ?)").bind(onlyMarket ?? null,onlyMarket ?? null,cutoff).first();
  await env.DB.prepare("UPDATE refresh_log SET completed_at=?,status=?,message=? WHERE id=?").bind(new Date().toISOString(),failed===0?"success":"partial","Updated "+updated+"; failed "+failed+"; stale or missing "+(remaining?.count ?? 0),log.meta.last_row_id).run();
  return {updated,failed,remaining:remaining?.count ?? 0,batchSize:40};
}
// INTENTIONAL: MFI market cap is USD. Keep SEC inputs USD-only until explicit FX conversion
// (with a dated, auditable rate source) exists; missing local-currency facts must stay unavailable.
function secFactValue(facts:any, tags:string[], periodEnd:string, annual:boolean): {value:number|null;tag:string|null;filed:string|null} {
  const taxonomies=["us-gaap","ifrs-full"];
  for (const taxonomy of taxonomies) {
  const concepts=facts?.facts?.[taxonomy] ?? {};
  for (const tag of tags) {
    const units=concepts[tag]?.units ?? {};
    // Market capitalisation from MFI is USD. Only use SEC facts explicitly tagged in USD;
    // never mix an issuer's local-currency facts into USD valuation formulas.
    const entries=(units.USD ?? []) as any[];
    const eligible=entries.filter((x:any)=>{
      if (typeof x.val!=="number" || !x.end || !x.filed || !["10-K","20-F","40-F","10-Q"].includes(x.form)) return false;
      if (annual) {
        // INTENTIONAL: annual income-statement facts must match the selected fiscal year end exactly.
        // Do not silently reuse an older EBIT fact when the latest filing uses an unsupported XBRL tag.
        if (x.end!==periodEnd || !x.start) return false;
        const days=(Date.parse(x.end)-Date.parse(x.start))/86400000;
        return days>=330 && days<=400 && ["10-K","20-F","40-F"].includes(x.form);
      }
      if (x.end>periodEnd) return false;
      return !x.start && (Date.parse(periodEnd)-Date.parse(x.end))/86400000<=120;
    }).sort((a:any,b:any)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed));
    if (eligible.length) return {value:eligible[0].val,tag,filed:eligible[0].filed};
  }
  }
  return {value:null,tag:null,filed:null};
}

async function syncUsFundamentals(env:Env, limit=10) {
  await ensureSchema(env);
  const mapAge=await env.DB.prepare("SELECT MIN(cm.updated_at) AS updated_at,COUNT(cm.symbol) AS count FROM stock_master m LEFT JOIN sec_company_map cm ON cm.symbol=m.symbol WHERE m.market='US' AND m.listing_status='active' AND m.source='Magic Formula Investing'").first<any>();
  const missingMap=await env.DB.prepare("SELECT COUNT(*) AS count FROM stock_master m LEFT JOIN sec_company_map cm ON cm.symbol=m.symbol WHERE m.market='US' AND m.listing_status='active' AND m.source='Magic Formula Investing' AND cm.symbol IS NULL").first<any>();
  const mapStale=!mapAge?.count || !mapAge.updated_at || Date.now()-Date.parse(mapAge.updated_at)>7*86400000 || (missingMap?.count??0)>0;
  if (mapStale) {
    const response=await fetch("https://www.sec.gov/files/company_tickers_exchange.json",{headers:{"User-Agent":"Magic Screen/1.0 support@binalah.co","Accept-Encoding":"gzip, deflate"}});
    if (!response.ok) throw new Error("SEC ticker map returned HTTP "+response.status);
    const payload:any=await response.json();
    const fields=payload.fields??[];
    const ix={cik:fields.indexOf("cik"),ticker:fields.indexOf("ticker")};
    if (ix.cik<0 || ix.ticker<0) throw new Error("Unexpected SEC ticker map format");
    const now=new Date().toISOString();
    const active=await env.DB.prepare("SELECT symbol FROM stock_master WHERE market='US' AND listing_status='active' AND source='Magic Formula Investing'").all<any>();
    const wanted=new Set(active.results.map((x:any)=>String(x.symbol).toUpperCase()));
    const symbolsToMap=[...wanted];
    for(let i=0;i<symbolsToMap.length;i+=80) await env.DB.batch(symbolsToMap.slice(i,i+80).map(symbol=>env.DB.prepare("INSERT INTO sec_company_map(symbol,cik,updated_at) VALUES(?,'UNMAPPED',?) ON CONFLICT(symbol) DO UPDATE SET updated_at=excluded.updated_at").bind(symbol,now)));
    const normaliseTicker=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,"");
    const cikByTicker=new Map<string,string>();
    for(const row of payload.data??[]) if(Number(row[ix.cik])>0) cikByTicker.set(normaliseTicker(String(row[ix.ticker])),String(row[ix.cik]).padStart(10,"0"));
    const mappedSymbols=symbolsToMap.map(symbol=>({symbol,cik:cikByTicker.get(normaliseTicker(symbol))})).filter((row):row is {symbol:string;cik:string}=>!!row.cik);
    for(let i=0;i<mappedSymbols.length;i+=80) await env.DB.batch(mappedSymbols.slice(i,i+80).map(row=>env.DB.prepare("UPDATE sec_company_map SET cik=?,updated_at=? WHERE symbol=?").bind(row.cik,now,row.symbol)));
  }
  const staleCalculatedBefore=new Date(Date.now()-30*86400000).toISOString();
  const staleRetryBefore=new Date(Date.now()-7*86400000).toISOString();
  // INTENTIONAL: annual fundamentals older than 550 days are not eligible for current screening.
  // The 18-month guard catches stale XBRL tag selection while allowing normal filing-cycle delays.
  const maxAnnualPeriodAgeDays=550;
  const maxAnnualPeriodEnd=new Date(Date.now()-maxAnnualPeriodAgeDays*86400000).toISOString().slice(0,10);
  // INTENTIONAL: wait for the MFI market-cap snapshot before attempting SEC calculations.
  // This avoids recording a false incomplete result during the gap between MFI import and quote sync.
  const candidates=await env.DB.prepare("SELECT m.symbol,m.company_name,q.market_cap,cm.cik FROM stock_master m LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market='US' LEFT JOIN sec_company_map cm ON cm.symbol=m.symbol LEFT JOIN stock_fundamentals f ON f.symbol=m.symbol AND f.market='US' WHERE m.market='US' AND m.listing_status='active' AND m.source='Magic Formula Investing' AND q.market_cap IS NOT NULL AND cm.cik IS NOT NULL AND cm.cik!='UNMAPPED' AND (f.updated_at IS NULL OR f.market_cap IS NOT q.market_cap OR (f.status='calculated' AND (f.updated_at<? OR f.fiscal_period<?)) OR (f.status!='calculated' AND f.updated_at<?)) ORDER BY CASE WHEN f.updated_at IS NULL THEN 0 WHEN f.status!='calculated' THEN 1 ELSE 2 END,f.updated_at,m.symbol LIMIT ?").bind(staleCalculatedBefore,maxAnnualPeriodEnd,staleRetryBefore,Math.max(1,Math.min(10,limit))).all<any>();
  let processed=0,calculated=0,stale=0,failed=0;
  for(const item of candidates.results) {
    const now=new Date().toISOString();
    try {
      const response=await fetch("https://data.sec.gov/api/xbrl/companyfacts/CIK"+item.cik+".json",{headers:{"User-Agent":"Magic Screen/1.0 support@binalah.co","Accept":"application/json"}});
      if(!response.ok) throw new Error("SEC company facts HTTP "+response.status);
      const facts:any=await response.json();
      // INTENTIONAL: anchor the fiscal period using EBIT facts or recognised annual revenue facts.
      // Some issuers do not expose operating income under standard EBIT concepts; revenue anchors
      // keep the selected period current while unsupported EBIT remains missing, never backfilled.
      const annualPeriodTags=["OperatingIncomeLoss","OperatingProfitLoss","ProfitLossFromOperatingActivities","Revenues","Revenue","RevenueFromContractWithCustomerExcludingAssessedTax","RevenueFromContractWithCustomerIncludingAssessedTax","SalesRevenueNet","SalesRevenueGoodsNet","SalesRevenueServicesNet"];
      const annualFacts=["us-gaap","ifrs-full"].flatMap(taxonomy=>annualPeriodTags.flatMap(tag=>facts?.facts?.[taxonomy]?.[tag]?.units?.USD ?? []));
      const annual=annualFacts.filter((x:any)=>x.val!=null && x.start && x.end && ["10-K","20-F","40-F"].includes(x.form) && (Date.parse(x.end)-Date.parse(x.start))/86400000>=330 && (Date.parse(x.end)-Date.parse(x.start))/86400000<=400).sort((a:any,b:any)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed));
      const periodEnd=annual[0]?.end ?? "";
      const periodAgeDays=periodEnd ? (Date.now()-Date.parse(periodEnd+"T00:00:00Z"))/86400000 : null;
      // INTENTIONAL: keep old SEC facts for diagnostics, but never calculate or rank them as current fundamentals.
      const staleFiscalPeriod=periodAgeDays!=null && periodAgeDays>maxAnnualPeriodAgeDays;
      const ebit=periodEnd ? secFactValue(facts,["OperatingIncomeLoss","OperatingProfitLoss","ProfitLossFromOperatingActivities"],periodEnd,true) : {value:null,tag:null,filed:null};
      const assets=periodEnd ? secFactValue(facts,["AssetsCurrent","CurrentAssets"],periodEnd,false) : {value:null,tag:null,filed:null};
      const liabilities=periodEnd ? secFactValue(facts,["LiabilitiesCurrent","CurrentLiabilities"],periodEnd,false) : {value:null,tag:null,filed:null};
      const ppe=periodEnd ? secFactValue(facts,["PropertyPlantAndEquipmentNet","PropertyPlantAndEquipment"],periodEnd,false) : {value:null,tag:null,filed:null};
      const cash=periodEnd ? secFactValue(facts,["CashAndCashEquivalentsAtCarryingValue","CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents","CashAndCashEquivalents"],periodEnd,false) : {value:null,tag:null,filed:null};
      const debtCurrent=periodEnd ? secFactValue(facts,["LongTermDebtCurrent","BorrowingsCurrent"],periodEnd,false) : {value:null,tag:null,filed:null};
      const shortDebt=periodEnd ? secFactValue(facts,["ShortTermBorrowings","ShortTermDebtCurrent"],periodEnd,false) : {value:null,tag:null,filed:null};
      const debtLong=periodEnd ? secFactValue(facts,["LongTermDebtNoncurrent","BorrowingsNoncurrent"],periodEnd,false) : {value:null,tag:null,filed:null};
      const leaseCurrent=periodEnd ? secFactValue(facts,["LongTermDebtAndFinanceLeaseObligationsCurrent"],periodEnd,false) : {value:null,tag:null,filed:null};
      const leaseLong=periodEnd ? secFactValue(facts,["LongTermDebtAndFinanceLeaseObligationsNoncurrent"],periodEnd,false) : {value:null,tag:null,filed:null};
      const debtTotal=periodEnd ? secFactValue(facts,["LongTermDebt","Borrowings"],periodEnd,false) : {value:null,tag:null,filed:null};
      const cap=Number(item.market_cap);
      const splitDebtKnown=debtCurrent.value!=null || shortDebt.value!=null || debtLong.value!=null;
      const leaseDebtKnown=leaseCurrent.value!=null || leaseLong.value!=null;
      const debtKnown=splitDebtKnown || leaseDebtKnown || debtTotal.value!=null;
      const totalDebt=splitDebtKnown ? (debtCurrent.value??0)+(shortDebt.value??0)+(debtLong.value??0)
        : leaseDebtKnown ? (leaseCurrent.value??0)+(leaseLong.value??0) : (debtTotal.value??0);
      const netWorkingCapital=(assets.value??0)-(liabilities.value??0);
      const investedCapital=netWorkingCapital+(ppe.value??0);
      const enterpriseValue=cap+totalDebt-(cash.value??0);
      const complete=!staleFiscalPeriod && ebit.value!=null && assets.value!=null && liabilities.value!=null && ppe.value!=null && cash.value!=null && debtKnown && item.market_cap!=null && enterpriseValue>0 && investedCapital>0;
      const ey=complete ? (ebit.value as number)/enterpriseValue : null;
      const roc=complete ? (ebit.value as number)/investedCapital : null;
      const status=staleFiscalPeriod ? "stale_fiscal_period" : complete ? "calculated" : "missing_required_facts";
      await env.DB.prepare("INSERT INTO stock_fundamentals(symbol,market,cik,ebit,current_assets,current_liabilities,net_ppe,total_debt,cash,market_cap,earnings_yield,return_on_capital,fiscal_period,filed_at,status,source,updated_at) VALUES(?,'US',?,?,?,?,?,?,?,?,?,?,?,?,?,'SEC EDGAR Company Facts',?) ON CONFLICT(symbol,market) DO UPDATE SET cik=excluded.cik,ebit=excluded.ebit,current_assets=excluded.current_assets,current_liabilities=excluded.current_liabilities,net_ppe=excluded.net_ppe,total_debt=excluded.total_debt,cash=excluded.cash,market_cap=excluded.market_cap,earnings_yield=excluded.earnings_yield,return_on_capital=excluded.return_on_capital,fiscal_period=excluded.fiscal_period,filed_at=excluded.filed_at,status=excluded.status,source=excluded.source,updated_at=excluded.updated_at")
        .bind(item.symbol,item.cik,ebit.value,assets.value,liabilities.value,ppe.value,totalDebt,cash.value,item.market_cap,ey,roc,periodEnd||null,ebit.filed,status,now).run();
      await env.DB.prepare("UPDATE stock_snapshot SET earnings_yield=?,return_on_capital=?,magic_formula_rank=NULL,data_status=? WHERE symbol=? AND market='US'").bind(ey,roc,staleFiscalPeriod?"fundamentals_stale":complete?"fundamentals_calculated":"fundamentals_incomplete",item.symbol).run();
      if(complete) calculated++;
      if(staleFiscalPeriod) stale++;
      processed++;
    } catch(error) {
      failed++;
      await env.DB.prepare("INSERT INTO stock_fundamentals(symbol,market,cik,status,source,updated_at) VALUES(?,'US',?,'provider_error','SEC EDGAR Company Facts',?) ON CONFLICT(symbol,market) DO UPDATE SET status='provider_error',updated_at=excluded.updated_at").bind(item.symbol,item.cik,now).run();
      processed++;
    }
  }
  const totals=await env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN f.status='calculated' AND f.market_cap IS q.market_cap THEN 1 ELSE 0 END) AS valid FROM stock_master m LEFT JOIN stock_fundamentals f ON f.symbol=m.symbol AND f.market='US' LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market='US' WHERE m.market='US' AND m.listing_status='active' AND m.source='Magic Formula Investing'").first<any>();
  let ranked=0;
  // INTENTIONAL: never publish a partial-universe Magic Formula rank. Every active MFI
  // candidate must have complete, usable inputs or all ranks remain blank.
  if(totals?.total>0 && totals.valid===totals.total) {
    const unranked=await env.DB.prepare("SELECT COUNT(*) AS count FROM stock_master m LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market='US' WHERE m.market='US' AND m.listing_status='active' AND m.source='Magic Formula Investing' AND q.magic_formula_rank IS NULL").first<any>();
    // INTENTIONAL: recompute only when at least one active candidate is unranked. This
    // handles a changed MFI universe even on a run that processes no new SEC facts.
    if((unranked?.count??0)>0) {
      const rankedRows=await env.DB.prepare("SELECT f.symbol,ROW_NUMBER() OVER(ORDER BY f.earnings_yield DESC)+ROW_NUMBER() OVER(ORDER BY f.return_on_capital DESC) AS combined_rank FROM stock_fundamentals f INNER JOIN stock_master m ON m.symbol=f.symbol AND m.market=f.market WHERE f.market='US' AND f.status='calculated' AND m.listing_status='active' AND m.source='Magic Formula Investing'").all<any>();
      // INTENTIONAL: only write rank rows when the calculated rank actually changes.
      // The SEC cron runs every thirty minutes; unchanged ranks do not consume D1 writes.
      for(const row of rankedRows.results) await env.DB.prepare("UPDATE stock_snapshot SET magic_formula_rank=? WHERE symbol=? AND market='US' AND magic_formula_rank IS NOT ?").bind(row.combined_rank,row.symbol,row.combined_rank).run();
      ranked=rankedRows.results.length;
    }
  } else if(processed>0 && totals?.total>0) {
    // INTENTIONAL: if any active candidate becomes incomplete, clear every rank so the
    // UI never displays a stale partial ranking as if the full universe were ranked.
    await env.DB.prepare("UPDATE stock_snapshot SET magic_formula_rank=NULL WHERE market='US' AND magic_formula_rank IS NOT NULL AND symbol IN (SELECT symbol FROM stock_master WHERE market='US' AND listing_status='active' AND source='Magic Formula Investing')").run();
  }
  const remaining=Math.max(0,(totals?.total??0)-(totals?.valid??0));
  return {source:"SEC EDGAR Company Facts",processed,calculated,stale,failed,remaining,ranked,total:totals?.total??0,note:"Ranks are published only when every active MFI candidate has usable required facts."};
}

async function syncMagicFormulaUniverse(env: Env, minimumMarketCap=50, select30=true, forceRefresh=false) {
  await ensureSchema(env);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS mfi_screening_meta (id INTEGER PRIMARY KEY CHECK(id=1), minimum_market_cap INTEGER NOT NULL, selected_count INTEGER NOT NULL, result_count INTEGER NOT NULL, source_updated_at TEXT NOT NULL, price_date TEXT, quarter_date TEXT)").run();

  // Reuse the last successful MFI result for six hours when the screen settings match.
  // This avoids a login/session round-trip every time someone opens the screener.
  // INTENTIONAL: cache successful MFI sessions for six hours; normal page loads should
  // not repeatedly scrape the authenticated site. The explicit refresh path can bypass this.
  if (!forceRefresh) {
    const cached = await env.DB.prepare("SELECT minimum_market_cap,selected_count,result_count,source_updated_at,price_date,quarter_date FROM mfi_screening_meta WHERE id=1").first<any>();
    const cacheAge = cached?.source_updated_at ? Date.now() - Date.parse(cached.source_updated_at) : Infinity;
    if (cached && cached.minimum_market_cap === minimumMarketCap && cached.selected_count === (select30 ? 30 : 50) && cacheAge >= 0 && cacheAge < 6 * 60 * 60 * 1000) {
      const result = await env.DB.prepare("SELECT m.symbol,m.company_name AS name,COALESCE(q.market_cap,0)/1000000.0 AS marketCapMillions FROM stock_master m LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market='US' WHERE m.market='US' AND m.listing_status='active' AND m.source='Magic Formula Investing' ORDER BY m.company_name").all<any>();
      if (result.results.length === cached.result_count) {
        return {imported:result.results.length,minimumMarketCap,selectedCount:select30?30:50,source:"Magic Formula Investing",asOf:cached.source_updated_at,priceDate:cached.price_date,quarterDate:cached.quarter_date,cached:true,stocks:result.results};
      }
    }
  }

  if (!env.MFI_SESSION_COOKIE) throw new Error("Magic Formula session is not configured. Add MFI_SESSION_COOKIE as a Cloudflare Worker secret.");
  const headers = { "User-Agent":"Mozilla/5.0 (compatible; MagicScreen/1.0)", "Cookie":env.MFI_SESSION_COOKIE };
  const pageUrl = "https://www.magicformulainvesting.com/Screening/StockScreening";
  const page = await fetch(pageUrl, {headers, redirect:"follow"});
  const pageHtml = await page.text();
  if (!page.ok) throw new Error("Magic Formula page returned HTTP "+page.status);
  if (/Account\/LogOn|name=["']Email["']|>\s*Login\s*</i.test(page.url+" "+pageHtml)) throw new Error("Magic Formula session expired or is not authenticated. Refresh MFI_SESSION_COOKIE.");
  const token = pageHtml.match(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i)?.[1]
    ?? pageHtml.match(/value=["']([^"']+)["'][^>]*name=["']__RequestVerificationToken["']/i)?.[1];
  if (!token) throw new Error("Could not find the anti-forgery token. The screening page may have changed.");
  const form = new URLSearchParams();
  form.set("MinimumMarketCap",String(minimumMarketCap));
  form.set("Select30",select30?"true":"false");
  form.set("stocks","Get Stocks");
  form.set("__RequestVerificationToken",token);
  const response = await fetch(pageUrl,{method:"POST",headers:{...headers,"Accept":"*/*","Content-Type":"application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With":"XMLHttpRequest","Referer":pageUrl,"Origin":"https://www.magicformulainvesting.com"},body:form.toString(),redirect:"follow"});
  const html = await response.text();
  if (!response.ok) throw new Error("Magic Formula screening returned HTTP "+response.status);
  if (/Account\/LogOn|name=["']Email["']|>\s*Login\s*</i.test(response.url+" "+html)) throw new Error("Magic Formula rejected the session. Refresh MFI_SESSION_COOKIE.");
  const table = html.match(/<table\b[^>]*class=["'][^"']*screeningdata[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) throw new Error("Could not find the screening results table in Magic Formula response.");
  // INTENTIONAL: the provider's screening table is alphabetically sorted and does not
  // contain EY/ROC ranks. Preserve it as a candidate universe, never as a ranking order.
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => {
    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell =>
      cell[1].replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g," ").trim()
    );
    if (cells.length < 5) return null;
    const symbol = cells[1].toUpperCase().replace(/[^A-Z0-9.\-]/g,"");
    const cap = Number(cells[2].replace(/,/g,""));
    if (!symbol || !Number.isFinite(cap)) return null;
    return {symbol,name:cells[0],marketCapMillions:cap,priceDate:cells[3],quarterDate:cells[4]};
  }).filter((row): row is {symbol:string;name:string;marketCapMillions:number;priceDate:string;quarterDate:string} => !!row && !!row.name);
  if (!rows.length) throw new Error("Magic Formula returned no parseable stock rows.");
  const now = new Date().toISOString();
  const previousUniverse = await env.DB.prepare("SELECT m.symbol,q.market_cap FROM stock_master m LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market='US' WHERE m.market='US' AND m.listing_status='active' AND m.source='Magic Formula Investing' ORDER BY m.symbol").all<any>();
  const previousCaps = new Map<string,number|null>(previousUniverse.results.map((row:any)=>[String(row.symbol),row.market_cap==null?null:Number(row.market_cap)]));
  const previousSymbols = previousUniverse.results.map((row:any)=>String(row.symbol)).sort();
  const nextSymbols = rows.map(row=>row.symbol).sort();
  const universeChanged = previousSymbols.length!==nextSymbols.length || previousSymbols.some((symbol:string,index:number)=>symbol!==nextSymbols[index]);
  const marketCapChanged = rows.some(row=>previousCaps.has(row.symbol) && previousCaps.get(row.symbol)!==row.marketCapMillions*1000000);
  for (let i=0;i<rows.length;i+=40) {
    await env.DB.batch(rows.slice(i,i+40).flatMap(row=>[
      env.DB.prepare("INSERT INTO stock_master (symbol,market,company_name,currency,exchange,listing_status,source,source_updated_at) VALUES (?,'US',?,'USD','Magic Formula Investing','active','Magic Formula Investing',?) ON CONFLICT(symbol,market) DO UPDATE SET company_name=excluded.company_name,exchange=excluded.exchange,listing_status='active',source=excluded.source,source_updated_at=excluded.source_updated_at WHERE stock_master.company_name IS NOT excluded.company_name OR stock_master.exchange IS NOT excluded.exchange OR stock_master.listing_status IS NOT 'active' OR stock_master.source IS NOT 'Magic Formula Investing'").bind(row.symbol,row.name,now),
      env.DB.prepare("INSERT INTO stock_snapshot (symbol,market,company_name,currency,market_cap,shariah_status,data_status,provider,updated_at) VALUES (?,'US',?,'USD',?,'unverified','mfi_screened','Magic Formula Investing',?) ON CONFLICT(symbol,market) DO UPDATE SET company_name=excluded.company_name,market_cap=excluded.market_cap,updated_at=excluded.updated_at WHERE stock_snapshot.company_name IS NOT excluded.company_name OR stock_snapshot.market_cap IS NOT excluded.market_cap").bind(row.symbol,row.name,row.marketCapMillions*1000000,now)
    ]));
  }
  const activeSymbols = rows.map(row=>row.symbol);
  await env.DB.prepare("UPDATE stock_master SET listing_status='inactive' WHERE market='US' AND listing_status!='inactive' AND symbol NOT IN ("+activeSymbols.map(()=>"?").join(",")+")").bind(...activeSymbols).run();
  if(universeChanged || marketCapChanged) {
    // INTENTIONAL: candidate membership or market-cap changes invalidate the previous
    // combined ranking. SEC ingestion republishes ranks only after all inputs are current.
    await env.DB.prepare("UPDATE stock_snapshot SET magic_formula_rank=NULL WHERE market='US' AND magic_formula_rank IS NOT NULL").run();
  }
  await env.DB.prepare("INSERT INTO mfi_screening_meta (id,minimum_market_cap,selected_count,result_count,source_updated_at,price_date,quarter_date) VALUES (1,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET minimum_market_cap=excluded.minimum_market_cap,selected_count=excluded.selected_count,result_count=excluded.result_count,source_updated_at=excluded.source_updated_at,price_date=excluded.price_date,quarter_date=excluded.quarter_date").bind(minimumMarketCap,select30?30:50,rows.length,now,rows[0]?.priceDate ?? null,rows[0]?.quarterDate ?? null).run();
  return {imported:rows.length,minimumMarketCap,selectedCount:select30?30:50,source:"Magic Formula Investing",asOf:now,priceDate:rows[0]?.priceDate ?? null,quarterDate:rows[0]?.quarterDate ?? null,cached:false,stocks:rows};
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname==="/api/pipeline/status" && request.method==="GET") {
      try {
        await ensureSchema(env);
        const market=url.searchParams.get("market")==="US" ? "US" : "MY";
        const quotes=await env.DB.prepare("SELECT MAX(updated_at) AS last_updated FROM stock_snapshot WHERE market=?").bind(market).first<any>();
        if (market==="MY") return json({market,last_quote_sync:quotes?.last_updated??null});
        const mfi=await env.DB.prepare("SELECT source_updated_at,price_date,quarter_date,result_count,minimum_market_cap,selected_count FROM mfi_screening_meta WHERE id=1").first<any>();
        const sec=await env.DB.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN f.status='calculated' AND f.market_cap IS q.market_cap THEN 1 ELSE 0 END),0) AS calculated,COALESCE(SUM(CASE WHEN f.status='calculated' AND f.market_cap IS NOT q.market_cap THEN 1 ELSE 0 END),0) AS stale_market_cap,COALESCE(SUM(CASE WHEN f.status='missing_required_facts' THEN 1 ELSE 0 END),0) AS incomplete,COALESCE(SUM(CASE WHEN f.status='stale_fiscal_period' THEN 1 ELSE 0 END),0) AS stale_fiscal_period,COALESCE(SUM(CASE WHEN f.status='provider_error' THEN 1 ELSE 0 END),0) AS provider_error,COALESCE(SUM(CASE WHEN cm.cik IS NULL OR cm.cik='UNMAPPED' THEN 1 ELSE 0 END),0) AS unmapped,COALESCE(SUM(CASE WHEN q.market_cap IS NULL THEN 1 ELSE 0 END),0) AS awaiting_market_cap,COALESCE(SUM(CASE WHEN q.market_cap IS NOT NULL AND cm.cik IS NOT NULL AND cm.cik!='UNMAPPED' AND f.status IS NULL THEN 1 ELSE 0 END),0) AS awaiting_fundamentals,MAX(f.updated_at) AS last_updated FROM stock_master m LEFT JOIN stock_fundamentals f ON f.symbol=m.symbol AND f.market='US' LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market='US' LEFT JOIN sec_company_map cm ON cm.symbol=m.symbol WHERE m.market='US' AND m.listing_status='active' AND m.source='Magic Formula Investing'").first<any>();
        return json({market,last_quote_sync:quotes?.last_updated??null,mfi_last_sync:mfi?.source_updated_at??null,mfi_price_date:mfi?.price_date??null,mfi_quarter_date:mfi?.quarter_date??null,mfi_count:mfi?.result_count??0,mfi_minimum_market_cap:mfi?.minimum_market_cap??null,mfi_selected_count:mfi?.selected_count??null,sec});
      } catch(e) { return json({error:e instanceof Error?e.message:String(e)},503); }
    }
    if (url.pathname==="/api/fundamentals/status" && request.method==="GET") {
      try {
        await ensureSchema(env);
        const status=await env.DB.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN f.status='calculated' AND f.market_cap IS q.market_cap THEN 1 ELSE 0 END),0) AS calculated,COALESCE(SUM(CASE WHEN f.status='calculated' AND f.market_cap IS NOT q.market_cap THEN 1 ELSE 0 END),0) AS stale_market_cap,COALESCE(SUM(CASE WHEN f.status='missing_required_facts' THEN 1 ELSE 0 END),0) AS incomplete,COALESCE(SUM(CASE WHEN f.status='provider_error' THEN 1 ELSE 0 END),0) AS provider_error,COALESCE(SUM(CASE WHEN cm.cik IS NULL OR cm.cik='UNMAPPED' THEN 1 ELSE 0 END),0) AS unmapped,COALESCE(SUM(CASE WHEN q.market_cap IS NULL THEN 1 ELSE 0 END),0) AS awaiting_market_cap,COALESCE(SUM(CASE WHEN q.market_cap IS NOT NULL AND cm.cik IS NOT NULL AND cm.cik!='UNMAPPED' AND f.status IS NULL THEN 1 ELSE 0 END),0) AS awaiting_fundamentals,MAX(f.updated_at) AS last_updated FROM stock_master m LEFT JOIN stock_fundamentals f ON f.symbol=m.symbol AND f.market='US' LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market='US' LEFT JOIN sec_company_map cm ON cm.symbol=m.symbol WHERE m.market='US' AND m.listing_status='active' AND m.source='Magic Formula Investing'").first<any>();
        return json({source:"SEC EDGAR Company Facts",...status});
      } catch(e) { return json({error:e instanceof Error?e.message:String(e)},503); }
    }
    if (url.pathname==="/api/fundamentals/sync" && request.method==="GET") {
      try {
        const limit=Math.min(10,Math.max(1,Number(url.searchParams.get("limit")??8)));
        return json(await syncUsFundamentals(env,limit));
      } catch(e) { return json({error:e instanceof Error?e.message:String(e),source:"SEC EDGAR Company Facts"},503); }
    }
    if (url.pathname==="/api/mfi/screen") {
      try {
        const minimumMarketCap = Math.min(5000000,Math.max(50,Number(url.searchParams.get("minimumMarketCap") ?? 50)));
        const select30 = url.searchParams.get("select30") !== "false";
        const forceRefresh = url.searchParams.get("force")==="1";
        const result = await syncMagicFormulaUniverse(env,minimumMarketCap,select30,forceRefresh);
        return json(result);
      } catch(e) { return json({error:e instanceof Error?e.message:String(e),source:"Magic Formula Investing"},503); }
    }
    if (url.pathname==="/api/health") return json({ok:true,service:"magic-screen",environment:env.APP_ENV ?? "development"});
    if (url.pathname==="/api/universe/import-my" && request.method==="POST") {
      if (!env.UNIVERSE_SYNC_TOKEN) return json({error:"UNIVERSE_SYNC_TOKEN is not configured"},503);
      if (request.headers.get("Authorization") !== "Bearer " + env.UNIVERSE_SYNC_TOKEN) return json({error:"Unauthorized"},401);
      try {
        await ensureSchema(env);
        const payload: any = await request.json();
        if (!Array.isArray(payload.rows) || payload.rows.length > 5000) return json({error:"Expected rows array, maximum 5000"},400);
        const now = new Date().toISOString();
        let imported = 0;
        for (let i=0; i<payload.rows.length; i+=80) {
          const batch = payload.rows.slice(i,i+80).map((r: any) => {
            const rawSymbol = String(r.symbol || "").trim().toUpperCase();
            const symbol = rawSymbol && !rawSymbol.endsWith(".KL") ? rawSymbol + ".KL" : rawSymbol;
            const companyName = String(r.company_name || r.name || "").trim();
            if (!/^[0-9A-Z][0-9A-Z.-]{0,14}\.KL$/.test(symbol) || !companyName) return null;
            return env.DB.prepare("INSERT INTO stock_master (symbol,market,company_name,currency,exchange,sector,listing_status,source,source_updated_at) VALUES (?, 'MY', ?, 'MYR', ?, ?, ?, ?, ?) ON CONFLICT(symbol,market) DO UPDATE SET company_name=excluded.company_name,exchange=excluded.exchange,sector=excluded.sector,listing_status=excluded.listing_status,source=excluded.source,source_updated_at=excluded.source_updated_at").bind(symbol,companyName,String(r.exchange || "BURSA"),r.sector || null,r.listing_status || "active",String(payload.source || "Bursa directory import"),now);
          }).filter(Boolean) as D1PreparedStatement[];
          if (batch.length) { await env.DB.batch(batch); imported += batch.length; }
        }
        return json({imported,source:payload.source || "Bursa directory import",asOf:now});
      } catch (e) { return json({error:String(e)},400); }
    }
    if (url.pathname==="/api/universe") {
      const market = url.searchParams.get("market")==="US" ? "US" : "MY";
      try {
        await ensureSchema(env);
        // INTENTIONAL: this is a read-only legacy/master-data endpoint. US candidate selection belongs to MFI;
        // never repopulate the displayed US universe from the broad SEC ticker directory.
        const result = await env.DB.prepare("SELECT * FROM stock_master WHERE market=? AND listing_status='active' ORDER BY company_name").bind(market).all();
        return json({market,stocks:result.results,count:result.results.length});
      } catch (e) { return json({market,stocks:[],count:0,error:String(e)},502); }
    }
    if (url.pathname==="/api/stocks") {
      const market = url.searchParams.get("market")==="US" ? "US" : "MY";
      let refresh: any = null;
      try {
        await ensureSchema(env);
        if (url.searchParams.get("refresh")==="1") {
          try {
            refresh = await refreshQuotes(env, market);
          } catch (error) {
            // INTENTIONAL: D1 write-quota exhaustion or quote-provider failure must not block cached reads.
            refresh = {updated:0,failed:0,remaining:null,error:String(error)};
          }
        }
        const result = await env.DB.prepare("SELECT m.symbol,m.market,m.company_name,m.currency,q.price,q.change_percent,q.market_cap,q.earnings_yield,q.return_on_capital,q.magic_formula_rank,f.fiscal_period,f.filed_at,f.status AS fundamentals_status,f.source AS fundamentals_source,COALESCE(q.shariah_status,'unverified') AS shariah_status,q.shariah_source,q.shariah_as_of,COALESCE(q.data_status,'awaiting_quote') AS data_status,q.provider,q.updated_at FROM stock_master m LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market=m.market LEFT JOIN stock_fundamentals f ON f.symbol=m.symbol AND f.market=m.market WHERE m.market=? AND m.listing_status='active' ORDER BY COALESCE(q.magic_formula_rank,999),m.company_name").bind(market).all();
        const latest = await env.DB.prepare("SELECT MAX(updated_at) AS updated_at FROM stock_snapshot WHERE market=?").bind(market).first<{updated_at:string|null}>();
        return json({market,stocks:result.results,updatedAt:latest?.updated_at ?? null,sourceStatus:result.results.some((row:any)=>row.price!=null)?"Quote cache connected":"Waiting for scheduled quote sync",refresh});
      } catch (error) {
        return json({market,stocks:[],updatedAt:null,sourceStatus:"Cached stock read failed",error:String(error),refresh},503);
      }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (controller.cron === "*/30 * * * *") {
      // INTENTIONAL: SEC ingestion is its own cron lane. Return after scheduling it so this
      // invocation does not also trigger a quote refresh for an unrelated market.
      // SEC ingestion runs independently from browser visits, in bounded batches.
      ctx.waitUntil(syncUsFundamentals(env, 10));
      return;
    }
    const market = controller.cron.startsWith("17 ") ? "MY" : "US";
    ctx.waitUntil(refreshQuotes(env, market));
  }
};