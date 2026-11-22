// Append-only audit ledger for Gemini accounting reviews. Preview/audit only:
// nothing here reads or writes production fundamentals, ratios or rankings.

export const DECISION_VALUES = new Set(["ACCEPT", "REJECT", "OVERRIDE"]);
export const OVERRIDE_CLASSIFICATIONS = new Set([
  "conventional_debt", "lease_liability", "finance_lease_liability", "operating_lease_liability",
  "failed_sale_leaseback_financing", "supplier_finance", "vendor_financing", "factoring",
  "receivables_financing", "royalty_financing", "tax_receivable_agreement", "restricted_cash",
  "unrestricted_cash", "customer_funds", "escrow", "short_term_investment", "noncontrolling_interest",
  "operating_liability", "other_financing_or_liability", "pension_liability", "asset_retirement_obligation",
  "contingent_consideration", "preferred_equity", "redeemable_noncontrolling_interest",
  "operating_income_presentation", "non_operating_item", "discontinued_operation", "exceptional_item_review",
  "right_of_use_asset", "rental_equipment", "property_plant_equipment", "working_capital_component",
  "other_ev_adjustment_review", "unknown"
]);
export const REVIEW_TASKS = new Set(["debt_scope", "cash_scope", "lease_scope", "nci_scope",
  "financing_scope", "ebit_scope", "invested_capital_scope", "full_scope"]);

export const MAX_RATIONALE_CHARS = 2000;
export const MAX_REVIEWER_CHARS = 80;
export const MAX_DECISION_BODY_BYTES = 8192;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// Idempotent on fresh and existing databases (IF NOT EXISTS everywhere).
export const LEDGER_DDL = [
  `CREATE TABLE IF NOT EXISTS gemini_accounting_review_history (
    history_id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT NOT NULL UNIQUE,
    symbol TEXT NOT NULL, accession TEXT, task TEXT NOT NULL, input_hash TEXT NOT NULL,
    prompt_version TEXT NOT NULL, policy_version TEXT NOT NULL, model TEXT NOT NULL,
    status TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gemini_review_history_symbol ON gemini_accounting_review_history(symbol,task,history_id)`,
  `CREATE TABLE IF NOT EXISTS gemini_accounting_review_decisions (
    decision_id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT NOT NULL, symbol TEXT NOT NULL, accession TEXT, task TEXT NOT NULL, input_hash TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('ACCEPT','REJECT','OVERRIDE')),
    override_classification TEXT,
    rationale TEXT NOT NULL, reviewer TEXT NOT NULL, created_at TEXT NOT NULL,
    CHECK (decision <> 'OVERRIDE' OR override_classification IS NOT NULL),
    CHECK (decision = 'OVERRIDE' OR override_classification IS NULL)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_gemini_review_decisions_key ON gemini_accounting_review_decisions(cache_key,decision_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gemini_review_decisions_symbol ON gemini_accounting_review_decisions(symbol,task,decision_id)`,
  // Append-only enforcement at the database layer.
  `CREATE TRIGGER IF NOT EXISTS gemini_review_history_no_update BEFORE UPDATE ON gemini_accounting_review_history
    BEGIN SELECT RAISE(ABORT,'gemini_accounting_review_history is append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS gemini_review_history_no_delete BEFORE DELETE ON gemini_accounting_review_history
    BEGIN SELECT RAISE(ABORT,'gemini_accounting_review_history is append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS gemini_review_decisions_no_update BEFORE UPDATE ON gemini_accounting_review_decisions
    BEGIN SELECT RAISE(ABORT,'gemini_accounting_review_decisions is append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS gemini_review_decisions_no_delete BEFORE DELETE ON gemini_accounting_review_decisions
    BEGIN SELECT RAISE(ABORT,'gemini_accounting_review_decisions is append-only'); END`
];

export async function ensureLedgerSchema(env) {
  for (const ddl of LEDGER_DDL) await env.DB.prepare(ddl).run();
}

export const HISTORY_INSERT_SQL = `INSERT OR IGNORE INTO gemini_accounting_review_history
  (cache_key,symbol,accession,task,input_hash,prompt_version,policy_version,model,status,response_json,created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?)`;

// Cache row and ledger row are written in ONE D1 batch (a single implicit transaction) so a
// review can never be cached without its history row, or vice versa. History is keyed by
// cache_key (UNIQUE + INSERT OR IGNORE), so it is appended once per completed review and
// never on a cache hit (cache hits return before this function is reached).
export async function persistCompletedReview(env, cacheInsertSql, row) {
  const cacheStmt = env.DB.prepare(cacheInsertSql).bind(row.cacheKey, row.symbol, row.accession, row.task, row.inputHash,
    row.promptVersion, row.policyVersion, row.model, row.status, row.responseJson, row.createdAt, row.createdAt);
  const historyStmt = env.DB.prepare(HISTORY_INSERT_SQL).bind(row.cacheKey, row.symbol, row.accession, row.task,
    row.inputHash, row.promptVersion, row.policyVersion, row.model, row.status, row.responseJson, row.createdAt);
  if (typeof env.DB.batch !== "function") {
    throw new Error("D1 batch support is required for atomic cache/history persistence");
  }
  await env.DB.batch([cacheStmt, historyStmt]);
}

function fail(message, status = 400) { return { ok: false, status, error: message }; }

export function parsePageParams(searchParams) {
  const rawLimit = searchParams.get("limit");
  const rawOffset = searchParams.get("offset");
  const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Math.floor(Number(rawLimit));
  const offset = rawOffset === null ? 0 : Math.floor(Number(rawOffset));
  if (!Number.isFinite(limit) || limit < 1) return fail("limit must be a positive integer");
  if (!Number.isFinite(offset) || offset < 0 || offset > 100000) return fail("offset must be a non-negative integer");
  return { ok: true, limit: Math.min(MAX_PAGE_SIZE, limit), offset };
}

export function validateDecisionPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fail("JSON object body required");
  const symbol = String(payload.symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,15}$/.test(symbol)) return fail("A valid US ticker symbol is required");
  const task = String(payload.task ?? "");
  if (!REVIEW_TASKS.has(task)) return fail("task must be a supported accounting review task");
  const cacheKey = String(payload.cache_key ?? "");
  if (!/^[0-9a-f]{64}$/.test(cacheKey)) return fail("cache_key must be the 64-character hex key of an existing cached review");
  const inputHash = String(payload.input_hash ?? "");
  if (!/^[0-9a-f]{64}$/.test(inputHash)) return fail("input_hash must be the 64-character hex evidence hash of the reviewed evidence");
  const decision = String(payload.decision ?? "");
  if (!DECISION_VALUES.has(decision)) return fail("decision must be ACCEPT, REJECT or OVERRIDE");
  let classification = null;
  if (decision === "OVERRIDE") {
    classification = String(payload.classification ?? "");
    if (!OVERRIDE_CLASSIFICATIONS.has(classification)) return fail("OVERRIDE requires a valid classification");
  } else if (payload.classification !== undefined && payload.classification !== null && payload.classification !== "") {
    return fail("classification is only allowed with OVERRIDE");
  }
  const rationale = typeof payload.rationale === "string" ? payload.rationale.trim() : "";
  if (!rationale) return fail("rationale is required");
  if (rationale.length > MAX_RATIONALE_CHARS) return fail("rationale exceeds " + MAX_RATIONALE_CHARS + " characters");
  const reviewer = typeof payload.reviewer === "string" ? payload.reviewer.trim() : "";
  if (!reviewer) return fail("reviewer is required");
  if (reviewer.length > MAX_REVIEWER_CHARS) return fail("reviewer exceeds " + MAX_REVIEWER_CHARS + " characters");
  if (/[\u0000-\u001f]/.test(reviewer)) return fail("reviewer must not contain control characters");
  const accession = payload.accession === undefined || payload.accession === null ? null : String(payload.accession);
  if (accession !== null && !/^[0-9A-Za-z-]{1,40}$/.test(accession)) return fail("accession is malformed");
  return { ok: true, value: { symbol, task, cacheKey, inputHash, decision, classification, rationale, reviewer, accession } };
}

// A decision must reference an EXACT existing cached review: same cache key, symbol, task,
// evidence hash (and accession when supplied). This blocks cross-symbol/task references.
export async function recordReviewDecision(env, payload, now = new Date().toISOString()) {
  const checked = validateDecisionPayload(payload);
  if (!checked.ok) return checked;
  const v = checked.value;
  await ensureLedgerSchema(env);
  const cached = await env.DB.prepare(
    "SELECT cache_key,symbol,accession,task,input_hash,status FROM gemini_accounting_review_cache WHERE cache_key=?"
  ).bind(v.cacheKey).first();
  if (!cached) return fail("No cached Gemini review exists for this cache_key", 404);
  if (cached.symbol !== v.symbol || cached.task !== v.task || cached.input_hash !== v.inputHash
    || (v.accession !== null && cached.accession !== v.accession))
    return fail("Decision does not match the cached review's symbol, task, evidence hash or accession", 409);
  const inserted = await env.DB.prepare(`INSERT INTO gemini_accounting_review_decisions
    (cache_key,symbol,accession,task,input_hash,decision,override_classification,rationale,reviewer,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING decision_id`)
    .bind(cached.cache_key, cached.symbol, cached.accession ?? null, cached.task, cached.input_hash,
      v.decision, v.classification, v.rationale, v.reviewer, now).first();
  return { ok: true, status: 201, decision: {
    decision_id: inserted?.decision_id ?? null, cache_key: cached.cache_key, symbol: cached.symbol,
    accession: cached.accession ?? null, task: cached.task, input_hash: cached.input_hash, decision: v.decision,
    classification: v.classification, reviewer: v.reviewer, created_at: now,
    reviewer_identity_verified: false,
    note: "Reviewer is self-reported under the shared bearer token; it is not a verified identity. Recording a decision does not approve production values."
  } };
}

function collectEvidenceIds(value, ids = new Set()) {
  if (!value || typeof value !== "object") return ids;
  if (Array.isArray(value)) {
    for (const item of value) collectEvidenceIds(item, ids);
    return ids;
  }
  if (typeof value.evidence_id === "string" && value.evidence_id.trim()) ids.add(value.evidence_id.trim());
  if (Array.isArray(value.evidence_ids)) {
    for (const id of value.evidence_ids) if (typeof id === "string" && id.trim()) ids.add(id.trim());
  }
  for (const child of Object.values(value)) collectEvidenceIds(child, ids);
  return ids;
}

export async function listReviewHistory(env, { symbol = null, task = null, limit, offset }) {
  await ensureLedgerSchema(env);
  const where = []; const args = [];
  if (symbol) { where.push("symbol=?"); args.push(symbol); }
  if (task) { where.push("task=?"); args.push(task); }
  const sql = "SELECT history_id,cache_key,symbol,accession,task,input_hash,prompt_version,policy_version,model,status,response_json,created_at "
    + "FROM gemini_accounting_review_history" + (where.length ? " WHERE " + where.join(" AND ") : "")
    + " ORDER BY history_id DESC LIMIT ? OFFSET ?";
  const rows = await env.DB.prepare(sql).bind(...args, limit, offset).all();
  return (rows?.results ?? []).map(row => {
    let response = null;
    try { response = JSON.parse(row.response_json); } catch { response = null; }
    const { response_json, ...metadata } = row;
    return { ...metadata, evidence_ids: [...collectEvidenceIds(response)].sort() };
  });
}

export async function listReviewDecisions(env, { symbol = null, task = null, cacheKey = null, limit, offset }) {
  await ensureLedgerSchema(env);
  const where = []; const args = [];
  if (symbol) { where.push("symbol=?"); args.push(symbol); }
  if (task) { where.push("task=?"); args.push(task); }
  if (cacheKey) { where.push("cache_key=?"); args.push(cacheKey); }
  const sql = "SELECT decision_id,cache_key,symbol,accession,task,input_hash,decision,override_classification,rationale,reviewer,created_at "
    + "FROM gemini_accounting_review_decisions" + (where.length ? " WHERE " + where.join(" AND ") : "")
    + " ORDER BY decision_id DESC LIMIT ? OFFSET ?";
  const rows = await env.DB.prepare(sql).bind(...args, limit, offset).all();
  return rows?.results ?? [];
}

