import { getFxRateFromEur, getFxRateToEur } from "./yahoo";

const TTL_MS = 60 * 60 * 1000; // 1h

const cache = new Map<string, { rate: number; ts: number }>();
const fromEurCache = new Map<string, { rate: number; ts: number }>();

/** EUR -> CUR rate for the display-currency switcher. */
export async function rateFromEur(currency: string): Promise<number> {
  const cur = currency.toUpperCase();
  if (cur === "EUR") return 1;
  const hit = fromEurCache.get(cur);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.rate;
  const rate = await getFxRateFromEur(cur);
  fromEurCache.set(cur, { rate, ts: Date.now() });
  return rate;
}

/**
 * Convert an amount in `currency` to EUR.
 * Handles the LSE "GBp" (pence) quirk.
 */
export async function toEur(amount: number, currency: string): Promise<number> {
  const cur = currency.trim();
  if (!cur || cur.toUpperCase() === "EUR") return amount;

  // London Stock Exchange quotes in pence.
  if (cur === "GBp" || cur === "GBX") {
    return (amount / 100) * (await rateToEur("GBP"));
  }
  return amount * (await rateToEur(cur.toUpperCase()));
}

async function rateToEur(currency: string): Promise<number> {
  const hit = cache.get(currency);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.rate;
  const rate = await getFxRateToEur(currency);
  cache.set(currency, { rate, ts: Date.now() });
  return rate;
}
