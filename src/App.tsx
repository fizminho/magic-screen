import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownUp, ArrowUpRight, Bell, ChevronDown, CircleHelp, Clock3, Database, Filter, Menu, RefreshCw, Search, ShieldCheck, Sparkles, TrendingUp, X } from "lucide-react";
import { universe } from "./data/universe";
import type { ApiResponse, Market, Stock } from "./types";
// @ts-ignore — pure ESM screening logic is tested independently in Node.
import { buildShortlist } from "../worker/shariah-screening.mjs";

type Tab = "all" | "shariah" | "watchlist";
type ManualShariahData = { shariahChecks: Array<Record<string, any>>; ipObservations: Array<Record<string, any>> };
type ShariahView = "all" | "eligible_validated" | "eligible_unvalidated" | "needs_review" | "excluded";
const SHARIAH_STORAGE_KEY = "magic-screen:manual-shariah-v1";
const EMPTY_MANUAL_SHARIAH: ManualShariahData = { shariahChecks: [], ipObservations: [] };
type PipelineStatus = {last_quote_sync?:string|null;mfi_last_sync?:string|null;mfi_price_date?:string|null;mfi_quarter_date?:string|null;mfi_count?:number;sec?:{total?:number;calculated?:number;last_updated?:string|null;incomplete?:number;provider_error?:number;unmapped?:number;stale_market_cap?:number;stale_fiscal_period?:number;awaiting_market_cap?:number;awaiting_fundamentals?:number}};
const dateTime = (value?:string|null) => value ? new Date(value).toLocaleString("en-MY",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "Not available";
const money = (value: number | null, currency: string) => value == null ? "—" : new Intl.NumberFormat("en-US", {style:"currency",currency,maximumFractionDigits:2}).format(value);
const pct = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const ratioPct = (value: number | null) => value == null ? "—" : `${(value * 100).toFixed(2)}%`;
const percentagePointDelta = (shadow: number | null, legacy: number | null) => shadow == null || legacy == null ? "—" : `${shadow >= legacy ? "+" : ""}${((shadow - legacy) * 100).toFixed(2)} pp`;

type MfiPreviewRow = {symbol:string;company_name:string|null;market_cap:number|null;earnings_yield:number|null;return_on_capital:number|null;earnings_yield_rank:number|null;return_on_capital_rank:number|null;magic_formula_score:number|null;magic_formula_rank:number|null;ranking_eligible:boolean;exclusion_reasons:string[];review_flags:string[]};
type MfiPreview = {as_of:string;minimum_eligible_cohort:number;summary:{universe:number;eligible:number;ranked:number;excluded:number;unsupported_provider?:number;filing_evidence_unavailable?:number;accounting_or_valuation_review?:number};rankings:MfiPreviewRow[];production_write:boolean;guardrail:string};

const MFI_SOURCE_URL = "https://www.magicformulainvesting.com/Screening/StockScreening";

export default function App() {
  const [market, setMarket] = useState<Market>("MY");
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"rank" | "name" | "change">("rank");
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [marketUniverse, setMarketUniverse] = useState(universe);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [mfiPreview,setMfiPreview]=useState<MfiPreview|null>(null);
  const [mfiPreviewError,setMfiPreviewError]=useState("");
  const [showMfiExcluded,setShowMfiExcluded]=useState(false);
  const [showMfiReconciliation,setShowMfiReconciliation]=useState(false);
  const [manualShariahData,setManualShariahData]=useState<ManualShariahData>(()=> {
    try { const raw=window.localStorage.getItem(SHARIAH_STORAGE_KEY); if(!raw)return EMPTY_MANUAL_SHARIAH; const parsed=JSON.parse(raw); return {shariahChecks:Array.isArray(parsed.shariahChecks)?parsed.shariahChecks:[],ipObservations:Array.isArray(parsed.ipObservations)?parsed.ipObservations:[]}; } catch { return EMPTY_MANUAL_SHARIAH; }
  });
  const [shariahImportOpen,setShariahImportOpen]=useState(false);
  const [shariahJson,setShariahJson]=useState("");
  const [shariahImportStatus,setShariahImportStatus]=useState("");
  const [shariahPromptText,setShariahPromptText]=useState("");
  const [shariahPromptOpen,setShariahPromptOpen]=useState(false);
  const [shariahView,setShariahView]=useState<ShariahView>("all");

  const [sourceStatus, setSourceStatus] = useState("Waiting for first sync");
  const [loading, setLoading] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importToken, setImportToken] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const [page, setPage] = useState(1);
  const [mfiCount, setMfiCount] = useState(30);
  const [minimumMarketCap, setMinimumMarketCap] = useState(50);
  const [addOpen,setAddOpen]=useState(false);
  const [addSymbol,setAddSymbol]=useState("");
  const [addName,setAddName]=useState("");
  const [addCap,setAddCap]=useState("");
  const [addToken,setAddToken]=useState("");
  const [addStatus,setAddStatus]=useState("");
  const [adding,setAdding]=useState(false);
  const [extensionOpen,setExtensionOpen]=useState(false);
  const [extensionSymbol,setExtensionSymbol]=useState("HRB");
  const [extensionToken,setExtensionToken]=useState("");
  const [extensionStatus,setExtensionStatus]=useState("");
  const [extensionResult,setExtensionResult]=useState<unknown>(null);
  const [extensionBusy,setExtensionBusy]=useState(false);
  const pageSize = 40;

  async function load(forceMfiSync = false) {
    setLoading(true);
    let cachedStocksLoaded = false;
    try {
      // INTENTIONAL: normal loads read D1 cache only. Refresh failures must not hide cached rows.
      const response = await fetch(`/api/stocks?market=${market}`);
      if (!response.ok) throw new Error("Cached stock API unavailable");
      const data = await response.json() as ApiResponse & {refresh?:{updated:number;failed:number;remaining:number;error?:string}};
      setStocks(data.stocks ?? []);
      cachedStocksLoaded = true;
      setUpdatedAt(data.updatedAt);

      let refreshMessage = "";
      if (forceMfiSync) {
        if (market === "US") {
          try {
            const syncResponse = await fetch("/api/mfi/screen?minimumMarketCap=" + minimumMarketCap + "&select30=" + (mfiCount === 30) + "&force=1");
            const syncData = await syncResponse.json() as {error?:string};
            if (!syncResponse.ok) throw new Error(syncData.error || "MFI refresh failed");
          } catch (error) {
            refreshMessage = " · Showing cached stocks; MFI refresh unavailable: " + (error instanceof Error ? error.message : "unknown error");
          }
        }
        try {
          const quoteResponse = await fetch(`/api/stocks?market=${market}&refresh=1`);
          const quoteData = await quoteResponse.json() as ApiResponse & {refresh?:{updated:number;failed:number;remaining:number;error?:string}};
          if (quoteData.stocks?.length) {
            setStocks(quoteData.stocks);
            setUpdatedAt(quoteData.updatedAt);
          }
          if (!quoteResponse.ok) throw new Error(quoteData.refresh?.error || "Quote refresh failed");
          if (quoteData.refresh?.failed) refreshMessage += " · Quote refresh failed for " + quoteData.refresh.failed + " symbols";
        } catch (error) {
          refreshMessage += " · Cached quotes retained: " + (error instanceof Error ? error.message : "refresh unavailable");
        }
      }

      if (market === "MY") {
        const universeResponse = await fetch("/api/universe?market=MY");
        if (universeResponse.ok) {
          const master = await universeResponse.json() as { stocks?: Array<{symbol:string;company_name:string;currency:string;market:Market}> };
          if (master.stocks?.length) setMarketUniverse(master.stocks.map(item => ({symbol:item.symbol,name:item.company_name,market:item.market,currency:item.currency})));
        }
      }
      const pipelineResponse = await fetch("/api/pipeline/status?market=" + market);
      if (pipelineResponse.ok) setPipeline(await pipelineResponse.json() as PipelineStatus);
      let fundamentalsStatus = "";
      if (market === "US") {
        const fundamentalsResponse = await fetch("/api/fundamentals/status");
        if (fundamentalsResponse.ok) {
          const fundamentals = await fundamentalsResponse.json() as {calculated?:number;total?:number;unmapped?:number;incomplete?:number;stale_fiscal_period?:number;provider_error?:number;stale_market_cap?:number};
          fundamentalsStatus = " · SEC fundamentals " + (fundamentals.calculated ?? 0) + "/" + (fundamentals.total ?? 0) + " ready";
          if (fundamentals.unmapped) fundamentalsStatus += ", " + fundamentals.unmapped + " unmapped";
          if (fundamentals.incomplete) fundamentalsStatus += ", " + fundamentals.incomplete + " incomplete";
          if (fundamentals.stale_fiscal_period) fundamentalsStatus += ", " + fundamentals.stale_fiscal_period + " stale fiscal periods";
          if (fundamentals.stale_market_cap) fundamentalsStatus += ", " + fundamentals.stale_market_cap + " valuation refresh pending";
          if (fundamentals.provider_error) fundamentalsStatus += ", " + fundamentals.provider_error + " errors";
        }
      }
      setSourceStatus((data.sourceStatus ?? "Showing cached data") + fundamentalsStatus + refreshMessage);
    } catch (error) {
      // INTENTIONAL: secondary request failures never clear a successfully loaded D1 cache.
      if (!cachedStocksLoaded) setSourceStatus(error instanceof Error ? error.message : "Cached stock data unavailable");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [market, mfiCount, minimumMarketCap]);
  useEffect(()=>{
    if(market!=="US"){setMfiPreview(null);setMfiPreviewError("");return;}
    let cancelled=false;
    fetch("/api/fundamentals/edgartools/ranking-preview/public")
      .then(async response=>{const data=await response.json() as MfiPreview & {error?:string};if(!response.ok)throw new Error(data.error||"Shadow ranking unavailable");return data;})
      .then(data=>{if(!cancelled){setMfiPreview(data);setMfiPreviewError("");}})
      .catch(error=>{if(!cancelled)setMfiPreviewError(error instanceof Error?error.message:"Shadow ranking unavailable");});
    return ()=>{cancelled=true;};
  },[market]);

  useEffect(() => {
    try { window.localStorage.setItem(SHARIAH_STORAGE_KEY, JSON.stringify(manualShariahData)); }
    catch { setShariahImportStatus("Browser storage is unavailable. Export your JSON and keep a backup."); }
  }, [manualShariahData]);

  const mfiUniverse = useMemo(() => stocks.filter(s => s.market === "US" && (s.universe_sources ?? []).includes("Magic Formula Investing")).map(s => ({ symbol:s.symbol, name:s.company_name })), [stocks]);
  const shariahShortlist = useMemo(() => buildShortlist({
    universe: { source_url:MFI_SOURCE_URL, retrieved_at:pipeline?.mfi_last_sync ?? updatedAt ?? null, snapshot:"live MFI candidate list", tickers:mfiUniverse },
    shariahChecks:manualShariahData.shariahChecks,
    ipObservations:manualShariahData.ipObservations,
    now:Date.now()
  }), [mfiUniverse,manualShariahData,pipeline?.mfi_last_sync,updatedAt]);
  const shariahBySymbol = useMemo(() => new Map<string, any>(shariahShortlist.rows.map((row:any):[string,any] => [row.symbol,row])), [shariahShortlist]);

  async function copyShariahPrompt() {
    const tickerList = mfiUniverse.map(stock => ({ ticker: stock.symbol, company_name: stock.name }));
    const prompt = [
      "You are helping me research Shariah screening status for a PERSONAL investment research workflow.",
      "Research ONLY the tickers listed below. Use publicly accessible information from Musaffa and HalalScreener where access is permitted.",
      "Do not bypass login, paywalls, CAPTCHAs, rate limits or access controls. Do not scrape or bulk-extract restricted pages. If a source cannot be accessed lawfully, return status \"No data\".",
      "For EACH ticker, return exactly two records: one source=\"musaffa\" and one source=\"halalscreener\".",
      "Capture the exact displayed status (Halal, Doubtful, Not Halal, or No data), the date you checked, a direct source URL, methodology if shown, latest financial period if shown, non-compliant income percentage, interest-bearing debt percentage, interest-bearing assets percentage, and concise evidence/limitations.",
      "Never infer or calculate a missing provider ratio. Use null when a value is not explicitly available. Never guess a status, date, methodology, period or URL. Distinguish unavailable, not found and inaccessible in evidence.",
      "Do not use Mizan or another provider as a substitute for either required source. Do not research Investing Paths or generate Investing Paths observations. That check remains a separate manual step.",
      "Return ONLY valid JSON, with no Markdown fences or commentary, using this exact top-level structure:",
      JSON.stringify({ shariahChecks: [{ symbol: "AAPL", source: "musaffa", status: "Halal", checked_at: "YYYY-MM-DD", reference: "https://...", methodology: null, financial_period: null, non_compliant_income_pct: null, interest_bearing_debt_pct: null, interest_bearing_assets_pct: null, evidence: null, limitations: null }], ipObservations: [] }, null, 2),
      "Allowed source values: musaffa, halalscreener. Allowed status values: Halal, Doubtful, Not Halal, No data.",
      "Include one record per source per ticker, even when no data is available. Do not include tickers outside the supplied list.",
      "Ticker universe:",
      JSON.stringify(tickerList, null, 2)
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(prompt);
      setShariahImportStatus("Ticker list and AI prompt copied. Paste it into your AI assistant.");
    } catch {
      setShariahPromptText(prompt);
      setShariahPromptOpen(true);
      setShariahImportStatus("Clipboard access is unavailable. Copy the prompt from the text box.");
    }
  }
  function importManualShariah() {
    try {
      const parsed=JSON.parse(shariahJson);
      if(!parsed || !Array.isArray(parsed.shariahChecks) || !Array.isArray(parsed.ipObservations)) throw new Error("JSON must contain shariahChecks and ipObservations arrays.");
      const next:ManualShariahData={shariahChecks:parsed.shariahChecks,ipObservations:parsed.ipObservations};
      const preview=buildShortlist({universe:{tickers:mfiUniverse},shariahChecks:next.shariahChecks,ipObservations:next.ipObservations,now:Date.now()});
      setManualShariahData(next);
      setShariahImportStatus(`Imported ${next.shariahChecks.length} Shariah records and ${next.ipObservations.length} Investing Paths records. ${preview.ignored_invalid_shariah_records.length+preview.ignored_invalid_investing_paths_records.length} invalid records will be excluded.`);
      setShariahImportOpen(false);
    } catch(error) { setShariahImportStatus(error instanceof Error?error.message:"Invalid JSON."); }
  }
  function exportManualShariah() {
    const blob=new Blob([JSON.stringify(manualShariahData,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const link=document.createElement("a"); link.href=url; link.download="magic-screen-manual-shariah.json"; link.click(); URL.revokeObjectURL(url);
  }

  useEffect(() => { setPage(1); }, [market, tab, query, sort]);

  const rows = useMemo(() => {
    // US stocks come exclusively from the active Magic Formula API response.
    // Do not merge the old bundled or SEC universe into the selected screener results.
    const base: Stock[] = market === "US" ? stocks : marketUniverse.filter(x => x.market === market).map(x => stocks.find(s => s.symbol === x.symbol) ?? ({
      symbol:x.symbol, market:x.market, company_name:x.name, currency:x.currency, price:null, change_percent:null,
      market_cap:null, earnings_yield:null, return_on_capital:null, magic_formula_rank:null,
      shariah_status:"unverified" as const, shariah_source:null, shariah_as_of:null, data_status:"awaiting_sync",
      provider:null, updated_at:""
    }));
    return base.filter(s => {
      if(tab === "shariah") {
        if(market !== "US" || !(s.universe_sources ?? []).includes("Magic Formula Investing")) return false;
        const state=shariahBySymbol.get(s.symbol)?.state;
        return !!state && (shariahView === "all" || state === shariahView);
      }
      return tab !== "watchlist" || watchlist.includes(s.symbol);
    })
      .filter(s => `${s.symbol} ${s.company_name}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a,b) => sort === "name" ? a.company_name.localeCompare(b.company_name) : sort === "change" ? (b.change_percent ?? -Infinity) - (a.change_percent ?? -Infinity) : (a.magic_formula_rank ?? 999) - (b.magic_formula_rank ?? 999));
  }, [stocks, marketUniverse, market, tab, query, sort, watchlist, shariahBySymbol, shariahView]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const available = stocks.filter(s => s.price != null).length;
  const ranked = stocks.filter(s => s.magic_formula_rank != null).length;
  const toggleWatch = (symbol: string) => setWatchlist(old => old.includes(symbol) ? old.filter(x=>x!==symbol) : [...old,symbol]);


  async function runExtensionDiagnostic() {
    if(!extensionToken.trim()){setExtensionStatus("Enter the UNIVERSE_SYNC_TOKEN configured in Cloudflare.");return;}
    const symbol=extensionSymbol.trim().toUpperCase();
    if(!/^[A-Z0-9.-]{1,15}$/.test(symbol)){setExtensionStatus("Enter a valid US ticker.");return;}
    setExtensionBusy(true);setExtensionStatus("Reading the latest annual SEC filing...");setExtensionResult(null);
    try{
      const response=await fetch("/api/fundamentals/diagnose-extensions",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+extensionToken.trim()},body:JSON.stringify({symbol})});
      const result=await response.json() as {error?:string};
      if(!response.ok) throw new Error(result.error||"SEC extension diagnostic failed ("+response.status+").");
      setExtensionResult(result);setExtensionStatus("Diagnostic complete. No fundamentals or rankings were changed.");
    }catch(error){setExtensionStatus(error instanceof Error?error.message:"Diagnostic failed.");}
    finally{setExtensionToken("");setExtensionBusy(false);}
  }
  function closeExtensionDiagnostic(){
    setExtensionOpen(false);setExtensionToken("");setExtensionStatus("");setExtensionResult(null);
  }

  async function importBursaFile(file: File) {
    if (!importToken.trim()) { setImportStatus("Enter the UNIVERSE_SYNC_TOKEN you configured in Cloudflare."); return; }
    setImporting(true); setImportStatus("Reading CSV...");
    try {
      const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(line=>line.trim());
      const parseRow = (line:string) => {
        const values:string[]=[]; let value="", quoted=false;
        for(let i=0;i<line.length;i++) {
          const ch=line[i];
          if(ch === '"') { if(quoted && line[i+1] === '"') { value+='"'; i++; } else quoted=!quoted; }
          else if(ch === "," && !quoted) { values.push(value.trim()); value=""; }
          else value+=ch;
        }
        values.push(value.trim()); return values;
      };
      if(lines.length<2) throw new Error("CSV must contain a header and at least one company row.");
      const headers=parseRow(lines[0]).map(x=>x.toLowerCase().replace(/[^a-z0-9]+/g," ").trim());
      const find=(names:string[])=>headers.findIndex(h=>names.includes(h));
      const symbolIndex=find(["symbol","ticker","stock code","stock number","code","stock no"]);
      const nameIndex=find(["company name","name of company","company","name","issuer name"]);
      const exchangeIndex=find(["exchange","market","listing market"]);
      const sectorIndex=find(["sector","industry"]);
      if(symbolIndex<0 || nameIndex<0) throw new Error("Could not identify the ticker/code and company-name columns in this CSV.");
      const rows=lines.slice(1).map(line=>{
        const values=parseRow(line);
        return {symbol:values[symbolIndex]??"",company_name:values[nameIndex]??"",exchange:exchangeIndex>=0?values[exchangeIndex]:"Main Market",sector:sectorIndex>=0?values[sectorIndex]:"",listing_status:"active"};
      }).filter(row=>row.symbol.trim() && row.company_name.trim());
      if(!rows.length) throw new Error("No valid company rows found in the CSV.");
      setImportStatus("Uploading "+rows.length.toLocaleString()+" companies...");
      const response=await fetch("/api/universe/import-my",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+importToken.trim()},body:JSON.stringify({source:file.name,rows})});
      const result=await response.json() as {imported?:number;error?:string};
      if(!response.ok) throw new Error(result.error || "Import failed ("+response.status+").");
      setImportStatus("Imported "+(result.imported ?? 0)+" Bursa listings. Reloading market data...");
      await load();
      setImportToken("");
    } catch(error) { setImportStatus(error instanceof Error?error.message:"Import failed."); }
    finally { setImporting(false); }
  }

  async function addUsStock() {
    if (!addToken.trim()) { setAddStatus("Enter the UNIVERSE_SYNC_TOKEN you configured in Cloudflare."); return; }
    if (!addSymbol.trim()) { setAddStatus("Enter a US ticker symbol."); return; }
    setAdding(true); setAddStatus("Adding...");
    try {
      const body:{symbol:string;company_name?:string;market_cap_millions?:number}={symbol:addSymbol.trim()};
      if (addName.trim()) body.company_name=addName.trim();
      if (addCap.trim()) body.market_cap_millions=Number(addCap);
      const response=await fetch("/api/universe/us/stocks",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+addToken.trim()},body:JSON.stringify(body)});
      const result=await response.json() as {symbol?:string;status?:string;error?:string;sec_directory_match?:boolean;awaiting_market_cap?:boolean};
      if(!response.ok) throw new Error(result.error || "Add failed ("+response.status+").");
      setAddStatus((result.symbol??"Stock")+" "+(result.status==="already_active"?"is already in the universe.":"added to the universe.")+(result.sec_directory_match===false?" No SEC ticker match was found, so it will show as unsupported until a filing is mapped.":"")+(result.awaiting_market_cap?" Market cap is not set, so ranks stay withheld until one is available.":"")+" Published ranks are withheld until the new candidate is complete.");
      setAddSymbol(""); setAddName(""); setAddCap("");
      await load();
    } catch(error) { setAddStatus(error instanceof Error?error.message:"Add failed."); }
    finally { setAdding(false); }
  }
  async function removeUsStock(symbol:string) {
    if (!addToken.trim()) { setAddOpen(true); setAddStatus("Enter the token, then use Remove again for "+symbol+"."); return; }
    if (!window.confirm("Remove "+symbol+" from your frontend additions? It stays in the universe if Magic Formula Investing still returns it.")) return;
    try {
      const response=await fetch("/api/universe/us/stocks?symbol="+encodeURIComponent(symbol),{method:"DELETE",headers:{"authorization":"Bearer "+addToken.trim()}});
      const result=await response.json() as {error?:string};
      if(!response.ok) throw new Error(result.error || "Remove failed ("+response.status+").");
      await load();
    } catch(error) { setAddOpen(true); setAddStatus(error instanceof Error?error.message:"Remove failed."); }
  }

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <a className="brand" href="#"><span className="brand-mark"><TrendingUp size={19}/></span><span>magic<span className="brand-light">screen</span><small>INVESTMENT RESEARCH</small></span></a>
      <div className="side-label">WORKSPACE</div>
      <button className="side-link active" onClick={()=>{setTab("all");setMenuOpen(false);}}><Activity size={17}/> Screener <span className="side-dot"/></button>
      <button className="side-link" onClick={()=>{setTab("watchlist");setMenuOpen(false);}}><Bell size={17}/> Watchlist <span className="side-count">{watchlist.length}</span></button>
      <div className="side-label side-gap">MARKETS</div>
      <button className={`side-link ${market==="MY"?"market-active":""}`} onClick={()=>{setMarket("MY");setMenuOpen(false);}}><span className="flag">🇲🇾</span> Bursa Malaysia</button>
      <button className={`side-link ${market==="US"?"market-active":""}`} onClick={()=>{setMarket("US");setMenuOpen(false);}}><span className="flag">🇺🇸</span> United States</button>
      <div className="sidebar-bottom">
        <div className="status-card"><span className="status-icon"><Database size={15}/></span><div><b>Data pipeline</b><small>{sourceStatus}</small></div><span className={`pulse ${available ? "live":""}`}/></div>
        <div className="profile"><div className="avatar">MS</div><div><b>Magic Screen</b><small>Personal workspace</small></div><ChevronDown size={15}/></div>
      </div>
    </aside>
    {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={()=>setMenuOpen(false)} />}
    <main className="main">
      <header className="topbar"><button className="menu-toggle" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)}>{menuOpen ? <X size={19}/> : <Menu size={19}/>}</button><div className="breadcrumb">Workspace <span>/</span> <b>Stock screener</b></div><div className="top-actions"><span className="market-pill">{market==="MY"?"🇲🇾 Bursa Malaysia":"🇺🇸 US Market"}</span><button className="icon-btn" title="About data" onClick={()=>setShowInfo(!showInfo)}><CircleHelp size={18}/></button><div className="avatar small-avatar">MS</div></div></header>
      <section className="content">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> THE MARKET, WITH A METHOD</div><h1>Find quality businesses.<br/><em>Pay a sensible price.</em></h1><p className="intro">A focused stock screener built around the Magic Formula, with Shariah status kept transparent.</p></div><div className="heading-actions">{market==="MY" && <button className="import-btn" onClick={()=>{setImportOpen(true);setImportStatus("");}}><Database size={14}/> Import Bursa CSV</button>}{market==="US" && <><button className="import-btn" onClick={()=>{setAddOpen(true);setAddStatus("");}}><Database size={14}/> Add US stock</button><button className="import-btn" onClick={()=>{setExtensionOpen(true);setExtensionStatus("");setExtensionResult(null);}}><Database size={14}/> Inspect SEC tags</button><label className="mfi-control">Min cap ($M)<input type="number" min="50" max="5000000" step="10" value={minimumMarketCap} onChange={e=>setMinimumMarketCap(Math.max(50,Number(e.target.value)||50))}/></label><label className="mfi-control">Stocks<select value={mfiCount} onChange={e=>setMfiCount(Number(e.target.value))}><option value={30}>Top 30</option><option value={50}>Top 50</option></select></label></>}<button className="refresh-btn" onClick={()=>void load(true)} disabled={loading}><RefreshCw size={15} className={loading?"spin":""}/>{loading?"Refreshing":"Refresh data"}</button></div></div>

        {extensionOpen && <div className="import-overlay" role="dialog" aria-modal="true" aria-label="Inspect SEC extension facts"><div className="import-dialog"><div className="import-dialog-head"><div><div className="eyebrow">SEC EDGAR · READ ONLY</div><h3>Inspect custom XBRL tags</h3></div><button className="modal-close" onClick={closeExtensionDiagnostic} aria-label="Close diagnostic">×</button></div><p>Inspect issuer-specific financial facts in the latest annual filing. This diagnostic does not update D1, calculate ratios, or change rankings.</p><label className="token-label">US ticker<input value={extensionSymbol} onChange={e=>setExtensionSymbol(e.target.value.toUpperCase())} placeholder="e.g. HRB" autoComplete="off"/></label><label className="token-label">UNIVERSE_SYNC_TOKEN<input type="password" value={extensionToken} onChange={e=>setExtensionToken(e.target.value)} placeholder="Cloudflare Worker secret" autoComplete="off"/></label><button className="refresh-btn" onClick={()=>void runExtensionDiagnostic()} disabled={extensionBusy}>{extensionBusy?"Inspecting...":"Inspect SEC filing"}</button>{extensionStatus && <div className="import-status">{extensionStatus}</div>}{extensionResult!=null && <pre className="extension-result">{JSON.stringify(extensionResult,null,2)}</pre>}<small className="import-security">The token is sent directly to your Worker for this request and cleared afterward. No Gemini API call is made.</small></div></div>}
        {addOpen && <div className="import-overlay" role="dialog" aria-modal="true" aria-label="Add US stock"><div className="import-dialog"><div className="import-dialog-head"><div><div className="eyebrow">UNITED STATES</div><h3>Add a stock to the universe</h3></div><button className="modal-close" onClick={()=>setAddOpen(false)} aria-label="Close add stock">×</button></div><p>Frontend additions are kept alongside Magic Formula Investing candidates. An MFI refresh never removes them. New stocks pass through the normal SEC evidence, review and ranking gates, and ranks are withheld until every candidate is complete.</p><label className="token-label">UNIVERSE_SYNC_TOKEN<input type="password" value={addToken} onChange={e=>setAddToken(e.target.value)} placeholder="Paste your Cloudflare Worker secret" autoComplete="off"/></label><label className="token-label">Ticker<input value={addSymbol} onChange={e=>setAddSymbol(e.target.value.toUpperCase())} placeholder="e.g. AAPL or BRK-B" autoComplete="off"/></label><label className="token-label">Company name (optional)<input value={addName} onChange={e=>setAddName(e.target.value)} placeholder="Looked up from SEC if blank" autoComplete="off"/></label><label className="token-label">Market cap, $M (optional)<input type="number" min="1" value={addCap} onChange={e=>setAddCap(e.target.value)} placeholder="Needed before it can be ranked" autoComplete="off"/></label><button className="refresh-btn" onClick={()=>void addUsStock()} disabled={adding}>{adding?"Adding":"Add stock"}</button>{addStatus && <div className="import-status">{addStatus}</div>}<small className="import-security">The token is sent directly to your Worker for this request only. It is not saved in the browser.</small></div></div>}
        {importOpen && <div className="import-overlay" role="dialog" aria-modal="true" aria-label="Import Bursa listings"><div className="import-dialog"><div className="import-dialog-head"><div><div className="eyebrow">BURSA MALAYSIA</div><h3>Import listed companies</h3></div><button className="modal-close" onClick={()=>setImportOpen(false)} aria-label="Close import">×</button></div><p>Upload the official Bursa company directory as a CSV file. The importer recognises common ticker and company-name column headings.</p><label className="token-label">UNIVERSE_SYNC_TOKEN<input type="password" value={importToken} onChange={e=>setImportToken(e.target.value)} placeholder="Paste your Cloudflare Worker secret" autoComplete="off"/></label><label className="csv-upload"><Database size={18}/><b>{importing?"Importing...":"Choose Bursa CSV file"}</b><small>CSV format only. Export the Bursa directory to CSV first.</small><input type="file" accept=".csv,text/csv" disabled={importing} onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void importBursaFile(file);e.currentTarget.value="";}}/></label>{importStatus && <div className="import-status">{importStatus}</div>}<small className="import-security">The token is sent directly to your Worker for this request only. It is not saved in the browser.</small></div></div>}
        {shariahImportOpen && <div className="import-overlay" role="dialog" aria-modal="true" aria-label="Paste AI Shariah screening JSON"><div className="import-dialog shariah-import-dialog"><div className="import-dialog-head"><div><div className="eyebrow">TEXT ONLY · PERSONAL USE</div><h3>Paste AI screening results</h3></div><button className="modal-close" onClick={()=>setShariahImportOpen(false)} aria-label="Close Shariah import">×</button></div><p>Paste the raw JSON returned by your AI assistant. No file upload is needed. InvestLah validates the ticker, source, status, date and source reference before using the records.</p><textarea className="shariah-json" value={shariahJson} onChange={e=>setShariahJson(e.target.value)} placeholder='{"shariahChecks":[],"ipObservations":[]}' spellCheck={false}/><button className="refresh-btn" onClick={importManualShariah} disabled={!shariahJson.trim()}>Validate and import pasted JSON</button>{shariahImportStatus && <div className="import-status">{shariahImportStatus}</div>}<small className="import-security">Data stays in this browser's local storage. It is not uploaded to Magic Screen's Worker or any screening provider. Investing Paths observations remain a separate manual check.</small></div></div>}
        {shariahPromptOpen && <div className="import-overlay" role="dialog" aria-modal="true" aria-label="Copy AI research prompt"><div className="import-dialog shariah-import-dialog"><div className="import-dialog-head"><div><div className="eyebrow">COPY PROMPT</div><h3>AI research prompt</h3></div><button className="modal-close" onClick={()=>setShariahPromptOpen(false)} aria-label="Close prompt">×</button></div><p>Select and copy this prompt into your AI assistant.</p><textarea className="shariah-json" value={shariahPromptText} readOnly spellCheck={false}/><button className="refresh-btn" onClick={()=>void navigator.clipboard.writeText(shariahPromptText).then(()=>{setShariahPromptOpen(false);setShariahImportStatus("AI prompt copied. Paste it into your AI assistant.");}).catch(()=>setShariahImportStatus("Select the prompt text and copy it manually."))}>Copy prompt</button></div></div>}
        {showInfo && <div className="info-banner"><ShieldCheck size={18}/><div><b>Data integrity comes first.</b><p>Prices, fundamentals and Shariah status are only shown when a source is available and verified. Unknown is not the same as compliant. US screening candidates are supplied by Magic Formula Investing. Bursa listings are loaded from the Bursa directory import. Yahoo Finance quotes are unofficial. Magic Formula metrics and Shariah classifications stay blank or unverified until reliable, dated financial and screening sources are connected.</p></div><button onClick={()=>setShowInfo(false)}>×</button></div>}
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-top">UNIVERSE <span className="stat-icon"><Activity size={16}/></span></div><div className="stat-value">{rows.length}<small> stocks tracked</small></div><div className="stat-foot">Initial watch universe</div></div>
          <div className="stat-card"><div className="stat-top">LIVE QUOTES <span className="stat-icon green"><TrendingUp size={16}/></span></div><div className="stat-value">{available}<small> / {rows.length}</small></div><div className="stat-foot">{available ? "Quotes received" : "Waiting for market data"}</div></div>
          <div className="stat-card"><div className="stat-top">FORMULA RANKED <span className="stat-icon violet"><Sparkles size={16}/></span></div><div className="stat-value">{ranked}<small> stocks</small></div><div className="stat-foot">Needs verified fundamentals</div></div>
          <div className="stat-card"><div className="stat-top">LAST UPDATED <span className="stat-icon"><Clock3 size={16}/></span></div><div className="stat-value time-value">{updatedAt ? new Date(updatedAt).toLocaleTimeString("en-MY",{hour:"2-digit",minute:"2-digit"}) : "—"}</div><div className="stat-foot">{updatedAt ? new Date(updatedAt).toLocaleDateString("en-MY") : "No successful sync yet"}</div></div>
        </div>
        <div className="pipeline-meta">
          {market==="US" ? <>
            <div><span>MFI UNIVERSE SYNC</span><b>{dateTime(pipeline?.mfi_last_sync)}</b><small>{pipeline?.mfi_count ?? 0} candidates · Price date {pipeline?.mfi_price_date ?? "—"} · Quarter data {pipeline?.mfi_quarter_date ?? "—"}</small></div>
            <div><span>SEC DATA LAST PROCESSED</span><b>{dateTime(pipeline?.sec?.last_updated)}</b><small>{pipeline?.sec?.calculated ?? 0}/{pipeline?.sec?.total ?? 0} current · {pipeline?.sec?.awaiting_market_cap ?? 0} awaiting market cap · {pipeline?.sec?.awaiting_fundamentals ?? 0} awaiting SEC · {pipeline?.sec?.incomplete ?? 0} incomplete · {pipeline?.sec?.stale_market_cap ?? 0} valuation refresh pending · {pipeline?.sec?.unmapped ?? 0} unmapped · {pipeline?.sec?.provider_error ?? 0} provider errors</small></div>
          </> : <div><span>QUOTE CACHE</span><b>{dateTime(pipeline?.last_quote_sync)}</b><small>Latest stored Bursa quote timestamp</small></div>}
        </div>

        {market==="US" && <section className="mfi-preview-panel">
          <div className="mfi-preview-head"><div><div className="eyebrow">EDGARTOOLS · SHADOW CALCULATION</div><h2>Magic Formula preview <span className="preview-pill">NOT PRODUCTION</span></h2><p>Read-only ranking from annual filing evidence. Candidate accounting inputs are not yet policy-approved.</p></div><div className="preview-updated">{mfiPreview ? dateTime(mfiPreview.as_of) : "Waiting for preview"}</div></div>
          {mfiPreviewError ? <div className="preview-empty">Preview unavailable: {mfiPreviewError}</div> : !mfiPreview ? <div className="preview-empty">Loading shadow ranking…</div> : <>
            <div className="preview-stats"><div><b>{mfiPreview.summary.universe}</b><span>Universe</span></div><div><b>{mfiPreview.summary.eligible}</b><span>Eligible</span></div><div><b>{mfiPreview.summary.ranked}</b><span>Ranked</span></div><div><b>{mfiPreview.summary.excluded}</b><span>Not ranked</span></div></div>
            <p className="preview-cohort-note">{mfiPreview.summary.eligible} of {mfiPreview.summary.universe} companies pass the current evidence gates. {mfiPreview.summary.eligible < mfiPreview.minimum_eligible_cohort ? `The minimum cohort is ${mfiPreview.minimum_eligible_cohort}, so numeric ranks are withheld until at least ${mfiPreview.minimum_eligible_cohort} companies qualify.` : `Classic Magic Formula ranking uses the sum of EY and ROC ordinal ranks; lower combined scores rank higher.`} Coverage exclusions: {mfiPreview.summary.unsupported_provider ?? 0} provider-unsupported, {mfiPreview.summary.filing_evidence_unavailable ?? 0} awaiting filing evidence, {mfiPreview.summary.accounting_or_valuation_review ?? 0} accounting/valuation review. This is a read-only preview, not a production ranking.</p>
            <div className="table-wrap"><table className="preview-table"><thead><tr><th>RANK</th><th>COMPANY</th><th>EY · SHADOW / LEGACY</th><th>ROC · SHADOW / LEGACY</th><th>EY RANK</th><th>ROC RANK</th><th>REVIEW FLAGS</th></tr></thead><tbody>
              {mfiPreview.rankings.filter(row=>row.magic_formula_rank!==null).map(row=>{
                const legacy=stocks.find(stock=>stock.market==="US" && stock.symbol===row.symbol);
                const legacyEy=legacy?.earnings_yield ?? null;
                const legacyRoc=legacy?.return_on_capital ?? null;
                return <tr key={row.symbol}><td className="formula-score">#{row.magic_formula_rank}</td><td><b>{row.company_name||row.symbol}</b><small className="preview-symbol">{row.symbol}</small></td><td><b>{ratioPct(row.earnings_yield)}</b><small className="preview-legacy-value" title={legacy?.fundamentals_status ? `Company Facts status: ${legacy.fundamentals_status}` : "No production Company Facts row"}>Legacy: {ratioPct(legacyEy)} · Δ {percentagePointDelta(row.earnings_yield,legacyEy)}</small></td><td><span title={row.return_on_capital!==null && row.return_on_capital>5?"Candidate ROC exceeds 500%. Review working capital, lease classification and net PP&E scope before relying on this value.": "Candidate ROC, not accounting-approved."}>{ratioPct(row.return_on_capital)}</span><small className="preview-legacy-value" title={legacy?.fundamentals_status ? `Company Facts status: ${legacy.fundamentals_status}` : "No production Company Facts row"}>Legacy: {ratioPct(legacyRoc)} · Δ {percentagePointDelta(row.return_on_capital,legacyRoc)}</small>{row.return_on_capital!==null && row.return_on_capital>5 && <small className="preview-warning">Outlier · verify denominator</small>}</td><td>{row.earnings_yield_rank?.toFixed(1)??"—"}</td><td>{row.return_on_capital_rank?.toFixed(1)??"—"}</td><td><span className="preview-warning" title={row.review_flags.join(", ") || "No review flags"}>{row.review_flags.length} flags · hover for details</span></td></tr>;
              })}
            </tbody></table></div>
            <button className="import-btn mfi-excluded-toggle" onClick={()=>setShowMfiReconciliation(value=>!value)}>{showMfiReconciliation?"Hide":"Show"} full legacy comparison ({mfiPreview.summary.universe})</button>
            {showMfiReconciliation && <div className="mfi-reconciliation">
              <p className="preview-cohort-note">Every active MFI candidate is shown, not just ranked names. Legacy values come from the current Company Facts production lane; shadow values come from the accession-matched EdgarTools annual filing lane. Missing values are shown as unavailable, never treated as zero.</p>
              <div className="table-wrap mfi-excluded-wrap"><table className="preview-table"><thead><tr><th>SYMBOL / STATUS</th><th>SHADOW EY</th><th>LEGACY EY</th><th>EY Δ</th><th>SHADOW ROC</th><th>LEGACY ROC</th><th>ROC Δ</th></tr></thead><tbody>
                {mfiPreview.rankings.map(row=>{
                  const legacy=stocks.find(stock=>stock.market==="US" && stock.symbol===row.symbol);
                  return <tr key={row.symbol}><td><b>{row.symbol}</b><small className="preview-symbol">{row.magic_formula_rank!==null?`Rank #${row.magic_formula_rank}`:(row.ranking_eligible?"Eligible · awaiting rank":row.exclusion_reasons.join(" · ")||"Not ranked")} · {legacy?.fundamentals_status||"No legacy row"}</small></td><td>{ratioPct(row.earnings_yield)}</td><td>{ratioPct(legacy?.earnings_yield??null)}</td><td>{percentagePointDelta(row.earnings_yield,legacy?.earnings_yield??null)}</td><td>{ratioPct(row.return_on_capital)}</td><td>{ratioPct(legacy?.return_on_capital??null)}</td><td>{percentagePointDelta(row.return_on_capital,legacy?.return_on_capital??null)}</td></tr>;
                })}
              </tbody></table></div>
            </div>}
            <button className="import-btn mfi-excluded-toggle" onClick={()=>setShowMfiExcluded(value=>!value)}>{showMfiExcluded?"Hide":"Show"} excluded companies ({mfiPreview.summary.excluded})</button>
            {showMfiExcluded && <div className="table-wrap mfi-excluded-wrap"><table className="preview-table"><thead><tr><th>COMPANY</th><th>WHY IT IS EXCLUDED</th></tr></thead><tbody>
              {mfiPreview.rankings.filter(row=>row.magic_formula_rank===null).map(row=><tr key={row.symbol}><td><b>{row.company_name||row.symbol}</b><small className="preview-symbol">{row.symbol}</small></td><td><small className="mfi-exclusion-reasons">{row.ranking_eligible ? `Eligible, but ranks are withheld because the minimum cohort of ${mfiPreview.minimum_eligible_cohort} has not been met.` : row.exclusion_reasons.join(" · ") || "No reason returned"}</small></td></tr>)}
            </tbody></table></div>}
            <p className="preview-footnote">Legacy values are the current Company Facts production lane; shadow values use accession-bound EdgarTools annual evidence. Deltas are percentage points and are diagnostic only. They do not approve the shadow inputs or change production. Every ranked row with accounting flags remains review-required. Candidate ROC above 500% is highlighted as an outlier for denominator validation, not automatically rejected. Hover over each flag count to inspect the exact issues. Not-ranked reasons are screening guardrails, not accounting conclusions. {mfiPreview.guardrail} Production write: {String(mfiPreview.production_write)}.</p>
          </>}
        </section>}

        <div className="section-title"><div><div className="eyebrow">DISCOVER OPPORTUNITIES</div><h2>{market==="MY"?"Bursa Malaysia":"US Equities"} <span className="sub-count">{rows.length} companies</span></h2></div><div className="method-tag"><Sparkles size={14}/> MAGIC FORMULA</div></div>
        {tab==="shariah" && <section className="shariah-panel">
          <div className="shariah-panel-head"><div><div className="eyebrow">MFI · TWO-SOURCE SCREENING</div><h3>Shariah-first shortlist</h3><p>Only current Magic Formula Investing candidates are included. A ticker is eligible only when both Musaffa and HalalScreener show fresh Halal results.</p></div><div className="shariah-actions"><button className="import-btn" onClick={()=>void copyShariahPrompt()}>Copy tickers + AI prompt</button><button className="import-btn" onClick={()=>{setShariahImportOpen(true);setShariahImportStatus("");setShariahJson("");}}>Paste AI JSON</button></div></div>
          <div className="shariah-summary"><div><b>{shariahShortlist.summary.eligible_validated}</b><span>Eligible · IP validated</span></div><div><b>{shariahShortlist.summary.eligible_unvalidated}</b><span>Eligible · IP not checked</span></div><div><b>{shariahShortlist.summary.needs_review}</b><span>Needs review</span></div><div><b>{shariahShortlist.summary.excluded}</b><span>Excluded / incomplete</span></div></div>
          <div className="shariah-filter-row"><label>Show<select value={shariahView} onChange={e=>setShariahView(e.target.value as ShariahView)}><option value="all">All screening states</option><option value="eligible_validated">Eligible · IP validated</option><option value="eligible_unvalidated">Eligible · IP not checked</option><option value="needs_review">Needs manual review</option><option value="excluded">Excluded / incomplete</option></select></label><span>{mfiUniverse.length} MFI candidates · {manualShariahData.shariahChecks.length} Shariah checks · {manualShariahData.ipObservations.length} manual IP records</span></div>
          {shariahImportStatus && <div className="import-status">{shariahImportStatus}</div>}
          <small className="shariah-local-note">Manual records are saved only in this browser. Export a backup before changing devices or clearing browser data. No provider is queried automatically.</small>
        </section>}

        <div className="toolbar"><div className="tabs"><button className={tab==="all"?"selected":""} onClick={()=>setTab("all")}>All stocks</button><button className={tab==="shariah"?"selected":""} onClick={()=>{setMarket("US");setTab("shariah");}}> <ShieldCheck size={14}/> Shariah shortlist</button><button className={tab==="watchlist"?"selected":""} onClick={()=>setTab("watchlist")}>Watchlist</button></div><div className="tools"><div className="searchbox"><Search size={15}/><input placeholder="Search company or ticker..." value={query} onChange={e=>setQuery(e.target.value)}/></div><button className="sort-btn" onClick={()=>setSort(s=>s==="rank"?"name":s==="name"?"change":"rank")}><ArrowDownUp size={14}/> Sort: {sort==="rank"?"Formula":sort==="name"?"Name":"Change"}</button></div></div>
        <div className="table-wrap"><table><thead><tr><th className="rank-col">#</th><th>COMPANY</th><th>PRICE</th><th>MARKET CAP</th><th>DAY CHANGE</th><th>EARNINGS YIELD</th><th>RETURN ON CAPITAL</th><th>FORMULA RANK</th><th>SOURCE</th>{tab==="shariah" && <><th>DECISION</th><th>SHARIAH SOURCES</th><th>INVESTING PATHS</th></>}<th></th></tr></thead><tbody>
          {pageRows.map((s,i)=><tr key={s.symbol}><td className="rank-cell">{s.magic_formula_rank ?? "—"}</td><td><div className="company-cell"><div className="ticker-icon">{s.symbol.replace(".KL","").slice(0,2)}</div><div><b>{s.company_name}</b><small>{s.symbol}</small>{s.market==="US" && (s.universe_sources??["Magic Formula Investing"]).includes("Magic Formula Investing") && <span className="intent-flag" title="Included in the Magic Formula Investing candidate universe; this is not a formula rank.">MFI CANDIDATE</span>}{s.market==="US" && (s.universe_sources??[]).includes("Frontend") && <span className="intent-flag" title="Added through the frontend. It stays active even if Magic Formula Investing no longer returns it.">ADDED{(s.universe_sources??[]).includes("Magic Formula Investing")?" + MFI":""}</span>}{s.market==="US" && (s.universe_sources??[]).includes("Frontend") && <button className="star-btn" title="Remove frontend addition" aria-label={"Remove "+s.symbol} onClick={()=>void removeUsStock(s.symbol)}>×</button>}{s.fundamentals_status==="stale_fiscal_period" && <span className="intent-flag stale" title="The latest annual SEC period available to this calculation is older than 550 days. Ratios and ranking are withheld until current facts are found.">STALE FACTS</span>}{(s.fundamentals_status==="negative_invested_capital" || s.fundamentals_status==="zero_invested_capital") && <span className="intent-flag stale" title={s.fundamentals_status==="negative_invested_capital"?"Reported current assets less current liabilities plus net PP&E is negative. ROC and ranking are intentionally withheld because this denominator is not meaningful for the standard formula.":"Reported current assets less current liabilities plus net PP&E is zero. ROC and ranking are intentionally withheld because division by zero is not meaningful."}>ROC REVIEW</span>}{s.fundamentals_missing_fields?.length ? <span className="intent-flag stale" title={"Not found in standard SEC Company Facts: "+s.fundamentals_missing_fields.join(", ")+". This does not mean the reported value is zero; the filing may use a custom tag or dimensional disclosure."}>FACTS MISSING</span> : null}{s.fundamentals_zero_fields?.length ? <span className="intent-flag" title={"Explicitly reported as zero in SEC Company Facts: "+s.fundamentals_zero_fields.join(", ")+". Zero is retained as reported, not treated as missing."}>ZERO FACT</span> : null}</div></div></td><td className="price-cell">{money(s.price,s.currency)}</td><td>{s.market_cap==null?"—":money(s.market_cap,s.currency)}</td><td className={s.change_percent==null?"muted":s.change_percent>=0?"positive":"negative"}>{pct(s.change_percent)}</td><td className="metric-cell"><span>{ratioPct(s.earnings_yield)}</span>{s.fiscal_period && <small className="metric-date">FY {s.fiscal_period}</small>}</td><td className="metric-cell"><span>{ratioPct(s.return_on_capital)}</span>{s.fiscal_period && <small className="metric-date">FY {s.fiscal_period}</small>}</td><td>{s.magic_formula_rank ? <span className="formula-score">#{s.magic_formula_rank}</span> : <span className="muted">Not ranked</span>}</td><td className="source-cell">{market==="US" ? ((s.universe_sources??["Magic Formula Investing"]).includes("Magic Formula Investing") ? <a href={MFI_SOURCE_URL} target="_blank" rel="noreferrer">Magic Formula Investing<span className="source-url">{MFI_SOURCE_URL}</span></a> : <span className="muted">Frontend addition</span>) : <span className="muted">Bursa directory import</span>}</td>{tab==="shariah" && <><td className="shariah-cell"><b>{shariahBySymbol.get(s.symbol)?.state?.replaceAll("_"," ") ?? "Excluded"}</b><small>{shariahBySymbol.get(s.symbol)?.shariah.reasons.join(" · ") || "No additional review notes"}</small></td><td className="shariah-cell"><b>Musaffa: {shariahBySymbol.get(s.symbol)?.shariah.per_source.musaffa.status ?? "unchecked"}</b><small>Checked {shariahBySymbol.get(s.symbol)?.shariah.per_source.musaffa.checked_at ?? "—"}</small><small>Ref: {shariahBySymbol.get(s.symbol)?.shariah.per_source.musaffa.reference ?? "—"}</small><b>HalalScreener: {shariahBySymbol.get(s.symbol)?.shariah.per_source.halalscreener.status ?? "unchecked"}</b><small>Checked {shariahBySymbol.get(s.symbol)?.shariah.per_source.halalscreener.checked_at ?? "—"}</small><small>Ref: {shariahBySymbol.get(s.symbol)?.shariah.per_source.halalscreener.reference ?? "—"}</small></td><td className="shariah-cell">{shariahBySymbol.get(s.symbol)?.investing_paths.status==="verified" ? <><b>Rank #{shariahBySymbol.get(s.symbol)?.investing_paths.rank ?? "—"}</b><small>EY {shariahBySymbol.get(s.symbol)?.investing_paths.earnings_yield ?? "—"}% · ROC {shariahBySymbol.get(s.symbol)?.investing_paths.return_on_capital ?? "—"}%</small><small>{[shariahBySymbol.get(s.symbol)?.investing_paths.fiscal_year,shariahBySymbol.get(s.symbol)?.investing_paths.fiscal_period].filter(Boolean).join(" ") || "Fiscal period —"}</small><small>Checked {shariahBySymbol.get(s.symbol)?.investing_paths.checked_at}</small><small>Ref: {shariahBySymbol.get(s.symbol)?.investing_paths.source_reference}</small></> : shariahBySymbol.get(s.symbol)?.investing_paths.status==="not_found" ? <><b>Not found</b><small>Checked {shariahBySymbol.get(s.symbol)?.investing_paths.checked_at}</small><small>Ref: {shariahBySymbol.get(s.symbol)?.investing_paths.source_reference}</small></> : <span>Not checked</span>}</td></>}<td><button className={`star-btn ${watchlist.includes(s.symbol)?"starred":""}`} onClick={()=>toggleWatch(s.symbol)} aria-label="Toggle watchlist">★</button></td></tr>)}
        </tbody></table>{rows.length===0 && <div className="empty-state"><Filter size={24}/><b>No stocks match this view</b><span>Try another search or switch tabs.</span></div>}</div>
        <div className="table-footer"><span>Showing {rows.length ? (page-1)*pageSize+1 : 0}–{Math.min(page*pageSize,rows.length)} of {rows.length} companies</span><div className="pagination"><button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Previous</button><span>{page} / {pageCount}</span><button disabled={page>=pageCount} onClick={()=>setPage(p=>Math.min(pageCount,p+1))}>Next</button></div><span><i className="legend-dot"/> Data status: {available ? "Partial live data" : "Awaiting first sync"}</span></div>
        <div className="method-note"><div className="method-note-icon"><CircleHelp size={17}/></div><div><b>How the Magic Formula works</b><p>Ranks businesses by a combination of Earnings Yield and Return on Capital. Earnings Yield is EBIT divided by Enterprise Value. Return on Capital is EBIT divided by net working capital plus net PP&E. Ratios use reported annual SEC facts and stay blank when required inputs are missing.</p></div><button onClick={()=>setShowInfo(true)}>Data methodology <ArrowUpRight size={14}/></button></div>
        <footer><span>© 2026 Magic Screen</span><span>Research tool only · Not investment advice</span><span>Built for clarity <span className="footer-star">✳</span></span></footer>
      </section>
    </main>
  </div>;
}
