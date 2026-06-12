import { getAssetHistory, getQuotes, quoteKey, type AssetRef } from "./market";
import { listTransactions, totalRealizedPnl } from "./repo";
import type {
  AllocationSlice,
  AssetClass,
  ConcentrationAlert,
  PortfolioSummary,
  Position,
  PositionView,
  Quote,
} from "./types";

export function buildPositionViews(
  positions: Position[],
  quotes: Map<string, Quote>,
): PositionView[] {
  const views: PositionView[] = positions.map((p) => {
    const q = quotes.get(`${p.assetClass}:${p.ticker}`);
    const price = q?.priceEur ?? null;
    const value = price !== null ? price * p.quantity : null;
    const pnl = value !== null ? value - p.invested : null;
    return {
      ...p,
      price,
      value,
      pnl,
      pnlPct: pnl !== null && p.invested > 0 ? (pnl / p.invested) * 100 : null,
      dayChangePct: q?.change24hPct ?? null,
      weightPct: null,
      spark7d: q?.spark7d ?? null,
    };
  });
  const total = views.reduce((s, v) => s + (v.value ?? 0), 0);
  if (total > 0) {
    for (const v of views) {
      v.weightPct = v.value !== null ? (v.value / total) * 100 : null;
    }
  }
  return views.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

export function summarize(views: PositionView[], realizedPnl?: number): PortfolioSummary {
  const totalValue = views.reduce((s, v) => s + (v.value ?? 0), 0);
  const totalInvested = views.reduce((s, v) => s + v.invested, 0);
  const pnl = totalValue - totalInvested;
  let dayChangeEur = 0;
  for (const v of views) {
    if (v.value !== null && v.dayChangePct !== null) {
      const yesterday = v.value / (1 + v.dayChangePct / 100);
      dayChangeEur += v.value - yesterday;
    }
  }
  const yesterdayTotal = totalValue - dayChangeEur;
  return {
    totalValue,
    totalInvested,
    pnl,
    pnlPct: totalInvested > 0 ? (pnl / totalInvested) * 100 : 0,
    dayChangeEur,
    dayChangePct: yesterdayTotal > 0 ? (dayChangeEur / yesterdayTotal) * 100 : 0,
    realizedPnl: realizedPnl ?? 0,
    positionsCount: views.length,
  };
}

// ── Concentration / risk ────────────────────────────────────────────────────

export function computeHhi(views: PositionView[]): number {
  const total = views.reduce((s, v) => s + (v.value ?? 0), 0);
  if (total <= 0) return 0;
  return views.reduce((s, v) => {
    const w = (v.value ?? 0) / total;
    return s + w * w;
  }, 0);
}

const MEME_COINS = new Set(["DOGE", "SHIB", "PEPE", "FLOKI", "MEW", "BONK", "WIF"]);

export function concentrationAlerts(views: PositionView[]): ConcentrationAlert[] {
  const alerts: ConcentrationAlert[] = [];
  const total = views.reduce((s, v) => s + (v.value ?? 0), 0);
  if (total <= 0) return alerts;

  const hhi = computeHhi(views);
  if (hhi > 0.25) {
    alerts.push({
      level: "danger",
      message: `Portefeuille très concentré (HHI ${hhi.toFixed(2)}) : un choc sur une ligne pèse lourd sur l'ensemble.`,
    });
  } else if (hhi > 0.15) {
    alerts.push({
      level: "warning",
      message: `Concentration modérée (HHI ${hhi.toFixed(2)}) : surveille tes plus grosses lignes.`,
    });
  }

  for (const v of views) {
    const w = ((v.value ?? 0) / total) * 100;
    if (w > 40) {
      alerts.push({
        level: "danger",
        message: `${v.ticker} représente ${w.toFixed(0)} % du portefeuille.`,
      });
    } else if (w > 25) {
      alerts.push({
        level: "warning",
        message: `${v.ticker} pèse ${w.toFixed(0)} % du portefeuille.`,
      });
    }
  }

  const cryptoValue = views
    .filter((v) => v.assetClass === "crypto")
    .reduce((s, v) => s + (v.value ?? 0), 0);
  const cryptoPct = (cryptoValue / total) * 100;
  if (cryptoPct > 60) {
    alerts.push({
      level: "warning",
      message: `Exposition crypto à ${cryptoPct.toFixed(0)} % du patrimoine, volatilité élevée.`,
    });
  }

  const memeValue = views
    .filter((v) => v.assetClass === "crypto" && MEME_COINS.has(v.ticker))
    .reduce((s, v) => s + (v.value ?? 0), 0);
  if (cryptoValue > 0 && (memeValue / cryptoValue) * 100 > 15) {
    alerts.push({
      level: "warning",
      message: `Les meme coins représentent ${((memeValue / cryptoValue) * 100).toFixed(0)} % de ta poche crypto.`,
    });
  }

  return alerts;
}

// ── Allocations ─────────────────────────────────────────────────────────────

export function allocationByClass(views: PositionView[]): AllocationSlice[] {
  return sliceBy(views, (v) => (v.assetClass === "crypto" ? "Crypto" : "Actions / ETF"));
}

const CRYPTO_CATEGORIES: Record<string, string> = {
  BTC: "Réserve de valeur",
  ETH: "Layer 1",
  SOL: "Layer 1",
  ADA: "Layer 1",
  AVAX: "Layer 1",
  NEAR: "Layer 1",
  APT: "Layer 1",
  SUI: "Layer 1",
  TON: "Layer 1",
  KAS: "Layer 1",
  HBAR: "Layer 1",
  XLM: "Paiements",
  XRP: "Paiements",
  LTC: "Paiements",
  BNB: "Exchange",
  DOGE: "Meme",
  SHIB: "Meme",
  PEPE: "Meme",
  FLOKI: "Meme",
  MEW: "Meme",
  BONK: "Meme",
  WIF: "Meme",
  LINK: "Infrastructure",
  DOT: "Infrastructure",
  ATOM: "Infrastructure",
  ARB: "Layer 2",
  OP: "Layer 2",
  MATIC: "Layer 2",
  UNI: "DeFi",
  INJ: "DeFi",
};

export function allocationByCategory(views: PositionView[]): AllocationSlice[] {
  return sliceBy(views, (v) =>
    v.assetClass === "crypto" ? (CRYPTO_CATEGORIES[v.ticker] ?? "Autres cryptos") : "Actions / ETF",
  );
}

export function allocationByAsset(views: PositionView[], top = 8): AllocationSlice[] {
  const slices = sliceBy(views, (v) => v.ticker);
  if (slices.length <= top) return slices;
  const head = slices.slice(0, top);
  const rest = slices.slice(top);
  const restValue = rest.reduce((s, x) => s + x.value, 0);
  const restPct = rest.reduce((s, x) => s + x.pct, 0);
  return [...head, { label: "Autres", value: restValue, pct: restPct }];
}

function sliceBy(
  views: PositionView[],
  groupFn: (v: PositionView) => string,
): AllocationSlice[] {
  const total = views.reduce((s, v) => s + (v.value ?? 0), 0);
  if (total <= 0) return [];
  const groups = new Map<string, number>();
  for (const v of views) {
    if (v.value === null) continue;
    const g = groupFn(v);
    groups.set(g, (groups.get(g) ?? 0) + v.value);
  }
  return [...groups.entries()]
    .map(([label, value]) => ({ label, value, pct: (value / total) * 100 }))
    .sort((a, b) => b.value - a.value);
}

// ── Portfolio timeline ──────────────────────────────────────────────────────

export interface TimelinePoint {
  date: string;
  value: number;
  invested: number;
  benchmark?: number;
}

/** EUR-denominated MSCI World UCITS ETF used as the comparison universe. */
const BENCHMARK_TICKER = "IWDA.AS";

/**
 * Money-weighted benchmark simulation: replay the user's real cash flows
 * (every buy/sell, fees included) into the benchmark ETF instead, and value
 * the resulting units at each date. Answers honestly: "what if the same
 * money had gone into a World ETF?"
 */
async function buildBenchmarkSeries(
  dates: string[],
  txs: { txDate: string; side: string; quantity: number; price: number; fees: number }[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!dates.length || !txs.length) return out;

  const spanDays = Math.min(
    1825,
    Math.ceil((Date.now() - new Date(txs[0].txDate).getTime()) / 86_400_000) + 7,
  );
  const hist = await getAssetHistory({ ticker: BENCHMARK_TICKER, assetClass: "stock" }, spanDays);
  if (hist.length < 2) return out;

  const priceAt = (date: string): number => {
    // forward-fill: last close at or before the date (first close as floor)
    let price = hist[0].value;
    for (const p of hist) {
      if (p.date > date) break;
      price = p.value;
    }
    return price;
  };

  let units = 0;
  let txIdx = 0;
  const applyUpTo = (date: string) => {
    while (txIdx < txs.length && txs[txIdx].txDate <= date) {
      const t = txs[txIdx];
      const price = priceAt(t.txDate);
      if (price > 0) {
        const flow =
          t.side === "buy" ? t.quantity * t.price + t.fees : -(t.quantity * t.price - t.fees);
        units = Math.max(0, units + flow / price);
      }
      txIdx++;
    }
  };

  applyUpTo(dates[0]);
  for (const date of dates) {
    applyUpTo(date);
    out.set(date, units * priceAt(date));
  }
  return out;
}

/**
 * Daily portfolio value over `days`, rebuilt from the transaction log and
 * per-asset price history (forward-filled).
 */
export async function buildTimeline(days: number, withBenchmark = false): Promise<TimelinePoint[]> {
  const txs = listTransactions()
    .slice()
    .sort((a, b) => (a.txDate === b.txDate ? a.id - b.id : a.txDate.localeCompare(b.txDate)));
  if (!txs.length) return [];

  const assets = new Map<string, AssetRef>();
  for (const t of txs) {
    const key = `${t.assetClass}:${t.ticker}`;
    if (!assets.has(key)) {
      assets.set(key, { ticker: t.ticker, assetClass: t.assetClass, coingeckoId: t.coingeckoId });
    } else if (t.coingeckoId) {
      assets.get(key)!.coingeckoId = t.coingeckoId;
    }
  }

  const histories = new Map<string, { date: string; value: number }[]>();
  await Promise.all(
    [...assets.entries()].map(async ([key, ref]) => {
      try {
        histories.set(key, await getAssetHistory(ref, days));
      } catch {
        histories.set(key, []);
      }
    }),
  );

  // Daily axis from max(start, first transaction) to today.
  const start = new Date(Math.max(Date.now() - days * 86_400_000, new Date(txs[0].txDate).getTime()));
  const dates: string[] = [];
  for (let d = new Date(start); d <= new Date(); d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  const pointers = new Map<string, number>();
  const lastPrice = new Map<string, number>();
  let txIdx = 0;
  const qty = new Map<string, number>();
  const cost = new Map<string, number>();

  // Replay transactions before the window start.
  while (txIdx < txs.length && txs[txIdx].txDate < dates[0]) {
    applyTx(txs[txIdx], qty, cost);
    txIdx++;
  }

  const out: TimelinePoint[] = [];
  for (const date of dates) {
    while (txIdx < txs.length && txs[txIdx].txDate <= date) {
      applyTx(txs[txIdx], qty, cost);
      txIdx++;
    }
    let value = 0;
    let invested = 0;
    for (const [key] of assets) {
      const q = qty.get(key) ?? 0;
      invested += cost.get(key) ?? 0;
      if (q <= 1e-12) continue;
      const hist = histories.get(key) ?? [];
      let ptr = pointers.get(key) ?? 0;
      while (ptr < hist.length && hist[ptr].date <= date) {
        lastPrice.set(key, hist[ptr].value);
        ptr++;
      }
      pointers.set(key, ptr);
      const price = lastPrice.get(key);
      if (price !== undefined) value += q * price;
    }
    out.push({ date, value, invested });
  }
  const filtered = out.filter((p) => p.value > 0 || p.invested > 0);

  if (withBenchmark && filtered.length) {
    try {
      const bench = await buildBenchmarkSeries(
        filtered.map((p) => p.date),
        txs,
      );
      for (const p of filtered) {
        const b = bench.get(p.date);
        if (b !== undefined) p.benchmark = b;
      }
    } catch {
      // benchmark is best effort: the portfolio series still renders
    }
  }
  return filtered;
}

function applyTx(
  t: { ticker: string; assetClass: AssetClass; side: string; quantity: number; price: number; fees: number },
  qty: Map<string, number>,
  cost: Map<string, number>,
) {
  const key = `${t.assetClass}:${t.ticker}`;
  const q0 = qty.get(key) ?? 0;
  const c0 = cost.get(key) ?? 0;
  if (t.side === "buy") {
    qty.set(key, q0 + t.quantity);
    cost.set(key, c0 + t.quantity * t.price + t.fees);
  } else if (q0 > 1e-12) {
    const sell = Math.min(t.quantity, q0);
    const kept = Math.max(0, q0 - sell) / q0;
    qty.set(key, q0 - sell);
    cost.set(key, c0 * kept);
  }
}

// ── Convenience: full portfolio snapshot ────────────────────────────────────

export async function loadPortfolio(positions: Position[], force = false) {
  const refs: AssetRef[] = positions.map((p) => ({
    ticker: p.ticker,
    assetClass: p.assetClass,
    coingeckoId: p.coingeckoId,
  }));
  const { quotes, errors } = await getQuotes(refs, force);
  const views = buildPositionViews(positions, quotes);
  const summary = summarize(views, totalRealizedPnl());
  return { views, summary, quotes, errors };
}

export { quoteKey };
