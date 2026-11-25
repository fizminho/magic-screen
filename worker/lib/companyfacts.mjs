import {
  getOwnerSession,
  rateLimitRequest,
  jsonResponse
} from "./auth.mjs";

const SEC_COMPANYFACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK";
const CACHE_MS = 24 * 60 * 60 * 1000;
const ALLOWED_FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A"]);

const DURATION_METRICS = [
  {
    key: "revenue",
    label: "Revenue",
    concepts: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
    unit: "USD"
  },
  {
    key: "netIncome",
    label: "Net income",
    concepts: ["NetIncomeLoss", "ProfitLoss"],
    unit: "USD"
  },
  {
    key: "operatingCashFlow",
    label: "Operating cash flow",
    concepts: ["NetCashProvidedByUsedInOperatingActivities"],
    unit: "USD"
  },
  {
    key: "dilutedEps",
    label: "Diluted EPS",
    concepts: ["EarningsPerShareDiluted"],
    unit: "USD / shares"
  }
];

const INSTANT_METRICS = [
  {
    key: "totalAssets",
    label: "Total assets",
    concepts: ["Assets"],
    unit: "USD"
  },
  {
    key: "totalLiabilities",
    label: "Total liabilities",
    concepts: ["Liabilities"],
    unit: "USD"
  },
  {
    key: "cash",
    label: "Cash and cash equivalents",
    concepts: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    unit: "USD"
  }
];

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function durationDays(start, end) {
  if (!validDate(start) || !validDate(end)) return null;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}

function selectConcept(gaap, concepts, unit) {
  for (const concept of concepts) {
    const fact = gaap?.[concept];
    const entries = fact?.units?.[unit];
    if (Array.isArray(entries) && entries.length) return entries;
  }
  return [];
}

function normalizeEntries(entries, kind) {
  const filtered = entries.filter((entry) => {
    if (!entry || !ALLOWED_FORMS.has(entry.form) || !validDate(entry.end) ||
        !validDate(entry.filed) || typeof entry.val !== "number" || !Number.isFinite(entry.val)) return false;
    if (kind === "instant") return !entry.start;
    const days = durationDays(entry.start, entry.end);
    return kind === "annual" ? days >= 300 && days <= 400 : days >= 70 && days <= 110;
  });

  const byEnd = new Map();
  for (const entry of filtered) {
    const current = byEnd.get(entry.end);
    if (!current || entry.filed > current.filed) byEnd.set(entry.end, entry);
  }
  return [...byEnd.values()]
    .sort((a, b) => b.end.localeCompare(a.end))
    .slice(0, kind === "annual" ? 5 : 8)
    .map((entry) => ({
      periodEnd: entry.end,
      filed: entry.filed,
      value: entry.val,
      form: entry.form
    }));
}

export function extractCompanyFacts(payload, cik, fetchedAt = new Date().toISOString()) {
  const gaap = payload?.facts?.["us-gaap"];
  if (!payload || typeof payload.entityName !== "string" || !gaap || typeof gaap !== "object") {
    throw new Error("sec_facts_invalid_response");
  }

  const metrics = {};
  for (const definition of DURATION_METRICS) {
    const entries = selectConcept(gaap, definition.concepts, definition.unit);
    metrics[definition.key] = {
      label: definition.label,
      unit: definition.unit,
      annual: normalizeEntries(entries, "annual"),
      quarterly: normalizeEntries(entries, "quarterly")
    };
  }
  for (const definition of INSTANT_METRICS) {
    const entries = selectConcept(gaap, definition.concepts, definition.unit);
    metrics[definition.key] = {
      label: definition.label,
      unit: definition.unit,
      latest: normalizeEntries(entries, "instant")
    };
  }

  const hasData = Object.values(metrics).some((metric) =>
    (metric.annual?.length || 0) + (metric.quarterly?.length || 0) + (metric.latest?.length || 0) > 0
  );
  if (!hasData) throw new Error("sec_facts_empty");

  return {
    companyName: payload.entityName.slice(0, 160),
    cik,
    fiscalYearEnd: typeof payload.fiscalYearEnd === "string" ? payload.fiscalYearEnd : null,
    fetchedAt,
    metrics
  };
}

function validUserAgent(value) {
  return typeof value === "string" && value.length >= 12 && value.includes("@") &&
    !/your-email|example\.com/i.test(value);
}

async function findInstrument(env, symbol) {
  return env.DB.prepare(
    "SELECT id, symbol, cik FROM instrument WHERE market='US' AND symbol=? AND active=1"
  ).bind(symbol).first();
}

async function loadCompanyFacts(request, env, instrument, fetcher) {
  const cached = await env.DB.prepare(
    "SELECT cik, fetched_at AS fetchedAt, facts_json AS factsJson FROM sec_companyfacts_cache WHERE instrument_id=?"
  ).bind(instrument.id).first();

  if (cached?.cik === instrument.cik && cached.factsJson &&
      Date.now() - Date.parse(cached.fetchedAt) < CACHE_MS) {
    try {
      return { ...JSON.parse(cached.factsJson), cacheHit: true };
    } catch {
      // Invalid cache is replaced by a fresh SEC response.
    }
  }

  if (!validUserAgent(env.SEC_USER_AGENT)) throw new Error("sec_user_agent_required");
  await rateLimitRequest(request, env, "sec_fetch", 5);

  const url = `${SEC_COMPANYFACTS}${instrument.cik}.json`;
  let response;
  try {
    response = await fetcher(url, {
      headers: { "user-agent": env.SEC_USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new Error("sec_upstream_unavailable");
  }
  if (response.status === 429) throw new Error("sec_upstream_limited");
  if (response.status === 404) throw new Error("sec_companyfacts_not_found");
  if (!response.ok) throw new Error("sec_upstream_unavailable");

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("sec_facts_invalid_response");
  }
  const fetchedAt = new Date().toISOString();
  const facts = extractCompanyFacts(payload, instrument.cik, fetchedAt);
  await env.DB.prepare(
    "INSERT INTO sec_companyfacts_cache(instrument_id,cik,fetched_at,facts_json) VALUES(?,?,?,?) " +
    "ON CONFLICT(instrument_id) DO UPDATE SET cik=excluded.cik,fetched_at=excluded.fetched_at,facts_json=excluded.facts_json"
  ).bind(instrument.id, instrument.cik, fetchedAt, JSON.stringify(facts)).run();
  return { ...facts, cacheHit: false };
}

export async function handleCompanyFactsRequest(request, env, url, fetcher = fetch) {
  const session = await getOwnerSession(request, env);
  if (!session) return jsonResponse({ error: "Sign in required." }, 401);

  const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) {
    return jsonResponse({ error: "Provide a valid US ticker." }, 400);
  }

  try {
    const instrument = await findInstrument(env, symbol);
    if (!instrument) return jsonResponse({ error: "US instrument not found." }, 404);
    if (!/^\d{10}$/.test(instrument.cik || "")) {
      return jsonResponse({ error: "Add a valid 10-digit SEC CIK to this instrument first." }, 409);
    }
    const facts = await loadCompanyFacts(request, env, instrument, fetcher);
    return jsonResponse(facts);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "rate_limited") return jsonResponse({ error: "SEC lookup limit reached. Try again later." }, 429);
    if (message === "sec_user_agent_required") return jsonResponse({ error: "Configure SEC_USER_AGENT with a real contact email before requesting company facts." }, 503);
    if (message === "sec_upstream_limited") return jsonResponse({ error: "SEC is rate-limiting requests. Try again later." }, 503);
    if (message === "sec_companyfacts_not_found" || message === "sec_facts_empty") {
      return jsonResponse({ error: "No usable SEC company facts were found for this company." }, 404);
    }
    if (message === "sec_facts_invalid_response") return jsonResponse({ error: "SEC returned an invalid company facts response." }, 502);
    console.error("SEC company facts request failed:", message);
    return jsonResponse({ error: "SEC company facts are temporarily unavailable." }, 503);
  }
}
