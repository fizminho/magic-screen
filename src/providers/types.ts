export type QuoteStatus = "ok" | "stale" | "unavailable";
export type QuoteMarket = "US" | "MY";
export type QuoteProviderId = "yahoo-finance" | "manual-csv";

export type QuoteSnapshot = {
  symbol: string;
  market: QuoteMarket;
  price: number | null;
  prevClose: number | null;
  changePct: number | null;
  asOf: string | null;
  currency: "USD" | "MYR";
  provider: QuoteProviderId;
  status: QuoteStatus;
};

export interface QuoteProvider {
  readonly id: QuoteProviderId;
  readonly market: QuoteMarket;
  getQuotes(symbols: string[]): Promise<QuoteSnapshot[]>;
}
