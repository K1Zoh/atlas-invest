import { describe, expect, it } from "vitest";
import { Lot } from "./cost-basis";

describe("Lot — weighted-average cost basis (PRU)", () => {
  it("adds fees to the basis on a buy and averages across buys", () => {
    const lot = new Lot();
    lot.buy(10, 100, 5); // cost 1005
    lot.buy(10, 110, 5); // cost +1105 = 2110
    expect(lot.quantity).toBe(20);
    expect(lot.avgCost).toBeCloseTo(105.5, 9);
  });

  it("on a partial sell: PRU basis out, fees out of proceeds, basis reduced pro-rata", () => {
    const lot = new Lot();
    lot.buy(20, 105.5, 0); // cost 2110
    const sale = lot.sell(5, 130, 3);
    expect(sale).not.toBeNull();
    expect(sale!.sellQty).toBe(5);
    expect(sale!.pru).toBeCloseTo(105.5, 9);
    expect(sale!.proceeds).toBeCloseTo(647, 9); // 5×130 − 3
    expect(sale!.realized).toBeCloseTo(119.5, 9); // 647 − 105.5×5
    expect(lot.quantity).toBe(15);
    expect(lot.cost).toBeCloseTo(1582.5, 6);
  });

  it("caps the sale at holdings and returns null when empty", () => {
    const lot = new Lot();
    lot.buy(5, 100);
    expect(lot.sell(10, 120)!.sellQty).toBe(5);
    expect(lot.quantity).toBe(0);
    expect(lot.sell(1, 200)).toBeNull();
  });
});
