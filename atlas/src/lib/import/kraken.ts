/**
 * Kraken asset/pair normalization.
 *
 * Kraken uses legacy ISO-style codes: crypto prefixed with "X", fiat with "Z"
 * (XXBT, XETH, ZEUR), while newer assets have no prefix (SOL, ADA). Pairs are
 * the base code immediately followed by the quote code, e.g. "XXBTZEUR",
 * "XBTEUR", "SOLEUR", "XETHZEUR".
 */

const QUOTE_CODES = [
  "ZEUR",
  "ZUSD",
  "ZGBP",
  "ZCAD",
  "ZJPY",
  "ZAUD",
  "EUR",
  "USD",
  "GBP",
  "USDT",
  "USDC",
  "DAI",
  "XBT",
  "XXBT",
  "ETH",
  "XETH",
];

/** Fiat currencies, used to tell the fiat leg from the crypto leg in ledgers. */
export const FIAT = new Set(["EUR", "USD", "GBP", "CHF", "CAD", "JPY", "AUD"]);

const ASSET_ALIASES: Record<string, string> = {
  XXBT: "BTC",
  XBT: "BTC",
  XETH: "ETH",
  XXRP: "XRP",
  XLTC: "LTC",
  XXLM: "XLM",
  XXDG: "DOGE",
  XDG: "DOGE",
  XXMR: "XMR",
  XZEC: "ZEC",
  XETC: "ETC",
  XREP: "REP",
  XMLN: "MLN",
  XXTZ: "XTZ",
  ZEUR: "EUR",
  ZUSD: "USD",
  ZGBP: "GBP",
};

export function normalizeKrakenAsset(code: string): string {
  const c = code.toUpperCase().trim();
  if (ASSET_ALIASES[c]) return ASSET_ALIASES[c];
  // Legacy convention: 4-char codes prefixed with X (e.g. XSOL -> SOL).
  if (c.length === 4 && c.startsWith("X")) return c.slice(1);
  // Staking / variants suffix (e.g. DOT.S, ETH2.S) -> base.
  if (c.includes(".")) return normalizeKrakenAsset(c.split(".")[0]);
  return c;
}

/** Split a Kraken pair into normalized base/quote, or null if unrecognized. */
export function parseKrakenPair(pair: string): { base: string; quote: string } | null {
  const p = pair.toUpperCase().trim().replace(/\//g, "");
  // Try the longest matching quote suffix first.
  for (const q of [...QUOTE_CODES].sort((a, b) => b.length - a.length)) {
    if (p.endsWith(q) && p.length > q.length) {
      return {
        base: normalizeKrakenAsset(p.slice(0, -q.length)),
        quote: normalizeKrakenAsset(q),
      };
    }
  }
  return null;
}
