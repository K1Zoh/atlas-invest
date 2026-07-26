import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountType, AssetClass, Transaction, TxSide } from "./types";

// tax.ts pulls its data through repo.listTransactions — mock it so each test
// feeds a controlled, hand-verified set of transactions (no DB involved).
vi.mock("./repo", () => ({ listTransactions: vi.fn() }));
import { listTransactions } from "./repo";
import { availableTaxYears, computeCryptoTax, computeStockRealized, computeStockTax } from "./tax";

let seq = 0;
function tx(o: {
  ticker?: string;
  assetClass?: AssetClass;
  side: TxSide;
  quantity: number;
  price: number;
  fees?: number;
  txDate: string;
  account?: AccountType | null;
}): Transaction {
  return {
    id: ++seq,
    ticker: o.ticker ?? "ACME",
    name: o.ticker ?? "ACME",
    assetClass: o.assetClass ?? "stock",
    side: o.side,
    quantity: o.quantity,
    price: o.price,
    fees: o.fees ?? 0,
    txDate: o.txDate,
    platform: null,
    account: o.account ?? null,
    coingeckoId: null,
    note: null,
    createdAt: "2020-01-01T00:00:00Z",
  };
}

function setTxs(txs: Transaction[]): void {
  vi.mocked(listTransactions).mockImplementation(((f?: { assetClass?: AssetClass }) =>
    txs.filter((t) => !f?.assetClass || t.assetClass === f.assetClass)) as typeof listTransactions);
}

beforeEach(() => {
  seq = 0;
  vi.clearAllMocks();
});

describe("computeStockRealized — PRU + PFU 30 %", () => {
  it("partial sell: weighted-average cost, fees added to basis and removed from proceeds", () => {
    setTxs([
      tx({ side: "buy", quantity: 10, price: 100, fees: 5, txDate: "2024-01-10" }),
      tx({ side: "sell", quantity: 4, price: 120, fees: 2, txDate: "2024-06-01" }),
    ]);
    const lines = computeStockRealized();
    expect(lines).toHaveLength(1);
    const l = lines[0];
    expect(l.qtySold).toBe(4);
    expect(l.netProceeds).toBeCloseTo(478, 4); // 4*120 - 2
    expect(l.costBasis).toBeCloseTo(402, 4); // (1005/10) * 4
    expect(l.pnl).toBeCloseTo(76, 4); // 478 - 402
    expect(l.pfuEstimate).toBeCloseTo(22.8, 4); // 76 * 0.3
  });

  it("excludes PEA sells entirely (no PFU while inside the plan)", () => {
    setTxs([
      tx({ ticker: "WPEA", side: "buy", quantity: 10, price: 100, txDate: "2024-01-10", account: "pea" }),
      tx({ ticker: "WPEA", side: "sell", quantity: 5, price: 150, txDate: "2024-06-01", account: "pea" }),
    ]);
    expect(computeStockRealized()).toHaveLength(0);
  });

  it("year filter: basis carries from earlier years, only the target year is reported", () => {
    setTxs([
      tx({ side: "buy", quantity: 10, price: 100, txDate: "2023-01-10" }),
      tx({ side: "sell", quantity: 5, price: 150, txDate: "2024-06-01" }),
      tx({ side: "sell", quantity: 5, price: 200, txDate: "2025-06-01" }),
    ]);
    const lines = computeStockRealized(2025);
    expect(lines).toHaveLength(1);
    expect(lines[0].date).toBe("2025-06-01");
    expect(lines[0].pnl).toBeCloseTo(500, 4); // proceeds 1000 − basis (100 PRU × 5)
  });

  it("caps a sell at the quantity actually held", () => {
    setTxs([
      tx({ side: "buy", quantity: 5, price: 100, txDate: "2024-01-10" }),
      tx({ side: "sell", quantity: 10, price: 120, txDate: "2024-06-01" }),
    ]);
    const lines = computeStockRealized();
    expect(lines[0].qtySold).toBe(5);
    expect(lines[0].pnl).toBeCloseTo(100, 4); // 5*120 − 5*100
  });
});

describe("computeCryptoTax — formulaire 2086", () => {
  it("single asset sold in full: PV = net proceeds − total acquisition cost", () => {
    setTxs([
      tx({ ticker: "BTC", assetClass: "crypto", side: "buy", quantity: 1, price: 10000, txDate: "2024-01-01" }),
      tx({ ticker: "BTC", assetClass: "crypto", side: "sell", quantity: 1, price: 15000, txDate: "2024-05-01" }),
    ]);
    const r = computeCryptoTax();
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].pnl).toBeCloseTo(5000, 4);
    expect(r.totalGains).toBeCloseTo(5000, 2);
    expect(r.netTaxable).toBeCloseTo(5000, 2);
    expect(r.pfuEstimate).toBeCloseTo(1500, 2);
  });

  it("partial sell with a second holding valued at PRU (2086 proration)", () => {
    setTxs([
      tx({ ticker: "BTC", assetClass: "crypto", side: "buy", quantity: 1, price: 10000, txDate: "2024-01-01" }),
      tx({ ticker: "ETH", assetClass: "crypto", side: "buy", quantity: 1, price: 2000, txDate: "2024-02-01" }),
      tx({ ticker: "BTC", assetClass: "crypto", side: "sell", quantity: 0.5, price: 20000, txDate: "2024-05-01" }),
    ]);
    const l = computeCryptoTax().lines[0];
    // portfolio value before the sale: BTC 1×20000 (sale price) + ETH 1×2000 (PRU) = 22000
    expect(l.portfolioValue).toBeCloseTo(22000, 4);
    // PV = 10000 − (12000 × 10000 / 22000)
    expect(l.pnl).toBeCloseTo(4545.4545, 3);
  });

  it("underwater sell yields a loss, taxed at zero", () => {
    setTxs([
      tx({ ticker: "BTC", assetClass: "crypto", side: "buy", quantity: 1, price: 10000, txDate: "2024-01-01" }),
      tx({ ticker: "BTC", assetClass: "crypto", side: "sell", quantity: 1, price: 8000, txDate: "2024-05-01" }),
    ]);
    const r = computeCryptoTax();
    expect(r.lines[0].pnl).toBeCloseTo(-2000, 4);
    expect(r.totalLosses).toBeCloseTo(2000, 2);
    expect(r.pfuEstimate).toBeCloseTo(0, 2);
  });
});

describe("availableTaxYears", () => {
  it("lists years that contain a sell, newest first", () => {
    setTxs([
      tx({ side: "buy", quantity: 1, price: 100, txDate: "2022-01-01" }),
      tx({ side: "sell", quantity: 1, price: 120, txDate: "2023-01-01" }),
      tx({ ticker: "BTC", assetClass: "crypto", side: "sell", quantity: 1, price: 1, txDate: "2025-01-01" }),
    ]);
    expect(availableTaxYears()).toEqual([2025, 2023]);
  });
});

describe("computeStockTax — losses offset gains before the 30 % flat tax", () => {
  it("taxes the net, not the sum of per-line (loss-flooring) estimates", () => {
    setTxs([
      tx({ ticker: "WIN", side: "buy", quantity: 10, price: 100, txDate: "2024-01-01" }),
      tx({ ticker: "LOSS", side: "buy", quantity: 10, price: 100, txDate: "2024-01-01" }),
      tx({ ticker: "WIN", side: "sell", quantity: 10, price: 150, txDate: "2024-06-01" }),
      tx({ ticker: "LOSS", side: "sell", quantity: 10, price: 60, txDate: "2024-06-01" }),
    ]);
    const r = computeStockTax();
    expect(r.totalGains).toBeCloseTo(500, 2);
    expect(r.totalLosses).toBeCloseTo(400, 2);
    expect(r.net).toBeCloseTo(100, 2);
    expect(r.pfuEstimate).toBeCloseTo(30, 2); // max(0, 100) × 0.3 — not 500 × 0.3 = 150
  });

  it("a net-loss year is taxed at zero", () => {
    setTxs([
      tx({ ticker: "AAA", side: "buy", quantity: 10, price: 100, txDate: "2024-01-01" }),
      tx({ ticker: "AAA", side: "sell", quantity: 10, price: 70, txDate: "2024-06-01" }),
    ]);
    const r = computeStockTax();
    expect(r.net).toBeCloseTo(-300, 2);
    expect(r.pfuEstimate).toBeCloseTo(0, 2);
  });
});
