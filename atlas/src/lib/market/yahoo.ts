import YahooFinance from "yahoo-finance2";
import type { HistoryPoint, SearchResult } from "../types";
import { getSymbolOverrides, saveSymbolMappingIfNew } from "./symbol-map";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

const STOCK_TYPES = new Set(["EQUITY", "ETF", "MUTUALFUND", "INDEX"]);

function toYahooSymbol(ticker: string): string {
  const up = ticker.toUpperCase();
  return getSymbolOverrides().get(up) ?? up;
}

// ── Auto-resolution of unknown broker codes ──────────────────────────────────
// When Yahoo returns nothing for a ticker (ETF codes differ per broker), search
// Yahoo for it, prefer a European EUR listing, verify the candidate actually
// quotes, then persist the mapping so it never has to be resolved again.

const RESOLVE_RETRY_MS = 6 * 60 * 60 * 1000;
const resolveFailedAt = new Map<string, number>();

/** Exchanges we prefer for a EUR-based portfolio, best first. */
const PREFERRED_EXCHANGES = ["PAR", "GER", "FRA", "AMS", "MIL", "BRU", "LIS", "DUS", "STU", "EBS", "LSE"];

interface SearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
  exchDisp?: string;
  isYahooFinance?: boolean;
}

function scoreCandidate(ticker: string, c: SearchQuote): number {
  if (!c.isYahooFinance || !c.symbol || !STOCK_TYPES.has(c.quoteType ?? "")) return -1;
  const sym = c.symbol.toUpperCase();
  let score = 0;
  // Same root code on another venue ("VUAA.DE" for "VUAA") is the typical case.
  if (sym === ticker) score += 120;
  else if (sym.startsWith(`${ticker}.`)) score += 100;
  const exIdx = PREFERRED_EXCHANGES.indexOf(c.exchange ?? "");
  if (exIdx !== -1) score += 40 - exIdx * 2;
  return score;
}

async function resolveUnknownSymbol(ticker: string): Promise<{ symbol: string; name: string | null } | null> {
  const failed = resolveFailedAt.get(ticker);
  if (failed && Date.now() - failed < RESOLVE_RETRY_MS) return null;
  try {
    const res = (await yf.search(
      ticker,
      { quotesCount: 10, newsCount: 0 },
      { validateResult: false },
    )) as { quotes?: SearchQuote[] };
    let best: SearchQuote | null = null;
    let bestScore = 0;
    for (const c of res.quotes ?? []) {
      const s = scoreCandidate(ticker, c);
      if (s > bestScore) {
        best = c;
        bestScore = s;
      }
    }
    if (best?.symbol && best.symbol.toUpperCase() !== ticker) {
      return { symbol: best.symbol.toUpperCase(), name: best.longname ?? best.shortname ?? null };
    }
  } catch {
    // network hiccup: fall through and retry later
  }
  resolveFailedAt.set(ticker, Date.now());
  return null;
}

export async function searchStocks(query: string, max = 8): Promise<SearchResult[]> {
  const res = (await yf.search(
    query,
    { quotesCount: max + 4, newsCount: 0 },
    { validateResult: false },
  )) as { quotes?: unknown[] };
  const out: SearchResult[] = [];
  for (const q of res.quotes ?? []) {
    const item = q as {
      symbol?: string;
      shortname?: string;
      longname?: string;
      quoteType?: string;
      exchDisp?: string;
      isYahooFinance?: boolean;
    };
    if (!item.isYahooFinance || !item.symbol) continue;
    if (!STOCK_TYPES.has(item.quoteType ?? "")) continue;
    out.push({
      ticker: item.symbol,
      name: item.longname || item.shortname || item.symbol,
      assetClass: "stock",
      exchange: item.exchDisp ?? null,
      coingeckoId: null,
    });
    if (out.length >= max) break;
  }
  return out;
}

export interface YahooQuote {
  symbol: string;
  price: number;
  currency: string;
  changePct: number | null;
  name: string | null;
}

// Several broker codes can map to the same Yahoo symbol (same ETF held via two
// brokers), so the reverse map carries a list of originals per symbol.
async function quoteBatch(
  reverse: Map<string, string[]>,
  out: Map<string, YahooQuote>,
): Promise<void> {
  const res = await yf.quote(
    [...reverse.keys()],
    {
      fields: ["regularMarketPrice", "currency", "regularMarketChangePercent", "shortName", "longName"],
    },
    { validateResult: false },
  );
  const quotes = Array.isArray(res) ? res : [res];
  for (const q of quotes) {
    if (!q?.symbol || q.regularMarketPrice === undefined) continue;
    const quote: YahooQuote = {
      symbol: q.symbol,
      price: q.regularMarketPrice,
      currency: q.currency ?? "USD",
      changePct: q.regularMarketChangePercent ?? null,
      name: q.longName ?? q.shortName ?? null,
    };
    for (const original of reverse.get(q.symbol.toUpperCase()) ?? [q.symbol.toUpperCase()]) {
      out.set(original, quote);
    }
  }
}

const MAX_RESOLVE_PER_CALL = 6;

export async function getStockQuotes(symbols: string[]): Promise<Map<string, YahooQuote>> {
  const out = new Map<string, YahooQuote>();
  if (!symbols.length) return out;
  // Map broker codes to Yahoo symbols, remember how to map results back.
  const reverse = new Map<string, string[]>();
  for (const s of symbols) {
    const y = toYahooSymbol(s);
    reverse.set(y, [...(reverse.get(y) ?? []), s.toUpperCase()]);
  }
  await quoteBatch(reverse, out);

  // Second chance for tickers Yahoo doesn't know under their broker code:
  // search-resolve them, quote the candidates, persist what actually works.
  const missing = symbols.map((s) => s.toUpperCase()).filter((s) => !out.has(s));
  if (!missing.length) return out;

  const retry = new Map<string, string[]>(); // resolved yahoo symbol -> original tickers
  const resolvedNames = new Map<string, string | null>();
  for (const ticker of missing.slice(0, MAX_RESOLVE_PER_CALL)) {
    const hit = await resolveUnknownSymbol(ticker);
    if (hit) {
      retry.set(hit.symbol, [...(retry.get(hit.symbol) ?? []), ticker]);
      resolvedNames.set(ticker, hit.name);
    }
  }
  if (retry.size) {
    try {
      await quoteBatch(retry, out);
      for (const [symbol, tickers] of retry) {
        for (const ticker of tickers) {
          // Persist only mappings that produced a real quote.
          if (out.has(ticker)) saveSymbolMappingIfNew(ticker, symbol, resolvedNames.get(ticker));
        }
      }
    } catch {
      // resolution is best effort; the ticker stays "cours indisponible"
    }
  }
  return out;
}

export async function getStockHistory(symbol: string, days: number): Promise<HistoryPoint[]> {
  const period1 = new Date(Date.now() - days * 86_400_000);
  const res = (await yf.chart(
    toYahooSymbol(symbol),
    { period1, interval: "1d" },
    { validateResult: false },
  )) as { quotes?: { date: string | Date; close: number | null }[] };
  const points: HistoryPoint[] = [];
  for (const q of res.quotes ?? []) {
    if (q.close === null || q.close === undefined) continue;
    points.push({
      date: new Date(q.date).toISOString().slice(0, 10),
      value: q.close,
    });
  }
  return points;
}

/** FX rate EUR -> CUR via Yahoo (e.g. EURUSD=X). */
export async function getFxRateFromEur(currency: string): Promise<number> {
  const res = (await yf.quote(
    `EUR${currency.toUpperCase()}=X`,
    { fields: ["regularMarketPrice"] },
    { validateResult: false },
  )) as { regularMarketPrice?: number } | { regularMarketPrice?: number }[];
  const q = Array.isArray(res) ? res[0] : res;
  const rate = q?.regularMarketPrice;
  if (!rate || rate <= 0) throw new Error(`Taux de change introuvable pour ${currency}`);
  return rate;
}

/** Direct FX rate CUR -> EUR via Yahoo (e.g. USDEUR=X). */
export async function getFxRateToEur(currency: string): Promise<number> {
  const res = await yf.quote(
    `${currency.toUpperCase()}EUR=X`,
    { fields: ["regularMarketPrice"] },
    { validateResult: false },
  );
  const q = Array.isArray(res) ? res[0] : res;
  const rate = q?.regularMarketPrice;
  if (!rate || rate <= 0) throw new Error(`Taux de change introuvable pour ${currency}`);
  return rate;
}
