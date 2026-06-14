import YahooFinance from "yahoo-finance2";
import type { HistoryPoint, SearchResult } from "../types";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

const STOCK_TYPES = new Set(["EQUITY", "ETF", "MUTUALFUND", "INDEX"]);

// Broker-specific codes (Trading 212 etc.) -> Yahoo symbols (ported from legacy).
const BROKER_TO_YF: Record<string, string> = {
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

function toYahooSymbol(ticker: string): string {
  return BROKER_TO_YF[ticker.toUpperCase()] ?? ticker.toUpperCase();
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

export async function getStockQuotes(symbols: string[]): Promise<Map<string, YahooQuote>> {
  const out = new Map<string, YahooQuote>();
  if (!symbols.length) return out;
  // Map broker codes to Yahoo symbols, remember how to map results back.
  const reverse = new Map<string, string>();
  for (const s of symbols) reverse.set(toYahooSymbol(s), s.toUpperCase());
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
    out.set(reverse.get(q.symbol.toUpperCase()) ?? q.symbol.toUpperCase(), {
      symbol: q.symbol,
      price: q.regularMarketPrice,
      currency: q.currency ?? "USD",
      changePct: q.regularMarketChangePercent ?? null,
      name: q.longName ?? q.shortName ?? null,
    });
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
