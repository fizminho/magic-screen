import { getOwnerSession, rateLimitRequest, jsonResponse } from "./auth.mjs";

const SEC_FORMS = new Set(["10-K", "10-Q", "8-K", "20-F", "40-F", "6-K", "DEF 14A", "S-1", "F-1", "SC 13D", "SC 13G"]);
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
  "SC 13D": "Beneficial ownership filing",
  "SC 13G": "Beneficial ownership filing"
};
const SEC_SUBMISSIONS = "https://data.sec.gov/submissions/CIK";

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
      filingDate < cutoff || !/^\d{10}-\d{2}-\d{6}$/.test(accessionNumber || "")) return null;

  const accessionPath = accessionNumber.replace(/-/g, "");
  const cikPath = String(Number(cik));
  const documentPath = primaryDocument
    ? encodeURIComponent(primaryDocument)
    : `${accessionNumber}-index.htm`;
  const url = `https://www.sec.gov/Archives/edgar/data/${cikPath}/${accessionPath}/${documentPath}`;
  const label = FORM_LABELS[form] || "SEC filing";

  return {
    symbol,
    cik,
    form,
    title: `${symbol} · ${form} filed ${filingDate}`,
    summary: reportDate ? `${label}. Report period ended ${reportDate}.` : `${label} filed with the SEC.`,
    source: "SEC EDGAR",
    filingDate,
    reportDate,
    accessionNumber,
    primaryDocument,
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
  const cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const fetchedAt = new Date(now).toISOString();
  const filings = [];
  for (let index = 0; index < recent.form.length; index++) {
    const filing = toFiling(recent, index, symbol, cik, fetchedAt, cutoff);
    if (filing) filings.push(filing);
  }
  return filings.sort((a, b) => b.filingDate.localeCompare(a.filingDate)).slice(0, 20);
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

    await rateLimitRequest(request, env, "sec_fetch", 5);
    const instrument = await env.DB.prepare(
      "SELECT cik FROM instrument WHERE market='US' AND symbol=? AND active=1"
    ).bind(symbol).first();
    if (!instrument) return jsonResponse({ error: "Add this US ticker to holdings or watchlist first." }, 404);
    if (!instrument.cik) return jsonResponse({ error: "Add the 10-digit SEC CIK to this instrument first." }, 409);

    const cik = instrument.cik;
    const payload = await fetchSubmissions(cik, env.SEC_USER_AGENT, fetcher);
    const filings = parseSecSubmissions(payload, symbol, cik);
    return jsonResponse({ symbol, cik, companyName: payload.name || symbol, source: "SEC EDGAR", filings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "rate_limited") return jsonResponse({ error: "SEC lookup limit reached. Try again later." }, 429);
    if (message === "sec_upstream_limited") return jsonResponse({ error: "SEC is temporarily rate limiting requests. Try again later." }, 503);
    if (message === "sec_invalid_response") return jsonResponse({ error: "SEC returned an unexpected filing response." }, 502);
    console.error("SEC filings request failed:", message);
    return jsonResponse({ error: "SEC filings are temporarily unavailable." }, 502);
  }
}
