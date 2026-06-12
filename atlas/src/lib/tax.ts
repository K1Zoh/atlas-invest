import { listTransactions } from "./repo";
import type { CryptoTaxResult, RealizedLine, Transaction } from "./types";

/**
 * Fiscalité française des plus-values réalisées — porté de l'app précédente.
 *
 * Actions / ETF : méthode PRU (coût moyen pondéré), PFU 30 %.
 * Crypto        : formule officielle du formulaire 2086 (BOFiP) :
 *   PV = prix_cession_net − (coût_global × prix_cession_net / valeur_globale_portefeuille)
 * La valeur globale du portefeuille avant cession est estimée au PRU pour les
 * lignes dont on n'a pas le cours historique exact (annoté `approximate`).
 */

const PFU = 0.3; // 12,8 % IR + 17,2 % prélèvements sociaux

function sortedTxs(assetClass: "stock" | "crypto"): Transaction[] {
  return listTransactions({ assetClass })
    .slice()
    .sort((a, b) => (a.txDate === b.txDate ? a.id - b.id : a.txDate.localeCompare(b.txDate)));
}

export function computeStockRealized(year?: number): RealizedLine[] {
  const txs = sortedTxs("stock");
  const basis = new Map<string, { qty: number; cost: number }>();
  const lines: RealizedLine[] = [];

  for (const t of txs) {
    let cb = basis.get(t.ticker);
    if (!cb) {
      cb = { qty: 0, cost: 0 };
      basis.set(t.ticker, cb);
    }
    if (t.side === "buy") {
      cb.qty += t.quantity;
      cb.cost += t.quantity * t.price + t.fees;
      continue;
    }
    const qtyBefore = cb.qty;
    if (qtyBefore <= 1e-9) continue;
    const qtySold = Math.min(t.quantity, qtyBefore);
    const pru = cb.cost / qtyBefore;
    const netProceeds = qtySold * t.price - t.fees;
    const costBasis = pru * qtySold;
    const pnl = netProceeds - costBasis;

    const kept = Math.max(0, qtyBefore - qtySold) / qtyBefore;
    cb.qty = qtyBefore - qtySold;
    cb.cost *= kept;

    if (year && t.txDate.slice(0, 4) !== String(year)) continue;
    lines.push({
      date: t.txDate,
      ticker: t.ticker,
      name: t.name,
      qtySold,
      unitPrice: t.price,
      fees: t.fees,
      netProceeds: round4(netProceeds),
      costBasis: round4(costBasis),
      pnl: round4(pnl),
      pfuEstimate: round4(Math.max(0, pnl) * PFU),
    });
  }
  return lines;
}

function portfolioValueAtSale(
  portfolio: Map<string, { qty: number; cost: number }>,
  soldTicker: string,
  salePrice: number,
): number {
  let total = 0;
  for (const [tk, p] of portfolio) {
    if (p.qty <= 1e-9) continue;
    total += tk === soldTicker ? p.qty * salePrice : p.qty * (p.cost / p.qty);
  }
  return total;
}

export function computeCryptoTax(year?: number): CryptoTaxResult {
  const txs = sortedTxs("crypto");
  const portfolio = new Map<string, { qty: number; cost: number }>();
  let globalCost = 0;
  const lines: CryptoTaxResult["lines"] = [];

  for (const t of txs) {
    let p = portfolio.get(t.ticker);
    if (!p) {
      p = { qty: 0, cost: 0 };
      portfolio.set(t.ticker, p);
    }
    if (t.side === "buy") {
      p.qty += t.quantity;
      p.cost += t.quantity * t.price + t.fees;
      globalCost += t.quantity * t.price + t.fees;
      continue;
    }
    const qtyBefore = p.qty;
    if (qtyBefore <= 1e-9) continue;
    const qtySold = Math.min(t.quantity, qtyBefore);
    const netProceeds = qtySold * t.price - t.fees;
    const portfolioValue = portfolioValueAtSale(portfolio, t.ticker, t.price);
    if (portfolioValue <= 0) continue;

    const pv2086 = netProceeds - (globalCost * netProceeds) / portfolioValue;
    const newGlobalCost = globalCost * (1 - netProceeds / portfolioValue);

    const kept = Math.max(0, qtyBefore - qtySold) / qtyBefore;
    p.qty = qtyBefore - qtySold;
    p.cost *= kept;
    globalCost = Math.max(0, newGlobalCost);

    if (year && t.txDate.slice(0, 4) !== String(year)) continue;
    lines.push({
      date: t.txDate,
      ticker: t.ticker,
      name: t.name,
      qtySold,
      unitPrice: t.price,
      fees: t.fees,
      netProceeds: round4(netProceeds),
      costBasis: round4(netProceeds - pv2086),
      pnl: round4(pv2086),
      pfuEstimate: round4(Math.max(0, pv2086) * PFU),
      portfolioValue: round4(portfolioValue),
      approximate: true,
    });
  }

  const gains = lines.filter((l) => l.pnl > 0).reduce((s, l) => s + l.pnl, 0);
  const losses = lines.filter((l) => l.pnl < 0).reduce((s, l) => s + l.pnl, 0);
  const net = gains + losses;
  return {
    lines,
    totalGains: round2(gains),
    totalLosses: round2(Math.abs(losses)),
    netTaxable: round2(net),
    pfuEstimate: round2(Math.max(0, net) * PFU),
  };
}

export function availableTaxYears(): number[] {
  const years = new Set<number>();
  for (const t of listTransactions()) {
    if (t.side === "sell") years.add(Number(t.txDate.slice(0, 4)));
  }
  return [...years].sort((a, b) => b - a);
}

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;
const round2 = (v: number) => Math.round(v * 100) / 100;
