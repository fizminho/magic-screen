import { useCallback, useEffect, useState } from "react";

type JobRun = {
  job: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  detail: string | null;
};

const JOBS = [
  { id: "sec_refresh", label: "SEC refresh", description: "Fetch the latest SEC filings and company facts for tracked US stocks." },
  { id: "research_brief", label: "Research Brief", description: "Generate AI research briefs from the latest available SEC data." }
] as const;

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

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default function JobsPanel({ onError, onNotice }: { onError: (value: string) => void; onNotice: (value: string) => void }) {
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

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
        <div className="credential-heading">
          <b>Recent executions</b>
          <button className="button button-small" onClick={() => refresh().catch((error) => onError(error instanceof Error ? error.message : "Refresh failed."))}>Refresh</button>
        </div>
        {loading ? <p>Loading job history…</p> : runs.length === 0 ? <p>No job executions recorded yet.</p> : runs.map((item, index) => (
          <div className="credential-row" key={item.job + item.startedAt + index}>
            <div className="credential-meta">
              <b>{label(item.job)}</b>
              <span>{new Date(item.startedAt).toLocaleString()} · {item.finishedAt ? "Finished " + new Date(item.finishedAt).toLocaleString() : "In progress"}</span>
              <span>{item.status}{item.detail ? " · " + item.detail : ""}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
