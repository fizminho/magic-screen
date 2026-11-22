// Read-only export of the persistent Gemini accounting review audit ledger.
// This calls history/decisions GET endpoints only. It never invokes Gemini or mutates application data.
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";

const base = String(process.env.WORKER_BASE_URL ?? "").replace(/\/$/, "");
const token = process.env.UNIVERSE_SYNC_TOKEN;
if (!base || !token) throw new Error("WORKER_BASE_URL and UNIVERSE_SYNC_TOKEN are required");

const PAGE_SIZE = 100;
const MAX_ROWS = 100000;
async function fetchAll(kind) {
  const rows = [];
  for (let offset = 0; offset <= MAX_ROWS; offset += PAGE_SIZE) {
    const url = new URL(base + "/api/fundamentals/edgartools/ai-review/" + kind);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, {
      method: "GET",
      headers: { authorization: "Bearer " + token, accept: "application/json" }
    });
    if (!response.ok) throw new Error(kind + " export failed: HTTP " + response.status);
    const payload = await response.json();
    const page = payload[kind];
    if (!Array.isArray(page)) throw new Error(kind + " response did not contain an array");
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
  throw new Error(kind + " export exceeded safety limit of " + MAX_ROWS + " rows");
}

const [history, decisions] = await Promise.all([fetchAll("history"), fetchAll("decisions")]);
const byStatus = {};
const byTask = {};
const symbols = new Set();
for (const row of history) {
  byStatus[row.status ?? "UNKNOWN"] = (byStatus[row.status ?? "UNKNOWN"] ?? 0) + 1;
  byTask[row.task ?? "UNKNOWN"] = (byTask[row.task ?? "UNKNOWN"] ?? 0) + 1;
  if (row.symbol) symbols.add(row.symbol);
}
const exportData = {
  exported_at: new Date().toISOString(),
  source: "read-only authenticated audit endpoints",
  audit_only: true,
  production_write: false,
  production_fundamentals_changed: false,
  rankings_changed: false,
  totals: { history: history.length, decisions: decisions.length, unique_symbols: symbols.size },
  history_by_status: byStatus,
  history_by_task: byTask,
  history,
  decisions
};
mkdirSync("artifacts", { recursive: true });
writeFileSync("artifacts/review-ledger-export.json", JSON.stringify(exportData, null, 2) + "\n");
const md = [
  "# Gemini accounting review audit ledger export",
  "",
  "- Exported: " + exportData.exported_at,
  "- History rows: " + history.length,
  "- Decision rows: " + decisions.length,
  "- Unique issuers: " + symbols.size,
  "- Production writes: **false**",
  "- Production fundamentals changed: **false**",
  "- Rankings changed: **false**",
  "",
  "## History by status",
  ...Object.entries(byStatus).sort().map(([k,v]) => "- " + k + ": " + v),
  "",
  "## History by task",
  ...Object.entries(byTask).sort().map(([k,v]) => "- " + k + ": " + v),
  "",
  "## Recorded decisions",
  decisions.length ? "| Issuer | Task | Decision | Reviewer | Created |\n|---|---|---|---|---|\n" +
    decisions.map(d => "| " + (d.symbol ?? "") + " | " + (d.task ?? "") + " | " + (d.decision ?? "") + " | " + (d.reviewer ?? "") + " | " + (d.created_at ?? "") + " |").join("\n")
    : "No human decisions are recorded in the returned ledger.",
  "",
  "Full source rows are in `review-ledger-export.json`. Treat this export as sensitive operational data."
].join("\n");
writeFileSync("artifacts/review-ledger-export.md", md + "\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
console.log("Read-only ledger export completed: " + history.length + " history rows, " + decisions.length + " decisions, " + symbols.size + " issuers.");
