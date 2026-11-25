import { getOwnerSession, rateLimitRequest, jsonResponse } from "./auth.mjs";

const SEC_FORMS = new Set(["10-K", "10-Q", "8-K", "20-F", "40-F", "6-K", "DEF 14A", "S-1", "F-1", "3", "4", "5", "144", "SC 13D", "SC 13D/A", "SC 13G", "SC 13G/A"]);
const FORM_LABELS = {
  "10-K": "Annual report",
  "10-Q": "Quarterly report",
  "8-K": "Current report",
  "20-F": "Foreign issuer annual report",
  "40-F": "Canadian issuer annual report",
  "6-K": "Foreign issuer current report",
  "DEF 14A": "Proxy statement",
  "S-1": "Registration statement",
  "F-1": "Foreign issuer registration statement",
  "3": "Initial statement of beneficial ownership",
  "4": "Insider transaction report",
  "5": "Annual statement of beneficial ownership changes",
  "144": "Notice of proposed sale of securities",
  "SC 13D": "Beneficial ownership filing",
  "SC 13D/A": "Beneficial ownership amendment",
  "SC 13G": "Beneficial ownership filing",
  "SC 13G/A": "Beneficial ownership amendment"
};
const SEC_SUBMISSIONS = "https://data.sec.gov/submissions/CIK";
const CACHE_SECONDS = 6 * 60 * 60;
const RETENTION_DAYS = 30;

function safeUserAgent(value) {
  return typeof value === "string" && value.length >= 12 && value.length <= 200 &&
    value.includes("@") && !/[\r\n]/.test(value);
}

async function fetchSubmissions(cik, userAgent, fetcher) {
  const url = `${SEC_SUBMISSIONS}${cik}.json`;
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
  if (response.status === 429) throw new Error("sec_upstream_limited");
  if (!response.ok) throw new Error("sec_unavailable");
  return response.json();
}

function toFiling(item, index, symbol, cik, fetchedAt, cutoff) {
  const form = item.form?.[index];
  const filingDate = item.filingDate?.[index];
  const accessionNumber = item.accessionNumber?.[index];
  const primaryDocument = item.primaryDocument?.[index] || "";
  const reportDate = item.reportDate?.[index] || null;
  if (!SEC_FORMS.has(form) || !/^\d{4}-\d{2}-\d{2}$/.test(filingDate || "") ||
      !Number.isFinite(Date.parse(filingDate)) || filingDate < cutoff ||
      !/^\d{10}-\d{2}-\d{6}$/.test(accessionNumber || "") ||
      accessionNumber.slice(0, 10) !== cik) return null;

  const accessionPath = accessionNumber.replace(/-/g, "");
  const cikPath = String(Number(cik));
  const safeDocument = typeof primaryDocument === "string" &&
    primaryDocument.length <= 200 && !/[\\/?#\r\n]/.test(primaryDocument);
  const documentPath = safeDocument && primaryDocument
    ? encodeURIComponent(primaryDocument)
    : `${accessionNumber}-index.htm`;
  const url = `https://www.sec.gov/Archives/edgar/data/${cikPath}/${accessionPath}/${documentPath}`;
  const label = FORM_LABELS[form] || "SEC filing";

  return {
    symbol,
    cik,
    form,
    title: `${symbol} · ${form} filed ${filingDate}`,
    summary: reportDate && /^\d{4}-\d{2}-\d{2}$/.test(reportDate)
      ? `${label}. Report period ended ${reportDate}.`
      : `${label} filed with the SEC.`,
    source: "SEC EDGAR",
    filingDate,
    reportDate,
    accessionNumber,
    primaryDocument: safeDocument ? primaryDocument : "",
    publishedAt: `${filingDate}T00:00:00.000Z`,
    fetchedAt,
    url
  };
}

export function parseSecSubmissions(payload, symbol, cik, now = Date.now()) {
  const recent = payload?.filings?.recent;
  if (!recent || !Array.isArray(recent.form) || !Array.isArray(recent.filingDate) ||
      !Array.isArray(recent.accessionNumber) || !Array.isArray(recent.primaryDocument)) {
    throw new Error("sec_invalid_response");
  }
  const cutoff = new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const fetchedAt = new Date(now).toISOString();
  const filings = [];
  for (let index = 0; index < recent.form.length; index++) {
    const filing = toFiling(recent, index, symbol, cik, fetchedAt, cutoff);
    if (filing) filings.push(filing);
  }
  return filings.sort((a, b) => b.filingDate.localeCompare(a.filingDate)).slice(0, 20);
}

function formatCachedFiling(row, symbol, cik) {
  return {
    symbol,
    cik,
    form: row.form,
    title: row.title,
    summary: row.summary,
    source: "SEC EDGAR",
    filingDate: row.filingDate,
    reportDate: row.reportDate,
    accessionNumber: row.accessionNumber,
    primaryDocument: row.primaryDocument || "",
    publishedAt: `${row.filingDate}T00:00:00.000Z`,
    fetchedAt: row.fetchedAt,
    url: row.url
  };
}

async function readCachedFilings(env, instrumentId, symbol, cik) {
  const cache = await env.DB.prepare(
    "SELECT cik, fetched_at AS fetchedAt, company_name AS companyName FROM sec_fetch_cache WHERE instrument_id=?"
  ).bind(instrumentId).first();
  if (!cache || cache.cik !== cik || !Number.isFinite(Date.parse(cache.fetchedAt)) ||
      Date.now() - Date.parse(cache.fetchedAt) >= CACHE_SECONDS * 1000) return null;

  const rows = await env.DB.prepare(
    "SELECT form, title, summary, filing_date AS filingDate, report_date AS reportDate, " +
    "accession_number AS accessionNumber, primary_document AS primaryDocument, " +
    "fetched_at AS fetchedAt, url FROM sec_filing WHERE instrument_id=? AND cik=? " +
    "ORDER BY filing_date DESC LIMIT 20"
  ).bind(instrumentId, cik).all();
  return {
    companyName: cache.companyName,
    filings: (rows.results || []).map((row) => formatCachedFiling(row, symbol, cik)),
    cached: true
  };
}

async function storeFilings(env, instrumentId, symbol, cik, companyName, filings, fetchedAt) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const statements = [
    env.DB.prepare("DELETE FROM sec_filing WHERE instrument_id=? AND (filing_date < ? OR cik<>?)")
      .bind(instrumentId, cutoff, cik),
    ...filings.map((filing) => env.DB.prepare(
      "INSERT INTO sec_filing(accession_number,cik,instrument_id,form,title,summary,filing_date,report_date,primary_document,url,fetched_at) " +
      "VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(accession_number) DO UPDATE SET " +
      "cik=excluded.cik,instrument_id=excluded.instrument_id,form=excluded.form,title=excluded.title,summary=excluded.summary, " +
      "filing_date=excluded.filing_date,report_date=excluded.report_date,primary_document=excluded.primary_document, " +
      "url=excluded.url,fetched_at=excluded.fetched_at"
    ).bind(
      filing.accessionNumber, cik, instrumentId, filing.form, filing.title, filing.summary,
      filing.filingDate, filing.reportDate, filing.primaryDocument, filing.url, fetchedAt
    )),
    env.DB.prepare(
      "INSERT INTO sec_fetch_cache(instrument_id,cik,fetched_at,company_name,filing_count) VALUES(?,?,?,?,?) " +
      "ON CONFLICT(instrument_id) DO UPDATE SET cik=excluded.cik,fetched_at=excluded.fetched_at, " +
      "company_name=excluded.company_name,filing_count=excluded.filing_count"
    ).bind(instrumentId, cik, fetchedAt, companyName, filings.length)
  ];
  await env.DB.batch(statements);
}

export async function handleSecRequest(request, env, url, fetcher = fetch) {
  try {
    if (request.method !== "GET" || url.pathname !== "/api/sec/filings") {
      return jsonResponse({ error: "Not found." }, 404);
    }
    const session = await getOwnerSession(request, env);
    if (!session) return jsonResponse({ error: "Sign in required." }, 401);

    const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) return jsonResponse({ error: "Provide a valid US ticker symbol." }, 400);
    if (!safeUserAgent(env.SEC_USER_AGENT)) {
      return jsonResponse({ error: "SEC contact User-Agent is not configured. Add an app name and contact email first." }, 503);
    }

    const instrument = await env.DB.prepare(
      "SELECT id, cik FROM instrument WHERE market='US' AND symbol=? AND active=1"
    ).bind(symbol).first();
    if (!instrument) return jsonResponse({ error: "Add this US ticker to holdings or watchlist first." }, 404);
    if (!instrument.cik) return jsonResponse({ error: "Add the 10-digit SEC CIK to this instrument first." }, 409);

    const cached = await readCachedFilings(env, instrument.id, symbol, instrument.cik);
    if (cached) {
      return jsonResponse({
        symbol, cik: instrument.cik, companyName: cached.companyName || symbol,
        source: "SEC EDGAR", cached: true, filings: cached.filings
      });
    }

    await rateLimitRequest(request, env, "sec_fetch", 5);
    const payload = await fetchSubmissions(instrument.cik, env.SEC_USER_AGENT, fetcher);
    const filings = parseSecSubmissions(payload, symbol, instrument.cik);
    const fetchedAt = new Date().toISOString();
    const companyName = typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim().slice(0, 200) : symbol;
    await storeFilings(env, instrument.id, symbol, instrument.cik, companyName, filings, fetchedAt);
    return jsonResponse({ symbol, cik: instrument.cik, companyName, source: "SEC EDGAR", cached: false, filings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "rate_limited") return jsonResponse({ error: "SEC lookup limit reached. Try again later." }, 429);
    if (message === "sec_upstream_limited") return jsonResponse({ error: "SEC is temporarily rate limiting requests. Try again later." }, 503);
    if (message === "sec_invalid_response") return jsonResponse({ error: "SEC returned an unexpected filing response." }, 502);
    console.error("SEC filings request failed:", message);
    return jsonResponse({ error: "SEC filings are temporarily unavailable." }, 502);
  }
}
