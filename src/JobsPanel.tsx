import { useCallback, useEffect, useState } from "react";

type JobRun = {
  job: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  detail: string | null;
};

type ResearchBrief = {
  symbol: string;
  company_summary: string;
  financial_strengths: string[];
  financial_risks: string[];
  filing_signals: string[];
  unknowns: string[];
  confidence: "low" | "medium" | "high";
  source_accessions: string[];
  disclaimer: string;
};

type ResearchSource = {
  accessionNumber: string;
  form: string;
  filed: string;
  title: string;
  url: string;
};

type ResearchResult = {
  brief: ResearchBrief;
  model: string;
  createdAt: string;
  cached: boolean;
  sources: ResearchSource[];
};

const JOBS = [
  { id: "sec_refresh", label: "SEC refresh", description: "Fetch the latest SEC filings and company facts for tracked US stocks." },
  { id: "research_brief", label: "Research Brief scan", description: "Scan tracked stocks with recent SEC filings and generate eligible research briefs." }
] as const;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers || {}) }
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload &&
      typeof payload.error === "string" ? payload.error : "Request failed.";
    throw new Error(message);
  }
  return payload as T;
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default function JobsPanel({ onError, onNotice }: { onError: (value: string) => void; onNotice: (value: string) => void }) {
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [ticker, setTicker] = useState("AAPL");
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);

  const refresh = useCallback(async () => {
    const result = await request<{ runs: JobRun[] }>("/api/admin/jobs");
    setRuns(result.runs);
  }, []);

  useEffect(() => {
    refresh().catch((error) => onError(error instanceof Error ? error.message : "Unable to load job history."))
      .finally(() => setLoading(false));
  }, [refresh, onError]);

  async function run(job: string) {
    setRunning(job);
    onError("");
    onNotice("");
    try {
      await request("/api/admin/jobs/run", { method: "POST", body: JSON.stringify({ job }) });
      onNotice(label(job) + " accepted. Refresh the history in a moment to see its result.");
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to start job.");
    } finally {
      setRunning(null);
    }
  }

  async function generateTickerBrief() {
    const symbol = ticker.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) {
      onError("Enter a valid US ticker symbol.");
      return;
    }
    setRunning("brief:" + symbol);
    setResearchResult(null);
    onError("");
    onNotice("");
    try {
      const result = await request<ResearchResult>("/api/analysis/run", {
        method: "POST",
        body: JSON.stringify({ symbol })
      });
      setResearchResult(result);
      onNotice(`${symbol} Research Brief generated successfully.${result.cached ? " Existing cached result reused." : ""}`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to generate the Research Brief.");
    } finally {
      setRunning(null);
    }
  }

  return (
    <section className="auth-panel jobs-panel">
      <span className="eyebrow">OPERATIONS</span>
      <h2>Manual job trigger</h2>
      <p>Run scheduled research tasks on demand. Only the signed-in owner can start a job.</p>
      <div className="job-actions">
        {JOBS.map((job) => (
          <div className="session-card" key={job.id}>
            <div><b>{job.label}</b><span>{job.description}</span></div>
            <button className="button button-secondary" onClick={() => run(job.id)} disabled={running !== null}>
              {running === job.id ? "Starting…" : "Run now"}
            </button>
          </div>
        ))}
      </div>

      <div className="credential-list">
        <div className="credential-heading"><b>Generate brief for a ticker</b><span>Direct AI test</span></div>
        <p>Generate a Research Brief for one US ticker without waiting for the scheduled recent-filing scan. Requires fresh SEC CompanyFacts data.</p>
        <div className="session-card">
          <div>
            <label htmlFor="research-ticker"><b>US ticker</b></label>
            <input id="research-ticker" className="text-field" value={ticker} maxLength={15}
              autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
              placeholder="e.g. AAPL" disabled={running !== null} />
          </div>
          <button className="button button-primary" onClick={generateTickerBrief}
            disabled={running !== null || !ticker.trim()}>
            {running === "brief:" + ticker.trim().toUpperCase() ? "Generating…" : "Generate brief"}
          </button>
        </div>
      </div>

      {researchResult && (
        <div className="credential-list">
          <div className="credential-heading">
            <b>{researchResult.brief.symbol} Research Brief</b>
            <span>{researchResult.brief.confidence} confidence</span>
          </div>
          <p>{researchResult.brief.company_summary}</p>
          {([
            ["Financial strengths", researchResult.brief.financial_strengths],
            ["Financial risks", researchResult.brief.financial_risks],
            ["Filing signals", researchResult.brief.filing_signals],
            ["Unknowns", researchResult.brief.unknowns]
          ] as Array<[string, string[]]>).map(([heading, items]) => items.length > 0 && (
            <div className="credential-row" key={heading}>
              <div className="credential-meta">
                <b>{heading}</b>
                {items.map((item, index) => <span key={index}>{item}</span>)}
              </div>
            </div>
          ))}
          <div className="credential-row">
            <div className="credential-meta">
              <b>Source filings</b>
              {researchResult.sources.length > 0 ? researchResult.sources.map((source) => (
                <a key={source.accessionNumber} href={source.url} target="_blank" rel="noreferrer">
                  {source.form} · {source.filed || source.accessionNumber} · {source.title}
                </a>
              )) : <span>No source filing links were returned for the model's cited accessions.</span>}
              {researchResult.brief.source_accessions.length > 0 && (
                <span>Model accessions: {researchResult.brief.source_accessions.join(", ")}</span>
              )}
            </div>
          </div>
          <p className="fine-print">{researchResult.brief.disclaimer} · {researchResult.model} · {new Date(researchResult.createdAt).toLocaleString()}</p>
        </div>
      )}

      <div className="credential-list">
        <div className="credential-heading">
          <b>Recent executions</b>
          <button className="button button-small" onClick={() => refresh().catch((error) => onError(error instanceof Error ? error.message : "Refresh failed."))}>Refresh</button>
        </div>
        {loading ? <p>Loading job history…</p> : runs.length === 0 ? <p>No job executions recorded yet.</p> : runs.map((item, index) => (
          <div className="credential-row" key={item.job + item.startedAt + index}>
            <div className="credential-meta">
              <b>{label(item.job.replace(/^manual_/, ""))}</b> <span>{item.job.startsWith("manual_") ? "Manual" : "Cron"}</span>
              <span>{new Date(item.startedAt).toLocaleString()} · {item.finishedAt ? "Finished " + new Date(item.finishedAt).toLocaleString() : "In progress"}</span>
              <span>{item.status}{item.detail ? " · " + item.detail : ""}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
