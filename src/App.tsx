import { useEffect, useMemo, useState } from "react";
import { Activity, Check, Clipboard, ClipboardPaste, RefreshCw, Search, ShieldCheck } from "lucide-react";
// @ts-ignore — pure ESM screening logic is tested independently in Node.
import { buildShortlist } from "../worker/shariah-screening.mjs";

type Stock = { symbol:string; company_name:string; market:string; price:number|null; market_cap:number|null; earnings_yield:number|null; return_on_capital:number|null; magic_formula_rank:number|null; universe_sources?:string[] };
type Pipeline = { mfi_last_sync?:string|null; mfi_count?:number|null; mfi_price_date?:string|null; mfi_quarter_date?:string|null };
type CheckRecord = Record<string,any>;
type ManualData = { shariahChecks:CheckRecord[]; ipObservations:CheckRecord[] };
type View = "all" | "eligible_validated" | "eligible_unvalidated" | "needs_review" | "excluded";
const STORAGE_KEY="magic-screen:manual-shariah-v1";
const MFI_URL="https://www.magicformulainvesting.com/Screening/StockScreening";
const EMPTY:ManualData={shariahChecks:[],ipObservations:[]};
const today=()=>new Date().toISOString().slice(0,10);
const dateLabel=(value?:string|null)=>value?new Date(value).toLocaleString("en-MY",{dateStyle:"medium",timeStyle:"short"}):"Not synced";
const pct=(value:any)=>value==null||value===""?"—":`${Number(value)}%`;

export default function App(){
 const [stocks,setStocks]=useState<Stock[]>([]);
 const [pipeline,setPipeline]=useState<Pipeline|null>(null);
 const [updatedAt,setUpdatedAt]=useState<string|null>(null);
 const [loading,setLoading]=useState(false);
 const [status,setStatus]=useState("Loading MFI universe…");
 const [tab,setTab]=useState<"universe"|"shortlist">("shortlist");
 const [query,setQuery]=useState("");
 const [view,setView]=useState<View>("all");
 const [manual,setManual]=useState<ManualData>(()=>{try{const v=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");return v&&Array.isArray(v.shariahChecks)&&Array.isArray(v.ipObservations)?v:EMPTY;}catch{return EMPTY;}});
 const [pasteOpen,setPasteOpen]=useState(false);
 const [jsonText,setJsonText]=useState("");
 const [message,setMessage]=useState("");
 const [promptText,setPromptText]=useState("");
 const [promptOpen,setPromptOpen]=useState(false);
 const [ipOpen,setIpOpen]=useState(false);
 const [ipSymbol,setIpSymbol]=useState("");
 const [ipFound,setIpFound]=useState(true);
 const [ipRank,setIpRank]=useState("");
 const [ipEy,setIpEy]=useState("");
 const [ipRoc,setIpRoc]=useState("");
 const [ipYear,setIpYear]=useState("");
 const [ipPeriod,setIpPeriod]=useState("");
 const [ipDate,setIpDate]=useState(today());
 const [ipReference,setIpReference]=useState("");

 async function load(force=false){
  setLoading(true);
  let refreshError="";
  try{
   if(force){
    try{
     const sync=await fetch("/api/mfi/screen?minimumMarketCap=50&select30=true&force=1");
     const result=await sync.json() as {error?:string};
     if(!sync.ok) refreshError=result.error||"MFI refresh failed";
    }catch(e){refreshError=e instanceof Error?e.message:"MFI refresh failed";}
   }
   const [stockResponse,pipelineResponse]=await Promise.all([
    fetch("/api/stocks?market=US"),
    fetch("/api/pipeline/status?market=US")
   ]);
   if(!stockResponse.ok) throw new Error("Unable to load the MFI candidate list");
   const data=await stockResponse.json() as {stocks?:Stock[];updatedAt?:string|null};
   setStocks((data.stocks||[]).filter((s:Stock)=>(s.universe_sources||[]).includes("Magic Formula Investing")));
   setUpdatedAt(data.updatedAt||null);
   if(pipelineResponse.ok)setPipeline(await pipelineResponse.json());
   setStatus(refreshError?"Showing cached MFI candidates. Refresh unavailable: "+refreshError:force?"MFI candidate list refreshed.":"MFI candidate list loaded.");
  }catch(e){setStatus(e instanceof Error?e.message:"Unable to load data.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);
 useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(manual));}catch{setMessage("Browser storage is full or unavailable. Keep a copy of your research JSON.");}},[manual]);

 const universe=useMemo(()=>stocks.map(s=>({symbol:s.symbol,name:s.company_name})),[stocks]);
 const shortlist=useMemo(()=>buildShortlist({
  universe:{source_url:MFI_URL,retrieved_at:pipeline?.mfi_last_sync??updatedAt??null,snapshot:"current MFI candidate list",tickers:universe},
  shariahChecks:manual.shariahChecks,ipObservations:manual.ipObservations,now:Date.now()
 }),[universe,manual,pipeline?.mfi_last_sync,updatedAt]);
 const rowMap=useMemo(()=>new Map(shortlist.rows.map((r:any)=>[r.symbol,r])),[shortlist]);
 const rows=useMemo(()=>shortlist.rows.filter((r:any)=>{
  if(view!=="all"&&tab==="shortlist"&&r.state!==view)return false;
  const stock=stocks.find(s=>s.symbol===r.symbol);
  return `${r.symbol} ${stock?.company_name||r.name||""}`.toLowerCase().includes(query.toLowerCase());
 }),[shortlist,stocks,view,tab]);
 const eligible=shortlist.summary.eligible_validated+shortlist.summary.eligible_unvalidated;

 async function copyPrompt(){
  const tickerList=universe.map(s=>({ticker:s.symbol,company_name:s.name}));
  const prompt=[
   "You are assisting with PERSONAL Shariah stock research. Research only the tickers supplied below.",
   "For every ticker, check both Musaffa and HalalScreener only if their current terms permit AI or automated research access. If those terms do not permit it, do not access that source; return No data and explain that a manual check is required. Never bypass login, paywalls, CAPTCHAs, rate limits or access controls. Do not scrape or bulk-extract restricted pages.",
   "Return exactly two shariahChecks records per ticker: source musaffa and source halalscreener. Use the exact displayed status: Halal, Doubtful, Not Halal, or No data. Include checked_at (YYYY-MM-DD), direct source URL in reference, methodology, latest financial period, non-compliant income %, interest-bearing debt %, interest-bearing assets %, evidence and limitations when available.",
   "Never guess, infer or calculate a missing status or ratio. Use null for unavailable numeric/text fields. Do not substitute Mizan or any other provider. Do not research Investing Paths. I will check Investing Paths separately and enter those observations manually.",
   "Return ONLY valid JSON, without Markdown fences or commentary. Use this exact structure:",
   JSON.stringify({shariahChecks:[{symbol:"AAPL",source:"musaffa",status:"Halal",checked_at:"YYYY-MM-DD",reference:"https://...",methodology:null,financial_period:null,non_compliant_income_pct:null,interest_bearing_debt_pct:null,interest_bearing_assets_pct:null,evidence:null,limitations:null}],ipObservations:[]},null,2),
   "Allowed source values: musaffa, halalscreener. Allowed status values: Halal, Doubtful, Not Halal, No data. Include one record per source per ticker, including No data. Do not include other tickers.",
   "MFI ticker universe:",JSON.stringify(tickerList,null,2)
  ].join("\n\n");
  try{await navigator.clipboard.writeText(prompt);setMessage("Ticker list and AI prompt copied. Paste it into your AI assistant.");}
  catch{setPromptText(prompt);setPromptOpen(true);}
 }
 function importJson(){
  try{
   const parsed=JSON.parse(jsonText);
   if(!parsed||!Array.isArray(parsed.shariahChecks)||!Array.isArray(parsed.ipObservations))throw new Error("JSON must contain shariahChecks and ipObservations arrays.");
   const allowed=new Set(universe.map(s=>s.symbol));
   const allowedSources=new Set(["musaffa","halalscreener"]);
   const allowedStatuses=new Set(["Halal","Doubtful","Not Halal","No data"]);
   for(const item of parsed.shariahChecks){
    if(!allowed.has(String(item.symbol||"").toUpperCase()))throw new Error("Unknown or non-MFI ticker: "+(item.symbol||"missing ticker"));
    if(!allowedSources.has(item.source))throw new Error("Unsupported Shariah source for "+item.symbol);
    if(!allowedStatuses.has(item.status))throw new Error("Unsupported status for "+item.symbol);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(item.checked_at||"")||Number.isNaN(Date.parse(item.checked_at)))throw new Error("Invalid checked_at date for "+item.symbol);
    if(typeof item.reference!=="string"||!/^https?:\/\//i.test(item.reference))throw new Error("A direct HTTP(S) source reference is required for "+item.symbol);
   }
   if(parsed.ipObservations.length)throw new Error("AI JSON must not contain Investing Paths observations. Record those manually in the app.");
   const preview=buildShortlist({universe:{tickers:universe},shariahChecks:parsed.shariahChecks,ipObservations:[],now:Date.now()});
   setManual({shariahChecks:parsed.shariahChecks,ipObservations:parsed.ipObservations});
   setMessage(`Imported ${parsed.shariahChecks.length} provider checks. ${preview.ignored_invalid_shariah_records.length+preview.ignored_invalid_investing_paths_records.length} records need correction.`);
   setPasteOpen(false);setJsonText("");
  }catch(e){setMessage(e instanceof Error?e.message:"Invalid JSON.");}
 }
 function saveIp(){
  if(!ipSymbol||!ipReference.trim()||!/^https?:\/\//i.test(ipReference)) {setMessage("Select a ticker and enter the Investing Paths page URL.");return;}
  if(ipFound&&[ipRank,ipEy,ipRoc,ipYear,ipPeriod].every(v=>!v.trim())){setMessage("Enter at least one visible Investing Paths value.");return;}
  if(ipRank&&(!Number.isInteger(Number(ipRank))||Number(ipRank)<1)){setMessage("Rank must be a positive whole number.");return;}
  if(ipYear&&(!Number.isInteger(Number(ipYear))||Number(ipYear)<1990)){setMessage("Enter a valid fiscal year.");return;}
  if([ipEy,ipRoc].some(v=>v.trim()&&!Number.isFinite(Number(v)))){setMessage("EY and ROC must be valid numbers.");return;}
  const observation:CheckRecord={symbol:ipSymbol,collection_method:"manual",manually_verified:true,found:ipFound,checked_at:ipDate,source_reference:ipReference.trim()};
  if(ipFound)Object.assign(observation,{rank:ipRank===""?null:Number(ipRank),earnings_yield:ipEy===""?null:Number(ipEy),return_on_capital:ipRoc===""?null:Number(ipRoc),fiscal_year:ipYear===""?null:Number(ipYear),fiscal_period:ipPeriod||null});
  setManual(old=>({...old,ipObservations:[...old.ipObservations.filter(x=>String(x.symbol).toUpperCase()!==ipSymbol),observation]}));
  setIpOpen(false);setMessage("Investing Paths manual observation saved in this browser.");
 }
 const selected=rows;
 return <div className="app-shell"><main className="main"><header className="topbar"><div className="brand"><span className="brand-mark"><Activity size={18}/></span><span>MAGIC<span className="brand-light">SCREEN</span><small>PERSONAL RESEARCH</small></span></div><div className="top-actions"><span className="market-pill">US · MFI UNIVERSE</span><button className="refresh-btn compact" onClick={()=>void load(true)} disabled={loading}><RefreshCw size={14} className={loading?"spin":""}/>{loading?"Refreshing":"Refresh MFI"}</button></div></header>
 <section className="content"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> SHARIAH-FIRST INVESTING</div><h1>One universe.<br/><em>Two Shariah checks.</em></h1><p className="intro">MFI tickers, Musaffa + HalalScreener evidence, then manual Investing Paths validation.</p></div></div>
 <div className="stats-grid"><div className="stat-card"><div className="stat-top">MFI TICKERS</div><div className="stat-value">{universe.length}</div><div className="stat-foot">Current US candidate universe</div></div><div className="stat-card"><div className="stat-top">HALAL · BOTH SOURCES</div><div className="stat-value">{eligible}</div><div className="stat-foot">Fresh Halal checks from both providers</div></div><div className="stat-card"><div className="stat-top">NEEDS REVIEW</div><div className="stat-value">{shortlist.summary.needs_review}</div><div className="stat-foot">Conflicting or unclear evidence</div></div><div className="stat-card"><div className="stat-top">MFI LAST SYNC</div><div className="stat-value time-value">{dateLabel(pipeline?.mfi_last_sync)}</div><div className="stat-foot">{status}</div></div></div>
 <section className="shariah-panel"><div className="shariah-panel-head"><div><div className="eyebrow">RESEARCH WORKFLOW</div><h3>{tab==="shortlist"?"Shariah-first shortlist":"MFI candidate universe"}</h3><p>Only tickers returned by Magic Formula Investing are included. Both Shariah sources must show fresh Halal results before a ticker can pass.</p></div><div className="shariah-actions"><button className="import-btn" onClick={()=>void copyPrompt()}><Clipboard size={15}/> Copy tickers + AI prompt</button><button className="import-btn" onClick={()=>{setJsonText("");setPasteOpen(true);}}><ClipboardPaste size={15}/> Paste AI JSON</button><button className="import-btn" onClick={()=>{setIpSymbol(universe[0]?.symbol||"");setIpDate(today());setIpOpen(true);}}>Investing Paths check</button></div></div>
 <div className="shariah-summary"><div><b>{shortlist.summary.eligible_validated}</b><span>Eligible · IP checked</span></div><div><b>{shortlist.summary.eligible_unvalidated}</b><span>Eligible · IP not checked</span></div><div><b>{shortlist.summary.needs_review}</b><span>Needs review</span></div><div><b>{shortlist.summary.excluded}</b><span>Excluded / incomplete</span></div></div>
 <div className="toolbar"><div className="tabs"><button className={tab==="shortlist"?"selected":""} onClick={()=>setTab("shortlist")}>Shariah shortlist</button><button className={tab==="universe"?"selected":""} onClick={()=>{setTab("universe");setView("all");}}>MFI universe</button></div><div className="tools"><div className="searchbox"><Search size={15}/><input placeholder="Search ticker or company…" value={query} onChange={e=>setQuery(e.target.value)}/></div>{tab==="shortlist"&&<select className="sort-btn" value={view} onChange={e=>setView(e.target.value as View)}><option value="all">All states</option><option value="eligible_validated">IP checked</option><option value="eligible_unvalidated">IP not checked</option><option value="needs_review">Needs review</option><option value="excluded">Excluded</option></select>}</div></div>
 <div className="table-wrap"><table className="research-table"><thead><tr><th>TICKER</th><th>MUSAFFA</th><th>HALALSCREENER</th><th>DECISION</th><th>INVESTING PATHS</th></tr></thead><tbody>
 {selected.map((row:any)=>{const s=stocks.find(x=>x.symbol===row.symbol);const ip=row.investing_paths;return <tr key={row.symbol}><td><div className="company-cell"><div className="ticker-icon">{row.symbol.slice(0,2)}</div><div><b>{s?.company_name||row.name||row.symbol}</b><small>{row.symbol}</small></div></div></td><td className="shariah-cell"><b>{row.shariah.per_source.musaffa.status}</b><small>{row.shariah.per_source.musaffa.reason||"Checked "+(manual.shariahChecks.find(x=>x.symbol===row.symbol&&x.source==="musaffa")?.checked_at||"—")}</small></td><td className="shariah-cell"><b>{row.shariah.per_source.halalscreener.status}</b><small>{row.shariah.per_source.halalscreener.reason||"Checked "+(manual.shariahChecks.find(x=>x.symbol===row.symbol&&x.source==="halalscreener")?.checked_at||"—")}</small></td><td><span className={"decision "+row.state}>{row.state.replaceAll("_"," ")}</span><small className="reason">{row.shariah.reasons.join(" · ")||"Both sources pass freshness and status checks"}</small></td><td className="shariah-cell">{ip.status==="verified"?<><b>Rank #{ip.rank??"—"}</b><small>EY {pct(ip.earnings_yield)} · ROC {pct(ip.return_on_capital)}</small><small>{[ip.fiscal_year,ip.fiscal_period].filter(Boolean).join(" ")||"Fiscal period not recorded"}</small><small>Checked {ip.checked_at}</small><a href={ip.source_reference} target="_blank" rel="noreferrer">Investing Paths source</a></>:ip.status==="not_found"?<><b>Not found</b><small>Checked {ip.checked_at}</small><a href={ip.source_reference} target="_blank" rel="noreferrer">Investing Paths source</a></>:<span className="muted">Not checked</span>}</td></tr>;})}
 </tbody></table>{selected.length===0&&<div className="empty-state"><ShieldCheck size={24}/><b>No tickers in this view</b><span>Refresh the MFI universe or change the filter.</span></div>}</div>
 <div className="table-footer"><span>{selected.length} of {universe.length} MFI tickers · Saved locally in this browser</span><span>Latest MFI sync: {dateLabel(pipeline?.mfi_last_sync)}</span></div></section>
 <div className="method-note"><ShieldCheck size={18}/><div><b>Strict by design</b><p>Only current MFI tickers are considered. Missing, stale, doubtful or conflicting Shariah evidence never becomes eligible. Investing Paths observations are recorded manually. AI output is research input, not an automatic ruling.</p></div></div>
 <footer><span>Personal research tool · Not investment advice</span><span>Musaffa + HalalScreener · Manual Investing Paths</span></footer></section>
 {pasteOpen&&<div className="import-overlay" role="dialog" aria-modal="true"><div className="import-dialog"><div className="import-dialog-head"><div><div className="eyebrow">TEXT ONLY</div><h3>Paste AI research JSON</h3></div><button className="modal-close" onClick={()=>setPasteOpen(false)}>×</button></div><p>Paste the raw JSON from your AI assistant. Records are checked against the current MFI universe and provider/status rules.</p><textarea className="shariah-json" value={jsonText} onChange={e=>setJsonText(e.target.value)} placeholder='{"shariahChecks":[],"ipObservations":[]}' spellCheck={false}/><button className="refresh-btn" onClick={importJson} disabled={!jsonText.trim()}>Validate and import</button></div></div>}
 {promptOpen&&<div className="import-overlay" role="dialog" aria-modal="true"><div className="import-dialog"><div className="import-dialog-head"><div><div className="eyebrow">COPY PROMPT</div><h3>AI research prompt</h3></div><button className="modal-close" onClick={()=>setPromptOpen(false)}>×</button></div><textarea className="shariah-json" value={promptText} readOnly/><button className="refresh-btn" onClick={()=>void navigator.clipboard.writeText(promptText)}>Copy prompt</button></div></div>}
 {ipOpen&&<div className="import-overlay" role="dialog" aria-modal="true"><div className="import-dialog"><div className="import-dialog-head"><div><div className="eyebrow">MANUAL SOURCE CHECK</div><h3>Investing Paths observation</h3></div><button className="modal-close" onClick={()=>setIpOpen(false)}>×</button></div><div className="form-grid"><label>Ticker<select value={ipSymbol} onChange={e=>setIpSymbol(e.target.value)}>{universe.map(s=><option key={s.symbol} value={s.symbol}>{s.symbol} · {s.name}</option>)}</select></label><label>Checked date<input type="date" value={ipDate} onChange={e=>setIpDate(e.target.value)}/></label><label className="wide check-label"><input type="checkbox" checked={ipFound} onChange={e=>setIpFound(e.target.checked)}/> Ticker found in Investing Paths</label>{ipFound&&<><label>Rank<input type="number" min="1" step="1" value={ipRank} onChange={e=>setIpRank(e.target.value)}/></label><label>EY %<input type="number" step="any" value={ipEy} onChange={e=>setIpEy(e.target.value)}/></label><label>ROC %<input type="number" step="any" value={ipRoc} onChange={e=>setIpRoc(e.target.value)}/></label><label>Fiscal year<input type="number" min="1990" value={ipYear} onChange={e=>setIpYear(e.target.value)}/></label><label>Fiscal period<input value={ipPeriod} onChange={e=>setIpPeriod(e.target.value)} placeholder="e.g. FY ended 2026-06-30"/></label></>}<label className="wide">Investing Paths source URL<input value={ipReference} onChange={e=>setIpReference(e.target.value)} placeholder="https://investingpaths.com/…"/></label></div><button className="refresh-btn" onClick={saveIp}>Save manual observation</button></div></div>}
 {message&&<div className="toast" role="status"><Check size={15}/>{message}<button onClick={()=>setMessage("")}>×</button></div>}
 </main></div>;
}
