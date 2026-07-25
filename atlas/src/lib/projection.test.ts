import { describe, it, expect } from "vitest";
import { projectDca, type SimConfig } from "./projection";
import { defaultReturnForName } from "./pea-presets";

function cfg(over: Partial<SimConfig> = {}): SimConfig {
  return {
    startCapital: 0,
    lines: [{ id: "a", ticker: "X", name: "X", monthly: 100, annualReturnPct: 0 }],
    candidate: null,
    targetMonthlyIncome: null,
    withdrawalRatePct: 4,
    currentAge: null,
    ...over,
  };
}

describe("projectDca — contributions", () => {
  it("0% return: value equals contributions at each horizon", () => {
    const r = projectDca(cfg());
    const h12 = r.horizons.find((h) => h.months === 12)!;
    expect(h12.expected).toBeCloseTo(1200, 6);
    expect(h12.invested).toBeCloseTo(1200, 6);
  });

  it("7% return grows a lump sum exactly by the annual factor over 12 months", () => {
    const r = projectDca(
      cfg({
        lines: [{ id: "a", ticker: "X", name: "X", monthly: 0, annualReturnPct: 7 }],
        startCapital: 1000,
      }),
    );
    const h12 = r.horizons.find((h) => h.months === 12)!;
    expect(h12.expected).toBeCloseTo(1070, 4);
    expect(h12.invested).toBeCloseTo(1000, 6);
  });

  it("passive income = value × withdrawalRate / 12", () => {
    const r = projectDca(cfg());
    const h12 = r.horizons.find((h) => h.months === 12)!;
    expect(h12.passiveIncome).toBeCloseTo((1200 * 0.04) / 12, 6);
  });

  it("exposes 41 yearly points (0..40)", () => {
    const r = projectDca(cfg());
    expect(r.yearly).toHaveLength(41);
    expect(r.yearly[0].year).toBe(0);
    expect(r.yearly[40].year).toBe(40);
  });
});

describe("projectDca — start capital, candidate, freedom", () => {
  it("splits start capital across lines by contribution weight (0% → held)", () => {
    const r = projectDca(
      cfg({
        startCapital: 1000,
        lines: [
          { id: "a", ticker: "A", name: "A", monthly: 70, annualReturnPct: 0 },
          { id: "b", ticker: "B", name: "B", monthly: 30, annualReturnPct: 0 },
        ],
      }),
    );
    const h12 = r.horizons.find((h) => h.months === 12)!;
    expect(h12.expected).toBeCloseTo(1000 + 100 * 12, 6);
    expect(h12.invested).toBeCloseTo(1000 + 100 * 12, 6);
  });

  it("candidate impact = value with − without, at 20-year reference", () => {
    const r = projectDca(
      cfg({
        candidate: { id: "c", ticker: "C", name: "C", monthly: 100, annualReturnPct: 0, included: false },
      }),
    );
    expect(r.candidateImpact).not.toBeNull();
    expect(r.candidateImpact!.referenceMonths).toBe(240);
    expect(r.candidateImpact!.valueDelta).toBeCloseTo(100 * 240, 6);
    expect(r.candidateImpact!.extraInvested).toBeCloseTo(100 * 240, 6);
    expect(r.candidateImpact!.gainDelta).toBeCloseTo(0, 6);
  });

  it("included candidate is reflected in the main horizons total", () => {
    const withOut = projectDca(
      cfg({
        candidate: { id: "c", ticker: "C", name: "C", monthly: 100, annualReturnPct: 0, included: false },
      }),
    );
    const withIn = projectDca(
      cfg({
        candidate: { id: "c", ticker: "C", name: "C", monthly: 100, annualReturnPct: 0, included: true },
      }),
    );
    const h = (r: typeof withOut) => r.horizons.find((x) => x.months === 12)!.expected;
    expect(h(withIn) - h(withOut)).toBeCloseTo(1200, 6);
  });

  it("capital target from passive income (4% ⇒ ×300) and freedom month", () => {
    const r = projectDca(
      cfg({
        lines: [{ id: "a", ticker: "A", name: "A", monthly: 1000, annualReturnPct: 0 }],
        targetMonthlyIncome: 100,
        withdrawalRatePct: 4,
        currentAge: 40,
      }),
      new Date("2026-01-15T00:00:00Z"),
    );
    expect(r.freedom).not.toBeNull();
    expect(r.freedom!.capitalTarget).toBeCloseTo(30000, 6);
    expect(r.freedom!.reached).toBe(true);
    expect(r.freedom!.months).toBe(30);
    expect(r.freedom!.age).toBe(42);
  });

  it("freedom unreached returns reached:false", () => {
    const r = projectDca(
      cfg({
        lines: [{ id: "a", ticker: "A", name: "A", monthly: 10, annualReturnPct: 0 }],
        targetMonthlyIncome: 100000,
        withdrawalRatePct: 4,
      }),
    );
    expect(r.freedom!.reached).toBe(false);
    expect(r.freedom!.months).toBeNull();
  });
});

describe("defaultReturnForName", () => {
  it("maps well-known indices to their default", () => {
    expect(defaultReturnForName("iShares MSCI World Swap PEA")).toBe(7);
    expect(defaultReturnForName("Amundi PEA Nasdaq 100")).toBe(10);
    expect(defaultReturnForName("BNP S&P 500")).toBe(8);
    expect(defaultReturnForName("Amundi PEA Marchés Émergents ESG")).toBe(7);
    expect(defaultReturnForName("Amundi PEA Europe")).toBe(6);
    expect(defaultReturnForName("Some Unknown Fund")).toBe(7);
  });
});
