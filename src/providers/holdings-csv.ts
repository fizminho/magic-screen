import { parseCsvRows } from "./manual-csv.ts";

const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;
const MAX_ROWS = 20;
const MAX_FILE_SIZE = 100_000;
const MAX_QUANTITY = 1_000_000_000_000;
const MAX_AVG_COST = 1_000_000_000_000;

export type HoldingImportRow = {
  symbol: string;
  market: "US" | "MY";
  quantity: number;
  avgCost: number | null;
  cik: string | null;
};

/**
 * Parse an owner-only holdings CSV.
 * Required columns: symbol,market,quantity,avg_cost. Optional: cik for US instruments.
 * Existing positions are upserted; rows omitted from the file are not deleted.
 */
export function parseHoldingsCsv(csv: string): HoldingImportRow[] {
  if (csv.length > MAX_FILE_SIZE) throw new Error("Holdings CSV is too large (maximum 100 KB).");
  const rows = parseCsvRows(csv.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("CSV needs a header and at least one holding row.");
  if (rows.length > MAX_ROWS + 1) throw new Error("Import is limited to 20 holdings per batch.");

  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const symbolIndex = headers.indexOf("symbol");
  const marketIndex = headers.indexOf("market");
  const quantityIndex = headers.indexOf("quantity");
  const avgCostIndex = headers.indexOf("avg_cost");
  const cikIndex = headers.indexOf("cik");
  if ([symbolIndex, marketIndex, quantityIndex, avgCostIndex].some((index) => index < 0)) {
    throw new Error("CSV headers must include symbol, market, quantity and avg_cost.");
  }

  const seen = new Set<string>();
  return rows.slice(1).map((row, index) => {
    const symbol = (row[symbolIndex] || "").trim().toUpperCase();
    const market = (row[marketIndex] || "").trim().toUpperCase();
    const quantity = Number((row[quantityIndex] || "").trim());
    const avgCostRaw = (row[avgCostIndex] || "").trim();
    const avgCost = avgCostRaw ? Number(avgCostRaw) : null;
    const cikRaw = cikIndex >= 0 ? (row[cikIndex] || "").trim() : "";
    const cik = cikRaw || null;

    if (!SYMBOL_PATTERN.test(symbol)) throw new Error(`Row ${index + 2}: invalid ticker symbol.`);
    if (market !== "US" && market !== "MY") throw new Error(`Row ${index + 2}: market must be US or MY.`);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
      throw new Error(`Row ${index + 2}: quantity must be greater than zero.`);
    }
    if (cik !== null && (market !== "US" || !/^[0-9]{1,10}$/.test(cik))) throw new Error(`Row ${index + 2}: CIK must be 1 to 10 digits and is only valid for US instruments.`);
    if (avgCost !== null && (!Number.isFinite(avgCost) || avgCost < 0 || avgCost > MAX_AVG_COST)) {
      throw new Error(`Row ${index + 2}: avg_cost must be zero or greater.`);
    }

    const key = `${market}:${symbol}`;
    if (seen.has(key)) throw new Error(`Row ${index + 2}: duplicate holding ${key}.`);
    seen.add(key);
    return { symbol, market, quantity, avgCost, cik };
  });
}
