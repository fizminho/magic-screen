interface Env { DB: D1Database; ASSETS: Fetcher; APP_ENV?: string; }
const symbols: Record<string, {name:string;market:"MY"|"US";currency:string}[]> = {
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
    {symbol:"5285.KL",name:"Sime Darby Plantation",market:"MY",currency:"MYR"},{symbol:"5211.KL",name:"Sunway",market:"MY",currency:"MYR"}
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
    {symbol:"ADBE",name:"Adobe",market:"US",currency:"USD"},{symbol:"INTU",name:"Intuit",market:"US",currency:"USD"}
  ]
};
const json = (data: unknown, status=200) => new Response(JSON.stringify(data), {status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*"}});
async function refreshQuotes(env: Env) {
  const started = new Date().toISOString();
  const batch = env.DB.prepare("INSERT INTO refresh_log (started_at,status,message) VALUES (?, 'running', 'Yahoo Finance chart quote refresh')");
  const log = await batch.bind(started).run();
  let updated=0, failed=0;
  for (const market of ["MY","US"] as const) {
    for (const item of symbols[market]) {
      try {
        const url = "https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(item.symbol)+"?range=5d&interval=1d";
        const res = await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 MagicScreen/0.1"}});
        if (!res.ok) throw new Error("Quote provider HTTP "+res.status);
        const payload:any = await res.json();
        const result = payload?.chart?.result?.[0];
        const meta = result?.meta;
        const quote = result?.indicators?.quote?.[0];
        const closes = (quote?.close ?? []).filter((v:any)=>typeof v==="number");
        const price = typeof meta?.regularMarketPrice==="number" ? meta.regularMarketPrice : closes.at(-1) ?? null;
        const previous = typeof meta?.chartPreviousClose==="number" ? meta.chartPreviousClose : closes.length>1 ? closes.at(-2) : null;
        const change = price!=null && previous ? ((price-previous)/previous)*100 : null;
        if (price==null) throw new Error("No quote in provider response");
        await env.DB.prepare(`INSERT INTO stock_snapshot (symbol,market,company_name,currency,price,change_percent,shariah_status,data_status,provider,updated_at)
          VALUES (?,?,?,?,?,?,'unverified','quote_only','Yahoo Finance',?)
          ON CONFLICT(symbol,market) DO UPDATE SET company_name=excluded.company_name,currency=excluded.currency,price=excluded.price,
          change_percent=excluded.change_percent,data_status='quote_only',provider=excluded.provider,updated_at=excluded.updated_at`)
          .bind(item.symbol,item.market,item.name,item.currency,price,change, new Date().toISOString()).run();
        updated++;
      } catch (e) { failed++; }
    }
  }
  await env.DB.prepare("UPDATE refresh_log SET completed_at=?,status=?,message=? WHERE id=?")
    .bind(new Date().toISOString(),failed===0?"success":"partial",`Updated ${updated}; failed ${failed}`,log.meta.last_row_id).run();
  return {updated,failed};
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname==="/api/health") return json({ok:true,service:"magic-screen",environment:env.APP_ENV ?? "development"});
    if (url.pathname==="/api/stocks") {
      const market = url.searchParams.get("market")==="US" ? "US" : "MY";
      if (url.searchParams.get("refresh")==="1") {
        try { await refreshQuotes(env); } catch { return json({error:"Refresh failed",market}, 502); }
      }
      try {
        const result = await env.DB.prepare("SELECT * FROM stock_snapshot WHERE market=? ORDER BY COALESCE(magic_formula_rank,999), company_name").bind(market).all();
        const latest = await env.DB.prepare("SELECT MAX(updated_at) AS updated_at FROM stock_snapshot WHERE market=?").bind(market).first<{updated_at:string|null}>();
        return json({market,stocks:result.results,updatedAt:latest?.updated_at ?? null,sourceStatus:result.results.length?"Quote cache connected":"Waiting for scheduled quote sync"});
      } catch { return json({market,stocks:[],updatedAt:null,sourceStatus:"Database not initialised"}); }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(refreshQuotes(env));
  }
};