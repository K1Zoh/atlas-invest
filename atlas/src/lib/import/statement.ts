import { getAssetHistory } from "../market";
import { searchStocks } from "../market/yahoo";
import type { TxSide } from "../types";

/**
 * Free-text statement parser ("colle n'importe quoi"). Accepts the kind of
 * history a banking/broker app shows on screen, pasted as-is:
 *
 *   MSCI World Swap PEA EUR (Acc)
 *   29 Jun · Ordre d'achat
 *   239,11 €
 *
 * Blocks are [instrument name…, "date · operation type", amount]. Only real
 * orders (achat/vente) become transactions: cash movements (lines typed
 * "PEA", "Dépôt", "Top-up"…) duplicate the orders and are skipped. Tickers
 * are resolved from the instrument name via Yahoo search (European EUR
 * listings preferred) and the quantity is derived from the close price at the
 * operation date — everything stays editable in the preview before import.
 */

export interface StatementOp {
  name: string;
  date: string; // YYYY-MM-DD
  side: TxSide;
  kind: "trade" | "dividend";
  amount: number; // EUR, absolute
}

// ── Line-level parsing ───────────────────────────────────────────────────────

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

const MONTHS: Record<string, number> = {
  jan: 1, janv: 1,
  feb: 2, fev: 2, fevr: 2,
  mar: 3, mars: 3,
  apr: 4, avr: 4,
  may: 5, mai: 5,
  jun: 6, juin: 6,
  jul: 7, juil: 7,
  aug: 8, aout: 8,
  sep: 9, sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function monthFromToken(raw: string): number | null {
  const tok = stripAccents(raw.toLowerCase()).replace(/\.$/, "");
  if (MONTHS[tok]) return MONTHS[tok];
  const four = tok.slice(0, 4);
  if (MONTHS[four]) return MONTHS[four];
  const three = tok.slice(0, 3);
  return MONTHS[three] ?? null;
}

/** "29 Jun" has no year: assume the current one, minus 1 if that lands in the future. */
function buildDate(day: number, month: number, year: number | null): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  let y = year ?? new Date().getFullYear();
  if (year !== null && year < 100) y = 2000 + year;
  const iso = (yy: number) =>
    `${yy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  let out = iso(y);
  if (year === null && out > new Date().toISOString().slice(0, 10)) out = iso(y - 1);
  return out;
}

const SEP = "[·•∙|–—-]";
// "29 Jun · Ordre d'achat" / "29 juin 2026 · PEA"
const DATE_WORD_RE = new RegExp(`^(\\d{1,2})\\s+([A-Za-zÀ-ÿ.]+)(?:\\s+(\\d{4}))?\\s*${SEP}\\s*(.+)$`);
// "29/06 · Achat" / "29/06/2026 · Vente"
const DATE_NUM_RE = new RegExp(`^(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2,4}))?\\s*${SEP}\\s*(.+)$`);
// "239,11 €" / "+1 234.56 EUR" / "-50€"
const AMOUNT_RE = /^([+\-−–])?\s*([\d  \s.,]+)\s*(?:€|EUR)\s*$/;

function parseHeader(line: string): { date: string; label: string } | null {
  let m = line.match(DATE_WORD_RE);
  if (m) {
    const month = monthFromToken(m[2]);
    const date = month ? buildDate(Number(m[1]), month, m[3] ? Number(m[3]) : null) : null;
    return date ? { date, label: m[4].trim() } : null;
  }
  m = line.match(DATE_NUM_RE);
  if (m) {
    const date = buildDate(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null);
    return date ? { date, label: m[4].trim() } : null;
  }
  return null;
}

function parseAmount(line: string): number | null {
  const m = line.match(AMOUNT_RE);
  if (!m) return null;
  let digits = m[2].replace(/[  \s]/g, "");
  // Last separator is the decimal one ("1.234,56" and "1,234.56" both work).
  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");
  const dec = Math.max(lastComma, lastDot);
  if (dec !== -1) {
    digits = digits.slice(0, dec).replace(/[.,]/g, "") + "." + digits.slice(dec + 1);
  }
  const v = parseFloat(digits);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function classifyLabel(label: string): { kind: "trade" | "dividend" | "cash"; side: TxSide } | null {
  const s = stripAccents(label.toLowerCase());
  if (s.includes("achat") || s.includes("buy")) return { kind: "trade", side: "buy" };
  if (s.includes("vente") || s.includes("sell") || s.includes("sale")) return { kind: "trade", side: "sell" };
  if (s.includes("dividend")) return { kind: "dividend", side: "buy" };
  return { kind: "cash", side: "buy" }; // "PEA", "Dépôt", "Top-up"… : cash echo of an order
}

export function parseStatementText(text: string): StatementOp[] {
  const ops: StatementOp[] = [];
  let pendingName: string | null = null;
  let pendingHeader: { date: string; label: string } | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const header = parseHeader(line);
    if (header) {
      pendingHeader = header;
      continue;
    }

    const amount = parseAmount(line);
    if (amount !== null) {
      if (pendingHeader && pendingName) {
        const cls = classifyLabel(pendingHeader.label);
        if (cls && cls.kind !== "cash") {
          ops.push({
            name: pendingName,
            date: pendingHeader.date,
            side: cls.side,
            kind: cls.kind,
            amount,
          });
        }
      }
      pendingHeader = null;
      continue;
    }

    // Anything else is (part of) an instrument name; apps often repeat it,
    // the last line before the date header wins.
    pendingName = line;
    pendingHeader = null;
  }
  return ops;
}

// ── Name -> Yahoo ticker resolution ──────────────────────────────────────────

export interface ResolvedInstrument {
  ticker: string;
  name: string;
}

const EU_SUFFIXES = [".PA", ".DE", ".AS", ".MI", ".BR", ".LS", ".DU", ".F", ".SG"];

function scoreMatch(query: string, r: { ticker: string; name: string; exchange: string | null }): number {
  let score = 0;
  if (r.exchange === "Paris") score += 40;
  else if (EU_SUFFIXES.some((s) => r.ticker.endsWith(s))) score += 20;
  const qWords = new Set(stripAccents(query.toLowerCase()).split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  for (const w of stripAccents(r.name.toLowerCase()).split(/[^a-z0-9]+/)) {
    if (qWords.has(w)) score += 3;
  }
  return score;
}

// Tokens that describe the share class, not the instrument: Yahoo's search
// often returns nothing when they are left in ("MSCI World Swap PEA EUR" -> 0
// results, "MSCI World Swap PEA" -> WPEA.PA).
const NOISE_WORDS = /\b(EUR|USD|GBP|CHF|Acc|Dist|Capi|Capitalisation|Hedged|C|D)\b\.?/gi;

async function searchBest(query: string): Promise<ResolvedInstrument | null> {
  const results = await searchStocks(query, 8);
  let best: ResolvedInstrument | null = null;
  let bestScore = 2; // require at least a little word overlap
  for (const r of results) {
    const s = scoreMatch(query, { ticker: r.ticker, name: r.name, exchange: r.exchange });
    if (s > bestScore) {
      best = { ticker: r.ticker.toUpperCase(), name: r.name };
      bestScore = s;
    }
  }
  return best;
}

/**
 * Search Yahoo for an instrument name, keep the most plausible EUR listing.
 * Progressive fallback: full cleaned name, then without share-class noise,
 * then dropping trailing words one by one (down to two words).
 */
export async function resolveInstrument(name: string): Promise<ResolvedInstrument | null> {
  const base = name.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
  if (!base) return null;

  const queries: string[] = [base];
  const noNoise = base.replace(NOISE_WORDS, " ").replace(/\s+/g, " ").trim();
  if (noNoise && noNoise !== base) queries.push(noNoise);
  let words = (noNoise || base).split(" ");
  while (words.length > 2) {
    words = words.slice(0, -1);
    queries.push(words.join(" "));
  }

  try {
    for (const q of queries) {
      const hit = await searchBest(q);
      if (hit) return hit;
    }
  } catch {
    // network hiccup: treated as unresolved
  }
  return null;
}

/** Close price (EUR) at or just before `date`, from the cached history layer. */
export async function closeAt(ticker: string, date: string): Promise<number | null> {
  const days = Math.min(
    1825,
    Math.max(15, Math.ceil((Date.now() - new Date(date).getTime()) / 86_400_000) + 10),
  );
  try {
    const points = await getAssetHistory({ ticker, assetClass: "stock" }, days);
    let close: number | null = null;
    for (const p of points) {
      if (p.date > date) break;
      close = p.value;
    }
    return close && close > 0 ? close : null;
  } catch {
    return null;
  }
}
