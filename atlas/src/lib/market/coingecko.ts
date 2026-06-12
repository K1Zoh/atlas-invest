import type { HistoryPoint, SearchResult } from "../types";

const BASE = "https://api.coingecko.com/api/v3";

/** Symbol -> CoinGecko id map for common assets (ported from the legacy app). */
export const KNOWN_COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  SHIB: "shiba-inu",
  LTC: "litecoin",
  ETC: "ethereum-classic",
  XLM: "stellar",
  HBAR: "hedera-hashgraph",
  KAS: "kaspa",
  SUI: "sui",
  PEPE: "pepe",
  FLOKI: "floki",
  MEW: "cat-in-a-dogs-world",
  DOT: "polkadot",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  MATIC: "matic-network",
  TRX: "tron",
  UNI: "uniswap",
  ATOM: "cosmos",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  INJ: "injective-protocol",
  RNDR: "render-token",
  TON: "the-open-network",
};

// The free CoinGecko tier rate-limits aggressively: serialize calls (2 at a
// time) and retry once on 429 so bulk history fetches survive.
const MAX_CONCURRENT = 2;
let active = 0;
const queue: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  active++;
}

function release(): void {
  active--;
  queue.shift()?.();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cg<T>(path: string): Promise<T> {
  await acquire();
  try {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${BASE}${path}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (res.status === 429) {
        if (attempt < 2) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        throw new Error("CoinGecko : limite de requêtes atteinte, réessaie dans une minute");
      }
      if (!res.ok) {
        throw new Error(`CoinGecko ${res.status} sur ${path}`);
      }
      return (await res.json()) as T;
    }
  } finally {
    release();
  }
}

export async function searchCrypto(query: string, max = 8): Promise<SearchResult[]> {
  const data = await cg<{
    coins: { id: string; symbol: string; name: string; market_cap_rank: number | null }[];
  }>(`/search?query=${encodeURIComponent(query)}`);
  return (data.coins ?? []).slice(0, max).map((c) => ({
    ticker: c.symbol.toUpperCase(),
    name: c.name,
    assetClass: "crypto" as const,
    exchange: c.market_cap_rank ? `Rang #${c.market_cap_rank}` : "Crypto",
    coingeckoId: c.id,
  }));
}

export interface CgMarket {
  id: string;
  symbol: string;
  priceEur: number;
  change24hPct: number | null;
  spark7d: number[] | null;
  name: string;
}

export async function getCryptoMarkets(ids: string[]): Promise<Map<string, CgMarket>> {
  const out = new Map<string, CgMarket>();
  if (!ids.length) return out;
  const data = await cg<
    {
      id: string;
      symbol: string;
      name: string;
      current_price: number | null;
      price_change_percentage_24h: number | null;
      sparkline_in_7d?: { price: number[] };
    }[]
  >(
    `/coins/markets?vs_currency=eur&ids=${encodeURIComponent(ids.join(","))}&sparkline=true&price_change_percentage=24h&per_page=250`,
  );
  for (const c of data) {
    if (c.current_price === null) continue;
    const raw = c.sparkline_in_7d?.price ?? null;
    out.set(c.id, {
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      priceEur: c.current_price,
      change24hPct: c.price_change_percentage_24h,
      spark7d: raw ? downsample(raw, 40) : null,
    });
  }
  return out;
}

export async function getCryptoHistory(id: string, days: number): Promise<HistoryPoint[]> {
  const interval = days > 60 ? "&interval=daily" : "";
  const data = await cg<{ prices: [number, number][] }>(
    `/coins/${encodeURIComponent(id)}/market_chart?vs_currency=eur&days=${days}${interval}`,
  );
  const byDay = new Map<string, number>();
  for (const [ts, price] of data.prices ?? []) {
    byDay.set(new Date(ts).toISOString().slice(0, 10), price);
  }
  return [...byDay.entries()].map(([date, value]) => ({ date, value }));
}

export function resolveCoingeckoId(ticker: string, stored?: string | null): string | null {
  if (stored) return stored;
  return KNOWN_COINGECKO_IDS[ticker.toUpperCase()] ?? null;
}

function downsample(arr: number[], target: number): number[] {
  if (arr.length <= target) return arr;
  const step = arr.length / target;
  const out: number[] = [];
  for (let i = 0; i < target; i++) out.push(arr[Math.floor(i * step)]);
  out[out.length - 1] = arr[arr.length - 1];
  return out;
}
