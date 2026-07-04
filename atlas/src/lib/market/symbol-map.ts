import { getDb } from "../db";

/**
 * Ticker → Yahoo symbol mappings. Broker exports (Trading 212, Revolut, PEA
 * brokers…) use bare codes that Yahoo often can't quote directly ("VUAA"
 * instead of "VUAA.DE"). Mappings come from three layers, later wins:
 *   1. built-in seed (ported from legacy, verified by hand),
 *   2. auto-resolved via Yahoo search (source 'auto'),
 *   3. manual overrides from Paramètres (source 'manual').
 * Layers 2 and 3 are persisted in the symbol_map table.
 */

export const BUILTIN_SYMBOL_MAP: Record<string, string> = {
  "10AP": "10AP.L",
  "6AQQ": "6AQQ.DE",
  XAMZ: "XAMZ.DU",
  L0CK: "L0CK.DE",
  EXSA: "EXSA.DE",
  "500USD.SW": "P500.PA",
  // Revolut bare codes -> Xetra EUR listings (verified).
  VUAA: "VUAA.DE",
  VWCG: "VWCG.DE",
  "36B5": "36B5.DE",
};

export interface SymbolMapping {
  ticker: string;
  yahooSymbol: string;
  name: string | null;
  source: "builtin" | "auto" | "manual";
  updatedAt: string | null;
}

interface Row {
  ticker: string;
  yahoo_symbol: string;
  name: string | null;
  source: string;
  updated_at: string;
}

// The map is read on every quote batch: cache it and invalidate on writes.
let cache: Map<string, string> | null = null;

export function invalidateSymbolCache(): void {
  cache = null;
}

/** Effective ticker → Yahoo symbol map (builtin + DB, DB wins). */
export function getSymbolOverrides(): Map<string, string> {
  if (cache) return cache;
  const map = new Map<string, string>(Object.entries(BUILTIN_SYMBOL_MAP));
  const rows = getDb().prepare("SELECT * FROM symbol_map").all() as Row[];
  for (const r of rows) map.set(r.ticker, r.yahoo_symbol);
  cache = map;
  return map;
}

export function listSymbolMappings(): SymbolMapping[] {
  const rows = getDb()
    .prepare("SELECT * FROM symbol_map ORDER BY ticker")
    .all() as Row[];
  const fromDb = new Set(rows.map((r) => r.ticker));
  const out: SymbolMapping[] = rows.map((r) => ({
    ticker: r.ticker,
    yahooSymbol: r.yahoo_symbol,
    name: r.name,
    source: r.source === "manual" ? "manual" : "auto",
    updatedAt: r.updated_at,
  }));
  for (const [ticker, yahooSymbol] of Object.entries(BUILTIN_SYMBOL_MAP)) {
    if (!fromDb.has(ticker)) {
      out.push({ ticker, yahooSymbol, name: null, source: "builtin", updatedAt: null });
    }
  }
  return out.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export function saveSymbolMapping(
  ticker: string,
  yahooSymbol: string,
  opts?: { name?: string | null; source?: "auto" | "manual" },
): void {
  getDb()
    .prepare(
      `INSERT INTO symbol_map (ticker, yahoo_symbol, name, source, updated_at)
       VALUES (@ticker, @yahooSymbol, @name, @source, datetime('now'))
       ON CONFLICT (ticker) DO UPDATE SET
         yahoo_symbol = excluded.yahoo_symbol,
         name = COALESCE(excluded.name, symbol_map.name),
         source = excluded.source,
         updated_at = excluded.updated_at`,
    )
    .run({
      ticker: ticker.toUpperCase().trim(),
      yahooSymbol: yahooSymbol.toUpperCase().trim(),
      name: opts?.name ?? null,
      source: opts?.source ?? "auto",
    });
  invalidateSymbolCache();
}

/** An auto mapping never overwrites a manual (or existing auto) one. */
export function saveSymbolMappingIfNew(
  ticker: string,
  yahooSymbol: string,
  name?: string | null,
): void {
  const existing = getDb()
    .prepare("SELECT ticker FROM symbol_map WHERE ticker = ?")
    .get(ticker.toUpperCase().trim());
  if (existing) return;
  saveSymbolMapping(ticker, yahooSymbol, { name, source: "auto" });
}

export function deleteSymbolMapping(ticker: string): void {
  getDb().prepare("DELETE FROM symbol_map WHERE ticker = ?").run(ticker.toUpperCase().trim());
  invalidateSymbolCache();
}
