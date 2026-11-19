export type Market = "MY" | "US";
export type ShariahStatus = "compliant" | "non_compliant" | "unverified";
export interface Stock {
  symbol: string; market: Market; company_name: string; currency: string;
  price: number | null; change_percent: number | null; market_cap: number | null;
  earnings_yield: number | null; return_on_capital: number | null;
  magic_formula_rank: number | null; shariah_status: ShariahStatus;
  shariah_source: string | null; shariah_as_of: string | null;
  data_status: string; provider: string | null; updated_at: string;
}
export interface ApiResponse { market: Market; stocks: Stock[]; updatedAt: string | null; sourceStatus: string; }