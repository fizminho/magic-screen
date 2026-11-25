import { getOwnerSession, jsonResponse } from "./auth.mjs";

function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildExportCsv(holdings, watchlist) {
  const header = [
    "record_type", "symbol", "market", "name", "currency",
    "quantity", "avg_cost", "cik", "note", "updated_at"
  ];
  const rows = [
    ...holdings.map((item) => [
      "holding", item.symbol, item.market, item.name, item.currency,
      item.quantity, item.avgCost, item.cik, item.notes, item.updatedAt
    ]),
    ...watchlist.map((item) => [
      "watchlist", item.symbol, item.market, item.name, item.currency,
      "", "", item.cik, item.note, item.addedAt
    ])
  ];
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function handleExportRequest(request, env, url) {
  if (request.method !== "GET" || url.pathname !== "/api/export") {
    return jsonResponse({ error: "Not found." }, 404);
  }
  try {
    const session = await getOwnerSession(request, env);
    if (!session) return jsonResponse({ error: "Sign in required." }, 401);

    const format = (url.searchParams.get("format") || "json").toLowerCase();
    if (!["json", "csv"].includes(format)) {
      return jsonResponse({ error: "Export format must be json or csv." }, 400);
    }

    const [holdingRows, watchlistRows, settingRows] = await Promise.all([
      env.DB.prepare(
        "SELECT i.symbol, i.market, i.name, i.currency, i.cik, h.quantity, " +
        "h.avg_cost AS avgCost, h.notes, h.updated_at AS updatedAt " +
        "FROM holding h JOIN instrument i ON i.id=h.instrument_id ORDER BY i.market,i.symbol"
      ).all(),
      env.DB.prepare(
        "SELECT i.symbol, i.market, i.name, i.currency, i.cik, w.note, w.added_at AS addedAt " +
        "FROM watchlist w JOIN instrument i ON i.id=w.instrument_id ORDER BY i.market,i.symbol"
      ).all(),
      env.DB.prepare(
        "SELECT key, value FROM setting WHERE key IN ('alert_move_pct','max_position_pct')"
      ).all()
    ]);

    const holdings = holdingRows.results || [];
    const watchlist = watchlistRows.results || [];
    const settings = Object.fromEntries((settingRows.results || []).map((row) => [row.key, Number(row.value)]));
    const exportedAt = new Date().toISOString();

    if (format === "csv") {
      const date = exportedAt.slice(0, 10);
      return new Response(buildExportCsv(holdings, watchlist), {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="magic-folio-${date}.csv"`,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff"
        }
      });
    }

    const date = exportedAt.slice(0, 10);
    return new Response(JSON.stringify({ exportedAt, holdings, watchlist, settings }, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="magic-folio-${date}.json"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("Export request failed:", message);
    return jsonResponse({ error: "Export is temporarily unavailable." }, 400);
  }
}

export { buildExportCsv };
