/**
 * Display currency. Amounts are stored and computed in EUR everywhere;
 * the UI can render them in another currency at today's FX rate.
 * The CurrencyProvider remounts the tree when this changes.
 */
export const DISPLAY_CURRENCIES = ["EUR", "USD", "GBP", "CHF"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

let displayCurrency: DisplayCurrency = "EUR";
let displayRate = 1; // EUR -> display currency

let MONEY = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
let MONEY_PRECISE = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 6,
});

export function setDisplayCurrency(currency: DisplayCurrency, rate: number): void {
  displayCurrency = currency;
  displayRate = rate > 0 ? rate : 1;
  MONEY = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
  MONEY_PRECISE = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 6,
  });
}

export function getDisplayCurrency(): DisplayCurrency {
  return displayCurrency;
}

/** Convert an EUR amount to the display currency (for chart axes etc.). */
export function cvtMoney(v: number): number {
  return v * displayRate;
}

const NUM = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 });

/** Format an EUR amount in the user's display currency. */
export function fmtEur(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const c = v * displayRate;
  // Small unit prices (e.g. meme coins) need more precision.
  if (c !== 0 && Math.abs(c) < 0.01) return MONEY_PRECISE.format(c);
  return MONEY.format(c);
}

const EUR_FIXED = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

/** Always EUR, whatever the display currency — French tax stays in euros. */
export function fmtEurFixed(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return EUR_FIXED.format(v);
}

export function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return NUM.format(v);
}

export function fmtQty(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 8 }).format(v);
}

export function fmtPct(v: number | null | undefined, signed = true): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const sign = signed && v > 0 ? "+" : "";
  return `${sign}${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Compact relative age, e.g. "à l'instant", "il y a 3 min", "il y a 2 h". */
export function fmtRelativeAge(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "à l'instant";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

/** Minutes since the given timestamp (Infinity if missing/invalid). */
export function ageMinutes(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isNaN(ms) ? Infinity : Math.max(0, ms) / 60000;
}
