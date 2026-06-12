import { getDb } from "../db";
import type { AssetClass, HistoryPoint, Quote, SearchResult } from "../types";
import { getCryptoHistory, getCryptoMarkets, resolveCoingeckoId, searchCrypto } from "./coingecko";
import { toEur } from "./fx";
import { getStockHistory, getStockQuotes, searchStocks } from "./yahoo";

const QUOTE_TTL_MS = 5 * 60 * 1000; // 5 min
const HISTORY_TTL_MS = 30 * 60 * 1000; // 30 min

export interface AssetRef {
  ticker: string;
  assetClass: AssetClass;
  coingeckoId?: string | null;
}

const keyOf = (a: AssetRef) => `${a.assetClass}:${a.ticker.toUpperCase()}`;

interface PriceCacheRow {
  ticker: string;
  asset_class: AssetClass;
  price_eur: number;
  change_24h_pct: number | null;
  native_currency: string;
  native_price: number;
  spark_7d: string | null;
  updated_at: string;
}

function rowToQuote(r: PriceCacheRow): Quote {
  return {
    ticker: r.ticker,
    assetClass: r.asset_class,
    priceEur: r.price_eur,
    change24hPct: r.change_24h_pct,
    nativeCurrency: r.native_currency,
    nativePrice: r.native_price,
    spark7d: r.spark_7d ? (JSON.parse(r.spark_7d) as number[]) : null,
    updatedAt: r.updated_at,
  };
}

function readCache(assets: AssetRef[]): Map<string, Quote> {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM price_cache WHERE ticker = ? AND asset_class = ?",
  );
  const out = new Map<string, Quote>();
  for (const a of assets) {
    const row = stmt.get(a.ticker.toUpperCase(), a.assetClass) as PriceCacheRow | undefined;
    if (row) out.set(keyOf(a), rowToQuote(row));
  }
  return out;
}

function writeCache(q: Quote): void {
  getDb()
    .prepare(
      `INSERT INTO price_cache (ticker, asset_class, price_eur, change_24h_pct, native_currency, native_price, spark_7d, updated_at)
       VALUES (@ticker, @assetClass, @priceEur, @change24hPct, @nativeCurrency, @nativePrice, @spark7d, @updatedAt)
       ON CONFLICT (ticker, asset_class) DO UPDATE SET
         price_eur = excluded.price_eur,
         change_24h_pct = excluded.change_24h_pct,
         native_currency = excluded.native_currency,
         native_price = excluded.native_price,
         spark_7d = COALESCE(excluded.spark_7d, price_cache.spark_7d),
         updated_at = excluded.updated_at`,
    )
    .run({
      ticker: q.ticker.toUpperCase(),
      assetClass: q.assetClass,
      priceEur: q.priceEur,
      change24hPct: q.change24hPct,
      nativeCurrency: q.nativeCurrency,
      nativePrice: q.nativePrice,
      spark7d: q.spark7d ? JSON.stringify(q.spark7d) : null,
      updatedAt: q.updatedAt,
    });
}

/**
 * Quotes for a set of assets, in EUR.
 * Served from the SQLite cache when fresh; otherwise refetched in two batch
 * calls (one Yahoo, one CoinGecko). Stale cache is the fallback on failure.
 */
export async function getQuotes(
  assets: AssetRef[],
  force = false,
): Promise<{ quotes: Map<string, Quote>; errors: string[] }> {
  const errors: string[] = [];
  const cached = readCache(assets);
  const now = Date.now();

  const isFresh = (q: Quote | undefined) =>
    !!q && now - new Date(q.updatedAt).getTime() < QUOTE_TTL_MS;

  const stale = assets.filter((a) => force || !isFresh(cached.get(keyOf(a))));
  if (!stale.length) return { quotes: cached, errors };

  const staleStocks = stale.filter((a) => a.assetClass === "stock");
  const staleCryptos = stale.filter((a) => a.assetClass === "crypto");
  const nowIso = new Date().toISOString();

  await Promise.all([
    (async () => {
      if (!staleStocks.length) return;
      try {
        const yq = await getStockQuotes(staleStocks.map((a) => a.ticker.toUpperCase()));
        for (const a of staleStocks) {
          const q = yq.get(a.ticker.toUpperCase());
          if (!q) continue;
          const quote: Quote = {
            ticker: a.ticker.toUpperCase(),
            assetClass: "stock",
            priceEur: await toEur(q.price, q.currency),
            change24hPct: q.changePct,
            nativeCurrency: q.currency,
            nativePrice: q.price,
            spark7d: null,
            updatedAt: nowIso,
          };
          writeCache(quote);
          cached.set(keyOf(a), { ...quote, spark7d: cached.get(keyOf(a))?.spark7d ?? null });
        }
      } catch (e) {
        errors.push(`Actions : ${e instanceof Error ? e.message : String(e)}`);
      }
    })(),
    (async () => {
      if (!staleCryptos.length) return;
      try {
        const idMap = new Map<string, string>(); // cgId -> ticker key
        const ids: string[] = [];
        for (const a of staleCryptos) {
          const id = resolveCoingeckoId(a.ticker, a.coingeckoId);
          if (!id) {
            errors.push(`Crypto ${a.ticker} : identifiant CoinGecko inconnu`);
            continue;
          }
          idMap.set(id, keyOf(a));
          ids.push(id);
        }
        const markets = await getCryptoMarkets(ids);
        for (const [id, m] of markets) {
          const key = idMap.get(id);
          if (!key) continue;
          const quote: Quote = {
            ticker: key.split(":")[1],
            assetClass: "crypto",
            priceEur: m.priceEur,
            change24hPct: m.change24hPct,
            nativeCurrency: "EUR",
            nativePrice: m.priceEur,
            spark7d: m.spark7d,
            updatedAt: nowIso,
          };
          writeCache(quote);
          cached.set(key, quote);
        }
      } catch (e) {
        errors.push(`Cryptos : ${e instanceof Error ? e.message : String(e)}`);
      }
    })(),
  ]);

  return { quotes: cached, errors };
}

/** Daily price history in EUR, cached in SQLite. */
export async function getAssetHistory(
  asset: AssetRef,
  days: number,
): Promise<HistoryPoint[]> {
  const db = getDb();
  const cacheKey = `hist:${asset.assetClass}:${asset.ticker.toUpperCase()}:${days}`;
  const row = db
    .prepare("SELECT payload, updated_at FROM history_cache WHERE cache_key = ?")
    .get(cacheKey) as { payload: string; updated_at: string } | undefined;
  if (row && Date.now() - new Date(row.updated_at).getTime() < HISTORY_TTL_MS) {
    return JSON.parse(row.payload) as HistoryPoint[];
  }

  let points: HistoryPoint[] = [];
  try {
    if (asset.assetClass === "stock") {
      const raw = await getStockHistory(asset.ticker.toUpperCase(), days);
      // Convert using the latest FX rate — a close approximation for display.
      const cachedQuote = readCache([asset]).get(keyOf(asset));
      const cur = cachedQuote?.nativeCurrency ?? "EUR";
      if (cur !== "EUR" && raw.length) {
        const factor = (await toEur(1000, cur)) / 1000;
        points = raw.map((p) => ({ date: p.date, value: p.value * factor }));
      } else {
        points = raw;
      }
    } else {
      const id = resolveCoingeckoId(asset.ticker, asset.coingeckoId);
      if (!id) throw new Error(`Identifiant CoinGecko inconnu pour ${asset.ticker}`);
      if (days > 365) {
        // CoinGecko free tier caps market_chart at 365 days: try Yahoo's
        // crypto pairs first for long ranges, fall back to a capped window.
        try {
          points = await getStockHistory(`${asset.ticker.toUpperCase()}-EUR`, days);
        } catch {
          points = await getCryptoHistory(id, 365);
        }
      } else {
        try {
          points = await getCryptoHistory(id, days);
        } catch (cgError) {
          // Yahoo lists most major pairs (BTC-EUR, ETH-EUR…) — last resort.
          points = await getStockHistory(`${asset.ticker.toUpperCase()}-EUR`, days).catch(() => {
            throw cgError;
          });
        }
      }
    }
    if (!points.length) throw new Error(`Historique vide pour ${asset.ticker}`);
  } catch (e) {
    if (row) return JSON.parse(row.payload) as HistoryPoint[]; // stale fallback
    throw e;
  }

  db.prepare(
    `INSERT INTO history_cache (cache_key, payload, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (cache_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
  ).run(cacheKey, JSON.stringify(points), new Date().toISOString());

  return points;
}

/** Fill 7-day sparklines for stock quotes (cryptos get theirs from CoinGecko). */
export async function fillStockSparks(
  assets: AssetRef[],
  quotes: Map<string, Quote>,
): Promise<void> {
  const targets = assets.filter(
    (a) => a.assetClass === "stock" && !quotes.get(keyOf(a))?.spark7d,
  );
  await Promise.all(
    targets.map(async (a) => {
      try {
        const hist = await getAssetHistory(a, 8);
        const q = quotes.get(keyOf(a));
        if (q && hist.length >= 2) {
          q.spark7d = hist.map((p) => p.value);
          writeCache(q);
        }
      } catch {
        // sparkline is decorative — ignore failures
      }
    }),
  );
}

export async function searchAll(query: string): Promise<SearchResult[]> {
  const [stocks, cryptos] = await Promise.allSettled([
    searchStocks(query),
    searchCrypto(query),
  ]);
  const out: SearchResult[] = [];
  if (cryptos.status === "fulfilled") out.push(...cryptos.value);
  if (stocks.status === "fulfilled") out.push(...stocks.value);
  // Exact ticker match first, then cryptos by rank / stocks as returned.
  const q = query.trim().toUpperCase();
  out.sort((a, b) => {
    const ax = a.ticker.toUpperCase() === q ? 0 : 1;
    const bx = b.ticker.toUpperCase() === q ? 0 : 1;
    return ax - bx;
  });
  return out;
}

/** Single asset quote (used to prefill the quick-add form). */
export async function getSingleQuote(asset: AssetRef): Promise<Quote | null> {
  const { quotes } = await getQuotes([asset]);
  return quotes.get(keyOf(asset)) ?? null;
}

export { keyOf as quoteKey };
