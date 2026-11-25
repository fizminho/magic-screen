import { jsonResponse } from "./auth.mjs";

const MAX_BODY_BYTES = 5_000_000;
const MAX_COMPANIES = 50;
const SYMBOL_RE = /^[A-Z0-9.-]{1,15}$/;

async function authorized(request, env) {
  const expected = env.UNIVERSE_SYNC_TOKEN;
  const supplied = request.headers.get("authorization") || "";
  if (typeof expected !== "string" || expected.length < 32 || !supplied.startsWith("Bearer ")) return false;
  const actual = supplied.slice(7);
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function validCompany(item) {
  if (!item || typeof item !== "object" || !SYMBOL_RE.test(item.symbol || "")) return false;
  if (!["supported", "unsupported_provider", "extraction_error"].includes(item.provider_status)) return false;
  if (item.provider_status === "supported") {
    const filing = item.filing || {};
    const accession = filing.accession_number || filing.accession;
    const period = filing.period_of_report || filing.period;
    if (typeof accession !== "string" || !/^\d{10}-\d{2}-\d{6}$/.test(accession)) return false;
    if (typeof period !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(period)) return false;
    if (!item.statements || typeof item.statements !== "object") return false;
  }
  return true;
}

export async function handleEdgarToolsRequest(request, env, url) {
  if (!await authorized(request, env)) return jsonResponse({ error: "Unauthorized provider request." }, 401);
  try {

  if (request.method === "GET" && url.pathname === "/api/fundamentals/edgartools/universe") {
    const rows = await env.DB.prepare(
      "SELECT DISTINCT i.symbol FROM instrument i " +
      "LEFT JOIN holding h ON h.instrument_id=i.id " +
      "LEFT JOIN watchlist w ON w.instrument_id=i.id " +
      "WHERE i.market='US' AND i.active=1 AND (h.instrument_id IS NOT NULL OR w.instrument_id IS NOT NULL) " +
      "ORDER BY i.symbol LIMIT ?"
    ).bind(MAX_COMPANIES).all();
    const symbols = (rows.results || []).map((row) => row.symbol);
    return jsonResponse({ market: "US", primary_provider: "EdgarTools", universe_source: "active_owner_holdings_and_watchlist", count: symbols.length, symbols });
  }

  if (request.method === "GET" && url.pathname === "/api/fundamentals/edgartools/status") {
    const rows = await env.DB.prepare(
      "SELECT symbol,provider_status AS providerStatus,accession,fiscal_period AS fiscalPeriod,form,filed_at AS filedAt,provider_version AS providerVersion,generated_at AS generatedAt,detail,updated_at AS updatedAt " +
      "FROM edgartools_provider_status ORDER BY symbol LIMIT ?"
    ).bind(MAX_COMPANIES).all();
    return jsonResponse({ provider: "EdgarTools", production_fundamentals_changed: false, rankings_changed: false, companies: rows.results || [] });
  }

  if (request.method === "POST" && url.pathname === "/api/fundamentals/edgartools/normalized") {
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_BODY_BYTES) return jsonResponse({ error: "Payload too large." }, 413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return jsonResponse({ error: "Payload too large." }, 413);
    let report;
    try { report = JSON.parse(raw); } catch { return jsonResponse({ error: "Invalid normalized JSON." }, 400); }
    if (report?.service !== "Magic Folio EdgarTools normalized analytics evidence" ||
        report?.production_data_modified !== false || report?.schema_version !== 1 ||
        !Array.isArray(report.companies) || report.companies.length < 1 || report.companies.length > MAX_COMPANIES ||
        typeof report.source_report_generated_at !== "string" || !Number.isFinite(Date.parse(report.source_report_generated_at))) {
      return jsonResponse({ error: "Invalid normalized evidence envelope." }, 400);
    }

    const now = new Date().toISOString();
    const writes = [];
    let metricCount = 0;
    for (const company of report.companies) {
      if (!SYMBOL_RE.test(company?.symbol || "") ||
          !["supported", "unsupported_provider", "extraction_error"].includes(company.provider_status) ||
          !Array.isArray(company.metrics) || company.metrics.length > 500) {
        return jsonResponse({ error: "Invalid normalized company record." }, 400);
      }
      if (company.provider_status !== "supported") {
        if (company.metrics.length !== 0) return jsonResponse({ error: "Unsupported company cannot contain normalized metrics." }, 400);
        continue;
      }
      if (typeof company.accession !== "string" || !/^\d{10}-\d{2}-\d{6}$/.test(company.accession) ||
          !["10-K", "20-F", "40-F"].includes(company.form)) {
        return jsonResponse({ error: "Invalid normalized filing metadata." }, 400);
      }
      const seen = new Set();
      for (const metric of company.metrics) {
        const key = [metric.statement, metric.metric, metric.period_end, metric.period_type].join("|");
        if (!["income_statement", "balance_sheet", "cash_flow_statement"].includes(metric.statement) ||
            !/^[A-Za-z][A-Za-z0-9]*$/.test(metric.metric || "") ||
            !/^\d{4}-\d{2}-\d{2}$/.test(metric.period_end || "") ||
            !["duration", "instant"].includes(metric.period_type) ||
            (metric.statement === "balance_sheet") !== (metric.period_type === "instant") ||
            !Number.isFinite(metric.value) || (metric.currency !== null && !/^[A-Z]{3}$/.test(metric.currency || "")) ||
            seen.has(key)) {
          return jsonResponse({ error: "Invalid or duplicate normalized metric." }, 400);
        }
        seen.add(key);
        writes.push(env.DB.prepare(
          "INSERT INTO edgartools_normalized_metric(symbol,accession,form,statement,metric,period_end,period_type,fiscal_label,value,currency,source_concept,source_label,standard_concept,balance,mapping_version,generated_at,ingested_at) " +
          "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol,accession,statement,metric,period_end,period_type) DO UPDATE SET " +
          "form=excluded.form,fiscal_label=excluded.fiscal_label,value=excluded.value,currency=excluded.currency,source_concept=excluded.source_concept," +
          "source_label=excluded.source_label,standard_concept=excluded.standard_concept,balance=excluded.balance,mapping_version=excluded.mapping_version," +
          "generated_at=excluded.generated_at,ingested_at=excluded.ingested_at"
        ).bind(company.symbol, company.accession, company.form, metric.statement, metric.metric, metric.period_end,
          metric.period_type, metric.fiscal_label || null, metric.value, metric.currency || null,
          typeof metric.source_concept === "string" ? metric.source_concept.slice(0, 200) : null,
          typeof metric.source_label === "string" ? metric.source_label.slice(0, 200) : null,
          typeof metric.standard_concept === "string" ? metric.standard_concept.slice(0, 120) : null,
          typeof metric.balance === "string" ? metric.balance.slice(0, 20) : null,
          Number.isInteger(company.mapping_version) ? company.mapping_version : 1,
          report.source_report_generated_at, now));
        metricCount++;
      }
    }
    for (let offset = 0; offset < writes.length; offset += 50) {
      await env.DB.batch(writes.slice(offset, offset + 50));
    }
    return jsonResponse({
      received: report.companies.length,
      metric_records: metricCount,
      provider: "EdgarTools",
      storage: "edgartools_normalized_metric",
      production_fundamentals_changed: false,
      rankings_changed: false
    });
  }

  if (request.method !== "POST" || url.pathname !== "/api/fundamentals/edgartools/ingest") {
    return jsonResponse({ error: "Not found." }, 404);
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return jsonResponse({ error: "Payload too large." }, 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return jsonResponse({ error: "Payload too large." }, 413);

  let report;
  try { report = JSON.parse(raw); } catch { return jsonResponse({ error: "Invalid JSON report." }, 400); }
  if (report?.primary_provider !== "EdgarTools" || report?.production_data_modified !== false ||
      !Array.isArray(report.companies) || report.companies.length < 1 || report.companies.length > MAX_COMPANIES ||
      !Array.isArray(report.symbols) || report.symbols.length !== report.companies.length ||
      new Set(report.symbols).size !== report.symbols.length ||
      typeof report.generated_at !== "string" || !Number.isFinite(Date.parse(report.generated_at))) {
    return jsonResponse({ error: "Invalid EdgarTools report envelope." }, 400);
  }
  const companies = report.companies;
  if (companies.some((item) => !validCompany(item)) ||
      new Set(companies.map((item) => item.symbol)).size !== companies.length ||
      report.symbols.some((symbol) => !SYMBOL_RE.test(symbol)) ||
      [...report.symbols].sort().join(",") !== companies.map((item) => item.symbol).sort().join(",")) {
    return jsonResponse({ error: "Invalid or duplicate company evidence." }, 400);
  }

  // D1 databases created by earlier Magic Folio deployments may have the
  // richer accession_key schema, while fresh installs use the original
  // accession schema from migration 0006. Support both without destructive
  // schema changes or touching existing evidence.
  const evidenceSchema = await env.DB.prepare("PRAGMA table_info(edgartools_filing_evidence)").all();
  const usesAccessionKey = (evidenceSchema.results || []).some((column) => column.name === "accession_key");

  const now = new Date().toISOString();
  const statements = [];
  for (const item of companies) {
    const filing = item.filing || {};
    const accession = filing.accession_number || filing.accession || null;
    const period = filing.period_of_report || filing.period || null;
    const form = filing.form || null;
    const filedAt = filing.filing_date || null;
    const version = report.edgartools_version || null;
    statements.push(env.DB.prepare(
      "INSERT INTO edgartools_provider_status(symbol,provider_status,accession,fiscal_period,form,filed_at,provider_version,generated_at,detail,updated_at) " +
      "VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET provider_status=excluded.provider_status,accession=excluded.accession," +
      "fiscal_period=excluded.fiscal_period,form=excluded.form,filed_at=excluded.filed_at,provider_version=excluded.provider_version," +
      "generated_at=excluded.generated_at,detail=excluded.detail,updated_at=excluded.updated_at WHERE excluded.generated_at>=edgartools_provider_status.generated_at"
    ).bind(item.symbol, item.provider_status, accession, period, form, filedAt, version, report.generated_at,
      typeof item.error === "string" ? item.error.slice(0, 300) : null, now));
    if (item.provider_status === "supported") {
      if (usesAccessionKey) {
        statements.push(env.DB.prepare(
          "INSERT INTO edgartools_filing_evidence(symbol,accession_key,market,cik,accession,fiscal_period,form,filed_at,reporting_currency,provider_status,provider,provider_version,generated_at,payload_json,ingested_at) " +
          "VALUES(?,?,'US',?,?,?,?,?,NULL,?,'EdgarTools',?,?,?,?) ON CONFLICT(symbol,accession_key) DO UPDATE SET " +
          "cik=excluded.cik,accession=excluded.accession,fiscal_period=excluded.fiscal_period,form=excluded.form,filed_at=excluded.filed_at," +
          "provider_status=excluded.provider_status,provider_version=excluded.provider_version,generated_at=excluded.generated_at," +
          "payload_json=excluded.payload_json,ingested_at=excluded.ingested_at"
        ).bind(item.symbol, accession, filing.cik || item.cik || null, accession, period, form || "annual", filedAt,
          item.provider_status, version, report.generated_at, JSON.stringify(item), now));
      } else {
        statements.push(env.DB.prepare(
          "INSERT INTO edgartools_filing_evidence(symbol,accession,fiscal_period,form,filed_at,provider_version,generated_at,payload_json,ingested_at) " +
          "VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol,accession) DO UPDATE SET fiscal_period=excluded.fiscal_period,form=excluded.form," +
          "filed_at=excluded.filed_at,provider_version=excluded.provider_version,generated_at=excluded.generated_at,payload_json=excluded.payload_json,ingested_at=excluded.ingested_at"
        ).bind(item.symbol, accession, period, form || "annual", filedAt, version, report.generated_at, JSON.stringify(item), now));
      }
    }
  }
  for (let offset = 0; offset < statements.length; offset += 50) {
    await env.DB.batch(statements.slice(offset, offset + 50));
  }
  return jsonResponse({
    received: companies.length,
    ingested: companies.filter((item) => item.provider_status === "supported").length,
    unsupported_provider: companies.filter((item) => item.provider_status === "unsupported_provider").map((item) => item.symbol),
    production_fundamentals_changed: false,
    rankings_changed: false
  });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown_error";
    console.error("EdgarTools ingestion failed:", detail.slice(0, 300));
    return jsonResponse({ error: "EdgarTools ingestion failed.", detail: detail.slice(0, 300) }, 500);
  }
}
