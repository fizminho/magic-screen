import { getOwnerSession, jsonResponse } from "./auth.mjs";

function round(value) {
  return Math.round(value * 100) / 100;
}

export function calculateDashboard(rows) {
  const holdings = Array.isArray(rows) ? rows : [];
  const totalCount = holdings.length;
  const counts = {
    US: holdings.filter((item) => item.market === "US").length,
    MY: holdings.filter((item) => item.market === "MY").length
  };

  const markets = ["US", "MY"].map((market) => {
    const items = holdings.filter((item) => item.market === market);
    const priced = items.map((item) => {
      const price = Number(item.price);
      const quantity = Number(item.quantity);
      const hasPrice = item.price !== null && item.price !== undefined &&
        Number.isFinite(price) && price > 0 && Number.isFinite(quantity) && quantity > 0;
      return {
        symbol: item.symbol,
        sector: typeof item.sector === "string" && item.sector.trim() ? item.sector.trim() : "Unclassified",
        value: hasPrice ? quantity * price : 0,
        status: item.quoteStatus || "unavailable",
        asOf: item.quoteAsOf || null,
        hasPrice
      };
    });
    const usable = priced.filter((item) => item.hasPrice);
    const totalValue = usable.reduce((sum, item) => sum + item.value, 0);
    const ranked = [...usable].sort((a, b) => b.value - a.value);
    const largest = ranked[0];
    const topThreeValue = ranked.slice(0, 3).reduce((sum, item) => sum + item.value, 0);
    const sectors = new Map();
    for (const item of usable) sectors.set(item.sector, (sectors.get(item.sector) || 0) + item.value);

    return {
      market,
      currency: market === "US" ? "USD" : "MYR",
      holdingsCount: items.length,
      pricedCount: usable.length,
      unavailableQuoteCount: priced.filter((item) => !item.hasPrice || item.status === "unavailable").length,
      staleQuoteCount: priced.filter((item) => item.status === "stale").length,
      quoteCoveragePct: items.length ? round((usable.length / items.length) * 100) : 0,
      marketValue: round(totalValue),
      largestPosition: largest && totalValue > 0 ? {
        symbol: largest.symbol,
        value: round(largest.value),
        weightPct: round((largest.value / totalValue) * 100)
      } : null,
      topThreeConcentrationPct: totalValue > 0 ? round((topThreeValue / totalValue) * 100) : null,
      sectorWeights: [...sectors.entries()].map(([sector, value]) => ({
        sector, value: round(value), weightPct: totalValue > 0 ? round((value / totalValue) * 100) : 0
      })).sort((a, b) => b.value - a.value)
    };
  });

  return {
    calculatedAt: new Date().toISOString(),
    holdingsCount: totalCount,
    marketCountSplit: {
      US: { count: counts.US, pct: totalCount ? round((counts.US / totalCount) * 100) : 0 },
      MY: { count: counts.MY, pct: totalCount ? round((counts.MY / totalCount) * 100) : 0 }
    },
    staleQuoteCount: holdings.filter((item) => item.quoteStatus === "stale").length,
    unavailableQuoteCount: holdings.filter((item) =>
      item.quoteStatus === "unavailable" || item.price === null || item.price === undefined
    ).length,
    markets
  };
}

export async function handleDashboardRequest(request, env, pathname) {
  if (pathname !== "/api/dashboard" || request.method !== "GET") {
    return jsonResponse({ error: "Not found." }, 404);
  }
  try {
    const session = await getOwnerSession(request, env);
    if (!session) return jsonResponse({ error: "Sign in required." }, 401);
    const result = await env.DB.prepare(
      "SELECT i.symbol, i.market, i.sector, h.quantity, q.price, q.as_of AS quoteAsOf, " +
      "COALESCE(q.status, 'unavailable') AS quoteStatus " +
      "FROM holding h JOIN instrument i ON i.id = h.instrument_id " +
      "LEFT JOIN quote_latest q ON q.instrument_id = i.id ORDER BY i.market, i.symbol"
    ).all();
    return jsonResponse(calculateDashboard(result.results || []));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("Dashboard request failed:", message);
    return jsonResponse({ error: "Dashboard request failed." }, 400);
  }
}
