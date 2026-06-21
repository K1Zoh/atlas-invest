import { FIAT, normalizeKrakenAsset, parseKrakenPair } from "./import/kraken";
import { extractCsvFromZip, looksLikeZip } from "./import/zip";
import { resolveCoingeckoId } from "./market/coingecko";
import {
  addTransactions,
  existingExtIds,
  existingFingerprints,
  type NewTransaction,
} from "./repo";
import type { AssetClass, TxSide } from "./types";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export type ExchangeId =
  | "auto"
  | "kraken"
  | "revolut"
  | "binance"
  | "coinbase"
  | "generic"
  | "positions";

export const EXCHANGES: { id: ExchangeId; label: string }[] = [
  { id: "auto", label: "Détection automatique" },
  { id: "kraken", label: "Kraken" },
  { id: "revolut", label: "Revolut (bourse)" },
  { id: "binance", label: "Binance" },
  { id: "coinbase", label: "Coinbase" },
  { id: "generic", label: "Modèle Atlas / autre" },
];

export type RowStatus = "new" | "duplicate" | "ignored";

export interface ParsedRow {
  status: RowStatus;
  reason?: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  side: TxSide;
  quantity: number;
  price: number;
  fees: number;
  txDate: string;
  platform: string | null;
  coingeckoId: string | null;
  extId: string | null;
  fingerprint: string;
}

export interface PreviewResult {
  exchange: ExchangeId;
  detected: ExchangeId;
  rows: ParsedRow[];
  counts: { new: number; duplicate: number; ignored: number; total: number };
  errors: string[];
}

/** A row extracted from a file before dedup status is assigned. */
interface ExtractedRow {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  side: TxSide;
  quantity: number;
  price: number;
  fees: number;
  txDate: string;
  platform: string | null;
  coingeckoId: string | null;
  extId: string | null;
  ignored?: string;
}

interface ExtractResult {
  rows: ExtractedRow[];
  errors: string[];
}

// ── CSV parsing ──────────────────────────────────────────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === "," || c === ";") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

function num(raw: string): number {
  return parseFloat(
    (raw ?? "")
      .replace(/[€$£\s]/g, "")
      .replace(/[A-Za-z]+$/, "")
      .replace(",", "."),
  );
}

/** Extract a number from a string with any currency prefix/suffix ("USD 188.60", "EUR 20"). */
function numLoose(raw: string): number {
  const cleaned = (raw ?? "").replace(/[^0-9.,-]/g, "").replace(",", ".");
  return parseFloat(cleaned);
}

function isoDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

const QUOTE_SUFFIXES = ["USDT", "USDC", "BUSD", "EUR", "USD", "BTC", "ETH", "BNB"];
function stripQuote(pair: string): { base: string; quote: string } | null {
  const p = pair.toUpperCase().trim();
  for (const q of QUOTE_SUFFIXES) {
    if (p.endsWith(q) && p.length > q.length) return { base: p.slice(0, -q.length), quote: q };
  }
  return null;
}

// ── Header helpers ───────────────────────────────────────────────────────────

function lowerHeader(rows: string[][]): string[] {
  return rows[0].map((h) => h.trim().toLowerCase());
}

function detectExchange(rows: string[][]): ExchangeId {
  const h = new Set(lowerHeader(rows));
  // Kraken trades export or ledgers export (Instant Buy lives in ledgers).
  if (h.has("txid") && h.has("pair") && h.has("vol") && h.has("ordertxid")) return "kraken";
  if (h.has("refid") && h.has("asset") && h.has("amount") && h.has("type") && h.has("balance"))
    return "kraken";
  if (h.has("ticker") && h.has("price per share") && h.has("total amount")) return "revolut";
  // Revolut crypto export: Symbol, Type, Quantity, Price, Value, Fees, Date.
  if (h.has("symbol") && h.has("value") && h.has("fees") && h.has("quantity") && h.has("date"))
    return "revolut";
  if (h.has("pair") && h.has("executed") && (h.has("side") || h.has("type"))) return "binance";
  if (h.has("transaction type") && h.has("quantity transacted")) return "coinbase";
  return "generic";
}

/** Kraken ledgers export has a refid column; trades export has pair/vol. */
function isKrakenLedgers(rows: string[][]): boolean {
  const h = new Set(lowerHeader(rows));
  return h.has("refid") && h.has("asset") && h.has("balance") && !h.has("pair");
}

// ── Kraken ───────────────────────────────────────────────────────────────────

function extractKraken(rows: string[][]): ExtractResult {
  const header = lowerHeader(rows);
  const idx = (n: string) => header.indexOf(n);
  const iTxid = idx("txid");
  const iPair = idx("pair");
  const iTime = idx("time");
  const iType = idx("type");
  const iPrice = idx("price");
  const iVol = idx("vol");
  const iFee = idx("fee");
  const errors: string[] = [];
  const out: ExtractedRow[] = [];

  for (const row of rows.slice(1)) {
    const txid = (row[iTxid] ?? "").trim();
    const pairRaw = (row[iPair] ?? "").trim();
    const parsed = parseKrakenPair(pairRaw);
    const date = isoDate(row[iTime] ?? "");
    const sideRaw = (row[iType] ?? "").trim().toLowerCase();
    const side: TxSide = sideRaw === "sell" ? "sell" : "buy";
    const price = num(row[iPrice] ?? "");
    const qty = num(row[iVol] ?? "");
    const fee = iFee !== -1 ? num(row[iFee] ?? "0") || 0 : 0;

    if (!parsed || !date || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
      continue; // unparseable line, silently skipped
    }
    const base: ExtractedRow = {
      ticker: parsed.base,
      name: parsed.base,
      assetClass: "crypto",
      side,
      quantity: qty,
      price,
      fees: fee,
      txDate: date,
      platform: "Kraken",
      coingeckoId: resolveCoingeckoId(parsed.base),
      extId: txid ? `kraken:${txid}` : null,
    };
    if (parsed.quote !== "EUR") {
      out.push({ ...base, ignored: `Paire ${parsed.base}/${parsed.quote} — seules les paires en EUR sont importées` });
    } else {
      out.push(base);
    }
  }
  if (!out.length) {
    errors.push("Aucune transaction trouvée. Sur Kraken, exporte « History → Export → Trades » sur toute la période (les achats « Instant Buy » sont dans l'export « Ledgers »).");
  }
  return { rows: out, errors };
}

// ── Kraken — Ledgers export (Instant Buy) ────────────────────────────────────
// Each trade is a group of ledger rows sharing a refid: a `spend` (fiat) leg
// and a `receive` (crypto) leg. Funding fees live on a same-timestamp `deposit`
// row (separate refid), which we attribute back to the trade. Crypto
// deposits/withdrawals (transfers) and staking `earn` rewards are ignored.

interface LedgerRow {
  refid: string;
  time: string;
  type: string;
  asset: string;
  amount: number;
  fee: number;
}

function extractKrakenLedgers(rows: string[][]): ExtractResult {
  const header = lowerHeader(rows);
  const idx = (n: string) => header.indexOf(n);
  const iRefid = idx("refid");
  const iTime = idx("time");
  const iType = idx("type");
  const iAsset = idx("asset");
  const iAmount = idx("amount");
  const iFee = idx("fee");
  const errors: string[] = [];

  const epoch = (time: string) => Date.parse(`${time.replace(" ", "T")}Z`);
  const groups = new Map<string, LedgerRow[]>();
  // Fiat funding fees (instant-buy charges a deposit fee just before the trade,
  // sometimes 1s earlier), matched to the nearest preceding trade by time.
  const deposits: { ts: number; fee: number; used: boolean }[] = [];

  for (const row of rows.slice(1)) {
    const lr: LedgerRow = {
      refid: (row[iRefid] ?? "").trim(),
      time: (row[iTime] ?? "").trim(),
      type: (row[iType] ?? "").trim().toLowerCase(),
      asset: normalizeKrakenAsset(row[iAsset] ?? ""),
      amount: num(row[iAmount] ?? ""),
      fee: iFee !== -1 ? num(row[iFee] ?? "0") || 0 : 0,
    };
    if (lr.type === "deposit" && FIAT.has(lr.asset) && lr.fee > 0) {
      deposits.push({ ts: epoch(lr.time), fee: lr.fee, used: false });
    }
    if (!lr.refid) continue;
    const g = groups.get(lr.refid) ?? [];
    g.push(lr);
    groups.set(lr.refid, g);
  }
  deposits.sort((a, b) => a.ts - b.ts);

  // Closest unconsumed fiat deposit within 10 min before the trade.
  const matchDepositFee = (tradeTs: number): number => {
    let best = -1;
    for (let k = 0; k < deposits.length; k++) {
      const d = deposits[k];
      if (d.used) continue;
      const gap = tradeTs - d.ts;
      if (gap >= -2000 && gap <= 600_000) {
        if (best === -1 || d.ts > deposits[best].ts) best = k;
      }
    }
    if (best === -1) return 0;
    deposits[best].used = true;
    return deposits[best].fee;
  };

  // Build trades, then match deposits chronologically (sequential consumption).
  interface Trade {
    refid: string;
    ts: number;
    date: string;
    ticker: string;
    side: TxSide;
    quantity: number;
    price: number;
    tradeFee: number;
    fiatAsset: string;
  }
  const trades: Trade[] = [];
  for (const [refid, legs] of groups) {
    const spend = legs.find((l) => l.type === "spend");
    const receive = legs.find((l) => l.type === "receive");
    if (!spend || !receive) continue; // not a trade (deposit/withdrawal/earn)

    const cryptoLeg = [spend, receive].find((l) => !FIAT.has(l.asset));
    const fiatLeg = [spend, receive].find((l) => FIAT.has(l.asset));
    if (!cryptoLeg || !fiatLeg) continue; // crypto<->crypto not supported here

    const date = isoDate(fiatLeg.time);
    if (!date) continue;

    const quantity = Math.abs(cryptoLeg.amount);
    let side: TxSide;
    let price: number;
    if (cryptoLeg.type === "receive") {
      side = "buy";
      price = quantity > 0 ? Math.abs(fiatLeg.amount) / quantity : 0;
    } else {
      side = "sell";
      price = quantity > 0 ? Math.abs(fiatLeg.amount) / quantity : 0;
    }
    if (quantity <= 0 || !Number.isFinite(price) || price <= 0) continue;

    trades.push({
      refid,
      ts: epoch(fiatLeg.time),
      date,
      ticker: cryptoLeg.asset,
      side,
      quantity,
      price,
      tradeFee: fiatLeg.fee,
      fiatAsset: fiatLeg.asset,
    });
  }
  trades.sort((a, b) => a.ts - b.ts);

  const out: ExtractedRow[] = [];
  for (const tr of trades) {
    // Deposit fees only apply to buys (funding the purchase).
    const fees = tr.tradeFee + (tr.side === "buy" ? matchDepositFee(tr.ts) : 0);
    const base: ExtractedRow = {
      ticker: tr.ticker,
      name: tr.ticker,
      assetClass: "crypto",
      side: tr.side,
      quantity: tr.quantity,
      price: tr.price,
      fees: Math.round(fees * 1e6) / 1e6,
      txDate: tr.date,
      platform: "Kraken",
      coingeckoId: resolveCoingeckoId(tr.ticker),
      extId: `kraken:${tr.refid}`,
    };
    if (tr.fiatAsset !== "EUR") {
      out.push({ ...base, ignored: `Réglé en ${tr.fiatAsset} — vérifie le prix (non converti en EUR)` });
    } else {
      out.push(base);
    }
  }
  if (!out.length) {
    errors.push("Aucune transaction d'achat/vente trouvée dans cet export Ledgers.");
  }
  return { rows: out, errors };
}

// ── Revolut (stocks / ETF) ───────────────────────────────────────────────────
// Columns: Date, Ticker, Type, Quantity, Price per share, Total Amount,
// Currency, FX Rate. USD trades are converted to EUR via FX Rate (native per
// EUR). CASH TOP-UP rows are skipped; DIVIDEND rows are flagged for the Fiscal tab.

function extractRevolut(rows: string[][]): ExtractResult {
  const header = lowerHeader(rows);
  const idx = (n: string) => header.indexOf(n);
  const iDate = idx("date");
  const iTicker = idx("ticker");
  const iType = idx("type");
  const iQty = idx("quantity");
  const iPrice = idx("price per share");
  const iTotal = idx("total amount");
  const iFx = idx("fx rate");
  const out: ExtractedRow[] = [];

  for (const row of rows.slice(1)) {
    const typeRaw = (row[iType] ?? "").trim().toUpperCase();
    const isBuy = typeRaw.includes("BUY");
    const isSell = typeRaw.includes("SELL");
    const ticker = (row[iTicker] ?? "").trim().toUpperCase();
    const date = isoDate(row[iDate] ?? "");

    if (!isBuy && !isSell) {
      // Dividends are surfaced so the user can log them; top-ups are noise.
      if (typeRaw.includes("DIVIDEND") && ticker && date) {
        out.push({
          ticker,
          name: ticker,
          assetClass: "stock",
          side: "buy",
          quantity: 0,
          price: 0,
          fees: 0,
          txDate: date,
          platform: "Revolut",
          coingeckoId: null,
          extId: `revolut:${(row[iDate] ?? "").trim()}`,
          ignored: "Dividende — à enregistrer dans l'onglet Fiscal",
        });
      }
      continue;
    }

    const fx = iFx !== -1 ? numLoose(row[iFx] ?? "1") || 1 : 1;
    const priceNative = numLoose(row[iPrice] ?? "");
    const totalNative = iTotal !== -1 ? numLoose(row[iTotal] ?? "") : NaN;
    const qty = numLoose(row[iQty] ?? "");

    if (!ticker || !date || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(priceNative) || priceNative <= 0) {
      continue;
    }
    const priceEur = priceNative / (fx || 1);
    const totalEur = Number.isFinite(totalNative) ? totalNative / (fx || 1) : qty * priceEur;
    const fees = Math.max(0, Math.round((totalEur - qty * priceEur) * 1e6) / 1e6);

    out.push({
      ticker,
      name: ticker,
      assetClass: "stock",
      side: isSell ? "sell" : "buy",
      quantity: qty,
      price: Math.round(priceEur * 1e6) / 1e6,
      fees,
      txDate: date,
      platform: "Revolut",
      coingeckoId: null,
      extId: `revolut:${(row[iDate] ?? "").trim()}`,
    });
  }

  out.sort((a, b) => a.txDate.localeCompare(b.txDate));
  return { rows: out, errors: [] };
}

// ── Revolut (crypto) ─────────────────────────────────────────────────────────
// Columns: Symbol, Type, Quantity, Price, Value, Fees, Date. Amounts use "," as
// a thousands separator. Buy/Receive are imported (price = Value/Quantity, the
// Price column is rounded to cents and useless for cheap coins). "Learn reward"
// and "Staking reward" are free dust with no value: flagged, not imported.

function numUS(raw: string): number {
  return parseFloat((raw ?? "").replace(/[^0-9.-]/g, ""));
}

function extractRevolutCrypto(rows: string[][]): ExtractResult {
  const header = lowerHeader(rows);
  const idx = (n: string) => header.indexOf(n);
  const iSymbol = idx("symbol");
  const iType = idx("type");
  const iQty = idx("quantity");
  const iValue = idx("value");
  const iFees = idx("fees");
  const iDate = idx("date");
  const out: ExtractedRow[] = [];

  for (const row of rows.slice(1)) {
    const typeRaw = (row[iType] ?? "").trim().toLowerCase();
    const ticker = (row[iSymbol] ?? "").trim().toUpperCase();
    const rawDate = (row[iDate] ?? "").trim();
    const d = new Date(rawDate);
    const date = Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    if (!ticker || !date) continue;

    const isBuy = typeRaw.includes("buy");
    const isReceive = typeRaw === "receive";
    const isReward = typeRaw.includes("reward");

    if (isReward) {
      // Free Learn/Staking dust: surfaced but not imported (no cost, untracked).
      out.push({
        ticker,
        name: ticker,
        assetClass: "crypto",
        side: "buy",
        quantity: numUS(row[iQty] ?? "") || 0,
        price: 0,
        fees: 0,
        txDate: date,
        platform: "Revolut",
        coingeckoId: resolveCoingeckoId(ticker),
        extId: `revolutc:${rawDate}:${ticker}`,
        ignored: "Récompense gratuite (Learn/Staking) — non importée par défaut",
      });
      continue;
    }
    if (!isBuy && !isReceive) continue;

    const qty = numUS(row[iQty] ?? "");
    const valueEur = numUS(row[iValue] ?? "");
    const fees = iFees !== -1 ? numUS(row[iFees] ?? "0") || 0 : 0;
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(valueEur) || valueEur <= 0) continue;
    const price = valueEur / qty;

    out.push({
      ticker,
      name: ticker,
      assetClass: "crypto",
      side: "buy",
      quantity: qty,
      price: Math.round(price * 1e8) / 1e8,
      fees,
      txDate: date,
      platform: "Revolut",
      coingeckoId: resolveCoingeckoId(ticker),
      extId: `revolutc:${rawDate}:${ticker}`,
    });
  }

  out.sort((a, b) => a.txDate.localeCompare(b.txDate));
  return { rows: out, errors: [] };
}

// ── Binance ──────────────────────────────────────────────────────────────────

function extractBinance(rows: string[][]): ExtractResult {
  const header = lowerHeader(rows);
  const idx = (n: string) => header.indexOf(n);
  const iDate = idx("date(utc)") !== -1 ? idx("date(utc)") : idx("date");
  const iPair = idx("pair");
  const iSide = idx("side") !== -1 ? idx("side") : idx("type");
  const iPrice = idx("price");
  const iExec = idx("executed");
  const iFee = idx("fee");
  const out: ExtractedRow[] = [];

  for (const row of rows.slice(1)) {
    const pair = (row[iPair] ?? "").trim();
    const sideRaw = (row[iSide] ?? "").trim().toUpperCase();
    if (sideRaw !== "BUY" && sideRaw !== "SELL") continue;
    const parsed = stripQuote(pair);
    const date = isoDate(row[iDate] ?? "");
    const price = num(row[iPrice] ?? "");
    const qty = num(row[iExec] ?? "");
    const fee = iFee !== -1 ? num(row[iFee] ?? "0") || 0 : 0;
    if (!parsed || !date || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) continue;
    const base: ExtractedRow = {
      ticker: parsed.base,
      name: parsed.base,
      assetClass: "crypto",
      side: sideRaw === "SELL" ? "sell" : "buy",
      quantity: qty,
      price,
      fees: fee,
      txDate: date,
      platform: "Binance",
      coingeckoId: resolveCoingeckoId(parsed.base),
      extId: null,
    };
    if (parsed.quote !== "EUR") {
      out.push({ ...base, ignored: `Paire ${parsed.base}/${parsed.quote} — seules les paires en EUR sont importées` });
    } else {
      out.push(base);
    }
  }
  return { rows: out, errors: [] };
}

// ── Coinbase ─────────────────────────────────────────────────────────────────

function extractCoinbase(rows: string[][]): ExtractResult {
  const header = lowerHeader(rows);
  const idx = (n: string) => header.indexOf(n);
  const iDate = idx("timestamp") !== -1 ? idx("timestamp") : idx("date");
  const iType = idx("transaction type");
  const iAsset = idx("asset");
  const iQty = idx("quantity transacted");
  const iSpot = idx("spot price at transaction");
  const iSpotCur = idx("spot price currency");
  const iFees = idx("fees") !== -1 ? idx("fees") : idx("fees and/or spread");
  const out: ExtractedRow[] = [];

  for (const row of rows.slice(1)) {
    const typeRaw = (row[iType] ?? "").trim().toUpperCase();
    const isBuy = typeRaw.includes("BUY") || typeRaw.includes("RECEIVE");
    const isSell = typeRaw.includes("SELL") || typeRaw.includes("CONVERT");
    if (!isBuy && !isSell) continue;
    const ticker = (row[iAsset] ?? "").trim().toUpperCase();
    const date = isoDate(row[iDate] ?? "");
    const qty = num(row[iQty] ?? "");
    const price = num(row[iSpot] ?? "");
    const fees = iFees !== -1 ? num(row[iFees] ?? "0") || 0 : 0;
    if (!ticker || !date || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) continue;
    const cur = iSpotCur !== -1 ? (row[iSpotCur] ?? "").trim().toUpperCase() : "EUR";
    const base: ExtractedRow = {
      ticker,
      name: ticker,
      assetClass: "crypto",
      side: isBuy ? "buy" : "sell",
      quantity: qty,
      price,
      fees,
      txDate: date,
      platform: "Coinbase",
      coingeckoId: resolveCoingeckoId(ticker),
      extId: null,
    };
    if (cur !== "EUR") {
      out.push({ ...base, ignored: `Prix en ${cur} — seules les lignes en EUR sont importées` });
    } else {
      out.push(base);
    }
  }
  return { rows: out, errors: [] };
}

// ── Generic / Atlas template ─────────────────────────────────────────────────

const COL_ALIASES: Record<string, string[]> = {
  ticker: ["ticker", "symbol", "asset", "coin", "actif"],
  name: ["name", "nom"],
  assetClass: ["asset_class", "class", "classe", "type_actif"],
  date: ["date", "date(utc)", "tx_date", "time", "timestamp"],
  quantity: ["quantity", "qty", "executed", "amount", "quantité", "volume", "vol"],
  price: ["price", "prix", "price per share", "unit price", "prix unitaire", "cours"],
  fees: ["fees", "fee", "frais", "commission"],
  side: ["side", "type", "sens"],
  platform: ["platform", "plateforme", "exchange", "broker", "courtier"],
};

function resolveCol(header: string[], field: string): number {
  for (const alias of COL_ALIASES[field] ?? []) {
    const i = header.indexOf(alias);
    if (i !== -1) return i;
  }
  return -1;
}

function extractGeneric(rows: string[][], assetClass: AssetClass): ExtractResult {
  const header = lowerHeader(rows);
  const iTicker = resolveCol(header, "ticker");
  const iName = resolveCol(header, "name");
  const iClass = resolveCol(header, "assetClass");
  const iDate = resolveCol(header, "date");
  const iQty = resolveCol(header, "quantity");
  const iPrice = resolveCol(header, "price");
  const iFees = resolveCol(header, "fees");
  const iSide = resolveCol(header, "side");
  const iPlatform = resolveCol(header, "platform");

  const missing = [
    ["Ticker", iTicker],
    ["Date", iDate],
    ["Quantité", iQty],
    ["Prix", iPrice],
  ]
    .filter(([, i]) => i === -1)
    .map(([n]) => n as string);
  if (missing.length) {
    return {
      rows: [],
      errors: [
        `Colonnes manquantes : ${missing.join(", ")}. Colonnes trouvées : ${header.join(", ")}. Télécharge le modèle pour le bon format.`,
      ],
    };
  }

  const out: ExtractedRow[] = [];
  for (const row of rows.slice(1)) {
    const ticker = (row[iTicker] ?? "").trim().toUpperCase();
    if (!ticker || !/^[A-Z0-9.\-^]{1,12}$/.test(ticker)) continue;
    const date = isoDate(row[iDate] ?? "");
    const qty = num(row[iQty] ?? "");
    const price = num(row[iPrice] ?? "");
    const fees = iFees !== -1 ? num(row[iFees] ?? "0") || 0 : 0;
    const sideRaw = iSide !== -1 ? (row[iSide] ?? "").toUpperCase() : "BUY";
    const side: TxSide = sideRaw.includes("SELL") || sideRaw.includes("VENTE") ? "sell" : "buy";
    if (!date || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) continue;

    const rowClassRaw = iClass !== -1 ? (row[iClass] ?? "").trim().toLowerCase() : "";
    const cls: AssetClass =
      rowClassRaw.startsWith("crypto") ? "crypto" : rowClassRaw.startsWith("stock") || rowClassRaw.startsWith("action") ? "stock" : assetClass;

    out.push({
      ticker,
      name: (iName !== -1 ? row[iName]?.trim() : "") || ticker,
      assetClass: cls,
      side,
      quantity: qty,
      price,
      fees,
      txDate: date,
      platform: iPlatform !== -1 ? row[iPlatform]?.trim() || null : null,
      coingeckoId: cls === "crypto" ? resolveCoingeckoId(ticker) : null,
      extId: null,
    });
  }
  return { rows: out, errors: [] };
}

// ── Positions list (quick bootstrap) ─────────────────────────────────────────
// A plain holdings list — ticker, quantity, average price — with no trade
// history. Each row becomes a single seed "buy" transaction so the position's
// quantity, average cost (PRU) and invested amount come out exact. Built to be
// pasted (often AI-generated) and very forgiving on column names. Date is not
// required: a global "as of" date is applied unless a row carries its own.

const POSITION_ALIASES: Record<string, string[]> = {
  ticker: ["ticker", "symbol", "symbole", "asset", "coin", "actif"],
  name: ["name", "nom", "libelle", "libellé"],
  assetClass: ["asset_class", "class", "classe", "type", "type_actif", "categorie", "catégorie"],
  quantity: ["quantity", "qty", "quantité", "quantite", "amount", "shares", "parts", "units", "nombre", "volume"],
  price: [
    "average_price", "avg_price", "average price", "avg price", "avg cost", "average cost",
    "pru", "prix moyen", "prix de revient", "prix d'achat", "prix achat", "cost", "cost basis",
    "buy price", "prix unitaire", "unit price", "cours", "prix", "price",
  ],
  platform: ["platform", "plateforme", "exchange", "broker", "courtier"],
  date: ["date", "buy date", "date d'achat", "acquired", "acquisition"],
};

function resolvePositionCol(header: string[], field: string): number {
  for (const alias of POSITION_ALIASES[field] ?? []) {
    const i = header.indexOf(alias);
    if (i !== -1) return i;
  }
  return -1;
}

const TICKER_RE = /^[A-Z0-9.\-^]{1,12}$/;
function classFromText(raw: string): AssetClass | null {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("crypto")) return "crypto";
  if (s.startsWith("stock") || s.startsWith("action") || s.startsWith("etf") || s.startsWith("bourse"))
    return "stock";
  return null;
}

/**
 * Parse one headerless positional row. Two layouts are accepted, told apart by
 * whether the 2nd cell names an asset class:
 *   ticker, class, quantity, average_price [, name, platform]
 *   ticker, quantity, average_price [, name, platform]   (class = fallback)
 */
function parsePositionalRow(
  cells: string[],
  fallbackClass: AssetClass,
  asOfDate: string,
): ExtractedRow | null {
  const ticker = (cells[0] ?? "").trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) return null;

  const sniffed = classFromText(cells[1] ?? "");
  const cls: AssetClass = sniffed ?? fallbackClass;
  const base = sniffed ? 2 : 1; // first numeric column

  const qty = num(cells[base] ?? "");
  const price = num(cells[base + 1] ?? "");
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) return null;

  return {
    ticker,
    name: (cells[base + 2] ?? "").trim() || ticker,
    assetClass: cls,
    side: "buy",
    quantity: qty,
    price,
    fees: 0,
    txDate: asOfDate,
    platform: (cells[base + 3] ?? "").trim() || null,
    coingeckoId: cls === "crypto" ? resolveCoingeckoId(ticker) : null,
    extId: null,
  };
}

function extractPositions(
  rows: string[][],
  assetClass: AssetClass,
  asOfDate: string,
): ExtractResult {
  const header = lowerHeader(rows);
  const iTicker = resolvePositionCol(header, "ticker");

  // Headerless paste (often AI-generated): no recognizable header and the first
  // cell already looks like a ticker. Parse every row positionally.
  if (iTicker === -1 && TICKER_RE.test((rows[0]?.[0] ?? "").trim().toUpperCase())) {
    const out: ExtractedRow[] = [];
    for (const row of rows) {
      const parsed = parsePositionalRow(row, assetClass, asOfDate);
      if (parsed) out.push(parsed);
    }
    if (!out.length) {
      return {
        rows: [],
        errors: [
          "Aucune position lisible. Format attendu par ligne : ticker, classe, quantité, prix moyen (ex : BTC,crypto,0.5,38000).",
        ],
      };
    }
    return { rows: out, errors: [] };
  }

  // Header-based parsing (the downloadable template, or any labelled CSV).
  const iName = resolvePositionCol(header, "name");
  const iClass = resolvePositionCol(header, "assetClass");
  const iQty = resolvePositionCol(header, "quantity");
  const iPrice = resolvePositionCol(header, "price");
  const iPlatform = resolvePositionCol(header, "platform");
  const iDate = resolvePositionCol(header, "date");

  const missing = [
    ["Ticker", iTicker],
    ["Quantité", iQty],
    ["Prix moyen", iPrice],
  ]
    .filter(([, i]) => i === -1)
    .map(([n]) => n as string);
  if (missing.length) {
    return {
      rows: [],
      errors: [
        `Colonnes manquantes : ${missing.join(", ")}. Colonnes trouvées : ${header.join(", ")}. Format attendu : ticker, quantité, prix moyen (classe, nom, plateforme en option).`,
      ],
    };
  }

  const out: ExtractedRow[] = [];
  for (const row of rows.slice(1)) {
    const ticker = (row[iTicker] ?? "").trim().toUpperCase();
    if (!ticker || !TICKER_RE.test(ticker)) continue;
    const qty = num(row[iQty] ?? "");
    const price = num(row[iPrice] ?? "");
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) continue;

    const cls: AssetClass = (iClass !== -1 ? classFromText(row[iClass] ?? "") : null) ?? assetClass;
    const rowDate = iDate !== -1 ? isoDate(row[iDate] ?? "") : null;

    out.push({
      ticker,
      name: (iName !== -1 ? row[iName]?.trim() : "") || ticker,
      assetClass: cls,
      side: "buy",
      quantity: qty,
      price,
      fees: 0,
      txDate: rowDate ?? asOfDate,
      platform: iPlatform !== -1 ? row[iPlatform]?.trim() || null : null,
      coingeckoId: cls === "crypto" ? resolveCoingeckoId(ticker) : null,
      extId: null,
    });
  }
  return { rows: out, errors: [] };
}

// ── Public API ───────────────────────────────────────────────────────────────

function fingerprint(r: { ticker: string; txDate: string; quantity: number; price: number; side: TxSide }): string {
  return `${r.ticker}|${r.txDate}|${r.side}|${r.quantity.toFixed(8)}|${r.price.toFixed(6)}`;
}

function decodeFile(raw: Buffer): { text: string; error?: string } {
  if (raw.length > MAX_FILE_BYTES) return { text: "", error: "Fichier trop volumineux (max 8 Mo)." };
  if (looksLikeZip(raw)) {
    const entry = extractCsvFromZip(raw);
    if (!entry) return { text: "", error: "Aucun CSV trouvé dans l'archive ZIP." };
    return { text: entry.content };
  }
  return { text: raw.toString("utf-8") };
}

/** Parse a file into a preview (no DB writes), assigning a dedup status per row. */
export function previewImport(
  raw: Buffer,
  opts: { exchange: ExchangeId; assetClass: AssetClass; asOfDate?: string },
): PreviewResult {
  const { text, error } = decodeFile(raw);
  if (error) {
    return { exchange: opts.exchange, detected: "generic", rows: [], counts: zero(), errors: [error] };
  }
  const csvRows = parseCsv(text);
  if (csvRows.length < 2) {
    return {
      exchange: opts.exchange,
      detected: "generic",
      rows: [],
      counts: zero(),
      errors: ["CSV vide ou illisible (aucune ligne de données)."],
    };
  }

  const detected = detectExchange(csvRows);
  const exchange = opts.exchange === "auto" ? detected : opts.exchange;

  // Global acquisition date for seeded positions (defaults to today).
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(opts.asOfDate ?? "")
    ? (opts.asOfDate as string)
    : new Date().toISOString().slice(0, 10);

  let extracted: ExtractResult;
  switch (exchange) {
    case "positions":
      extracted = extractPositions(csvRows, opts.assetClass, asOfDate);
      break;
    case "kraken":
      extracted = isKrakenLedgers(csvRows) ? extractKrakenLedgers(csvRows) : extractKraken(csvRows);
      break;
    case "revolut": {
      const h = new Set(lowerHeader(csvRows));
      extracted = h.has("price per share")
        ? extractRevolut(csvRows)
        : extractRevolutCrypto(csvRows);
      break;
    }
    case "binance":
      extracted = extractBinance(csvRows);
      break;
    case "coinbase":
      extracted = extractCoinbase(csvRows);
      break;
    default:
      extracted = extractGeneric(csvRows, opts.assetClass);
  }

  const knownExtIds = existingExtIds();
  const knownFps = existingFingerprints();
  const seenExtIds = new Set<string>();
  const seenFps = new Set<string>();

  const rows: ParsedRow[] = extracted.rows.map((r) => {
    const fp = fingerprint(r);
    let status: RowStatus;
    let reason = r.ignored;
    if (r.ignored) {
      status = "ignored";
    } else if (
      (r.extId && (knownExtIds.has(r.extId) || seenExtIds.has(r.extId))) ||
      knownFps.has(fp) ||
      seenFps.has(fp)
    ) {
      status = "duplicate";
      reason = "Déjà importée";
    } else {
      status = "new";
      if (r.extId) seenExtIds.add(r.extId);
      seenFps.add(fp);
    }
    return { ...r, status, reason, fingerprint: fp };
  });

  const counts = {
    new: rows.filter((r) => r.status === "new").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
    ignored: rows.filter((r) => r.status === "ignored").length,
    total: rows.length,
  };

  return { exchange, detected, rows, counts, errors: extracted.errors };
}

/**
 * Insert the rows the user confirmed (the client sends only those it wants,
 * possibly with values edited/completed by hand). Each row is validated and
 * re-deduped server-side by ext_id then value fingerprint, so re-imports and
 * overlaps never create duplicates. Row status is not trusted here: an
 * "ignored" row the user completed and included is inserted like any other.
 */
export function commitImport(rows: ParsedRow[]): { imported: number; skipped: number } {
  const knownExtIds = existingExtIds();
  const knownFps = existingFingerprints();
  const toInsert: NewTransaction[] = [];
  let skipped = 0;

  for (const r of rows) {
    const qty = Number(r.quantity);
    const price = Number(r.price);
    if (!r.ticker || !r.txDate || !(qty > 0) || !(price >= 0)) {
      skipped++;
      continue;
    }
    const fp = fingerprint({ ...r, quantity: qty, price });
    if ((r.extId && knownExtIds.has(r.extId)) || knownFps.has(fp)) {
      skipped++;
      continue;
    }
    knownFps.add(fp);
    if (r.extId) knownExtIds.add(r.extId);
    toInsert.push({
      ticker: r.ticker,
      name: r.name || r.ticker,
      assetClass: r.assetClass,
      side: r.side,
      quantity: qty,
      price,
      fees: Number(r.fees) || 0,
      txDate: r.txDate,
      platform: r.platform,
      coingeckoId: r.coingeckoId,
      note: r.platform ? `Import ${r.platform}` : "Import CSV",
      extId: r.extId,
    });
  }
  addTransactions(toInsert);
  return { imported: toInsert.length, skipped };
}

/** Downloadable canonical template the user can fill for any exchange. */
export function buildTemplate(): string {
  return [
    "ticker,name,asset_class,side,quantity,price,fees,date,platform",
    "BTC,Bitcoin,crypto,buy,0.05,42000,1.5,2024-01-15,Kraken",
    "ETH,Ethereum,crypto,buy,1.2,2300,0.9,2024-02-03,Binance",
    "CW8,Amundi MSCI World,stock,buy,3,480.25,0,2024-03-10,Trade Republic",
    "SOL,Solana,crypto,sell,5,150,0.5,2024-04-22,Kraken",
  ].join("\n");
}

/**
 * Simple positions template (no history): one current holding per line, just
 * ticker + quantity + average price. The fastest way to seed the app.
 */
export function buildPositionsTemplate(): string {
  return [
    "ticker,asset_class,quantity,average_price,name,platform",
    "BTC,crypto,0.5,38000,Bitcoin,Kraken",
    "ETH,crypto,4,2100,Ethereum,Binance",
    "CW8,stock,3,480.25,Amundi MSCI World,Trade Republic",
    "AAPL,stock,10,175.40,Apple,Revolut",
  ].join("\n");
}

function zero() {
  return { new: 0, duplicate: 0, ignored: 0, total: 0 };
}
