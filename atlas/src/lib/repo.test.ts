import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Drive the real repo code path against a throwaway in-memory database. getDb is
// mocked; initSchema (the real one) builds the production DDL so the test can
// never drift from the real schema.
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn() };
});
import { getDb, initSchema } from "./db";
import { addTransaction, addTransactions, getPositions, listTransactions, totalRealizedPnl } from "./repo";

beforeEach(() => {
  const mem = new Database(":memory:");
  initSchema(mem);
  vi.mocked(getDb).mockReturnValue(mem);
});

describe("getPositions — average cost (PRU)", () => {
  it("aggregates buys and a partial sell into PRU, invested, realized P&L", () => {
    addTransactions([
      { ticker: "ACME", name: "Acme", assetClass: "stock", side: "buy", quantity: 10, price: 100, fees: 5, txDate: "2024-01-10" },
      { ticker: "ACME", name: "Acme", assetClass: "stock", side: "buy", quantity: 10, price: 110, fees: 5, txDate: "2024-02-10" },
      { ticker: "ACME", name: "Acme", assetClass: "stock", side: "sell", quantity: 5, price: 130, fees: 3, txDate: "2024-06-10" },
    ]);
    const positions = getPositions("stock");
    expect(positions).toHaveLength(1);
    const p = positions[0];
    expect(p.quantity).toBeCloseTo(15, 9);
    expect(p.invested).toBeCloseTo(1582.5, 6); // (1005 + 1105) × 15/20
    expect(p.avgCost).toBeCloseTo(105.5, 6);
    expect(p.realizedPnl).toBeCloseTo(119.5, 6); // (5×130 − 3) − 105.5×5
  });

  it("excludes fully-closed positions but keeps their realized P&L in the total", () => {
    addTransactions([
      { ticker: "GONE", name: "Gone", assetClass: "stock", side: "buy", quantity: 5, price: 100, txDate: "2024-01-10" },
      { ticker: "GONE", name: "Gone", assetClass: "stock", side: "sell", quantity: 5, price: 120, txDate: "2024-06-10" },
    ]);
    expect(getPositions("stock")).toHaveLength(0);
    expect(totalRealizedPnl("stock")).toBeCloseTo(100, 6); // 5×120 − 5×100
  });

  it("forces crypto transactions to carry no fiscal envelope, and uppercases the ticker", () => {
    addTransaction({
      ticker: "btc",
      name: "Bitcoin",
      assetClass: "crypto",
      side: "buy",
      quantity: 1,
      price: 10000,
      txDate: "2024-01-01",
      account: "pea",
    });
    const [t] = listTransactions({ assetClass: "crypto" });
    expect(t.ticker).toBe("BTC");
    expect(t.account).toBeNull();
  });
});
