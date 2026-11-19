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
        const previous = typeof meta?.chartPreviousClose==="number" ? meta.chartPreviousClose : closes.length>1 ? closes.at(-2) : null;
        const change = price!=null && previous ? ((price-previous)/previous)*100 : null;
        if (price==null) throw new Error("No quote in provider response");
        await env.DB.prepare("INSERT INTO stock_snapshot (symbol,market,company_name,currency,price,change_percent,shariah_status,data_status,provider,updated_at) VALUES (?,?,?,?,?,?,'unverified','quote_only','Yahoo Finance',?) ON CONFLICT(symbol,market) DO UPDATE SET company_name=excluded.company_name,currency=excluded.currency,price=excluded.price,change_percent=excluded.change_percent,data_status='quote_only',provider=excluded.provider,updated_at=excluded.updated_at").bind(item.symbol,item.market,item.name,item.currency,price,change,new Date().toISOString()).run();
        updated++;
      } catch { failed++; }
    }
  }
  const cutoff = new Date(Date.now()-24*60*60*1000).toISOString();
  const remaining = await env.DB.prepare("SELECT COUNT(*) AS count FROM stock_master m LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market=m.market WHERE m.listing_status='active' AND (? IS NULL OR m.market=?) AND (q.updated_at IS NULL OR q.updated_at < ?)").bind(onlyMarket ?? null,onlyMarket ?? null,cutoff).first();
  await env.DB.prepare("UPDATE refresh_log SET completed_at=?,status=?,message=? WHERE id=?").bind(new Date().toISOString(),failed===0?"success":"partial","Updated "+updated+"; failed "+failed+"; stale or missing "+(remaining?.count ?? 0),log.meta.last_row_id).run();
  return {updated,failed,remaining:remaining?.count ?? 0,batchSize:40};
}
async function syncUsUniverse(env: Env) {
  await ensureSchema(env);
  const response = await fetch("https://www.sec.gov/files/company_tickers_exchange.json",{headers:{"User-Agent":"MagicScreen/0.1 contact support@binalah.co"}});
  if (!response.ok) throw new Error("SEC directory HTTP "+response.status);
  const payload: any = await response.json();
  const fields = payload.fields ?? [];
  const ix = {name:fields.indexOf("name"),ticker:fields.indexOf("ticker"),exchange:fields.indexOf("exchange")};
  if (Object.values(ix).some(i=>i<0)) throw new Error("Unexpected SEC directory format");
  const exchanges = new Set(["Nasdaq","NYSE","NYSE American","NYSE Arca","Cboe","Cboe BZX"]);
  const rows = (payload.data ?? []).filter((r:any[])=>exchanges.has(String(r[ix.exchange])) && /^[A-Z][A-Z0-9.-]{0,9}$/.test(String(r[ix.ticker] ?? "")) && String(r[ix.name] ?? "").trim().length>0);
  const now = new Date().toISOString();
  let imported=0;
  for (let i=0;i<rows.length;i+=80) {
    const batch = rows.slice(i,i+80).map((r:any[])=>env.DB.prepare("INSERT INTO stock_master (symbol,market,company_name,currency,exchange,listing_status,source,source_updated_at) VALUES (?,'US',?,'USD',?,'active','SEC company_tickers_exchange.json',?) ON CONFLICT(symbol,market) DO UPDATE SET company_name=excluded.company_name,exchange=excluded.exchange,source=excluded.source,source_updated_at=excluded.source_updated_at,listing_status='active'").bind(String(r[ix.ticker]).trim().toUpperCase(),String(r[ix.name]).trim(),String(r[ix.exchange]),now));
    await env.DB.batch(batch);
    imported+=batch.length;
  }
  const total = await env.DB.prepare("SELECT COUNT(*) AS count FROM stock_master WHERE market='US' AND listing_status='active'").first();
  return {imported,total:total?.count ?? imported,source:"SEC company_tickers_exchange.json",asOf:now,note:"SEC states this directory does not guarantee accuracy or complete exchange coverage."};
}

async function syncMagicFormulaUniverse(env: Env, minimumMarketCap=50, select30=true) {
  await ensureSchema(env);
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
  await env.DB.prepare("UPDATE stock_master SET listing_status='inactive' WHERE market='US'").run();
  for (let i=0;i<rows.length;i+=80) {
    await env.DB.batch(rows.slice(i,i+80).map(row=>env.DB.prepare("INSERT INTO stock_master (symbol,market,company_name,currency,exchange,listing_status,source,source_updated_at) VALUES (?,'US',?,'USD','Magic Formula Investing','active','Magic Formula Investing',?) ON CONFLICT(symbol,market) DO UPDATE SET company_name=excluded.company_name,exchange=excluded.exchange,listing_status='active',source=excluded.source,source_updated_at=excluded.source_updated_at").bind(row.symbol,row.name,now)));
  }
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS mfi_screening_meta (id INTEGER PRIMARY KEY CHECK(id=1), minimum_market_cap INTEGER NOT NULL, selected_count INTEGER NOT NULL, result_count INTEGER NOT NULL, source_updated_at TEXT NOT NULL, price_date TEXT, quarter_date TEXT)").run();
  await env.DB.prepare("INSERT INTO mfi_screening_meta (id,minimum_market_cap,selected_count,result_count,source_updated_at,price_date,quarter_date) VALUES (1,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET minimum_market_cap=excluded.minimum_market_cap,selected_count=excluded.selected_count,result_count=excluded.result_count,source_updated_at=excluded.source_updated_at,price_date=excluded.price_date,quarter_date=excluded.quarter_date").bind(minimumMarketCap,select30?30:50,rows.length,now,rows[0]?.priceDate ?? null,rows[0]?.quarterDate ?? null).run();
  return {imported:rows.length,minimumMarketCap,selectedCount:select30?30:50,source:"Magic Formula Investing",asOf:now,priceDate:rows[0]?.priceDate ?? null,quarterDate:rows[0]?.quarterDate ?? null,stocks:rows};
}
\nexport default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname==="/api/mfi/screen") {
      try {
        const minimumMarketCap = Math.min(5000000,Math.max(50,Number(url.searchParams.get("minimumMarketCap") ?? 50)));
        const select30 = url.searchParams.get("select30") !== "false";
        const result = await syncMagicFormulaUniverse(env,minimumMarketCap,select30);
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
        const sync = market==="US" && url.searchParams.get("sync")==="1" ? await syncUsUniverse(env) : null;
        const result = await env.DB.prepare("SELECT * FROM stock_master WHERE market=? AND listing_status='active' ORDER BY company_name").bind(market).all();
        return json({market,stocks:result.results,count:result.results.length,sync});
      } catch (e) { return json({market,stocks:[],count:0,error:String(e)},502); }
    }
    if (url.pathname==="/api/stocks") {
      const market = url.searchParams.get("market")==="US" ? "US" : "MY";
      try {
        let refresh = null;
        if (url.searchParams.get("refresh")==="1") refresh = await refreshQuotes(env, market);
        else await ensureSchema(env);
        const result = await env.DB.prepare("SELECT m.symbol,m.market,m.company_name,m.currency,q.price,q.change_percent,q.market_cap,q.earnings_yield,q.return_on_capital,q.magic_formula_rank,COALESCE(q.shariah_status,'unverified') AS shariah_status,q.shariah_source,q.shariah_as_of,COALESCE(q.data_status,'awaiting_quote') AS data_status,q.provider,q.updated_at FROM stock_master m LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market=m.market WHERE m.market=? AND m.listing_status='active' ORDER BY COALESCE(q.magic_formula_rank,999),m.company_name").bind(market).all();
        const latest = await env.DB.prepare("SELECT MAX(updated_at) AS updated_at FROM stock_snapshot WHERE market=?").bind(market).first<{updated_at:string|null}>();
        return json({market,stocks:result.results,updatedAt:latest?.updated_at ?? null,sourceStatus:result.results.some((row:any)=>row.price!=null)?"Quote cache connected":"Waiting for scheduled quote sync",refresh});
      } catch { return json({market,stocks:[],updatedAt:null,sourceStatus:"Database not initialised"}); }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const market = controller.cron.startsWith("17 ") ? "MY" : "US";
    ctx.waitUntil(refreshQuotes(env, market));
  }
};