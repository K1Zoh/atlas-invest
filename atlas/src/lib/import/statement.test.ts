import { describe, expect, it, vi } from "vitest";

// statement.ts imports the market layer for ticker/price resolution, which
// parseStatementText itself never touches — stub them so the import stays
// isolated (no yahoo-finance2, no DB).
vi.mock("../market", () => ({ getAssetHistory: vi.fn() }));
vi.mock("../market/yahoo", () => ({ searchStocks: vi.fn() }));
import { parseStatementText } from "./statement";

describe("parseStatementText", () => {
  it("keeps buy/sell orders and skips cash-echo lines", () => {
    const text = [
      "iShares MSCI World",
      "29/06/2024 · Ordre d'achat",
      "1 239,11 €",
      "Amundi Nasdaq",
      "30/06/2024 · Ordre de vente",
      "119,13 €",
      "Versement",
      "01/07/2024 · PEA",
      "593,14 €",
    ].join("\n");
    expect(parseStatementText(text)).toEqual([
      { name: "iShares MSCI World", date: "2024-06-29", side: "buy", kind: "trade", amount: 1239.11 },
      { name: "Amundi Nasdaq", date: "2024-06-30", side: "sell", kind: "trade", amount: 119.13 },
    ]);
  });

  it("parses word-month headers with an explicit year", () => {
    expect(parseStatementText("Foo\n5 janv. 2023 · Ordre d'achat\n50 €")).toEqual([
      { name: "Foo", date: "2023-01-05", side: "buy", kind: "trade", amount: 50 },
    ]);
  });

  it("uses the last name line before the date header", () => {
    const ops = parseStatementText("Old Name\nReal Name\n15/03/2024 · Achat\n10 €");
    expect(ops[0].name).toBe("Real Name");
  });
});
