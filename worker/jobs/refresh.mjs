import { parseSecSubmissions } from "../lib/sec.mjs";
import { parseSecCompanyFacts } from "../lib/sec-companyfacts.mjs";

const SEC_SUBMISSIONS = "https://data.sec.gov/submissions/CIK";
const SEC_COMPANYFACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK";
const FACTS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_INSTRUMENTS = 8;
const SEC_PAUSE_MS = 550;

function validUserAgent(value) {
  return typeof value === "string" && value.length >= 12 && value.length <= 200 &&
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) && !/[\r\n]/.test(value);
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, userAgent, fetcher) {
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetcher(url, {
        method: "GET",
        headers: { "user-agent": userAgent, accept: "application/json" },
        signal: AbortSignal.timeout(8_000)
      });
      if (response.status >= 500 && attempt === 0) continue;
      break;
    } catch {
      if (attempt === 1) throw new Error("sec_unavailable");
    }
  }
  if (!response) throw new Error("sec_unavailable");
  if (response.status === 429) throw new Error("sec_rate_limited");
  if (!response.ok) throw new Error("sec_unavailable");
  return response.json();
}

async function storeFilings(env, instrument, filings, companyName, fetchedAt) {
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const statements = [
    env.DB.prepare("DELETE FROM sec_filing WHERE instrument_id=? AND (filing_date < ? OR cik<>?)")
      .bind(instrument.id, cutoff, instrument.cik),
    ...filings.map((filing) => env.DB.prepare(
      "INSERT INTO sec_filing(accession_number,cik,instrument_id,form,title,summary,filing_date,report_date,primary_document,url,fetched_at) " +
      "VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(accession_number) DO UPDATE SET " +
      "instrument_id=excluded.instrument_id,form=excluded.form,title=excluded.title,summary=excluded.summary," +
      "filing_date=excluded.filing_date,report_date=excluded.report_date,primary_document=excluded.primary_document," +
      "url=excluded.url,fetched_at=excluded.fetched_at"
    ).bind(
      filing.accessionNumber, instrument.cik, instrument.id, filing.form, filing.title,
      filing.summary, filing.filingDate, filing.reportDate, filing.primaryDocument, filing.url, fetchedAt
    )),
    env.DB.prepare(
      "INSERT INTO sec_fetch_cache(instrument_id,cik,fetched_at,company_name,filing_count) VALUES(?,?,?,?,?) " +
      "ON CONFLICT(instrument_id) DO UPDATE SET cik=excluded.cik,fetched_at=excluded.fetched_at," +
      "company_name=excluded.company_name,filing_count=excluded.filing_count"
    ).bind(instrument.id, instrument.cik, fetchedAt, companyName, filings.length)
  ];
  await env.DB.batch(statements);
}

async function refreshCompanyFacts(env, instrument, userAgent, fetcher, now) {
  const cached = await env.DB.prepare(
    "SELECT cik, fetched_at AS fetchedAt FROM sec_companyfacts_cache WHERE instrument_id=?"
  ).bind(instrument.id).first();
  if (cached && String(cached.cik).padStart(10, "0") === instrument.cik &&
      Number.isFinite(Date.parse(cached.fetchedAt)) &&
      now - Date.parse(cached.fetchedAt) < FACTS_TTL_MS) return "cache";

  const payload = await fetchJson(`${SEC_COMPANYFACTS}${instrument.cik}.json`, userAgent, fetcher);
  const facts = parseSecCompanyFacts(payload, instrument.symbol, instrument.cik);
  const fetchedAt = new Date(now).toISOString();
  await env.DB.prepare(
    "INSERT INTO sec_companyfacts_cache(instrument_id,cik,fetched_at,facts_json) VALUES(?,?,?,?) " +
    "ON CONFLICT(instrument_id) DO UPDATE SET cik=excluded.cik,fetched_at=excluded.fetched_at,facts_json=excluded.facts_json"
  ).bind(instrument.id, instrument.cik, fetchedAt, JSON.stringify(facts)).run();
  return "updated";
}

export async function runSecRefresh(env, { fetcher = fetch, now = Date.now() } = {}) {
  const startedAt = new Date(now).toISOString();
  const inserted = await env.DB.prepare(
    "INSERT INTO job_run(job,started_at,status,detail) VALUES('sec_refresh',?,'running','SEC refresh started')"
  ).bind(startedAt).run();
  const jobId = inserted.meta?.last_row_id;
  let refreshed = 0;
  let filingCount = 0;
  let newFilingCount = 0;
  let factsUpdated = 0;
  let factsCached = 0;
  let failed = 0;

  try {
    if (!validUserAgent(env.SEC_USER_AGENT)) throw new Error("sec_user_agent_not_configured");
    const result = await env.DB.prepare(
      "SELECT DISTINCT i.id,i.symbol,i.cik FROM instrument i " +
      "LEFT JOIN holding h ON h.instrument_id=i.id " +
      "LEFT JOIN watchlist w ON w.instrument_id=i.id " +
      "WHERE i.market='US' AND i.active=1 AND i.cik IS NOT NULL AND (h.instrument_id IS NOT NULL OR w.instrument_id IS NOT NULL) " +
      "ORDER BY i.symbol LIMIT ?"
    ).bind(MAX_INSTRUMENTS).all();
    const instruments = result.results || [];

    for (let index = 0; index < instruments.length; index++) {
      const instrument = instruments[index];
      try {
        const payload = await fetchJson(`${SEC_SUBMISSIONS}${instrument.cik}.json`, env.SEC_USER_AGENT, fetcher);
        const filings = parseSecSubmissions(payload, instrument.symbol, instrument.cik, now);
        const fetchedAt = new Date(now).toISOString();
        const companyName = typeof payload.name === "string" && payload.name.trim()
          ? payload.name.trim().slice(0, 200) : instrument.symbol;
        await storeFilings(env, instrument, filings, companyName, fetchedAt);
        filingCount += filings.length;
        const recentCutoff = new Date(now - 86400000).toISOString().slice(0, 10);
        newFilingCount += filings.filter((filing) => filing.filingDate >= recentCutoff).length;
        await pause(SEC_PAUSE_MS);
        const factsResult = await refreshCompanyFacts(env, instrument, env.SEC_USER_AGENT, fetcher, now);
        if (factsResult === "updated") factsUpdated++;
        else factsCached++;
        refreshed++;
      } catch (error) {
        failed++;
        // Log only a bounded error code, never request headers, payloads or secrets.
        const code = error instanceof Error ? error.message : "unknown";
        console.warn("SEC refresh instrument failed:", instrument.symbol, code.slice(0, 64));
      }
      if (index < instruments.length - 1) await pause(SEC_PAUSE_MS);
    }

    const status = failed > 0 ? (refreshed ? "partial" : "failed") : !instruments.length ? "skipped_no_data" : newFilingCount ? "success" : "skipped_no_new_data";
    const detail = JSON.stringify({
      instruments: instruments.length, refreshed, failed, filings: filingCount, newFilings: newFilingCount,
      companyfactsUpdated: factsUpdated, companyfactsCached: factsCached,
      reason: instruments.length ? undefined : "no_owned_us_instruments_with_cik"
    }).slice(0, 1000);
    await env.DB.prepare(
      "UPDATE job_run SET finished_at=?,status=?,detail=? WHERE id=?"
    ).bind(new Date().toISOString(), status, detail, jobId).run();
    return { status, instruments: instruments.length, refreshed, failed, filingCount, newFilingCount, factsUpdated, factsCached };
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    await env.DB.prepare(
      "UPDATE job_run SET finished_at=?,status='failed',detail=? WHERE id=?"
    ).bind(new Date().toISOString(), code.slice(0, 160), jobId).run();
    throw error;
  }
}

export async function runWeeklyHousekeeping(env, { now = Date.now() } = {}) {
  const startedAt = new Date(now).toISOString();
  const inserted = await env.DB.prepare(
    "INSERT INTO job_run(job,started_at,status,detail) VALUES('weekly_housekeeping',?,'running','Housekeeping started')"
  ).bind(startedAt).run();
  const jobId = inserted.meta?.last_row_id;
  try {
    const cutoff30 = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    const cutoff7 = new Date(now - 7 * 86400000).toISOString();
    const cutoff90 = new Date(now - 90 * 86400000).toISOString();
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM sec_filing WHERE filing_date < ?").bind(cutoff30),
      env.DB.prepare("DELETE FROM sec_fetch_cache WHERE fetched_at < ?").bind(cutoff7),
      env.DB.prepare("DELETE FROM sec_companyfacts_cache WHERE fetched_at < ?").bind(cutoff7),
      env.DB.prepare("DELETE FROM alert_log WHERE sent_at < ?").bind(cutoff30),
      env.DB.prepare("DELETE FROM job_run WHERE started_at < ? AND status <> 'running' AND id <> ?")
        .bind(cutoff90, jobId ?? -1),
      env.DB.prepare("DELETE FROM auth_challenge WHERE expires_at <= ?").bind(new Date(now).toISOString()),
      env.DB.prepare("DELETE FROM auth_attempt WHERE window < ?").bind(new Date(now - 86400000).toISOString().slice(0, 13)),
      env.DB.prepare("DELETE FROM setting WHERE key LIKE 'ai_daily_%' AND substr(key,10,10) < ?")
        .bind(new Date(now - 7 * 86400000).toISOString().slice(0, 10))
    ]);
    const changes = results.reduce((sum, item) => sum + Number(item.meta?.changes || 0), 0);
    await env.DB.prepare(
      "UPDATE job_run SET finished_at=?,status='success',detail=? WHERE id=?"
    ).bind(new Date().toISOString(), JSON.stringify({ rowsDeleted: changes }), jobId).run();
    return { status: "success", rowsDeleted: changes };
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    await env.DB.prepare(
      "UPDATE job_run SET finished_at=?,status='failed',detail=? WHERE id=?"
    ).bind(new Date().toISOString(), code.slice(0, 160), jobId).run();
    throw error;
  }
}
