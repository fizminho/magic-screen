import { useEffect, useState, type FormEvent } from "react";
import { fetchMarketDataQuotes } from "./providers/marketdata";
import { parseManualQuotesCsv } from "./providers/manual-csv";
import { parseHoldingsCsv } from "./providers/holdings-csv";
import type { QuoteSnapshot } from "./providers/types";
import { readDashboardSnapshot, saveDashboardSnapshot } from "./offline-dashboard";

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
  thresholds: { maxPositionPct: number; alertMovePct: number };
  riskFlags: Array<{ market: "US" | "MY"; severity: "warning" | "caution"; code: string; message: string }>;
  holdingsCount: number;
  staleQuoteCount: number;
  unavailableQuoteCount: number;
  markets: DashboardMarket[];
};

type PortfolioSettings = {
  alertMovePct: number;
  maxPositionPct: number;
};

type PublicResearchBrief = {
  company_summary: string;
  financial_strengths: string[];
  financial_risks: string[];
  filing_signals: string[];
  unknowns: string[];
  confidence: "low" | "medium" | "high";
  source_accessions: string[];
};


type ResearchInboxItem = { brief: PublicResearchBrief & { symbol: string }; model: string; createdAt: string };

type ResearchResult = {
  brief: PublicResearchBrief;
  model: string;
  createdAt: string;
  cached: boolean;
  sources: Array<{ accessionNumber: string; form: string; filed: string; title: string; url: string }>;
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
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

function decodePushApplicationKey(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
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
  const [settings, setSettings] = useState<PortfolioSettings>({ alertMovePct: 4, maxPositionPct: 25 });
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
  const [secLoadingSymbol, setSecLoadingSymbol] = useState("");
  const [researchLoadingSymbol, setResearchLoadingSymbol] = useState("");
  const [researchResult, setResearchResult] = useState<(ResearchResult & { symbol: string }) | null>(null);
  const [researchInbox, setResearchInbox] = useState<ResearchInboxItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);
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
  const [offlineSnapshotAt, setOfflineSnapshotAt] = useState<string | null>(null);
  const [pushState, setPushState] = useState<"checking" | "unsupported" | "not-configured" | "not-subscribed" | "subscribed">("checking");
  const [pushBusy, setPushBusy] = useState(false);

  async function refreshHoldings() {
    const result = await api<{ holdings: Holding[] }>("/api/holdings");
    setHoldings(result.holdings);
  }

  async function refreshWatchlist() {
    const result = await api<{ items: WatchlistItem[] }>("/api/watchlist");
    setWatchlist(result.items);
  }

  async function refreshDashboard(): Promise<boolean> {
    try {
      const snapshot = await api<Dashboard>("/api/dashboard");
      setDashboard(snapshot);
      setOfflineSnapshotAt(null);
      saveDashboardSnapshot(snapshot).catch(() => undefined);
      return false;
    } catch (cause) {
      const status = cause instanceof Error ? (cause as Error & { status?: number }).status : undefined;
      if (status === 401) {
        setDashboard(null);
        setOfflineSnapshotAt(null);
        throw cause;
      }
      if (cause instanceof TypeError || !navigator.onLine) {
        const cached = await readDashboardSnapshot<Dashboard>().catch(() => null);
        if (cached) {
          setDashboard(cached.data);
          setOfflineSnapshotAt(cached.savedAt);
          return true;
        }
      }
      throw cause;
    }
  }

  async function refreshSettings() {
    const result = await api<{ settings: PortfolioSettings }>("/api/settings");
    setSettings(result.settings);
  }

  async function refreshResearchInbox() {
    setInboxLoading(true);
    try {
      const result = await api<{ briefs: ResearchInboxItem[] }>("/api/analysis/inbox");
      setResearchInbox(result.briefs);
    } catch (cause) {
      if (!(cause instanceof Error && (cause as Error & { status?: number }).status === 401)) {
        onError(cause instanceof Error ? cause.message : "Unable to load the research inbox.");
      }
    } finally { setInboxLoading(false); }
  }

  async function openInboxBrief(item: ResearchInboxItem) {
    onError(""); onNotice("");
    try {
      const result = await api<ResearchResult & { brief: PublicResearchBrief | null }>(
        `/api/analysis/latest?symbol=${encodeURIComponent(item.brief.symbol)}`
      );
      if (!result.brief) throw new Error("This brief is no longer available for an instrument in your portfolio or watchlist.");
      setResearchResult({ ...result, brief: result.brief, symbol: item.brief.symbol });
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to open this research brief.");
    }
  }

  async function refreshPortfolio() {
    const results = await Promise.allSettled([
      refreshHoldings(), refreshWatchlist(), refreshDashboard(), refreshSettings()
    ]);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (!failures.length) return;
    const dashboardResult = results[2];
    if (dashboardResult.status === "fulfilled" && dashboardResult.value === true &&
        failures.every((failure) => failure.reason instanceof TypeError || !navigator.onLine)) return;
    throw failures[0].reason;
  }

  async function enablePushNotifications() {
    onError(""); onNotice(""); setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("Install Magic Folio from its HTTPS website before enabling notifications.");
      const config = await api<{ enabled: boolean; publicKey: string | null }>("/api/push/config");
      if (!config.enabled || !config.publicKey) throw new Error("Push notifications are not configured on the server yet.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted. Check this site's browser settings.");
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodePushApplicationKey(config.publicKey) as BufferSource
      });
      await api("/api/push/subscribe", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
      setPushState("subscribed");
      onNotice("Push notifications enabled on this device.");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to enable push notifications.");
    } finally { setPushBusy(false); }
  }

  async function disablePushNotifications() {
    onError(""); onNotice(""); setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setPushState("not-subscribed");
      onNotice("Push notifications disabled on this device.");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to disable push notifications.");
    } finally { setPushBusy(false); }
  }

  async function sendTestPush() {
    onError(""); onNotice(""); setPushBusy(true);
    try {
      const result = await api<{ sent: number; removed: number }>("/api/push/test", { method: "POST", body: "{}" });
      onNotice(result.sent ? "Test notification sent. Check this device." : "No active push subscription received the test.");
      if (result.removed) setPushState("not-subscribed");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to send a test notification.");
    } finally { setPushBusy(false); }
  }

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

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError(""); onNotice(""); setBusy(true);
    try {
      const result = await api<{ settings: PortfolioSettings }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(settings)
      });
      setSettings(result.settings);
      onNotice("Portfolio settings saved.");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to save settings.");
    } finally { setBusy(false); }
  }

  async function downloadExport(format: "json" | "csv") {
    onError(""); onNotice(""); setBusy(true);
    try {
      const response = await fetch(`/api/export?format=${format}`, {
        method: "GET",
        credentials: "same-origin",
        headers: { accept: format === "csv" ? "text/csv" : "application/json" }
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => ({}));
        const message = payload && typeof payload === "object" && "error" in payload &&
          typeof payload.error === "string" ? payload.error : "Unable to export portfolio data.";
        if (response.status === 401) sessionStorage.removeItem("magicfolio.marketdata.token");
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `magic-folio-${new Date().toISOString().slice(0, 10)}.${format}`;
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      onNotice(`Portfolio ${format.toUpperCase()} export downloaded.`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to export portfolio data.");
    } finally { setBusy(false); }
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
    onError(""); onNotice(""); setSecLoadingSymbol(item.symbol); setSecLoading(true);
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
    } finally { setSecLoading(false); setSecLoadingSymbol(""); }
  }

  async function loadResearchBrief(item: { symbol: string; market: "US" | "MY"; cik: string | null }) {
    if (item.market !== "US") { onError("Public SEC research is available for US instruments only."); return; }
    if (!item.cik) { onError("Add the SEC CIK to this instrument first."); return; }
    onError(""); onNotice(""); setResearchLoadingSymbol(item.symbol); setResearchResult(null);
    try {
      const filings = await api<{ companyName: string; filings: Array<{ form: string; title: string; summary: string; filingDate: string; reportDate: string | null; url: string; accessionNumber: string }> }>(
        `/api/sec/filings?symbol=${encodeURIComponent(item.symbol)}`
      );
      setSecSymbol(item.symbol);
      setSecCompanyName(filings.companyName);
      setSecFilings(filings.filings);
      await api(`/api/sec/companyfacts?symbol=${encodeURIComponent(item.symbol)}`);
      const result = await api<ResearchResult>("/api/analysis/run", {
        method: "POST",
        body: JSON.stringify({ symbol: item.symbol })
      });
      setResearchResult({ ...result, symbol: item.symbol });
      await refreshResearchInbox();
      onNotice(`Research brief ready for ${item.symbol}.`);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Unable to generate the research brief.");
    } finally { setResearchLoadingSymbol(""); }
  }

  async function refreshUsQuotes() {
    if (!marketToken.trim()) { onError("Save your Market Data API token first."); return; }
    const symbols = [...new Set([...holdings, ...watchlist].filter((item) => item.market === "US").map((item) => item.symbol))];
    if (!symbols.length) { onError("Add at least one US holding or watchlist item before refreshing quotes."); return; }
    onError(""); onNotice(""); setBusy(true);
    try {
      const authState = await api<{ authenticated: boolean }>("/api/auth/state");
      if (!authState.authenticated) { sessionStorage.removeItem("magicfolio.marketdata.token"); setMarketToken(""); throw new Error("Your owner session expired. Sign in again before refreshing quotes."); }
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

  useEffect(() => {
    void refreshResearchInbox();
  }, []);

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

      {offlineSnapshotAt && (
        <div className="offline-banner" role="status">
          Offline. Showing the last saved dashboard from {formatDate(offlineSnapshotAt)}. Changes and live quotes are paused.
        </div>
      )}
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
                {item?.largestPosition && item.largestPosition.weightPct > settings.maxPositionPct && (
                  <p className="risk-warning" role="status">
                    Concentration alert: {item.largestPosition.symbol} is above your {settings.maxPositionPct}% position limit
                  </p>
                )}
                {item?.sectorWeights.slice(0, 3).map((sector) => (
                  <div className="sector-weight" key={sector.sector}><span>{sector.sector}</span><b>{sector.weightPct}%</b></div>
                ))}
                <small>Indicative value · {item?.staleQuoteCount ?? 0} stale</small>
              </div>
            );
          })}
        </div>
        <div className="risk-flags" aria-live="polite">
          <span className="eyebrow">RULE-BASED FLAGS · POSITION LIMIT {dashboard?.thresholds.maxPositionPct ?? settings.maxPositionPct}% · MOVE ALERT {dashboard?.thresholds.alertMovePct ?? settings.alertMovePct}%</span>
          {!dashboard ? <p>Checking portfolio rules…</p> :
            dashboard.riskFlags.length === 0 ? <p>No concentration or quote-quality flags at the moment.</p> :
            dashboard.riskFlags.map((flag, index) => (
              <div className={`risk-flag risk-${flag.severity}`} key={`${flag.code}:${flag.market}:${index}`}>
                <b>{flag.market}</b><span>{flag.message}</span>
              </div>
            ))
          }
        </div>
        <p className="dashboard-disclaimer">US and MY values are kept separate because they use different currencies. Metrics use available quotes, including stale prices where marked. Flags are deterministic checks, not investment advice.</p>
      </div>

      <div className="holdings-table-wrap">
        <table className="holdings-table">
          <thead><tr><th>Instrument</th><th>Quantity</th><th>Avg. cost</th><th>Latest quote</th><th>Source / as of</th><th>SEC filings</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="empty-cell">Loading holdings…</td></tr> :
              holdings.length === 0 ? <tr><td colSpan={7} className="empty-cell">No holdings yet. Add your first US or Bursa position below.</td></tr> :
              holdings.map((item) => (
                <tr key={`${item.market}:${item.symbol}`}>
                  <td><b>{item.symbol}</b><span className="market-tag">{item.market} · {item.currency}</span></td>
                  <td>{item.quantity.toLocaleString()}</td>
                  <td>{formatMoney(item.avgCost, item.currency)}</td>
                  <td><b>{formatMoney(item.price, item.currency)}</b>{item.changePct !== null && <span className={item.changePct >= 0 ? "quote-positive" : "quote-negative"}>{(item.changePct * 100).toFixed(2)}%</span>}</td>
                  <td><span className={`quote-status quote-${item.quoteStatus}`}>{item.quoteStatus === "ok" ? (item.market === "US" ? "24h delayed" : "Manual") : item.quoteStatus}</span><small>{formatDate(item.quoteAsOf)}</small></td>
                  <td>{item.market === "US" && item.cik ? <div className="row-actions"><button className="button button-small" onClick={() => loadSecFilings(item)} disabled={secLoading || !!researchLoadingSymbol}>{secLoading && secLoadingSymbol === item.symbol ? "Loading…" : "Filings"}</button><button className="button button-small button-secondary" onClick={() => loadResearchBrief(item)} disabled={secLoading || !!researchLoadingSymbol}>{researchLoadingSymbol === item.symbol ? "Researching…" : "Research"}</button></div> : <small>{item.market === "US" ? "CIK needed" : "—"}</small>}</td>
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
            <thead><tr><th>Instrument</th><th>Latest quote</th><th>Source / as of</th><th>Note</th><th>SEC filings</th><th></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="empty-cell">Loading watchlist…</td></tr> :
                watchlist.length === 0 ? <tr><td colSpan={6} className="empty-cell">Nothing on your watchlist yet.</td></tr> :
                watchlist.map((item) => (
                  <tr key={`${item.market}:${item.symbol}`}>
                    <td><b>{item.symbol}</b><span className="market-tag">{item.market} · {item.currency}</span></td>
                    <td><b>{formatMoney(item.price, item.currency)}</b>{item.changePct !== null && <span className={item.changePct >= 0 ? "quote-positive" : "quote-negative"}>{(item.changePct * 100).toFixed(2)}%</span>}</td>
                    <td><span className={`quote-status quote-${item.quoteStatus}`}>{item.quoteStatus === "ok" ? (item.market === "US" ? "24h delayed" : "Manual") : item.quoteStatus}</span><small>{formatDate(item.quoteAsOf)}</small></td>
                    <td>{item.note || " "}</td>
                    <td>{item.market === "US" && item.cik ? <div className="row-actions"><button className="button button-small" onClick={() => loadSecFilings(item)} disabled={secLoading || !!researchLoadingSymbol}>{secLoading && secLoadingSymbol === item.symbol ? "Loading…" : "Filings"}</button><button className="button button-small button-secondary" onClick={() => loadResearchBrief(item)} disabled={secLoading || !!researchLoadingSymbol}>{researchLoadingSymbol === item.symbol ? "Researching…" : "Research"}</button></div> : <small>{item.market === "US" ? "CIK needed" : "—"}</small>}</td>
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
          {watchMarket === "US" && <label>SEC CIK<input inputMode="numeric" maxLength={10} value={watchCik} onChange={(event) => setWatchCik(event.target.value.replace(/[^0-9]/g, "").slice(0, 10))} placeholder="Optional 10-digit CIK" /></label>}
          <button className="button button-secondary" type="submit" disabled={busy || (watchlist.length >= 50 && !existingWatchlistItem)}>Add to watchlist</button>
        </form>
      </section>

      {secSymbol && (
        <section className="tool-card tool-wide sec-filings-panel">
          <div className="watchlist-heading">
            <div><span className="eyebrow">OFFICIAL REGULATORY FILINGS</span><h3>{secCompanyName} · {secSymbol}</h3></div>
            <button className="button button-quiet button-small" onClick={() => { setSecSymbol(""); setSecFilings([]); }}>Close</button>
          </div>
          {secFilings.length === 0 ? <p>No matching SEC filings from the last 30 days.</p> :
            <div className="sec-filing-list">
              {secFilings.map((filing) => (
                <article className="sec-filing-row" key={filing.accessionNumber}>
                  <div><b>{filing.form}</b><span>{filing.title}</span><small>{filing.summary}</small></div>
                  <div><small>Filed {filing.filingDate}</small><a href={filing.url} target="_blank" rel="noreferrer">Open SEC filing</a></div>
                </article>
              ))}
            </div>
          }
          <p className="fine-print">Metadata only. Filing documents open directly on sec.gov. SEC lookup requires a configured contact User-Agent and is limited to 5 requests per hour.</p>
        </section>
      )}

      <section className="tool-card tool-wide research-inbox">
        <div className="watchlist-heading">
          <div><span className="eyebrow">SCHEDULED & SAVED ANALYSIS</span><h3>Research inbox</h3></div>
          <div className="row-actions">
            <span className="holding-count">{researchInbox.length} briefs</span>
            <button className="button button-small" type="button" onClick={refreshResearchInbox} disabled={inboxLoading}>
              {inboxLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        {inboxLoading ? <p>Loading saved research…</p> :
          researchInbox.length === 0 ? <p>No research briefs yet. Run Research on a US holding or watchlist item with a configured SEC CIK. Scheduled briefs will appear here after new SEC filings are processed.</p> :
          <div className="research-inbox-list">
            {researchInbox.map((item) => (
              <article className="research-inbox-item" key={`${item.symbol}:${item.createdAt}`}>
                <div className="research-inbox-meta">
                  <b>{item.symbol}</b>
                  <span className={`confidence confidence-${item.brief.confidence}`}>{item.brief.confidence} confidence</span>
                  <small>{formatDate(item.createdAt)}</small>
                </div>
                <p>{item.brief.company_summary}</p>
                <button className="button button-small" type="button" onClick={() => openInboxBrief(item)}>
                  Read brief
                </button>
              </article>
            ))}
          </div>
        }
        <p className="fine-print">Only public SEC research for instruments currently in your holdings or watchlist is shown. No portfolio quantities, costs or private notes are included.</p>
      </section>

      {researchResult && (
        <section className="tool-card tool-wide research-panel">
          <div className="watchlist-heading">
            <div><span className="eyebrow">PUBLIC COMPANY RESEARCH · {researchResult.brief.confidence.toUpperCase()} CONFIDENCE</span><h3>{researchResult.symbol} research brief</h3></div>
            <button className="button button-quiet button-small" onClick={() => setResearchResult(null)}>Close</button>
          </div>
          <p>{researchResult.brief.company_summary}</p>
          <div className="research-grid">
            {([
              ["Financial strengths", researchResult.brief.financial_strengths],
              ["Financial risks", researchResult.brief.financial_risks],
              ["Filing signals", researchResult.brief.filing_signals],
              ["Unknowns / data gaps", researchResult.brief.unknowns]
            ] as Array<[string, string[]]>).map(([title, items]) => (
              <article className="research-list" key={title}>
                <b>{title}</b>
                {items.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>No supported points returned.</p>}
              </article>
            ))}
          </div>
          <div className="research-sources">
            <b>SEC sources</b>
            {researchResult.sources.length ? researchResult.sources.map((source) => (
              <a key={source.accessionNumber} href={source.url} target="_blank" rel="noreferrer">{source.form} · {source.filed} · {source.title}</a>
            )) : <p>No recent filing citations were supplied.</p>}
          </div>
          <p className="fine-print">AI-generated and may be wrong. Generated by {researchResult.model} · {researchResult.cached ? "cached" : "new analysis"} · {formatDate(researchResult.createdAt)}. Uses public SEC company facts and filing metadata only. Holdings, quantities, average costs, notes and quote prices are not sent to the model. Not investment advice.</p>
        </section>
      )}

      <div className="portfolio-tools">
        <section className="tool-card">
          <span className="eyebrow">ADD / UPDATE</span>
          <h3>Position details</h3>
          <form className="holding-form" onSubmit={addHolding}>
            <label>Market<select value={market} onChange={(event) => setMarket(event.target.value as "US" | "MY")}><option value="US">United States (USD)</option><option value="MY">Bursa Malaysia (MYR)</option></select></label>
            <label>Symbol<input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder={market === "US" ? "AAPL" : "1155"} maxLength={15} required /></label>
            <label>Quantity<input type="number" min="0.000001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="100" required /></label>
            <label>Average cost<input type="number" min="0" step="any" value={avgCost} onChange={(event) => setAvgCost(event.target.value)} placeholder="Optional" /></label>
            {market === "US" && <label>SEC CIK (optional)<input inputMode="numeric" maxLength={10} value={cik} onChange={(event) => setCik(event.target.value.replace(/[^0-9]/g, "").slice(0, 10))} placeholder="10-digit CIK" /></label>}
            {market === "US" && <p className="field-wide fine-print">Find the CIK on <a href="https://www.sec.gov/edgar/search/" target="_blank" rel="noreferrer">SEC EDGAR company search</a>.</p>}
            <label className="field-wide">Notes<input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Optional private note" /></label>
            <button className="button button-primary field-wide" type="submit" disabled={busy || (holdings.length >= 20 && !existingHolding)}>Save holding</button>
          </form>
        </section>

        <section className="tool-card tool-wide">
          <span className="eyebrow">BULK IMPORT</span>
          <h3>Import holdings CSV</h3>
          <p>Paste up to 20 rows using <code>symbol,market,quantity,avg_cost[,cik]</code>. Use <code>US</code> or <code>MY</code>. CIK is optional and US-only. Existing positions are updated; rows omitted from the file are not deleted.</p>
          <textarea className="csv-field" rows={5} value={holdingsCsv} onChange={(event) => setHoldingsCsv(event.target.value)}
            placeholder={"symbol,market,quantity,avg_cost\nAAPL,US,10,185.50,0000320193\n1155,MY,500,6.42,"} />
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

        <section className="tool-card">
          <span className="eyebrow">PUSH NOTIFICATIONS</span>
          <h3>Alerts on this device</h3>
          {pushState === "checking" ? <p>Checking notification support…</p> :
            pushState === "unsupported" ? <p>Install the app from its HTTPS website on a supported browser to enable push notifications.</p> :
            pushState === "not-configured" ? <p>Push is not configured on the server yet. The notification controls will activate after VAPID setup.</p> :
            pushState === "subscribed" ? <p>This device is subscribed. You can send a test notification or remove this device.</p> :
            <p>Enable notifications only when you want them. Your browser will ask for permission after you tap the button.</p>}
          <div className="tool-actions">
            <button className="button button-secondary" type="button" onClick={enablePushNotifications} disabled={pushBusy || pushState === "checking" || pushState === "unsupported" || pushState === "not-configured" || pushState === "subscribed"}>Enable on this device</button>
            <button className="button button-quiet" type="button" onClick={sendTestPush} disabled={pushBusy || pushState !== "subscribed"}>Send test</button>
            <button className="button button-quiet" type="button" onClick={disablePushNotifications} disabled={pushBusy || pushState !== "subscribed"}>Disable</button>
          </div>
          <p className="fine-print">Push is currently a delivery channel for test and supported alerts. Permission is never requested automatically.</p>
        </section>

        <section className="tool-card">
          <span className="eyebrow">DATA PORTABILITY</span>
          <h3>Export your data</h3>
          <p>JSON includes holdings, watchlist and portfolio settings. CSV contains positions and watchlist in a spreadsheet-friendly format. Exports require your active passkey session.</p>
          <div className="tool-actions">
            <button className="button button-secondary" type="button" onClick={() => downloadExport("json")} disabled={busy}>Download JSON</button>
            <button className="button button-quiet" type="button" onClick={() => downloadExport("csv")} disabled={busy}>Download CSV</button>
          </div>
          <p className="fine-print">CSV is spreadsheet-safe. Quote snapshots and SEC filing metadata are not included in this export.</p>
        </section>

        <section className="tool-card">
          <span className="eyebrow">RISK & ALERT SETTINGS</span>
          <h3>Portfolio thresholds</h3>
          <form className="holding-form" onSubmit={saveSettings}>
            <label>Daily move alert (%)<input type="number" min="1" max="20" step="0.5" value={settings.alertMovePct}
              onChange={(event) => setSettings((current) => ({ ...current, alertMovePct: Number(event.target.value) }))} required /></label>
            <label>Maximum position size (%)<input type="number" min="5" max="50" step="1" value={settings.maxPositionPct}
              onChange={(event) => setSettings((current) => ({ ...current, maxPositionPct: Number(event.target.value) }))} required /></label>
            <button className="button button-secondary field-wide" type="submit" disabled={busy}>Save settings</button>
          </form>
          <p className="fine-print">Position size is used for rule-based concentration warnings. Daily move and position-size thresholds power local rule-based warnings. Push delivery is configured separately above.</p>
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
