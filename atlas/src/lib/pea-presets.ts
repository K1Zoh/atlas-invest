export interface EtfPreset {
  ticker: string;
  name: string;
  annualReturnPct: number;
}

/** Common PEA-eligible ETFs offered as quick-add chips. Tickers are labels only
 * (the simulator never fetches a price). */
export const ETF_PRESETS: EtfPreset[] = [
  { ticker: "WPEA", name: "iShares MSCI World Swap PEA", annualReturnPct: 7 },
  { ticker: "ESE", name: "BNP Paribas S&P 500 PEA", annualReturnPct: 8 },
  { ticker: "PAEEM", name: "Amundi PEA Marchés Émergents", annualReturnPct: 7 },
  { ticker: "PCEU", name: "Amundi PEA Europe", annualReturnPct: 6 },
  { ticker: "PUST", name: "Amundi PEA Nasdaq 100", annualReturnPct: 10 },
];

export const DEFAULT_RETURN = 7;

/** Best-effort default annual return from a fund's display name. */
export function defaultReturnForName(name: string): number {
  const s = name.toLowerCase();
  if (s.includes("nasdaq")) return 10;
  if (s.includes("s&p") || s.includes("500")) return 8;
  if (s.includes("emerg") || s.includes("émerg") || s.includes("pays")) return 7;
  if (s.includes("europe") || s.includes("stoxx")) return 6;
  if (s.includes("world") || s.includes("monde") || s.includes("wpea")) return 7;
  return DEFAULT_RETURN;
}
