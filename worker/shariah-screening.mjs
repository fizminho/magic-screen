// Offline, personal-use Shariah-first screening logic (masterplan gates B, C, D).
// Pure functions only: no network, no database, no production wiring. All inputs are
// records the owner entered manually after lawfully viewing each source.

export const SHARIAH_SOURCES = Object.freeze(["musaffa", "halalscreener"]);
export const DEFAULT_MAX_AGE_DAYS = 30; // owner-adjustable freshness window

const STATUS_MAP = new Map([
  ["halal", "halal"],
  ["doubtful", "doubtful"],
  ["not halal", "not_halal"],
  ["not_halal", "not_halal"],
  ["non-halal", "not_halal"],
  ["haram", "not_halal"],
  ["no data", "no_data"],
  ["no_data", "no_data"],
]);

// Unknown wording is never promoted to Halal.
export function normalizeStatus(raw) {
  const key = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return STATUS_MAP.get(key) ?? "unrecognised";
}

export function normalizeSymbol(raw) {
  return String(raw ?? "").trim().toUpperCase();
}

function ageDays(checkedAt, now) {
  const t = Date.parse(checkedAt);
  if (Number.isNaN(t)) return null;
  return (now - t) / 86400000;
}

// One source's check -> { status, fresh, reason }
export function assessSourceCheck(check, now, maxAgeDays) {
  if (!check) return { status: "unchecked", fresh: false, reason: "not checked" };
  const status = normalizeStatus(check.status);
  if (typeof check.reference !== "string" || !check.reference.trim()) return { status, fresh: false, reason: status === "no_data" ? "source reference unavailable" : "missing source reference" };
  const age = ageDays(check.checked_at, now);
  if (age === null) return { status, fresh: false, reason: "missing or invalid checked date" };
  if (age < 0) return { status, fresh: false, reason: "checked date is in the future" };
  if (age > maxAgeDays) return { status, fresh: false, reason: `stale (${Math.floor(age)} days old)` };
  return { status, fresh: true, reason: null };
}

// Decision: "pass" | "review" | "excluded". Never invents a combined ruling.
export function evaluateShariah(symbol, checks = {}, { now = Date.now(), maxAgeDays = DEFAULT_MAX_AGE_DAYS } = {}) {
  const per = {};
  for (const src of SHARIAH_SOURCES) per[src] = assessSourceCheck(checks[src], now, maxAgeDays);
  const reasons = [];
  const statuses = SHARIAH_SOURCES.map((s) => per[s].status);
  const concrete = statuses.filter((s) => ["halal", "doubtful", "not_halal"].includes(s));
  const conflict = concrete.length > 1 && new Set(concrete).size > 1;

  for (const src of SHARIAH_SOURCES) {
    const p = per[src];
    if (p.status === "unchecked") reasons.push(`${src}: not checked`);
    else if (p.status === "unrecognised") reasons.push(`${src}: unrecognised status "${checks[src]?.status}"`);
    else if (p.status !== "halal") reasons.push(`${src}: ${p.status}`);
    if (p.reason && p.status !== "unchecked") reasons.push(`${src}: ${p.reason}`);
  }

  let decision;
  if (conflict) { decision = "review"; reasons.unshift("sources disagree — manual review required"); }
  else if (SHARIAH_SOURCES.every((s) => per[s].status === "halal" && per[s].fresh)) decision = "pass";
  else decision = "excluded";
  return { symbol: normalizeSymbol(symbol), decision, per_source: per, reasons };
}

// Gate C: validate one manual Investing Paths observation. Only fields actually seen are kept.
export function validateInvestingPathsObservation(obs) {
  const errors = [];
  const symbol = normalizeSymbol(obs?.symbol);
  if (!symbol) errors.push("symbol is required");
  if (obs?.collection_method !== "manual") errors.push('collection_method must be "manual" (no scraping/automation/AI collection)');
  if (obs?.manually_verified !== true) errors.push("manually_verified must be true");
  if (Number.isNaN(Date.parse(obs?.checked_at))) errors.push("checked_at must be a valid date");
  if (!obs?.source_reference) errors.push("source_reference (direct page reference) is required");
  if (typeof obs?.found !== "boolean") errors.push("found must be an explicit boolean");
  const found = obs?.found === true;
  const out = { symbol, found, checked_at: obs?.checked_at ?? null, source_reference: obs?.source_reference ?? null };
  if (!found) {
    // "Not Found / Not Checked" — never infer a rank or call it unranked.
    for (const k of ["rank", "earnings_yield", "return_on_capital", "fiscal_year", "fiscal_period"]) {
      if (obs?.[k] != null) errors.push(`${k} must be empty when found is false`);
    }
    return { ok: errors.length === 0, errors, observation: { ...out, status: "not_found" } };
  }
  const num = (k, { int = false, min = -Infinity } = {}) => {
    if (obs?.[k] == null || obs[k] === "") return null;
    const v = Number(obs[k]);
    if (!Number.isFinite(v) || (int && !Number.isInteger(v)) || v < min) { errors.push(`${k} is not a valid number`); return null; }
    return v;
  };
  const observation = {
    ...out, status: "verified",
    rank: num("rank", { int: true, min: 1 }),
    earnings_yield: num("earnings_yield"),
    return_on_capital: num("return_on_capital"),
    fiscal_year: num("fiscal_year", { int: true, min: 1990 }),
    fiscal_period: obs?.fiscal_period ? String(obs.fiscal_period) : null,
  };
  const anyField = ["rank", "earnings_yield", "return_on_capital", "fiscal_year", "fiscal_period"].some((k) => observation[k] != null);
  if (!anyField) errors.push("a found ticker must record at least one visible field");
  return { ok: errors.length === 0, errors, observation };
}

// Gate D data: one audited row per MFI ticker.
export function buildShortlist({ universe, shariahChecks = [], ipObservations = [], now = Date.now(), maxAgeDays = DEFAULT_MAX_AGE_DAYS }) {
  const checksBySymbol = new Map();
  const shariahErrors = [];
  for (const row of shariahChecks) {
    const s = normalizeSymbol(row.symbol);
    const source = String(row.source ?? "").trim().toLowerCase();
    if (!s || !SHARIAH_SOURCES.includes(source)) {
      shariahErrors.push({ symbol: s || null, source: source || null, reason: "missing symbol or unsupported source" });
      continue;
    }
    const per = checksBySymbol.get(s) ?? {};
    if (Object.hasOwn(per, source)) {
      per[source] = { status: "__duplicate_source_record__", checked_at: null };
      shariahErrors.push({ symbol: s, source, reason: "duplicate source record; manual reconciliation required" });
    } else if (per[source]?.status !== "__duplicate_source_record__") {
      per[source] = row;
    }
    checksBySymbol.set(s, per);
  }
  const ipBySymbol = new Map();
  const ipErrors = [];
  for (const raw of ipObservations) {
    const v = validateInvestingPathsObservation(raw);
    if (!v.ok) { ipErrors.push({ symbol: v.observation.symbol, errors: v.errors }); continue; }
    ipBySymbol.set(v.observation.symbol, v.observation);
  }
  const seen = new Set();
  const rows = [];
  for (const t of universe.tickers ?? []) {
    const symbol = normalizeSymbol(typeof t === "string" ? t : t.symbol);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    const shariah = evaluateShariah(symbol, checksBySymbol.get(symbol), { now, maxAgeDays });
    const ip = ipBySymbol.get(symbol) ?? null;
    let state;
    if (shariah.decision === "pass") state = ip?.status === "verified" ? "eligible_validated" : "eligible_unvalidated";
    else state = shariah.decision === "review" ? "needs_review" : "excluded";
    rows.push({ symbol, name: typeof t === "string" ? null : t.name ?? null, state, shariah, investing_paths: ip ?? { status: "not_checked" } });
  }
  const count = (s) => rows.filter((r) => r.state === s).length;
  return {
    generated_at: new Date(now).toISOString(),
    universe: { source_url: universe.source_url ?? null, retrieved_at: universe.retrieved_at ?? null, snapshot: universe.snapshot ?? null, count: rows.length },
    max_age_days: maxAgeDays,
    summary: { eligible_validated: count("eligible_validated"), eligible_unvalidated: count("eligible_unvalidated"), needs_review: count("needs_review"), excluded: count("excluded") },
    ignored_invalid_shariah_records: shariahErrors,
    ignored_invalid_investing_paths_records: ipErrors,
    rows,
  };
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LABEL = { eligible_validated: "Eligible · validated", eligible_unvalidated: "Eligible · not yet validated", needs_review: "Needs manual review", excluded: "Excluded" };

export function renderReportHtml(result) {
  const cell = (p) => `${esc(p.status)}${p.fresh ? "" : ` <small>(${esc(p.reason)})</small>`}`;
  const body = result.rows.map((r) => {
    const ip = r.investing_paths;
    const ipText = ip.status === "verified"
      ? `Rank ${esc(ip.rank ?? "—")} · EY ${esc(ip.earnings_yield ?? "—")} · ROC ${esc(ip.return_on_capital ?? "—")} · ${esc([ip.fiscal_year, ip.fiscal_period].filter(Boolean).join(" ") || "—")}<br><small>checked ${esc(ip.checked_at)} · ${esc(ip.source_reference)}</small>`
      : ip.status === "not_found" ? `Not found <small>(checked ${esc(ip.checked_at)})</small>` : "Not checked";
    return `<tr class="${esc(r.state)}"><td><b>${esc(r.symbol)}</b><br><small>${esc(r.name ?? "")}</small></td><td>${esc(LABEL[r.state])}</td><td>${cell(r.shariah.per_source.musaffa)}</td><td>${cell(r.shariah.per_source.halalscreener)}</td><td>${ipText}</td><td><small>${esc(r.shariah.reasons.join("; "))}</small></td></tr>`;
  }).join("\n");
  const s = result.summary;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shariah-first MFI shortlist (personal use)</title>
<style>:root{--bg:#fff;--fg:#14213d;--mut:#667;--line:#d8dde6;--ok:#e7f6ec;--rev:#fff4d6}@media(prefers-color-scheme:dark){:root{--bg:#0b1020;--fg:#e6ebf5;--mut:#9aa6bd;--line:#26314d;--ok:#12301f;--rev:#3a3112}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px system-ui,sans-serif}.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}small{color:var(--mut)}tr.eligible_validated{background:var(--ok)}tr.needs_review{background:var(--rev)}tr.excluded{opacity:.75}</style></head><body>
<h1>Shariah-first MFI shortlist</h1>
<p><small>Personal-use research record. Not a public feed. Universe: ${esc(result.universe.source_url ?? "unknown")} · retrieved ${esc(result.universe.retrieved_at ?? "unknown")} · ${result.universe.count} tickers · Shariah freshness window ${result.max_age_days} days · generated ${esc(result.generated_at)}</small></p>
<p>Eligible &amp; validated: <b>${s.eligible_validated}</b> · Eligible, not yet validated: <b>${s.eligible_unvalidated}</b> · Needs review: <b>${s.needs_review}</b> · Excluded: <b>${s.excluded}</b></p>
<div class="wrap"><table><thead><tr><th>Ticker</th><th>State</th><th>Musaffa</th><th>HalalScreener</th><th>Investing Paths (manual)</th><th>Why</th></tr></thead><tbody>
${body}
</tbody></table></div></body></html>`;
}
