# Simulateur DCA + Liberté financière (PEA) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a DCA projection simulator to the PEA page that projects contributions across ETFs over 3 months → 40 years, with a pessimistic/expected/optimistic band, a "test an ETF" marginal-impact block, and a "financial freedom" layer (passive-income target → freedom date).

**Architecture:** A pure calculation module (`projection.ts`, unit-tested with vitest) does all the math client-side. A new `ProjectionChart` (recharts, same patterns as `charts.tsx`) draws the band + curves. A new section component `pea-projection.tsx` holds the inputs and results, persists its config through the existing `/api/settings` KV (key `pea.sim`), and is rendered at the bottom of the existing PEA page. No new API route.

**Tech Stack:** Next.js 16 (client components), React 19, TypeScript, recharts 3.8, vitest (new devDep, math only), existing Atlas UI kit + i18n + `usePortfolio`.

> **Project rule (`atlas/AGENTS.md`):** "This is NOT the Next.js you know." Mirror the patterns already in `src/app/pea/page.tsx`, `src/components/charts.tsx`, `src/lib/format.ts`, and `src/lib/i18n.tsx` rather than training-data assumptions. When a step touches something Next-specific, copy the existing file's shape.

> **Data-safety rule (`feedback_live_db_testing`):** the dev DB holds the user's real PEA. This feature is read-only on portfolio data; it only writes the `pea.sim` settings key. Do not trigger destructive UI actions during browser verification.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `atlas/package.json` | add `vitest` devDep + `test` script | Modify |
| `atlas/src/lib/projection.ts` | pure DCA/FIRE math, all types | Create |
| `atlas/src/lib/projection.test.ts` | vitest unit tests for the math | Create |
| `atlas/src/lib/pea-presets.ts` | ETF presets + `defaultReturnForName` | Create |
| `atlas/src/components/charts.tsx` | add `ProjectionChart` | Modify (append) |
| `atlas/src/lib/i18n.tsx` | `pea.sim.*` keys (fr + en) | Modify |
| `atlas/src/components/pea-projection.tsx` | the section (inputs + results + persistence) | Create |
| `atlas/src/app/pea/page.tsx` | render `<PeaProjection />` | Modify |

---

## Task 1: Test tooling (vitest, math only)

**Files:** Modify `atlas/package.json`

- [ ] **Step 1: Install vitest**

Run (from `atlas/`):
```bash
npm install -D vitest
```
Expected: `vitest` added to devDependencies, no peer-dep errors.

- [ ] **Step 2: Add a `test` script**

In `atlas/package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Smoke test that the runner works**

Create `atlas/src/lib/projection.test.ts` with a temporary check:
```ts
import { describe, it, expect } from "vitest";

describe("vitest wiring", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 passing test. (This file is fleshed out in Task 2+.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/projection.test.ts
git commit -m "chore(test): add vitest for pure-logic unit tests"
```

---

## Task 2: `projectDca` core — types + future-value math (expected scenario)

**Files:** Create `atlas/src/lib/projection.ts` · Modify `atlas/src/lib/projection.test.ts`

- [ ] **Step 1: Write failing tests**

Replace `projection.test.ts` contents:
```ts
import { describe, it, expect } from "vitest";
import { projectDca, type SimConfig } from "./projection";

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
    const r = projectDca(cfg({ lines: [{ id: "a", ticker: "X", name: "X", monthly: 0, annualReturnPct: 7 }], startCapital: 1000 }));
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `projection.ts` has no exports yet.

- [ ] **Step 3: Implement `projection.ts` (minimal to pass)**

Create `atlas/src/lib/projection.ts`:
```ts
export interface SimLine {
  id: string;
  ticker: string;
  name: string;
  monthly: number;
  annualReturnPct: number;
}

export interface SimCandidate extends SimLine {
  included: boolean;
}

export interface SimConfig {
  startCapital: number;
  lines: SimLine[];
  candidate: SimCandidate | null;
  targetMonthlyIncome: number | null;
  withdrawalRatePct: number;
  currentAge: number | null;
}

export interface HorizonRow {
  months: number;
  invested: number;
  expected: number;
  low: number;
  high: number;
  passiveIncome: number;
}

export interface YearPoint {
  year: number;
  invested: number;
  expected: number;
  low: number;
  high: number;
  target: number | null;
}

export interface FreedomInfo {
  reached: boolean;
  months: number | null;
  year: number | null;
  age: number | null;
  capitalTarget: number | null;
}

export interface CandidateImpact {
  referenceMonths: number;
  valueDelta: number;
  gainDelta: number;
  extraInvested: number;
}

export interface ProjectionResult {
  yearly: YearPoint[];
  horizons: HorizonRow[];
  freedom: FreedomInfo | null;
  candidateImpact: CandidateImpact | null;
}

export const HORIZON_MONTHS = [3, 12, 60, 120, 240, 480] as const;
export const SCENARIO_DELTAS = { low: -3, expected: 0, high: 2 } as const;
const MAX_FREEDOM_MONTHS = 720;
const REFERENCE_MONTHS = 240;

function monthlyRate(annualPct: number): number {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

/** Future value of one line: initial `p` compounding + `monthly` contributed end-of-month. */
function lineValue(p: number, monthly: number, annualPct: number, n: number): number {
  const r = monthlyRate(annualPct);
  const growth = Math.pow(1 + r, n);
  const fvContrib = Math.abs(r) < 1e-9 ? monthly * n : monthly * ((growth - 1) / r);
  return p * growth + fvContrib;
}

function totalValue(config: SimConfig, n: number, delta: number, includeCandidate: boolean): number {
  const lines = config.lines;
  const totalMonthly = lines.reduce((s, l) => s + Math.max(0, l.monthly), 0);
  let total = 0;
  if (lines.length === 0) {
    total += config.startCapital; // no return assumption available → held flat
  } else {
    for (const l of lines) {
      const weight = totalMonthly > 0 ? Math.max(0, l.monthly) / totalMonthly : 1 / lines.length;
      total += lineValue(config.startCapital * weight, Math.max(0, l.monthly), l.annualReturnPct + delta, n);
    }
  }
  if (includeCandidate && config.candidate) {
    total += lineValue(0, Math.max(0, config.candidate.monthly), config.candidate.annualReturnPct + delta, n);
  }
  return total;
}

function investedAt(config: SimConfig, n: number, includeCandidate: boolean): number {
  const base = config.lines.reduce((s, l) => s + Math.max(0, l.monthly), 0);
  const cand = includeCandidate && config.candidate ? Math.max(0, config.candidate.monthly) : 0;
  return config.startCapital + (base + cand) * n;
}

export function projectDca(config: SimConfig, now: Date = new Date()): ProjectionResult {
  const includeCandidate = !!(config.candidate && config.candidate.included);
  const wr = config.withdrawalRatePct / 100;

  const horizons: HorizonRow[] = HORIZON_MONTHS.map((months) => {
    const expected = totalValue(config, months, SCENARIO_DELTAS.expected, includeCandidate);
    return {
      months,
      invested: investedAt(config, months, includeCandidate),
      expected,
      low: totalValue(config, months, SCENARIO_DELTAS.low, includeCandidate),
      high: totalValue(config, months, SCENARIO_DELTAS.high, includeCandidate),
      passiveIncome: wr > 0 ? (expected * wr) / 12 : 0,
    };
  });

  const capitalTarget =
    config.targetMonthlyIncome && config.targetMonthlyIncome > 0 && wr > 0
      ? (config.targetMonthlyIncome * 12) / wr
      : null;

  const yearly: YearPoint[] = [];
  for (let y = 0; y <= 40; y++) {
    const n = y * 12;
    yearly.push({
      year: y,
      invested: investedAt(config, n, includeCandidate),
      expected: totalValue(config, n, SCENARIO_DELTAS.expected, includeCandidate),
      low: totalValue(config, n, SCENARIO_DELTAS.low, includeCandidate),
      high: totalValue(config, n, SCENARIO_DELTAS.high, includeCandidate),
      target: capitalTarget,
    });
  }

  let freedom: FreedomInfo | null = null;
  if (capitalTarget !== null) {
    let months: number | null = null;
    for (let n = 1; n <= MAX_FREEDOM_MONTHS; n++) {
      if (totalValue(config, n, SCENARIO_DELTAS.expected, includeCandidate) >= capitalTarget) {
        months = n;
        break;
      }
    }
    if (months === null) {
      freedom = { reached: false, months: null, year: null, age: null, capitalTarget };
    } else {
      const d = new Date(now);
      d.setMonth(d.getMonth() + months);
      freedom = {
        reached: true,
        months,
        year: d.getFullYear(),
        age: config.currentAge !== null ? config.currentAge + Math.floor(months / 12) : null,
        capitalTarget,
      };
    }
  }

  let candidateImpact: CandidateImpact | null = null;
  if (config.candidate) {
    const withCand = totalValue(config, REFERENCE_MONTHS, SCENARIO_DELTAS.expected, true);
    const withoutCand = totalValue(config, REFERENCE_MONTHS, SCENARIO_DELTAS.expected, false);
    const extraInvested = Math.max(0, config.candidate.monthly) * REFERENCE_MONTHS;
    candidateImpact = {
      referenceMonths: REFERENCE_MONTHS,
      valueDelta: withCand - withoutCand,
      gainDelta: withCand - withoutCand - extraInvested,
      extraInvested,
    };
  }

  return { yearly, horizons, freedom, candidateImpact };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS (all Task 2 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/projection.ts src/lib/projection.test.ts
git commit -m "feat(pea): DCA projection core (future value, horizons, yearly series)"
```

---

## Task 3: Start capital split + candidate impact + freedom date (tests)

**Files:** Modify `atlas/src/lib/projection.test.ts`

The implementation from Task 2 already covers these; this task locks the behaviour with tests.

- [ ] **Step 1: Append tests**

Add to `projection.test.ts`:
```ts
describe("projectDca — start capital, candidate, freedom", () => {
  it("splits start capital across lines by contribution weight (0% → held)", () => {
    const r = projectDca(cfg({
      startCapital: 1000,
      lines: [
        { id: "a", ticker: "A", name: "A", monthly: 70, annualReturnPct: 0 },
        { id: "b", ticker: "B", name: "B", monthly: 30, annualReturnPct: 0 },
      ],
    }));
    const h12 = r.horizons.find((h) => h.months === 12)!;
    expect(h12.expected).toBeCloseTo(1000 + 100 * 12, 6);
    expect(h12.invested).toBeCloseTo(1000 + 100 * 12, 6);
  });

  it("candidate impact = value with − without, at 20-year reference", () => {
    const r = projectDca(cfg({
      candidate: { id: "c", ticker: "C", name: "C", monthly: 100, annualReturnPct: 0, included: false },
    }));
    expect(r.candidateImpact).not.toBeNull();
    expect(r.candidateImpact!.referenceMonths).toBe(240);
    expect(r.candidateImpact!.valueDelta).toBeCloseTo(100 * 240, 6);
    expect(r.candidateImpact!.extraInvested).toBeCloseTo(100 * 240, 6);
    expect(r.candidateImpact!.gainDelta).toBeCloseTo(0, 6);
  });

  it("included candidate is reflected in the main horizons total", () => {
    const withOut = projectDca(cfg({
      candidate: { id: "c", ticker: "C", name: "C", monthly: 100, annualReturnPct: 0, included: false },
    }));
    const withIn = projectDca(cfg({
      candidate: { id: "c", ticker: "C", name: "C", monthly: 100, annualReturnPct: 0, included: true },
    }));
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
    expect(r.freedom!.capitalTarget).toBeCloseTo(30000, 6); // 100 × 300
    expect(r.freedom!.reached).toBe(true);
    expect(r.freedom!.months).toBe(30); // 1000/mo at 0% crosses 30000 at month 30
    expect(r.freedom!.age).toBe(42); // 40 + floor(30/12)
  });

  it("freedom unreached returns reached:false", () => {
    const r = projectDca(cfg({
      lines: [{ id: "a", ticker: "A", name: "A", monthly: 10, annualReturnPct: 0 }],
      targetMonthlyIncome: 100000,
      withdrawalRatePct: 4,
    }));
    expect(r.freedom!.reached).toBe(false);
    expect(r.freedom!.months).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify pass**

Run: `npm test`
Expected: PASS (Task 2 impl already satisfies these). If any fail, fix `projection.ts` to match the assertions, not the tests.

- [ ] **Step 3: Commit**

```bash
git add src/lib/projection.test.ts
git commit -m "test(pea): lock start-capital split, candidate impact, freedom date"
```

---

## Task 4: ETF presets module

**Files:** Create `atlas/src/lib/pea-presets.ts` · Modify `atlas/src/lib/projection.test.ts`

- [ ] **Step 1: Write failing test**

Append to `projection.test.ts`:
```ts
import { defaultReturnForName } from "./pea-presets";

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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `pea-presets` module not found.

- [ ] **Step 3: Implement `pea-presets.ts`**

Create `atlas/src/lib/pea-presets.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pea-presets.ts src/lib/projection.test.ts
git commit -m "feat(pea): ETF presets + default-return heuristic"
```

---

## Task 5: `ProjectionChart` (recharts)

**Files:** Modify `atlas/src/components/charts.tsx`

- [ ] **Step 1: Extend the recharts import**

In `charts.tsx`, add `ReferenceLine` and `ReferenceDot` to the existing `from "recharts"` import block (keep the others):
```tsx
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
```

- [ ] **Step 2: Append `ProjectionChart` at the end of `charts.tsx`**

```tsx
// ── DCA projection (band low..high + expected + invested + freedom target) ──

export interface ProjectionPointView {
  year: number;
  invested: number;
  expected: number;
  low: number;
  high: number;
}

export function ProjectionChart({
  points,
  height = 260,
  target,
  freedomYear,
  labels,
}: {
  points: ProjectionPointView[];
  height?: number;
  target?: number | null;
  freedomYear?: number | null;
  labels: { expected: string; invested: string; band: string; target: string; freedom: string };
}) {
  const id = useId();
  const data = useMemo(
    () =>
      points.map((p) => ({
        year: p.year,
        expected: p.expected,
        invested: p.invested,
        band: [p.low, p.high] as [number, number],
      })),
    [points],
  );
  if (data.length < 2) {
    return <div className="py-12 text-center text-sm text-muted">—</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id={`pj-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
        <XAxis
          dataKey="year"
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickFormatter={(y: number) => `${y} an${y > 1 ? "s" : ""}`}
          axisLine={false}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickFormatter={(v: number) => `${Math.round(cvtMoney(v) / 100) / 10}k`}
          axisLine={false}
          tickLine={false}
          width={46}
          domain={["auto", "auto"]}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as
              | { expected: number; invested: number; band: [number, number] }
              | undefined;
            if (!row) return null;
            return (
              <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-xl">
                <div className="mb-1 font-medium text-muted">{`${label} ans`}</div>
                <div className="tnum font-semibold text-accent">
                  {labels.expected} : {fmtEur(row.expected)}
                </div>
                <div className="tnum text-muted">
                  {labels.band} : {fmtEur(row.band[0])} – {fmtEur(row.band[1])}
                </div>
                <div className="tnum text-muted">
                  {labels.invested} : {fmtEur(row.invested)}
                </div>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="band"
          stroke="none"
          fill={`url(#pj-${id})`}
          isAnimationActive
          animationDuration={700}
        />
        <Line
          type="monotone"
          dataKey="invested"
          stroke="var(--muted)"
          strokeWidth={1.2}
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="expected"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={false}
          isAnimationActive
          animationDuration={700}
        />
        {target ? (
          <ReferenceLine
            y={target}
            stroke="var(--accent-2)"
            strokeDasharray="5 4"
            label={{ value: labels.target, position: "insideTopLeft", fill: "var(--accent-2)", fontSize: 11 }}
          />
        ) : null}
        {target && freedomYear != null ? (
          <ReferenceDot x={freedomYear} y={target} r={4} fill="var(--accent-2)" stroke="var(--surface)" />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `charts.tsx`. (Browser rendering is verified in Task 8.)

- [ ] **Step 4: Commit**

```bash
git add src/components/charts.tsx
git commit -m "feat(pea): ProjectionChart (band + expected + invested + freedom target)"
```

---

## Task 6: i18n keys

**Files:** Modify `atlas/src/lib/i18n.tsx`

- [ ] **Step 1: Add French keys**

In the `fr` object, right after the existing `"pea.saved": …` line, insert:
```ts
  // PEA — simulateur DCA
  "pea.sim.title": "Simulateur DCA",
  "pea.sim.subtitle": "Projette tes versements et visualise ta liberté financière à long terme",
  "pea.sim.startCapital": "Capital de départ",
  "pea.sim.startCapitalHint": "Pré-rempli avec la valeur de ton PEA. Mets 0 pour repartir de zéro.",
  "pea.sim.fromPea": "Depuis mon PEA",
  "pea.sim.addEtf": "Ajouter un ETF",
  "pea.sim.monthly": "€/mois",
  "pea.sim.annual": "%/an",
  "pea.sim.budget": "Budget mensuel",
  "pea.sim.emptyHint": "Ajoute au moins un ETF pour lancer la simulation.",
  "pea.sim.testEtf": "Tester un ETF",
  "pea.sim.testEtfHint": "Pose un ETF candidat et vois son impact, sans toucher à ton plan.",
  "pea.sim.include": "Inclure",
  "pea.sim.remove": "Retirer",
  "pea.sim.objective": "Objectif liberté",
  "pea.sim.targetIncome": "Revenu passif visé (€/mois)",
  "pea.sim.withdrawalRate": "Taux de retrait (%)",
  "pea.sim.age": "Âge actuel (optionnel)",
  "pea.sim.capitalTarget": "Capital-cible",
  "pea.sim.expected": "Attendu",
  "pea.sim.band": "Fourchette",
  "pea.sim.invested": "Total versé",
  "pea.sim.headline": "Dans {years} ans",
  "pea.sim.headlineGain": "dont ≈ {gain} de plus-value",
  "pea.sim.horizon": "Horizon",
  "pea.sim.value": "Valeur estimée",
  "pea.sim.gain": "Plus-value",
  "pea.sim.rente": "Rente/mois",
  "pea.sim.freedomTitle": "Date de liberté",
  "pea.sim.freedomReached": "Objectif atteint vers {year}",
  "pea.sim.freedomReachedAge": "Objectif atteint vers {year}, à tes {age} ans",
  "pea.sim.freedomNotReached": "Objectif non atteint dans l'horizon simulé — augmente le versement ou la durée.",
  "pea.sim.freedomSetTarget": "Renseigne un revenu passif visé pour estimer ta date de liberté.",
  "pea.sim.freedomPassive": "Revenu passif estimé à cette date",
  "pea.sim.impact": "Impact de l'ETF testé",
  "pea.sim.impactExcluded": "(non inclus dans ton plan actuel)",
  "pea.sim.impactNote": "Écart lié à l'hypothèse de rendement que tu saisis.",
  "pea.sim.disclaimer":
    "Estimations à titre indicatif, basées sur des hypothèses de rendement que tu choisis. Les performances passées ne préjugent pas des performances futures. Ceci n'est pas un conseil en investissement.",
```

- [ ] **Step 2: Add English keys**

In the `en` object, after its `"pea.saved": …` line, insert the same keys with English values:
```ts
  // PEA — DCA simulator
  "pea.sim.title": "DCA simulator",
  "pea.sim.subtitle": "Project your contributions and picture long-term financial freedom",
  "pea.sim.startCapital": "Starting capital",
  "pea.sim.startCapitalHint": "Pre-filled with your PEA value. Set 0 to start from scratch.",
  "pea.sim.fromPea": "From my PEA",
  "pea.sim.addEtf": "Add an ETF",
  "pea.sim.monthly": "€/mo",
  "pea.sim.annual": "%/yr",
  "pea.sim.budget": "Monthly budget",
  "pea.sim.emptyHint": "Add at least one ETF to run the simulation.",
  "pea.sim.testEtf": "Test an ETF",
  "pea.sim.testEtfHint": "Drop in a candidate ETF and see its impact, without touching your plan.",
  "pea.sim.include": "Include",
  "pea.sim.remove": "Remove",
  "pea.sim.objective": "Freedom goal",
  "pea.sim.targetIncome": "Target passive income (€/mo)",
  "pea.sim.withdrawalRate": "Withdrawal rate (%)",
  "pea.sim.age": "Current age (optional)",
  "pea.sim.capitalTarget": "Target capital",
  "pea.sim.expected": "Expected",
  "pea.sim.band": "Range",
  "pea.sim.invested": "Total invested",
  "pea.sim.headline": "In {years} years",
  "pea.sim.headlineGain": "of which ≈ {gain} capital gain",
  "pea.sim.horizon": "Horizon",
  "pea.sim.value": "Estimated value",
  "pea.sim.gain": "Capital gain",
  "pea.sim.rente": "Income/mo",
  "pea.sim.freedomTitle": "Freedom date",
  "pea.sim.freedomReached": "Goal reached around {year}",
  "pea.sim.freedomReachedAge": "Goal reached around {year}, at age {age}",
  "pea.sim.freedomNotReached": "Goal not reached within the simulated horizon — raise the contribution or duration.",
  "pea.sim.freedomSetTarget": "Set a target passive income to estimate your freedom date.",
  "pea.sim.freedomPassive": "Estimated passive income at that date",
  "pea.sim.impact": "Tested ETF impact",
  "pea.sim.impactExcluded": "(not included in your current plan)",
  "pea.sim.impactNote": "The gap reflects the return assumption you enter.",
  "pea.sim.disclaimer":
    "Indicative estimates, based on return assumptions you choose. Past performance does not guarantee future results. This is not investment advice.",
```

- [ ] **Step 3: Verify `t()` interpolation supports `{var}`**

Read `src/lib/i18n.tsx` and confirm the `t(key, vars)` implementation replaces `{name}` tokens. If it does not support interpolation, do the substitution in the component instead (Task 7) with `.replace()`. Note which path applies.

- [ ] **Step 4: Typecheck & commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/lib/i18n.tsx
git commit -m "i18n(pea): DCA simulator strings (fr + en)"
```

---

## Task 7: `PeaProjection` section component

**Files:** Create `atlas/src/components/pea-projection.tsx`

This component owns: state, seed defaults, load/persist through `/api/settings` (`pea.sim`), and the full inputs + results UI. It follows the patterns in `pea/page.tsx` (same imports, `usePortfolio`, `useApi`, `postJson`, `fmtEur`/`fmtPct`, UI kit, `cn`).

- [ ] **Step 1: Create the file**

Create `atlas/src/components/pea-projection.tsx`:
```tsx
"use client";

import { Flag, FlaskConical, LineChart, Plus, Target, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePortfolio } from "@/components/portfolio-context";
import { ProjectionChart } from "@/components/charts";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { fmtEur, fmtPct } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { defaultReturnForName, ETF_PRESETS } from "@/lib/pea-presets";
import { projectDca, type SimConfig, type SimLine } from "@/lib/projection";
import { postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const SETTINGS_KEY = "pea.sim";
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

interface SettingsPayload {
  settings: Record<string, { value: string }>;
}

function defaultConfig(): SimConfig {
  return {
    startCapital: 0,
    lines: [
      { id: uid(), ticker: "WPEA", name: "MSCI World", monthly: 70, annualReturnPct: 7 },
      { id: uid(), ticker: "PAEEM", name: "Marchés Émergents", monthly: 30, annualReturnPct: 7 },
    ],
    candidate: null,
    targetMonthlyIncome: 1500,
    withdrawalRatePct: 4,
    currentAge: null,
  };
}

function money(s: string): number {
  const n = parseFloat(s.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function PeaProjection() {
  const { t } = useI18n();
  const { data: pf } = usePortfolio();
  const settingsApi = useApi<SettingsPayload>("/api/settings");

  const [config, setConfig] = useState<SimConfig | null>(null);
  const seeded = useRef(false);
  const dirty = useRef(false);

  const peaViews = useMemo(() => (pf?.views ?? []).filter((v) => v.account === "pea"), [pf]);
  const peaValue = useMemo(() => peaViews.reduce((s, v) => s + (v.value ?? 0), 0), [peaViews]);

  // Seed once, when settings have loaded: saved config wins, else defaults with PEA value.
  useEffect(() => {
    if (seeded.current || !settingsApi.data) return;
    seeded.current = true;
    const raw = settingsApi.data.settings[SETTINGS_KEY]?.value;
    if (raw) {
      try {
        setConfig(JSON.parse(raw) as SimConfig);
        return;
      } catch {
        /* fall through to defaults */
      }
    }
    const base = defaultConfig();
    base.startCapital = Math.round(peaValue);
    setConfig(base);
  }, [settingsApi.data, peaValue]);

  // Debounced autosave after the first user edit.
  useEffect(() => {
    if (!config || !dirty.current) return;
    const h = setTimeout(() => {
      postJson("/api/settings", { updates: { [SETTINGS_KEY]: JSON.stringify(config) } }).catch(() => {});
    }, 700);
    return () => clearTimeout(h);
  }, [config]);

  const update = (patch: Partial<SimConfig>) => {
    dirty.current = true;
    setConfig((c) => (c ? { ...c, ...patch } : c));
  };
  const patchLine = (id: string, patch: Partial<SimLine>) =>
    update({ lines: (config?.lines ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const addLine = (preset?: { ticker: string; name: string; annualReturnPct: number }) =>
    update({
      lines: [
        ...(config?.lines ?? []),
        {
          id: uid(),
          ticker: preset?.ticker ?? "",
          name: preset?.name ?? "ETF",
          monthly: 0,
          annualReturnPct: preset?.annualReturnPct ?? 7,
        },
      ],
    });
  const removeLine = (id: string) => update({ lines: (config?.lines ?? []).filter((l) => l.id !== id) });

  const fromPea = () => {
    if (!peaViews.length) return;
    const total = peaValue || 1;
    update({
      startCapital: Math.round(peaValue),
      lines: peaViews.map((v) => ({
        id: uid(),
        ticker: v.ticker,
        name: v.name ?? v.ticker,
        monthly: Math.round((100 * (v.value ?? 0)) / total),
        annualReturnPct: defaultReturnForName(v.name ?? v.ticker),
      })),
    });
  };

  const result = useMemo(() => (config ? projectDca(config) : null), [config]);

  if (!config || !result) {
    return <Card className="fade-up h-72 animate-pulse" />;
  }

  const budget =
    config.lines.reduce((s, l) => s + Math.max(0, l.monthly), 0) +
    (config.candidate?.included ? Math.max(0, config.candidate.monthly) : 0);
  const h20 = result.horizons.find((h) => h.months === 240)!;

  return (
    <Card className="fade-up">
      <CardHeader title={t("pea.sim.title")} subtitle={t("pea.sim.subtitle")} />
      <div className="grid gap-5 px-5 pb-5 pt-3 lg:grid-cols-2">
        {/* ---- Inputs ---- */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-muted">{t("pea.sim.startCapital")}</label>
            <input
              inputMode="decimal"
              value={config.startCapital}
              onChange={(e) => update({ startCapital: money(e.target.value) })}
              className="tnum w-28 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-right text-sm"
            />
          </div>
          <p className="-mt-2 text-[11px] text-muted">{t("pea.sim.startCapitalHint")}</p>

          <div className="flex flex-col gap-2">
            {config.lines.map((l) => (
              <LineRow
                key={l.id}
                line={l}
                monthlyLabel={t("pea.sim.monthly")}
                annualLabel={t("pea.sim.annual")}
                onChange={(p) => patchLine(l.id, p)}
                onRemove={() => removeLine(l.id)}
              />
            ))}
            {!config.lines.length ? (
              <p className="py-4 text-center text-sm text-muted">{t("pea.sim.emptyHint")}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {peaViews.length ? (
              <Chip onClick={fromPea} strong>
                {t("pea.sim.fromPea")}
              </Chip>
            ) : null}
            {ETF_PRESETS.map((p) => (
              <Chip key={p.ticker} onClick={() => addLine(p)}>
                + {p.name.replace(/^.*PEA\s*/i, "").split(" ").slice(0, 2).join(" ") || p.ticker}
              </Chip>
            ))}
            <Chip onClick={() => addLine()}>
              <Plus className="h-3 w-3" /> {t("pea.sim.addEtf")}
            </Chip>
          </div>

          <div className="flex justify-end text-sm">
            <span className="text-muted">
              {t("pea.sim.budget")} : <span className="tnum font-semibold text-foreground">{fmtEur(budget)}</span>
            </span>
          </div>

          {/* Candidate */}
          <CandidateBlock
            candidate={config.candidate}
            labels={{
              title: t("pea.sim.testEtf"),
              hint: t("pea.sim.testEtfHint"),
              include: t("pea.sim.include"),
              monthly: t("pea.sim.monthly"),
              annual: t("pea.sim.annual"),
              add: t("pea.sim.addEtf"),
              remove: t("pea.sim.remove"),
            }}
            onChange={(candidate) => update({ candidate })}
          />

          {/* Objective */}
          <div className="rounded-xl border border-border/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4 text-accent-2" /> {t("pea.sim.objective")}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field3 label={t("pea.sim.targetIncome")}>
                <input
                  inputMode="decimal"
                  value={config.targetMonthlyIncome ?? ""}
                  onChange={(e) =>
                    update({ targetMonthlyIncome: e.target.value ? money(e.target.value) : null })
                  }
                  className="tnum w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-right text-sm"
                />
              </Field3>
              <Field3 label={t("pea.sim.withdrawalRate")}>
                <input
                  inputMode="decimal"
                  value={config.withdrawalRatePct}
                  onChange={(e) => update({ withdrawalRatePct: money(e.target.value) })}
                  className="tnum w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-right text-sm"
                />
              </Field3>
              <Field3 label={t("pea.sim.age")}>
                <input
                  inputMode="numeric"
                  value={config.currentAge ?? ""}
                  onChange={(e) => update({ currentAge: e.target.value ? Math.round(money(e.target.value)) : null })}
                  className="tnum w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-right text-sm"
                />
              </Field3>
            </div>
            {result.freedom?.capitalTarget ? (
              <p className="mt-2 text-[11px] text-muted">
                {t("pea.sim.capitalTarget")} : <span className="tnum">{fmtEur(result.freedom.capitalTarget)}</span>
              </p>
            ) : null}
          </div>
        </div>

        {/* ---- Results ---- */}
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted">{t("pea.sim.headline").replace("{years}", "20")}</span>
              <span className="tnum text-2xl font-bold">≈ {fmtEur(h20.expected)}</span>
            </div>
            <p className="text-xs text-muted">
              {t("pea.sim.headlineGain").replace("{gain}", fmtEur(h20.expected - h20.invested))} ·{" "}
              {t("pea.sim.invested")} : {fmtEur(h20.invested)}
            </p>
          </div>

          <ProjectionChart
            points={result.yearly}
            target={result.freedom?.capitalTarget ?? null}
            freedomYear={result.freedom?.reached && result.freedom.months != null ? result.freedom.months / 12 : null}
            labels={{
              expected: t("pea.sim.expected"),
              invested: t("pea.sim.invested"),
              band: t("pea.sim.band"),
              target: t("pea.sim.capitalTarget"),
              freedom: t("pea.sim.freedomTitle"),
            }}
          />

          <FreedomCard result={result} t={t} />

          {/* Horizons table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="py-2 pr-2 font-medium">{t("pea.sim.horizon")}</th>
                  <th className="py-2 px-2 text-right font-medium">{t("pea.sim.invested")}</th>
                  <th className="py-2 px-2 text-right font-medium">{t("pea.sim.value")}</th>
                  <th className="py-2 px-2 text-right font-medium">{t("pea.sim.gain")}</th>
                  <th className="py-2 pl-2 text-right font-medium">{t("pea.sim.rente")}</th>
                </tr>
              </thead>
              <tbody>
                {result.horizons.map((h) => {
                  const gain = h.expected - h.invested;
                  const pct = h.invested > 0 ? (gain / h.invested) * 100 : null;
                  return (
                    <tr key={h.months} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-2">{h.months < 12 ? `${h.months} mois` : `${h.months / 12} ans`}</td>
                      <td className="tnum py-2 px-2 text-right text-muted">{fmtEur(h.invested)}</td>
                      <td className="tnum py-2 px-2 text-right font-medium">
                        {fmtEur(h.expected)}
                        <span className="block text-[10px] font-normal text-muted">
                          {fmtEur(h.low)}–{fmtEur(h.high)}
                        </span>
                      </td>
                      <td className={cn("tnum py-2 px-2 text-right", gain >= 0 ? "text-accent" : "text-danger")}>
                        {fmtEur(gain)}
                        {pct !== null ? <span className="block text-[10px] text-muted">{fmtPct(pct)}</span> : null}
                      </td>
                      <td className="tnum py-2 pl-2 text-right text-muted">{fmtEur(h.passiveIncome)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {result.candidateImpact && config.candidate ? (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-2/40 p-3 text-xs leading-relaxed">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-accent-2" />
              <span className="text-muted">
                <span className="font-medium text-foreground">{t("pea.sim.impact")}</span>
                {!config.candidate.included ? ` ${t("pea.sim.impactExcluded")}` : ""} :{" "}
                <span className="text-foreground">
                  ≈ +{fmtEur(result.candidateImpact.valueDelta)} à 20 ans
                </span>{" "}
                (dont ≈ +{fmtEur(result.candidateImpact.gainDelta)} de plus-value), pour{" "}
                {fmtEur(result.candidateImpact.extraInvested)} versés de plus. {t("pea.sim.impactNote")}
              </span>
            </div>
          ) : null}

          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted/70">
            <LineChart className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("pea.sim.disclaimer")}
          </p>
        </div>
      </div>
    </Card>
  );
}

function LineRow({
  line,
  monthlyLabel,
  annualLabel,
  onChange,
  onRemove,
}: {
  line: SimLine;
  monthlyLabel: string;
  annualLabel: string;
  onChange: (p: Partial<SimLine>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-xs font-bold">{line.ticker || "—"}</span>
        <span className="block truncate text-[11px] text-muted">{line.name}</span>
      </span>
      <NumBox value={line.monthly} suffix={monthlyLabel} onChange={(n) => onChange({ monthly: n })} />
      <NumBox value={line.annualReturnPct} suffix={annualLabel} onChange={(n) => onChange({ annualReturnPct: n })} />
      <button aria-label="remove" onClick={onRemove} className="text-muted transition-colors hover:text-danger">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function NumBox({ value, suffix, onChange }: { value: number; suffix: string; onChange: (n: number) => void }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm">
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value.replace(",", "."));
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className="tnum w-12 bg-transparent text-right outline-none"
      />
      <span className="ml-0.5 text-[10px] text-muted">{suffix}</span>
    </span>
  );
}

function CandidateBlock({
  candidate,
  labels,
  onChange,
}: {
  candidate: SimConfig["candidate"];
  labels: { title: string; hint: string; include: string; monthly: string; annual: string; add: string; remove: string };
  onChange: (c: SimConfig["candidate"]) => void;
}) {
  return (
    <div className="rounded-xl border border-accent/25 bg-accent/[0.05] p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-accent">
          <FlaskConical className="h-4 w-4" /> {labels.title}
        </span>
        {candidate ? (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={candidate.included}
              onChange={(e) => onChange({ ...candidate, included: e.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            {labels.include}
          </label>
        ) : null}
      </div>
      {candidate ? (
        <div className="flex items-center gap-2">
          <input
            value={candidate.name}
            onChange={(e) => onChange({ ...candidate, name: e.target.value })}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm"
          />
          <NumBox value={candidate.monthly} suffix={labels.monthly} onChange={(n) => onChange({ ...candidate, monthly: n })} />
          <NumBox
            value={candidate.annualReturnPct}
            suffix={labels.annual}
            onChange={(n) => onChange({ ...candidate, annualReturnPct: n })}
          />
          <button aria-label={labels.remove} onClick={() => onChange(null)} className="text-muted hover:text-danger">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted">{labels.hint}</p>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() =>
              onChange({ id: uid(), ticker: "", name: "Nasdaq 100", monthly: 20, annualReturnPct: 10, included: false })
            }
          >
            <Plus className="h-3.5 w-3.5" /> {labels.add}
          </Button>
        </div>
      )}
    </div>
  );
}

function FreedomCard({ result, t }: { result: NonNullable<ReturnType<typeof projectDca>>; t: (k: string, v?: Record<string, string | number>) => string }) {
  const f = result.freedom;
  if (!f || f.capitalTarget === null) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/60 p-3 text-sm text-muted">
        <Flag className="h-4 w-4 text-accent-2" /> {t("pea.sim.freedomSetTarget")}
      </div>
    );
  }
  const line = !f.reached
    ? t("pea.sim.freedomNotReached")
    : f.age != null
      ? t("pea.sim.freedomReachedAge").replace("{year}", String(f.year)).replace("{age}", String(f.age))
      : t("pea.sim.freedomReached").replace("{year}", String(f.year));
  const passive =
    f.reached && f.capitalTarget != null ? (f.capitalTarget * 0 + f.capitalTarget) : null; // capital at freedom ≈ target
  return (
    <div className="rounded-xl border border-accent-2/30 bg-accent-2/[0.06] p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Flag className="h-4 w-4 text-accent-2" /> {t("pea.sim.freedomTitle")}
      </div>
      <p className={cn("mt-1 text-sm", f.reached ? "text-foreground" : "text-muted")}>{line}</p>
      {passive != null ? (
        <p className="mt-1 text-[11px] text-muted">
          {t("pea.sim.freedomPassive")} : <span className="tnum">{fmtEur(passive * (result.horizons[0] ? 1 : 1))}</span>
        </p>
      ) : null}
    </div>
  );
}

function Chip({ children, onClick, strong }: { children: React.ReactNode; onClick: () => void; strong?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition-colors",
        strong ? "border-accent/40 text-foreground hover:border-accent" : "border-border text-muted hover:border-accent/40",
      )}
    >
      {children}
    </button>
  );
}

function Field3({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] leading-tight text-muted">{label}</span>
      {children}
    </label>
  );
}
```

> Note: the `FreedomCard` passive-income line above is a placeholder-free simplification — at the freedom date the capital ≈ the target, whose passive income ≈ the user's `targetMonthlyIncome`. In Step 2 replace the `passive` computation with the clean value (see fix below) so the displayed number is exactly the target income.

- [ ] **Step 2: Fix the freedom passive-income line to show the target income cleanly**

Replace the `passive` block inside `FreedomCard` with a direct read of the target income (capital-at-freedom × withdrawal ÷ 12 == the target income by construction). Change `FreedomCard` to also receive `targetIncome`:

In `PeaProjection`, pass it:
```tsx
<FreedomCard result={result} targetIncome={config.targetMonthlyIncome} t={t} />
```
And update `FreedomCard`:
```tsx
function FreedomCard({
  result,
  targetIncome,
  t,
}: {
  result: NonNullable<ReturnType<typeof projectDca>>;
  targetIncome: number | null;
  t: (k: string) => string;
}) {
  const f = result.freedom;
  if (!f || f.capitalTarget === null) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/60 p-3 text-sm text-muted">
        <Flag className="h-4 w-4 text-accent-2" /> {t("pea.sim.freedomSetTarget")}
      </div>
    );
  }
  const line = !f.reached
    ? t("pea.sim.freedomNotReached")
    : f.age != null
      ? t("pea.sim.freedomReachedAge").replace("{year}", String(f.year)).replace("{age}", String(f.age))
      : t("pea.sim.freedomReached").replace("{year}", String(f.year));
  return (
    <div className="rounded-xl border border-accent-2/30 bg-accent-2/[0.06] p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Flag className="h-4 w-4 text-accent-2" /> {t("pea.sim.freedomTitle")}
      </div>
      <p className={cn("mt-1 text-sm", f.reached ? "text-foreground" : "text-muted")}>{line}</p>
      {f.reached && targetIncome ? (
        <p className="mt-1 text-[11px] text-muted">
          {t("pea.sim.freedomPassive")} : <span className="tnum">{fmtEur(targetIncome)}/mois</span>
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. Fix any mismatch against the real signatures of `useApi`, `postJson`, `usePortfolio`, `Card`, `CardHeader`, `Button` by reading those source files and adjusting (do not change their APIs).

- [ ] **Step 4: Commit**

```bash
git add src/components/pea-projection.tsx
git commit -m "feat(pea): DCA simulator section (inputs, results, persistence)"
```

---

## Task 8: Wire into the PEA page + browser verification

**Files:** Modify `atlas/src/app/pea/page.tsx`

- [ ] **Step 1: Import and render the section**

At the top of `pea/page.tsx`, add the import:
```tsx
import { PeaProjection } from "@/components/pea-projection";
```
Then render it inside the page's root `<div className="flex flex-col gap-5">`, as the **last child** (after the `{initialLoading ? … : …}` block and before the two dialogs `<ManagePeaDialog … />`):
```tsx
      <PeaProjection />
```
The simulator shows for everyone (it does not depend on having PEA positions), so place it outside the `!peaViews.length` empty-state branch.

- [ ] **Step 2: Start the dev server (preview)**

Use preview_start with the dev server config (create `.claude/launch.json` with an entry running `npm run dev` on port 3000 in `atlas/` if none exists). Navigate to `/pea`.

- [ ] **Step 3: Verify — console/network/render**

- read_console_messages → no errors.
- read_page on `/pea` → the "Simulateur DCA" card renders with two seed lines, chart, table, freedom card, disclaimer.
- Change a monthly value and a return; confirm the chart, headline and table update.
- Add a preset chip, toggle the candidate "Inclure"; confirm the impact note and totals react.
- read_network_requests → a `POST /api/settings` fires ~700ms after edits (autosave). Reload `/pea`; confirm the edited config persisted.

- [ ] **Step 4: Responsive pass**

resize_window to 375px; confirm inputs stack, the table scrolls horizontally rather than overflowing the page, and nothing clips. Fix with the existing Atlas mobile patterns if needed.

- [ ] **Step 5: Screenshot proof + commit**

Take a screenshot for the user. Then:
```bash
git add src/app/pea/page.tsx
git commit -m "feat(pea): show DCA simulator on the PEA page"
```

---

## Self-review notes (author)

- **Spec coverage:** free ETF lines (Task 7), presets + from-PEA (Task 4/7), start capital pre-fill (Task 7), band/expected/optimistic (Task 2/5), horizons table + rente column (Task 7), test-an-ETF marginal impact (Task 3/7), freedom target + date + passive income (Task 3/7), persistence via `pea.sim` (Task 7), disclaimer + neutral impact wording (Task 6/7). All present.
- **Placeholder scan:** the only "placeholder" word appears in Task 7 Step 1's note, which is explicitly resolved in Step 2 (clean `targetIncome` read). No `TODO`/`TBD` left in code.
- **Type consistency:** `SimConfig`/`SimLine`/`ProjectionResult`/`projectDca` names match across Tasks 2–8. `ProjectionChart` prop `points: ProjectionPointView[]` is satisfied by `result.yearly` (`YearPoint` is structurally compatible: has `year`, `invested`, `expected`, `low`, `high`). Settings shape `{ settings: Record<string,{value:string}> }` matches `pea/page.tsx`.
- **Known verify-time risks:** (1) recharts range-`Area` via `band: [low, high]` — confirm it renders a filled band in the browser; if not, split into two stacked areas. (2) `t()` interpolation — Task 6 Step 3 checks whether `{var}` is supported; the component uses `.replace()` defensively regardless. (3) `useApi`/`postJson`/`usePortfolio` exact signatures — verified by `tsc` in Task 7 Step 3.
