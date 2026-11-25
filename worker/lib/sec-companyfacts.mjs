import { getOwnerSession, rateLimitRequest, jsonResponse } from "./auth.mjs";

const SEC_COMPANYFACTS = "https://data.sec.gov/api/xbrl/companyfacts/CIK";
const CACHE_SECONDS = 6 * 60 * 60;
const MAX_FILINGS = 20;
const ALLOWED_FORMS = new Set(["10-K", "10-Q", "20-F", "40-F", "6-K"]);

// Facts are returned as reported. No values are summed, annualised, or inferred here.
const CONCEPTS = {
  revenue: { tags: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"], period: "duration" },
  operatingIncome: { tags: ["OperatingIncomeLoss"], period: "duration" },
  operatingExpenses: { tags: ["OperatingExpenses", "OperatingCostsAndExpenses", "CostsAndExpenses"], period: "duration" },
  netIncome: { tags: ["NetIncomeLoss"], period: "duration" },
  incomeTaxExpense: { tags: ["IncomeTaxExpenseBenefit"], period: "duration" },
  interestExpense: { tags: ["InterestExpenseNonOperating", "InterestAndDebtExpense"], period: "duration" },
  cashAndEquivalents: { tags: ["CashAndCashEquivalentsAtCarryingValue"], period: "instant" },
  currentAssets: { tags: ["AssetsCurrent"], period: "instant" },
  currentLiabilities: { tags: ["LiabilitiesCurrent"], period: "instant" },
  currentDebt: { tags: ["LongTermDebtCurrent", "LongTermDebtAndFinanceLeaseObligationsCurrent", "ShortTermBorrowings"], period: "instant" },
  longTermDebt: { tags: ["LongTermDebtNoncurrent", "LongTermDebtAndFinanceLeaseObligationsNoncurrent", "LongTermDebt"], period: "instant" },
  accountsReceivable: { tags: ["AccountsReceivableNetCurrent"], period: "instant" },
  inventory: { tags: ["InventoryNet"], period: "instant" },
  propertyPlantEquipment: { tags: ["PropertyPlantAndEquipmentNet"], period: "instant" },
  totalAssets: { tags: ["Assets"], period: "instant" },
  totalLiabilities: { tags: ["Liabilities"], period: "instant" }
};

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function safeUserAgent(value) {
  return typeof value === "string" && value.length >= 12 && value.length <= 200 &&
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) && !/[\r\n]/.test(value);
}

function accessionMatchesCik(accession, cik) {
  return typeof accession === "string" && /^\d{10}-\d{2}-\d{6}$/.test(accession) &&
    accession.slice(0, 10) === cik;
}

function selectFactEntries(companyFacts, concept) {
  const usGaap = companyFacts?.facts?.["us-gaap"];
  const selected = [];
  for (const tag of concept.tags) {
    const fact = usGaap?.[tag];
    const entries = fact?.units?.USD;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!ALLOWED_FORMS.has(entry.form) || !validDate(entry.filed) || !validDate(entry.end) ||
          !Number.isFinite(entry.val) || !accessionMatchesCik(entry.accn, companyFacts.cik)) continue;
      if (concept.period === "duration" && !validDate(entry.start)) continue;
      if (concept.period === "instant" && entry.start !== undefined) continue;
      selected.push({ tag, entry });
    }
    if (selected.length) break;
  }
  return selected;
}

export function parseSecCompanyFacts(payload, symbol, cik) {
  if (!payload || typeof payload !== "object" || payload.cik === undefined ||
      String(payload.cik).padStart(10, "0") !== cik || !payload.facts?.["us-gaap"]) {
    throw new Error("sec_facts_invalid_response");
  }

  const groups = new Map();
  for (const [key, concept] of Object.entries(CONCEPTS)) {
    for (const { tag, entry } of selectFactEntries(payload, concept)) {
      const group = groups.get(entry.accn) || {
        accessionNumber: entry.accn,
        form: entry.form,
        filed: entry.filed,
        fiscalYear: entry.fy ?? null,
        fiscalPeriod: entry.fp ?? null,
        facts: {}
      };
      const current = group.facts[key];
      // Prefer the latest reported period for a concept within this exact filing.
      if (!current || entry.end > current.end ||
          (entry.end === current.end && String(entry.start || "") > String(current.start || ""))) {
        group.facts[key] = {
          tag,
          value: entry.val,
          unit: "USD",
          start: entry.start || null,
          end: entry.end
        };
      }
      groups.set(entry.accn, group);
    }
  }

  return {
    symbol,
    cik,
    entityName: typeof payload.entityName === "string" ? payload.entityName.slice(0, 200) : symbol,
    taxonomy: "us-gaap",
    source: "SEC Companyfacts",
    facts: [...groups.values()]
      .sort((a, b) => b.filed.localeCompare(a.filed))
      .slice(0, MAX_FILINGS)
  };
}

async function fetchCompanyFacts(cik, userAgent, fetcher) {
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetcher(`${SEC_COMPANYFACTS}${cik}.json`, {
        method: "GET",
        headers: { "user-agent": userAgent, accept: "application/json" },
        signal: AbortSignal.timeout(8_000)
      });
      if (response.status >= 500 && attempt === 0) continue;
      break;
    } catch {
      if (attempt === 1) throw new Error("sec_facts_unavailable");
    }
  }
  if (!response) throw new Error("sec_facts_unavailable");
  if (response.status === 429) throw new Error("sec_upstream_limited");
  if (!response.ok) throw new Error("sec_facts_unavailable");
  return response.json();
}

export async function handleSecCompanyFactsRequest(request, env, url, fetcher = fetch) {
  try {
    if (request.method !== "GET" || url.pathname !== "/api/sec/companyfacts") {
      return jsonResponse({ error: "Not found." }, 404);
    }
    const session = await getOwnerSession(request, env);
    if (!session) return jsonResponse({ error: "Sign in required." }, 401);

    const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) {
      return jsonResponse({ error: "Provide a valid US ticker symbol." }, 400);
    }
    if (!safeUserAgent(env.SEC_USER_AGENT)) {
      return jsonResponse({ error: "SEC contact User-Agent is not configured. Add an app name and contact email first." }, 503);
    }

    const instrument = await env.DB.prepare(
      "SELECT id, cik FROM instrument WHERE market='US' AND symbol=? AND active=1"
    ).bind(symbol).first();
    if (!instrument) return jsonResponse({ error: "Add this US ticker to holdings or watchlist first." }, 404);
    if (!instrument.cik) return jsonResponse({ error: "Add the 10-digit SEC CIK to this instrument first." }, 409);

    const cached = await env.DB.prepare(
      "SELECT cik, fetched_at AS fetchedAt, facts_json AS factsJson FROM sec_companyfacts_cache WHERE instrument_id=?"
    ).bind(instrument.id).first();
    if (cached && String(cached.cik).padStart(10, "0") === instrument.cik &&
        Number.isFinite(Date.parse(cached.fetchedAt)) &&
        Date.now() - Date.parse(cached.fetchedAt) < CACHE_SECONDS * 1000) {
      try {
        return jsonResponse({ ...JSON.parse(cached.factsJson), cached: true });
      } catch {
        // A malformed cache is discarded and refreshed from the official SEC endpoint.
      }
    }

    await rateLimitRequest(request, env, "sec_fetch", 5);
    const payload = await fetchCompanyFacts(instrument.cik, env.SEC_USER_AGENT, fetcher);
    const facts = parseSecCompanyFacts(payload, symbol, instrument.cik);
    const fetchedAt = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO sec_companyfacts_cache(instrument_id,cik,fetched_at,facts_json) VALUES(?,?,?,?) " +
      "ON CONFLICT(instrument_id) DO UPDATE SET cik=excluded.cik,fetched_at=excluded.fetched_at,facts_json=excluded.facts_json"
    ).bind(instrument.id, instrument.cik, fetchedAt, JSON.stringify(facts)).run();

    return jsonResponse({ ...facts, fetchedAt, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "rate_limited") return jsonResponse({ error: "SEC lookup limit reached. Try again later." }, 429);
    if (message === "sec_upstream_limited") return jsonResponse({ error: "SEC is temporarily rate limiting requests. Try again later." }, 503);
    if (message === "sec_facts_invalid_response") return jsonResponse({ error: "SEC returned unexpected companyfacts data." }, 502);
    console.error("SEC companyfacts request failed:", message);
    return jsonResponse({ error: "SEC companyfacts are temporarily unavailable." }, 502);
  }
}
