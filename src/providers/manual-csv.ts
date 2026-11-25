import type { QuoteSnapshot } from "./types";

const MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

/**
 * Parse the Magic Folio manual-import format:
 * symbol,price,asOf[,prevClose]
 * Dates must identify the actual quote date/time; do not use today's date for an old quote.
 */
export function parseManualQuotesCsv(csv: string, now = Date.now()): QuoteSnapshot[] {
  if (csv.length > 250_000) throw new Error("CSV is too large (maximum 250 KB).");
  const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("CSV needs a header and at least one quote row.");
  if (rows.length > 501) throw new Error("CSV is limited to 500 quote rows per import.");

  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const symbolIndex = headers.indexOf("symbol");
  const priceIndex = headers.indexOf("price");
  const asOfIndex = headers.indexOf("asof");
  const prevCloseIndex = headers.indexOf("prevclose");
  if (symbolIndex < 0 || priceIndex < 0 || asOfIndex < 0) {
    throw new Error("CSV headers must include symbol, price and asOf. prevClose is optional.");
  }

  const seen = new Set<string>();
  return rows.slice(1).map((row, index) => {
    const symbol = (row[symbolIndex] || "").trim().toUpperCase();
    const price = Number((row[priceIndex] || "").trim());
    const asOfRaw = (row[asOfIndex] || "").trim();
    const prevCloseRaw = prevCloseIndex >= 0 ? (row[prevCloseIndex] || "").trim() : "";
    const prevClose = prevCloseRaw ? Number(prevCloseRaw) : null;
    const asOfDate = asOfRaw ? new Date(asOfRaw) : null;

    if (!SYMBOL_PATTERN.test(symbol)) throw new Error(`Row ${index + 2}: invalid Bursa symbol.`);
    if (seen.has(symbol)) throw new Error(`Row ${index + 2}: duplicate symbol ${symbol}.`);
    seen.add(symbol);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Row ${index + 2}: price must be greater than zero.`);
    if (!asOfDate || !Number.isFinite(asOfDate.getTime()) || asOfDate.getTime() > now + 5 * 60 * 1000) {
      throw new Error(`Row ${index + 2}: asOf must be a valid date/time and cannot be in the future.`);
    }
    if (prevClose !== null && (!Number.isFinite(prevClose) || prevClose <= 0)) {
      throw new Error(`Row ${index + 2}: prevClose must be greater than zero.`);
    }

    return {
      symbol, market: "MY", price, prevClose,
      changePct: prevClose === null ? null : (price - prevClose) / prevClose,
      asOf: asOfDate.toISOString(), currency: "MYR", provider: "manual-csv",
      status: now - asOfDate.getTime() > MAX_AGE_MS ? "stale" : "ok"
    };
  });
}
