import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory DB via the real schema; stub the market layer so importing the
// module graph pulls in neither yahoo-finance2 nor the real database.
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn() };
});
vi.mock("./market", () => ({ getAssetHistory: vi.fn() }));
vi.mock("./market/yahoo", () => ({ searchStocks: vi.fn() }));
vi.mock("./market/coingecko", () => ({ resolveCoingeckoId: () => null }));

import { getDb, initSchema } from "./db";
import { previewImport } from "./importers";
import { addTransaction } from "./repo";

beforeEach(() => {
  const mem = new Database(":memory:");
  initSchema(mem);
  vi.mocked(getDb).mockReturnValue(mem);
});

const HEADER = "ticker,name,asset_class,side,quantity,price,fees,date,platform,account";
function csv(...rows: string[]): Buffer {
  return Buffer.from([HEADER, ...rows].join("\n"), "utf-8");
}

describe("previewImport — dedup (fingerprint alignment with repo)", () => {
  it("flags a row already present in the database as duplicate", () => {
    addTransaction({
      ticker: "ACME",
      name: "Acme",
      assetClass: "stock",
      side: "buy",
      quantity: 10,
      price: 100,
      fees: 0,
      txDate: "2024-01-15",
      account: "cto",
    });
    const res = previewImport(csv("ACME,Acme,stock,buy,10,100,0,2024-01-15,Test,CTO"), {
      exchange: "generic",
      assetClass: "stock",
    });
    expect(res.counts.duplicate).toBe(1);
    expect(res.rows[0].status).toBe("duplicate");
  });

  it("flags an unseen row as new", () => {
    const res = previewImport(csv("NVDA,Nvidia,stock,buy,2,500,0,2024-02-20,Test,CTO"), {
      exchange: "generic",
      assetClass: "stock",
    });
    expect(res.counts.new).toBe(1);
    expect(res.rows[0].status).toBe("new");
  });

  it("dedupes two identical rows within the same file", () => {
    const res = previewImport(
      csv(
        "TSLA,Tesla,stock,buy,1,200,0,2024-03-01,Test,CTO",
        "TSLA,Tesla,stock,buy,1,200,0,2024-03-01,Test,CTO",
      ),
      { exchange: "generic", assetClass: "stock" },
    );
    expect(res.counts.new).toBe(1);
    expect(res.counts.duplicate).toBe(1);
  });
});
