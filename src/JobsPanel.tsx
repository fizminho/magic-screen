import { useCallback, useEffect, useState } from "react";

type JobRun = {
  id: number;
  job: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  detail: unknown;
};

type Props = { onError: (message: string) => void; onNotice: (message: string) => void };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Request failed.");
  return payload as T;
}

const labels: Record<string, string> = {
  manual_sec_refresh: "SEC refresh · Manual",
  sec_refresh: "SEC refresh · Cron",
  manual_research_brief: "Research Brief · Manual",
  scheduled_research_brief: "Research Brief · Cron"
};

function detailText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, item]) => key + ": " + String(item)).join(" · ");
  }
  return "";
}

export default function JobsPanel({ onError, onNotice }: Props) {
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await request<{ runs: JobRun[] }>("/api/admin/jobs");
      setRuns(result.runs);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to load job history.");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function run(job: "sec_refresh" | "research_brief") {
    setBusy(true);
    onError("");
    onNotice("");
    try {
      await request("/api/admin/jobs/run", {
        method: "POST",
        body: JSON.stringify({ job })
      });
      onNotice(job === "sec_refresh"
        ? "SEC refresh started. Check execution history for the result."
        : "Research Brief started. Check execution history for the result.");
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Unable to start job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tool-card tool-wide">
      <div className="watchlist-heading">
        <div><span className="eyebrow">OPERATIONS</span><h3>Scheduled jobs</h3></div>
        <button className="button button-small" type="button" onClick={() => void refresh()} disabled={loading}>Refresh history</button>
      </div>
      <p>Run the same job logic used by Cron without waiting for the next schedule. Only one manual job can run at a time.</p>
      <div className="tool-actions">
        <button className="button button-secondary" type="button" onClick={() => void run("sec_refresh")} disabled={busy}>
          {busy ? "Starting…" : "Run SEC refresh"}
        </button>
        <button className="button button-primary" type="button" onClick={() => void run("research_brief")} disabled={busy}>
          {busy ? "Starting…" : "Run Research Brief"}
        </button>
      </div>
      <div className="research-inbox-list">
        {loading ? <p>Loading execution history…</p> : runs.length === 0 ? <p>No job executions recorded yet.</p> :
          runs.map((item) => (
            <article className="research-inbox-item" key={item.id}>
              <div className="research-inbox-meta">
                <b>{labels[item.job] || item.job}</b>
                <span className={`confidence confidence-${item.status === "success" ? "high" : item.status === "failed" ? "low" : "medium"}`}>{item.status}</span>
                <small>{new Date(item.startedAt).toLocaleString()}</small>
              </div>
              {item.finishedAt && <small>Finished {new Date(item.finishedAt).toLocaleString()}</small>}
              {detailText(item.detail) && <p>{detailText(item.detail)}</p>}
            </article>
          ))
        }
      </div>
      <p className="fine-print">Manual execution uses the existing cache and five-brief daily AI quota. SEC refresh still requires a valid SEC contact User-Agent. Cron schedules are unchanged.</p>
    </section>
  );
}
