import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownUp, ArrowUpRight, Bell, ChevronDown, CircleHelp, Clock3, Database, Filter, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sparkles, TrendingUp } from "lucide-react";
import { universe } from "./data/universe";
import type { ApiResponse, Market, Stock } from "./types";

type Tab = "all" | "shariah" | "watchlist";
const money = (value: number | null, currency: string) => value == null ? "—" : new Intl.NumberFormat("en-US", {style:"currency",currency,maximumFractionDigits:2}).format(value);
const pct = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export default function App() {
  const [market, setMarket] = useState<Market>("MY");
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"rank" | "name" | "change">("rank");
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [marketUniverse, setMarketUniverse] = useState(universe);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState("Waiting for first sync");
  const [loading, setLoading] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [showInfo, setShowInfo] = useState(false);

  async function load(refresh = false) {
    setLoading(true);
    try {
      if (refresh && market === "US") {
        const syncResponse = await fetch("/api/universe?market=US&sync=1");
        if (!syncResponse.ok) throw new Error("US universe sync failed");
      }
      const response = await fetch(`/api/stocks?market=${market}${refresh ? "&refresh=1" : ""}`);
      if (!response.ok) throw new Error("API unavailable");
      const data = await response.json() as ApiResponse;
      setStocks(data.stocks ?? []);
      const universeResponse = await fetch("/api/universe?market=" + market);
      if (universeResponse.ok) {
        const master = await universeResponse.json() as { stocks?: Array<{symbol:string;company_name:string;currency:string;market:Market}> };
        if (master.stocks?.length) setMarketUniverse(master.stocks.map(item => ({symbol:item.symbol,name:item.company_name,market:item.market,currency:item.currency})));
      }
      setUpdatedAt(data.updatedAt);
      setSourceStatus(data.sourceStatus ?? "Connected");
    } catch {
      setStocks([]);
      setMarketUniverse(universe.filter(x => x.market === market));
      setSourceStatus("API not configured");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [market]);

  const rows = useMemo(() => {
    const base = marketUniverse.filter(x => x.market === market).map(x => stocks.find(s => s.symbol === x.symbol) ?? ({
      symbol:x.symbol, market:x.market, company_name:x.name, currency:x.currency, price:null, change_percent:null,
      market_cap:null, earnings_yield:null, return_on_capital:null, magic_formula_rank:null,
      shariah_status:"unverified" as const, shariah_source:null, shariah_as_of:null, data_status:"awaiting_sync",
      provider:null, updated_at:""
    }));
    return base.filter(s => (tab !== "shariah" || s.shariah_status === "compliant") && (tab !== "watchlist" || watchlist.includes(s.symbol)))
      .filter(s => `${s.symbol} ${s.company_name}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a,b) => sort === "name" ? a.company_name.localeCompare(b.company_name) : sort === "change" ? (b.change_percent ?? -Infinity) - (a.change_percent ?? -Infinity) : (a.magic_formula_rank ?? 999) - (b.magic_formula_rank ?? 999));
  }, [stocks, marketUniverse, market, tab, query, sort, watchlist]);

  const available = stocks.filter(s => s.price != null).length;
  const ranked = stocks.filter(s => s.magic_formula_rank != null).length;
  const toggleWatch = (symbol: string) => setWatchlist(old => old.includes(symbol) ? old.filter(x=>x!==symbol) : [...old,symbol]);

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#"><span className="brand-mark"><TrendingUp size={19}/></span><span>magic<span className="brand-light">screen</span><small>INVESTMENT RESEARCH</small></span></a>
      <div className="side-label">WORKSPACE</div>
      <button className="side-link active" onClick={()=>setTab("all")}><Activity size={17}/> Screener <span className="side-dot"/></button>
      <button className="side-link" onClick={()=>setTab("watchlist")}><Bell size={17}/> Watchlist <span className="side-count">{watchlist.length}</span></button>
      <div className="side-label side-gap">MARKETS</div>
      <button className={`side-link ${market==="MY"?"market-active":""}`} onClick={()=>setMarket("MY")}><span className="flag">🇲🇾</span> Bursa Malaysia</button>
      <button className={`side-link ${market==="US"?"market-active":""}`} onClick={()=>setMarket("US")}><span className="flag">🇺🇸</span> United States</button>
      <div className="sidebar-bottom">
        <div className="status-card"><span className="status-icon"><Database size={15}/></span><div><b>Data pipeline</b><small>{sourceStatus}</small></div><span className={`pulse ${available ? "live":""}`}/></div>
        <div className="profile"><div className="avatar">MS</div><div><b>Magic Screen</b><small>Personal workspace</small></div><ChevronDown size={15}/></div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>Stock screener</b></div><div className="top-actions"><span className="market-pill">{market==="MY"?"🇲🇾 Bursa Malaysia":"🇺🇸 US Market"}</span><button className="icon-btn" title="About data" onClick={()=>setShowInfo(!showInfo)}><CircleHelp size={18}/></button><div className="avatar small-avatar">MS</div></div></header>
      <section className="content">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> THE MARKET, WITH A METHOD</div><h1>Find quality businesses.<br/><em>Pay a sensible price.</em></h1><p className="intro">A focused stock screener built around the Magic Formula, with Shariah status kept transparent.</p></div><button className="refresh-btn" onClick={()=>void load(true)} disabled={loading}><RefreshCw size={15} className={loading?"spin":""}/>{loading?"Refreshing":"Refresh data"}</button></div>
        {showInfo && <div className="info-banner"><ShieldCheck size={18}/><div><b>Data integrity comes first.</b><p>Prices, fundamentals and Shariah status are only shown when a source is available and verified. Unknown is not the same as compliant. This first build is awaiting its initial Cloudflare data sync.</p></div><button onClick={()=>setShowInfo(false)}>×</button></div>}
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-top">UNIVERSE <span className="stat-icon"><Activity size={16}/></span></div><div className="stat-value">{marketUniverse.filter(x=>x.market===market).length}<small> stocks tracked</small></div><div className="stat-foot">Initial watch universe</div></div>
          <div className="stat-card"><div className="stat-top">LIVE QUOTES <span className="stat-icon green"><TrendingUp size={16}/></span></div><div className="stat-value">{available}<small> / {marketUniverse.filter(x=>x.market===market).length}</small></div><div className="stat-foot">{available ? "Quotes received" : "Waiting for market data"}</div></div>
          <div className="stat-card"><div className="stat-top">FORMULA RANKED <span className="stat-icon violet"><Sparkles size={16}/></span></div><div className="stat-value">{ranked}<small> stocks</small></div><div className="stat-foot">Needs verified fundamentals</div></div>
          <div className="stat-card"><div className="stat-top">LAST UPDATED <span className="stat-icon"><Clock3 size={16}/></span></div><div className="stat-value time-value">{updatedAt ? new Date(updatedAt).toLocaleTimeString("en-MY",{hour:"2-digit",minute:"2-digit"}) : "—"}</div><div className="stat-foot">{updatedAt ? new Date(updatedAt).toLocaleDateString("en-MY") : "No successful sync yet"}</div></div>
        </div>
        <div className="section-title"><div><div className="eyebrow">DISCOVER OPPORTUNITIES</div><h2>{market==="MY"?"Bursa Malaysia":"US Equities"} <span className="sub-count">{rows.length} companies</span></h2></div><div className="method-tag"><Sparkles size={14}/> MAGIC FORMULA</div></div>
        <div className="toolbar"><div className="tabs"><button className={tab==="all"?"selected":""} onClick={()=>setTab("all")}>All stocks</button><button className={tab==="shariah"?"selected":""} onClick={()=>setTab("shariah")}> <ShieldCheck size={14}/> Shariah verified</button><button className={tab==="watchlist"?"selected":""} onClick={()=>setTab("watchlist")}>Watchlist</button></div><div className="tools"><div className="searchbox"><Search size={15}/><input placeholder="Search company or ticker..." value={query} onChange={e=>setQuery(e.target.value)}/></div><button className="sort-btn" onClick={()=>setSort(s=>s==="rank"?"name":s==="name"?"change":"rank")}><ArrowDownUp size={14}/> Sort: {sort==="rank"?"Formula":sort==="name"?"Name":"Change"}</button></div></div>
        <div className="table-wrap"><table><thead><tr><th className="rank-col">#</th><th>COMPANY</th><th>PRICE</th><th>DAY CHANGE</th><th>MAGIC FORMULA</th><th>SHARIAH STATUS</th><th></th></tr></thead><tbody>
          {rows.map((s,i)=><tr key={s.symbol}><td className="rank-cell">{s.magic_formula_rank ?? String(i+1).padStart(2,"0")}</td><td><div className="company-cell"><div className="ticker-icon">{s.symbol.replace(".KL","").slice(0,2)}</div><div><b>{s.company_name}</b><small>{s.symbol}</small></div></div></td><td className="price-cell">{money(s.price,s.currency)}</td><td className={s.change_percent==null?"muted":s.change_percent>=0?"positive":"negative"}>{pct(s.change_percent)}</td><td>{s.magic_formula_rank ? <span className="formula-score">#{s.magic_formula_rank}</span> : <span className="pending">Awaiting fundamentals</span>}</td><td><span className={`shariah ${s.shariah_status}`}><i/>{s.shariah_status==="compliant"?"Verified compliant":s.shariah_status==="non_compliant"?"Not compliant":"Unverified"}</span></td><td><button className={`star-btn ${watchlist.includes(s.symbol)?"starred":""}`} onClick={()=>toggleWatch(s.symbol)} aria-label="Toggle watchlist">★</button></td></tr>)}
        </tbody></table>{rows.length===0 && <div className="empty-state"><Filter size={24}/><b>No stocks match this view</b><span>Try another search or switch tabs.</span></div>}</div>
        <div className="table-footer"><span>Showing {rows.length} of {universe.filter(x=>x.market===market).length} tracked companies</span><span><i className="legend-dot"/> Data status: {available ? "Partial live data" : "Awaiting first sync"}</span></div>
        <div className="method-note"><div className="method-note-icon"><CircleHelp size={17}/></div><div><b>How the Magic Formula works</b><p>Ranks businesses by a combination of Earnings Yield and Return on Capital. Both require reliable financial statements. This screen will not invent a score when either input is missing.</p></div><button onClick={()=>setShowInfo(true)}>Data methodology <ArrowUpRight size={14}/></button></div>
        <footer><span>© 2026 Magic Screen</span><span>Research tool only · Not investment advice</span><span>Built for clarity <span className="footer-star">✳</span></span></footer>
      </section>
    </main>
  </div>;
}