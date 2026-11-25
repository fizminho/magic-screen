import { useEffect, useState, type FormEvent } from "react";
import { fetchMarketDataQuotes } from "./providers/marketdata";
import { parseManualQuotesCsv } from "./providers/manual-csv";
import { parseHoldingsCsv } from "./providers/holdings-csv";
import type { QuoteSnapshot } from "./providers/types";

type Holding = {
  symbol: string;
  market: "US" | "MY";
  cik: string | null;
  name: string;
  currency: "USD" | "MYR";
  quantity: number;
  avgCost: number | null;
  notes: string | null;
  price: number | null;
  prevClose: number | null;
  changePct: number | null;
  quoteAsOf: string | null;
  quoteProvider: string | null;
  quoteStatus: "ok" | "stale" | "unavailable";
};

type DashboardMarket = {
  market: "US" | "MY";
  currency: "USD" | "MYR";
  holdingsCount: number;
  pricedCount: number;
  unavailableQuoteCount: number;
  staleQuoteCount: number;
  quoteCoveragePct: number;
  marketValue: number;
  dayChangeValue: number;
  dayChangePct: number | null;
  largestPosition: { symbol: string; value: number; weightPct: number } | null;
  topThreeConcentrationPct: number | null;
  sectorWeights: Array<{ sector: string; value: number; weightPct: number }>;
};
type Dashboard = {
  holdingsCount: number;
  staleQuoteCount: number;
  unavailableQuoteCount: number;
  markets: DashboardMarket[];
};

type WatchlistItem = {
  symbol: string;
  market: "US" | "MY";
  cik: string | null;
  name: string;
  currency: "USD" | "MYR";
  note: string | null;
  addedAt: string;
  price: number | null;
  changePct: number | null;
  quoteAsOf: string | null;
  quoteStatus: "ok" | "stale" | "unavailable";
};

type Props = {
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init.headers || {}) }
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) sessionStorage.removeItem("magicfolio.marketdata.token");
    const message = payload && typeof payload === "object" && "error" in payload &&
      typeof payload.error === "string" ? payload.error : "Request failed. Please try again.";
    throw new Error(message);
  }
  return payload as T;
}

function formatMoney(value: number | null, currency: "USD" | "MYR") {
  if (value === null || !Number.isFinite(value)) return "No quote";
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 4 }).format(value);
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "No timestamp";
}

export default function PortfolioPanel({ onError, onNotice }: Props) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchSymbol, setWatchSymbol] = useState("");
  const [watchMarket, setWatchMarket] = useState<"US" | "MY">("US");
  const [watchNote, setWatchNote] = useState("");
  const [watchCik, setWatchCik] = useState("");
  const [cik, setCik] = useState("");
  const [secSymbol, setSecSymbol] = useState("");
  const [secCompanyName, setSecCompanyName] = useState("");
  const [secFilings, setSecFilings] = useState<Array<{form:string;title:string;summary:string;filingDate:string;reportDate:string|null;url:string;accessionNumber:string}>>([]);
  const [secLoading, setSecLoading] = useState(false);
  const [marketToken, setMarketToken] = useState("");
  const [symbol, setSymbol] = useState("");
  const [market, setMarket] = useState<"US" | "MY">("US");
  const [quantity, setQuantity] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [notes, setNotes] = useState("");
  const [manualCsv, setManualCsv] = useState("");
  const [holdingsCsv, setHoldingsCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refreshHoldings() {
    const result = await api<{ holdings: Holding[] }>("/api/holdings");
    setHoldings(result.holdings);
  }

  async function refreshWatchlist() {
    const result = await api<{ items: WatchlistItem[] }>("/api/watchlist");
    setWatchlist(result.items);
  }

  async function refreshDashboard() {
    setDashboard(await api<Dashboard>("/api/dashboard"));
  }

  async function refreshPortfolio() {
    await Promise.all([refreshHoldings(), refreshWatchlist(), refreshDashboard()]);
  }

  useEffect(() => {
    setMarketToken(sessionStorage.getItem("magicfolio.marketdata.token") || "");
    refreshPortfolio()
      .catch((cause) => onError(cause instanceof Error ? cause.message : "Unable to load portfolio data."))
      .finally(() => setLoading(false));
  }, []);

  function saveMarketToken() {
    const token = marketToken.trim();
    if (token.length < 12) {
      onError("Enter a valid Market Data API token.");
      return;
    }
    sessionStorage.setItem("magicfolio.marketdata.token", token);
    setMarketToken(token);
    onNotice("Market Data token saved in this browser tab only. It is not sent to Magic Folio.");
    onError("");
  }

  function clearMarketToken() {
    sessionStorage.removeItem("magicfolio.marketdata.token");
    setMarketToken("");
    onNotice("Market Data token cleared from this browser tab.");
    onError("");
  }

  async function addHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError(""); onNotice(""); setBusy(true);
    try {
      const nextQuantity = Number(quantity);
      const nextAvgCost = avgCost.trim() ? Number(avgCost) : null;
      await api("/api/holdings", {
        method: "PUT",
        body: JSON.stringify({
          holdings: [{
            symbol: symbol.trim().toUpperCase(),
            market,
            quantity: nextQuantity,
            avgCost: nextAvgCost,
            notes: notes.trim() || null,
            cik: market === "US" ? (cik.trim() || null) : null
          }]
        })
      });
      setSymbol(""); setQuantity(""); setAvgCost(""); setNotes(""); setCik("");
      await refreshPortfolio();
      onNotice("Holding saved.");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to save holding.");
    } finally { setBusy(false); }
  }

  async function removeHolding(item: Holding) {
    if (!window.confirm(`Remove ${item.market}:${item.symbol} from holdings?`)) return;
    onError(""); onNotice(""); setBusy(true);
    try {
      await api(`/api/holdings/${encodeURIComponent(item.market)}/${encodeURIComponent(item.symbol)}`, {
        method: "DELETE", body: "{}"
      });
      await refreshPortfolio();
      onNotice(`${item.symbol} removed from holdings.`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to remove holding.");
    } finally { setBusy(false); }
  }

  async function importHoldingsCsv() {
    onError(""); onNotice(""); setBusy(true);
    try {
      const rows = parseHoldingsCsv(holdingsCsv);
      const result = await api<{ saved: number }>("/api/holdings", {
        method: "PUT", body: JSON.stringify({ holdings: rows })
      });
      setHoldingsCsv("");
      await refreshPortfolio();
      onNotice(`Imported ${result.saved} positions. Existing positions were updated; omitted holdings were left unchanged.`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to import holdings CSV.");
    } finally { setBusy(false); }
  }

  async function addWatchlistItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError(""); onNotice(""); setBusy(true);
    try {
      await api("/api/watchlist", {
        method: "POST",
        body: JSON.stringify({ items: [{
          symbol: watchSymbol.trim().toUpperCase(), market: watchMarket, note: watchNote.trim() || null,
          cik: watchMarket === "US" ? (watchCik.trim() || null) : null
        }] })
      });
      setWatchSymbol(""); setWatchNote(""); setWatchCik("");
      await refreshWatchlist();
      onNotice("Watchlist item saved.");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to save watchlist item.");
    } finally { setBusy(false); }
  }

  async function removeWatchlistItem(item: WatchlistItem) {
    if (!window.confirm(`Remove ${item.market}:${item.symbol} from watchlist?`)) return;
    onError(""); onNotice(""); setBusy(true);
    try {
      await api(`/api/watchlist/${encodeURIComponent(item.market)}/${encodeURIComponent(item.symbol)}`, {
        method: "DELETE", body: "{}"
      });
      await refreshWatchlist();
      onNotice(`${item.symbol} removed from watchlist.`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to remove watchlist item.");
    } finally { setBusy(false); }
  }

  async function saveQuoteBatches(quotes: QuoteSnapshot[]) {
    let saved = 0;
    const unmatched: string[] = [];
    for (let i = 0; i < quotes.length; i += 50) {
      const result = await api<{ saved: number; unmatchedSymbols: string[] }>("/api/quotes/snapshots", {
        method: "POST",
        body: JSON.stringify({ quotes: quotes.slice(i, i + 50) })
      });
      saved += result.saved;
      unmatched.push(...result.unmatchedSymbols);
    }
    await refreshPortfolio();
    return { saved, unmatched };
  }

  async function loadSecFilings(item: { symbol: string; market: "US" | "MY"; cik: string | null }) {
    if (item.market !== "US") { onError("SEC filings are available for US instruments only."); return; }
    if (!item.cik) { onError("Add the SEC CIK to this instrument first."); return; }
    onError(""); onNotice(""); setSecLoading(true);
    try {
      const result = await api<{ companyName: string; filings: Array<{ form: string; title: string; summary: string; filingDate: string; reportDate: string | null; url: string; accessionNumber: string }> }>(
        `/api/sec/filings?symbol=${encodeURIComponent(item.symbol)}`
      );
      setSecSymbol(item.symbol);
      setSecCompanyName(result.companyName);
      setSecFilings(result.filings);
      onNotice(`Loaded ${result.filings.length} recent SEC filings for ${item.symbol}.`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to load SEC filings.");
    } finally { setSecLoading(false); }
  }

  async function refreshUsQuotes() {
    if (!marketToken.trim()) { onError("Save your Market Data API token first."); return; }
    const symbols = [...new Set([...holdings, ...watchlist].filter((item) => item.market === "US").map((item) => item.symbol))];
    if (!symbols.length) { onError("Add at least one US holding or watchlist item before refreshing quotes."); return; }
    onError(""); onNotice(""); setBusy(true);
    try {
      const quotes = await fetchMarketDataQuotes(symbols, marketToken.trim());
      const result = await saveQuoteBatches(quotes);
      onNotice(`Saved ${result.saved} US quote snapshots. Data is at least 24 hours delayed. ${result.unmatched.length ? `Unmatched: ${result.unmatched.join(", ")}.` : ""}`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to refresh US quotes.");
    } finally { setBusy(false); }
  }

  async function importBursaCsv() {
    onError(""); onNotice(""); setBusy(true);
    try {
      const quotes = parseManualQuotesCsv(manualCsv);
      const result = await saveQuoteBatches(quotes);
      setManualCsv("");
      onNotice(`Imported ${result.saved} Bursa quote snapshots. ${result.unmatched.length ? `Add these to your holdings or watchlist first: ${result.unmatched.join(", ")}.` : ""}`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to import Bursa CSV.");
    } finally { setBusy(false); }
  }

  const usCount = new Set([...holdings, ...watchlist].filter((item) => item.market === "US").map((item) => item.symbol)).size;
  const myCount = new Set([...holdings, ...watchlist].filter((item) => item.market === "MY").map((item) => item.symbol)).size;
  const existingHolding = holdings.some((item) =>
    item.market === market && item.symbol === symbol.trim().toUpperCase()
  );
  const existingWatchlistItem = watchlist.some((item) =>
    item.market === watchMarket && item.symbol === watchSymbol.trim().toUpperCase()
  );

  return (
    <section className="portfolio-panel">
      <div className="portfolio-heading">
        <div><span className="eyebrow">OWNER PORTFOLIO</span><h2>Your holdings</h2></div>
        <span className="holding-count">{holdings.length} / 20</span>
      </div>

      <div className="dashboard-summary">
        <div className="dashboard-overview">
          <div className="metric-tile"><span>POSITIONS</span><strong>{dashboard?.holdingsCount ?? "—"}</strong></div>
          <div className="metric-tile"><span>STALE QUOTES</span><strong>{dashboard?.staleQuoteCount ?? "—"}</strong></div>
          <div className="metric-tile"><span>NO QUOTE</span><strong>{dashboard?.unavailableQuoteCount ?? "—"}</strong></div>
          <div className="market-counts">
            <span>US {dashboard?.markets.find((item) => item.market === "US")?.holdingsCount ?? 0}</span>
            <span>MY {dashboard?.markets.find((item) => item.market === "MY")?.holdingsCount ?? 0}</span>
          </div>
        </div>
        <div className="market-metrics">
          {(["US", "MY"] as const).map((marketCode) => {
            const item = dashboard?.markets.find((marketItem) => marketItem.market === marketCode);
            return (
              <div className="market-metric-card" key={marketCode}>
                <div className="market-metric-title"><b>{marketCode === "US" ? "United States" : "Bursa Malaysia"}</b><span>{item?.quoteCoveragePct ?? 0}% quote coverage</span></div>
                <strong>{item ? formatMoney(item.marketValue, marketCode === "US" ? "USD" : "MYR") : "—"}</strong>
                <div className={`dashboard-day-change ${(item?.dayChangeValue ?? 0) >= 0 ? "quote-positive" : "quote-negative"}`}>
                  Day move: {item && item.dayChangePct !== null ? `${item.dayChangeValue >= 0 ? "+" : ""}${formatMoney(item.dayChangeValue, item.currency)} · ${item.dayChangePct >= 0 ? "+" : ""}${item.dayChangePct}%` : "—"}
                </div>
                <div className="market-metric-details">
                  <span>Largest: {item?.largestPosition ? `${item.largestPosition.symbol} · ${item.largestPosition.weightPct}%` : "—"}</span>
                  <span>Top 3: {item?.topThreeConcentrationPct === null || item?.topThreeConcentrationPct === undefined ? "—" : `${item.topThreeConcentrationPct}%`}</span>
                </div>
                {item?.sectorWeights.slice(0, 3).map((sector) => (
                  <div className="sector-weight" key={sector.sector}><span>{sector.sector}</span><b>{sector.weightPct}%</b></div>
                ))}
                <small>Indicative value · {item?.staleQuoteCount ?? 0} stale</small>
              </div>
            );
          })}
        </div>
        <p className="dashboard-disclaimer">US and MY values are kept separate because they use different currencies. Metrics use available quotes, including stale prices where marked.</p>
      </div>

      <div className="holdings-table-wrap">
        <table className="holdings-table">
          <thead><tr><th>Instrument</th><th>Quantity</th><th>Avg. cost</th><th>Latest quote</th><th>Source / as of</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="empty-cell">Loading holdings…</td></tr> :
              holdings.length === 0 ? <tr><td colSpan={6} className="empty-cell">No holdings yet. Add your first US or Bursa position below.</td></tr> :
              holdings.map((item) => (
                <tr key={`${item.market}:${item.symbol}`}>
                  <td><b>{item.symbol}</b><span className="market-tag">{item.market} · {item.currency}</span></td>
                  <td>{item.quantity.toLocaleString()}</td>
                  <td>{formatMoney(item.avgCost, item.currency)}</td>
                  <td><b>{formatMoney(item.price, item.currency)}</b>{item.changePct !== null && <span className={item.changePct >= 0 ? "quote-positive" : "quote-negative"}>{(item.changePct * 100).toFixed(2)}%</span>}</td>
                  <td><span className={`quote-status quote-${item.quoteStatus}`}>{item.quoteStatus === "ok" ? (item.market === "US" ? "24h delayed" : "Manual") : item.quoteStatus}</span><small>{formatDate(item.quoteAsOf)}</small></td>
                  <td><button className="button button-danger button-small" onClick={() => removeHolding(item)} disabled={busy}>Remove</button></td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      <section className="tool-card tool-wide watchlist-card">
        <div className="watchlist-heading">
          <div><span className="eyebrow">ON YOUR RADAR</span><h3>Watchlist</h3></div>
          <span className="holding-count">{watchlist.length} tracked</span>
        </div>
        <div className="holdings-table-wrap">
          <table className="holdings-table watchlist-table">
            <thead><tr><th>Instrument</th><th>Latest quote</th><th>Source / as of</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="empty-cell">Loading watchlist…</td></tr> :
                watchlist.length === 0 ? <tr><td colSpan={5} className="empty-cell">Nothing on your watchlist yet.</td></tr> :
                watchlist.map((item) => (
                  <tr key={`${item.market}:${item.symbol}`}>
                    <td><b>{item.symbol}</b><span className="market-tag">{item.market} · {item.currency}</span></td>
                    <td><b>{formatMoney(item.price, item.currency)}</b>{item.changePct !== null && <span className={item.changePct >= 0 ? "quote-positive" : "quote-negative"}>{(item.changePct * 100).toFixed(2)}%</span>}</td>
                    <td><span className={`quote-status quote-${item.quoteStatus}`}>{item.quoteStatus === "ok" ? (item.market === "US" ? "24h delayed" : "Manual") : item.quoteStatus}</span><small>{formatDate(item.quoteAsOf)}</small></td>
                    <td>{item.note || " "}</td>
                    <td><button className="button button-danger button-small" onClick={() => removeWatchlistItem(item)} disabled={busy}>Remove</button></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
        <form className="watchlist-form" onSubmit={addWatchlistItem}>
          <label>Market<select value={watchMarket} onChange={(event) => setWatchMarket(event.target.value as "US" | "MY")}><option value="US">United States</option><option value="MY">Bursa Malaysia</option></select></label>
          <label>Symbol<input value={watchSymbol} onChange={(event) => setWatchSymbol(event.target.value.toUpperCase())} maxLength={15} placeholder={watchMarket === "US" ? "MSFT" : "1155"} required /></label>
          <label className="watch-note">Note<input value={watchNote} onChange={(event) => setWatchNote(event.target.value)} maxLength={500} placeholder="Optional reminder" /></label>
          <button className="button button-secondary" type="submit" disabled={busy || (watchlist.length >= 50 && !existingWatchlistItem)}>Add to watchlist</button>
        </form>
      </section>

      <div className="portfolio-tools">
        <section className="tool-card">
          <span className="eyebrow">ADD / UPDATE</span>
          <h3>Position details</h3>
          <form className="holding-form" onSubmit={addHolding}>
            <label>Market<select value={market} onChange={(event) => setMarket(event.target.value as "US" | "MY")}><option value="US">United States (USD)</option><option value="MY">Bursa Malaysia (MYR)</option></select></label>
            <label>Symbol<input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder={market === "US" ? "AAPL" : "1155"} maxLength={15} required /></label>
            <label>Quantity<input type="number" min="0.000001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="100" required /></label>
            <label>Average cost<input type="number" min="0" step="any" value={avgCost} onChange={(event) => setAvgCost(event.target.value)} placeholder="Optional" /></label>
            <label className="field-wide">Notes<input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Optional private note" /></label>
            <button className="button button-primary field-wide" type="submit" disabled={busy || (holdings.length >= 20 && !existingHolding)}>Save holding</button>
          </form>
        </section>

        <section className="tool-card tool-wide">
          <span className="eyebrow">BULK IMPORT</span>
          <h3>Import holdings CSV</h3>
          <p>Paste up to 20 rows using <code>symbol,market,quantity,avg_cost</code>. Use <code>US</code> or <code>MY</code>. Existing positions are updated; rows omitted from the file are not deleted.</p>
          <textarea className="csv-field" rows={5} value={holdingsCsv} onChange={(event) => setHoldingsCsv(event.target.value)}
            placeholder={"symbol,market,quantity,avg_cost\nAAPL,US,10,185.50\n1155,MY,500,6.42"} />
          <button className="button button-secondary" onClick={importHoldingsCsv} disabled={busy || !holdingsCsv.trim()}>
            {busy ? "Importing…" : "Import holdings"}
          </button>
        </section>

        <section className="tool-card">
          <span className="eyebrow">US QUOTES · FREE TIER</span>
          <h3>Market Data connection</h3>
          <p>Optional personal-use API. 100 credits/day, at least 24-hour delayed, one source IP at a time. Refresh from one device; other devices read the saved snapshot.</p>
          <label className="field-label" htmlFor="marketdata-token">Market Data API token</label>
          <input id="marketdata-token" className="text-field" type="password" autoComplete="off" value={marketToken}
            onChange={(event) => setMarketToken(event.target.value)} placeholder="Paste your own API token" />
          <div className="tool-actions">
            <button className="button button-secondary" onClick={saveMarketToken} disabled={busy || !marketToken.trim()}>Save in this tab</button>
            <button className="button button-quiet" onClick={clearMarketToken} disabled={busy || !marketToken}>Clear token</button>
          </div>
          <button className="button button-primary" onClick={refreshUsQuotes} disabled={busy || !marketToken.trim() || usCount === 0}>
            {busy ? "Working…" : `Refresh US quotes (${usCount})`}
          </button>
          <p className="fine-print">The token stays in this browser tab's session storage. It is sent directly to MarketData.app and never to the Magic Folio Worker.</p>
        </section>

        <section className="tool-card tool-wide">
          <span className="eyebrow">BURSA MALAYSIA · MANUAL IMPORT</span>
          <h3>Import Bursa quote CSV</h3>
          <p>First add your Bursa holdings or watchlist items above. Then paste a CSV using this header: <code>symbol,price,asOf,prevClose</code>. The final column is optional. Use the actual quote timestamp and MYR price.</p>
          <textarea className="csv-field" rows={5} value={manualCsv} onChange={(event) => setManualCsv(event.target.value)}
            placeholder={"symbol,price,asOf,prevClose\n1155,6.42,2026-11-24T08:00:00+08:00,6.30"} />
          <button className="button button-secondary" onClick={importBursaCsv} disabled={busy || !manualCsv.trim() || myCount === 0}>
            {busy ? "Importing…" : `Import Bursa quotes (${myCount} symbols)`}
          </button>
          <p className="fine-print">No Bursa website scraping or unofficial API. Quotes are private and tagged with their import timestamp.</p>
        </section>
      </div>
    </section>
  );
}
