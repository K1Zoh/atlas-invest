export type AssetClass = "stock" | "crypto";

export type TxSide = "buy" | "sell";

export interface Transaction {
  id: number;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  side: TxSide;
  quantity: number;
  price: number; // unit price in EUR
  fees: number;
  txDate: string; // YYYY-MM-DD
  platform: string | null;
  coingeckoId: string | null;
  note: string | null;
  createdAt: string;
}

export interface Position {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  quantity: number;
  avgCost: number; // PRU in EUR
  invested: number; // current cost basis in EUR
  realizedPnl: number;
  platform: string | null;
  coingeckoId: string | null;
  firstBuy: string;
}

export interface Quote {
  ticker: string;
  assetClass: AssetClass;
  priceEur: number;
  change24hPct: number | null;
  nativeCurrency: string;
  nativePrice: number;
  spark7d: number[] | null;
  updatedAt: string;
}

export interface PositionView extends Position {
  price: number | null;
  value: number | null;
  pnl: number | null;
  pnlPct: number | null;
  dayChangePct: number | null;
  weightPct: number | null;
  spark7d: number[] | null;
}

export interface PortfolioSummary {
  totalValue: number;
  totalInvested: number;
  pnl: number;
  pnlPct: number;
  dayChangeEur: number;
  dayChangePct: number;
  realizedPnl: number;
  positionsCount: number;
}

export interface AllocationSlice {
  label: string;
  value: number;
  pct: number;
}

export interface ConcentrationAlert {
  level: "info" | "warning" | "danger";
  message: string;
}

export interface WatchlistItem {
  id: number;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  coingeckoId: string | null;
  targetPrice: number | null;
  note: string | null;
  addedAt: string;
  price?: number | null;
  change24hPct?: number | null;
  distanceToTargetPct?: number | null;
}

export type AlertKind =
  | "above"
  | "below"
  | "buy_target"
  | "sell_target"
  | "stop_loss"
  | "take_profit";

export interface PriceAlert {
  id: number;
  ticker: string;
  assetClass: AssetClass;
  coingeckoId: string | null;
  kind: AlertKind;
  threshold: number;
  label: string;
  active: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

export interface AiRecommendation {
  ticker: string;
  action: "acheter" | "renforcer" | "conserver" | "alleger" | "vendre";
  conviction: 1 | 2 | 3 | 4 | 5;
  reason: string;
  priceAtSuggestion?: number | null;
}

export interface AiAnalysis {
  id: number;
  scope: "portfolio" | "asset";
  assetClass: AssetClass | "all";
  ticker: string | null;
  model: string;
  content: string;
  recommendations: AiRecommendation[] | null;
  snapshot: string | null;
  createdAt: string;
}

export interface SearchResult {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  exchange: string | null;
  coingeckoId: string | null;
  price?: number | null;
}

export interface HistoryPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface RealizedLine {
  date: string;
  ticker: string;
  name: string;
  qtySold: number;
  unitPrice: number;
  fees: number;
  netProceeds: number;
  costBasis: number;
  pnl: number;
  pfuEstimate: number;
}

export interface CryptoTaxResult {
  lines: (RealizedLine & { portfolioValue: number; approximate: boolean })[];
  totalGains: number;
  totalLosses: number;
  netTaxable: number;
  pfuEstimate: number;
}
