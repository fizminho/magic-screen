// @ts-ignore JavaScript module is contract-tested directly with Node.js.
import { MEMBERSHIP_DDL, SOURCE_MFI, backfillMfiMemberships, applyMfiSelection, invalidateUsRanks } from "./universe-membership.mjs";
// @ts-ignore JavaScript module is contract-tested directly with Node.js.
import { cooldownElapsed, withSecurityHeaders, publicErrorMessage, MFI_FORCE_COOLDOWN_MS } from "./security.mjs";

interface Env { DB: D1Database; ASSETS: Fetcher; APP_ENV?: string; MFI_SESSION_COOKIE?: string; }
const json = (data: unknown, status=200) => new Response(JSON.stringify(data), {status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
let membershipReady=false;
async function ensureMembershipSchema(env: Env) {
  if (membershipReady) return;
  await env.DB.batch(MEMBERSHIP_DDL.map((sql:string)=>env.DB.prepare(sql)));
  await backfillMfiMemberships(env.DB);
  membershipReady=true;
}
async function ensureSchema(env: Env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS stock_snapshot (
      symbol TEXT NOT NULL, market TEXT NOT NULL CHECK (market IN ('MY','US')), company_name TEXT NOT NULL, currency TEXT NOT NULL,
      price REAL, change_percent REAL, market_cap REAL, earnings_yield REAL, return_on_capital REAL, magic_formula_rank INTEGER,
      shariah_status TEXT NOT NULL DEFAULT 'unverified', shariah_source TEXT, shariah_as_of TEXT,
      data_status TEXT NOT NULL DEFAULT 'unavailable', provider TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (symbol,market)
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_stock_snapshot_market_rank ON stock_snapshot(market, magic_formula_rank)")
  ]);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS stock_master (symbol TEXT NOT NULL, market TEXT NOT NULL, company_name TEXT NOT NULL, currency TEXT NOT NULL, exchange TEXT, sector TEXT, listing_status TEXT NOT NULL DEFAULT 'active', source TEXT NOT NULL, source_updated_at TEXT NOT NULL, PRIMARY KEY(symbol,market))").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_stock_master_market_name ON stock_master(market,company_name)").run();
  await ensureMembershipSchema(env);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS mfi_screening_meta (id INTEGER PRIMARY KEY CHECK(id=1), minimum_market_cap INTEGER NOT NULL, selected_count INTEGER NOT NULL, result_count INTEGER NOT NULL, source_updated_at TEXT NOT NULL, price_date TEXT, quarter_date TEXT)").run();
}
async function syncMagicFormulaUniverse(env: Env, minimumMarketCap=50, select30=true, forceRefresh=false) {
  await ensureSchema(env);


  // Reuse the last successful MFI result for six hours when the screen settings match.
  // This avoids a login/session round-trip every time someone opens the screener.
  // INTENTIONAL: cache successful MFI sessions for six hours; normal page loads should
  // not repeatedly scrape the authenticated site. The explicit refresh path can bypass this.
  if (!forceRefresh) {
    const cached = await env.DB.prepare("SELECT minimum_market_cap,selected_count,result_count,source_updated_at,price_date,quarter_date FROM mfi_screening_meta WHERE id=1").first<any>();
    const cacheAge = cached?.source_updated_at ? Date.now() - Date.parse(cached.source_updated_at) : Infinity;
    if (cached && cached.minimum_market_cap === minimumMarketCap && cached.selected_count === (select30 ? 30 : 50) && cacheAge >= 0 && cacheAge < 6 * 60 * 60 * 1000) {
      const result = await env.DB.prepare("SELECT m.symbol,m.company_name AS name,COALESCE(q.market_cap,0)/1000000.0 AS marketCapMillions FROM stock_master m LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market='US' WHERE m.market='US' AND EXISTS (SELECT 1 FROM stock_universe_membership um WHERE um.market='US' AND um.symbol=m.symbol AND um.source='Magic Formula Investing' AND um.active=1) ORDER BY m.company_name").all<any>();
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
  const previousUniverse = await env.DB.prepare("SELECT m.symbol,q.market_cap FROM stock_master m LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market='US' WHERE m.market='US' AND m.listing_status='active' AND EXISTS (SELECT 1 FROM stock_universe_membership um WHERE um.market='US' AND um.symbol=m.symbol AND um.active=1) ORDER BY m.symbol").all<any>();
  const previousCaps = new Map<string,number|null>(previousUniverse.results.map((row:any)=>[String(row.symbol),row.market_cap==null?null:Number(row.market_cap)]));
  const previousSymbols = previousUniverse.results.map((row:any)=>String(row.symbol)).sort();
  const nextSymbols = rows.map(row=>row.symbol).sort();
  const universeChanged = previousSymbols.length!==nextSymbols.length || previousSymbols.some((symbol:string,index:number)=>symbol!==nextSymbols[index]);
  const marketCapChanged = rows.some(row=>previousCaps.has(row.symbol) && previousCaps.get(row.symbol)!==row.marketCapMillions*1000000);
  // INTENTIONAL: MFI.com is one source of US universe membership. A refresh may only change the
  // MFI membership; frontend memberships are never deactivated here (see worker/universe-membership.mjs).
  const applied=await applyMfiSelection(env.DB,rows,now);
  if(universeChanged || marketCapChanged || applied.unionChanged) {
    // Candidate membership and market-cap changes invalidate any legacy stored ranks.
    await invalidateUsRanks(env.DB);
  }
  await env.DB.prepare("INSERT INTO mfi_screening_meta (id,minimum_market_cap,selected_count,result_count,source_updated_at,price_date,quarter_date) VALUES (1,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET minimum_market_cap=excluded.minimum_market_cap,selected_count=excluded.selected_count,result_count=excluded.result_count,source_updated_at=excluded.source_updated_at,price_date=excluded.price_date,quarter_date=excluded.quarter_date").bind(minimumMarketCap,select30?30:50,rows.length,now,rows[0]?.priceDate ?? null,rows[0]?.quarterDate ?? null).run();
  return {imported:rows.length,minimumMarketCap,selectedCount:select30?30:50,source:"Magic Formula Investing",asOf:now,priceDate:rows[0]?.priceDate ?? null,quarterDate:rows[0]?.quarterDate ?? null,cached:false,stocks:rows,membership:{mfiAdded:applied.mfiAdded,mfiDeactivated:applied.mfiDeactivated,stillActiveViaOtherSource:applied.stillActiveViaOtherSource,activeUniverseSize:applied.activeUniverseSize}};
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withSecurityHeaders(await handleRequest(request, env));
  },
};

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return json({ ok: true, service: "magic-screen", mode: "mfi-shariah-personal" });
  }

  if (url.pathname === "/api/pipeline/status" && request.method === "GET") {
    try {
      await ensureSchema(env);
      const mfi = await env.DB.prepare(
        "SELECT source_updated_at,price_date,quarter_date,result_count,minimum_market_cap,selected_count FROM mfi_screening_meta WHERE id=1"
      ).first<any>();
      return json({
        market: "US",
        mfi_last_sync: mfi?.source_updated_at ?? null,
        mfi_price_date: mfi?.price_date ?? null,
        mfi_quarter_date: mfi?.quarter_date ?? null,
        mfi_count: mfi?.result_count ?? 0,
        mfi_minimum_market_cap: mfi?.minimum_market_cap ?? null,
        mfi_selected_count: mfi?.selected_count ?? null
      });
    } catch (error) {
      return json({ error: publicErrorMessage(error, "MFI status unavailable") }, 503);
    }
  }

  if (url.pathname === "/api/mfi/screen" && request.method === "GET") {
    try {
      const minimumMarketCap = Math.min(5000000, Math.max(50, Number(url.searchParams.get("minimumMarketCap") ?? 50)));
      const select30 = url.searchParams.get("select30") !== "false";
      let forceRefresh = url.searchParams.get("force") === "1";
      if (forceRefresh) {
        const meta = await env.DB.prepare("SELECT source_updated_at FROM mfi_screening_meta WHERE id=1").first<any>().catch(() => null);
        if (!cooldownElapsed(meta?.source_updated_at, MFI_FORCE_COOLDOWN_MS)) forceRefresh = false;
      }
      return json(await syncMagicFormulaUniverse(env, minimumMarketCap, select30, forceRefresh));
    } catch (error) {
      return json({ error: publicErrorMessage(error, "Magic Formula refresh unavailable"), source: "Magic Formula Investing" }, 503);
    }
  }

  if (url.pathname === "/api/stocks" && request.method === "GET") {
    try {
      await ensureSchema(env);
      const result = await env.DB.prepare(
        `SELECT m.symbol,m.market,m.company_name,m.currency,q.market_cap,q.updated_at,
          (SELECT GROUP_CONCAT(um2.source,'|') FROM stock_universe_membership um2
           WHERE um2.market='US' AND um2.symbol=m.symbol AND um2.active=1) AS universe_sources_raw
         FROM stock_master m
         LEFT JOIN stock_snapshot q ON q.symbol=m.symbol AND q.market='US'
         WHERE m.market='US' AND m.listing_status='active'
           AND EXISTS (SELECT 1 FROM stock_universe_membership um
             WHERE um.market='US' AND um.symbol=m.symbol AND um.source=? AND um.active=1)
         ORDER BY m.company_name`
      ).bind(SOURCE_MFI).all<any>();
      const stocks = result.results.map((row:any) => {
        const { universe_sources_raw, ...stock } = row;
        return { ...stock, universe_sources: universe_sources_raw ? String(universe_sources_raw).split("|").sort() : [] };
      });
      const latest = await env.DB.prepare(
        "SELECT MAX(q.updated_at) AS updated_at FROM stock_snapshot q INNER JOIN stock_universe_membership um ON um.symbol=q.symbol AND um.market='US' AND um.source=? AND um.active=1 WHERE q.market='US'"
      ).bind(SOURCE_MFI).first<any>();
      const mfi = await env.DB.prepare("SELECT source_updated_at FROM mfi_screening_meta WHERE id=1").first<any>();
      return json({
        market: "US",
        stocks,
        updatedAt: latest?.updated_at ?? mfi?.source_updated_at ?? null,
        sourceStatus: stocks.length ? "Magic Formula Investing universe connected" : "Waiting for MFI sync"
      });
    } catch (error) {
      return json({ market: "US", stocks: [], updatedAt: null, sourceStatus: "MFI candidate read failed", error: publicErrorMessage(error, "MFI candidate read failed") }, 503);
    }
  }

  return env.ASSETS.fetch(request);
}
