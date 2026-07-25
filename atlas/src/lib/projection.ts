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
