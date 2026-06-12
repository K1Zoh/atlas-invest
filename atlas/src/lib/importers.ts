import { resolveCoingeckoId } from "./market/coingecko";
import { addTransaction, listTransactions } from "./repo";
import type { AssetClass } from "./types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface ImportReport {
  imported: number;
  skipped: number;
  errors: string[];
  format: string;
}

/** Minimal CSV parser with quoted-field support. */
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

const COL_ALIASES: Record<string, string[]> = {
  ticker: ["ticker", "symbol", "asset", "coin", "currency name", "actif"],
  date: ["date", "date(utc)", "tx_date", "time", "timestamp", "date utc"],
  quantity: ["quantity", "qty", "executed", "amount", "quantity transacted", "quantité"],
  price: [
    "price",
    "prix",
    "price per share",
    "unit price",
    "spot price at transaction",
    "prix unitaire",
  ],
  fees: ["fees", "fee", "frais", "commission"],
  side: ["side", "type", "transaction type", "sens"],
};

function resolveCol(header: string[], field: string): number {
  const lower = header.map((h) => h.trim().toLowerCase());
  for (const alias of COL_ALIASES[field] ?? []) {
    const idx = lower.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseNumber(raw: string): number {
  const cleaned = raw
    .replace(/[€$]/g, "")
    .replace(/\s/g, "")
    .replace(/[A-Za-z]+$/, "") // Binance "0.5BTC" style suffixes
    .replace(",", ".");
  return parseFloat(cleaned);
}

function parseDate(raw: string): string | null {
  const d = new Date(raw.trim());
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  // dd/mm/yyyy
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

const QUOTE_SUFFIXES = ["USDT", "USDC", "BUSD", "EUR", "USD", "BTC", "ETH", "BNB"];

function stripQuote(pair: string): string | null {
  const p = pair.toUpperCase().trim();
  for (const q of QUOTE_SUFFIXES) {
    if (p.endsWith(q) && p.length > q.length) return p.slice(0, -q.length);
  }
  return null;
}

function existingKeys(): Set<string> {
  return new Set(
    listTransactions().map(
      (t) => `${t.ticker}|${t.txDate}|${t.quantity.toFixed(8)}|${t.price.toFixed(6)}`,
    ),
  );
}

export function importCsv(raw: Buffer, assetClass: AssetClass): ImportReport {
  if (raw.length > MAX_FILE_BYTES) {
    return { imported: 0, skipped: 0, errors: ["Fichier trop volumineux (max 5 Mo)."], format: "?" };
  }
  const rows = parseCsv(raw.toString("utf-8"));
  if (rows.length < 2) {
    return { imported: 0, skipped: 0, errors: ["CSV vide ou illisible."], format: "?" };
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const headerSet = new Set(header);

  if (["pair", "side", "executed"].every((c) => headerSet.has(c))) {
    return importBinance(rows);
  }
  if (headerSet.has("transaction type") && headerSet.has("quantity transacted")) {
    return importCoinbase(rows);
  }
  return importGeneric(rows, assetClass);
}

function importGeneric(rows: string[][], assetClass: AssetClass): ImportReport {
  const header = rows[0];
  const report: ImportReport = { imported: 0, skipped: 0, errors: [], format: "generic" };

  const iTicker = resolveCol(header, "ticker");
  const iDate = resolveCol(header, "date");
  const iQty = resolveCol(header, "quantity");
  const iPrice = resolveCol(header, "price");
  const iFees = resolveCol(header, "fees");
  const iSide = resolveCol(header, "side");

  const missing = [
    ["Ticker/Symbol", iTicker],
    ["Date", iDate],
    ["Quantity", iQty],
    ["Price", iPrice],
  ]
    .filter(([, idx]) => idx === -1)
    .map(([name]) => name as string);
  if (missing.length) {
    report.errors.push(
      `Colonnes manquantes : ${missing.join(", ")}. Colonnes trouvées : ${header.join(", ")}`,
    );
    report.skipped = rows.length - 1;
    return report;
  }

  const seen = existingKeys();
  for (const row of rows.slice(1)) {
    const ticker = (row[iTicker] ?? "").trim().toUpperCase();
    if (!ticker || !/^[A-Z0-9.\-^]{1,12}$/.test(ticker)) {
      report.skipped++;
      continue;
    }
    const date = parseDate(row[iDate] ?? "");
    const qty = parseNumber(row[iQty] ?? "");
    const price = parseNumber(row[iPrice] ?? "");
    const fees = iFees !== -1 ? parseNumber(row[iFees] ?? "0") || 0 : 0;
    const sideRaw = iSide !== -1 ? (row[iSide] ?? "").toUpperCase() : "BUY";
    const side = sideRaw.includes("SELL") || sideRaw.includes("VENTE") ? "sell" : "buy";

    if (!date || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
      report.skipped++;
      continue;
    }
    const key = `${ticker}|${date}|${qty.toFixed(8)}|${price.toFixed(6)}`;
    if (seen.has(key)) {
      report.skipped++;
      continue;
    }
    addTransaction({
      ticker,
      name: ticker,
      assetClass,
      side,
      quantity: qty,
      price,
      fees,
      txDate: date,
      coingeckoId: assetClass === "crypto" ? resolveCoingeckoId(ticker) : null,
      note: "Import CSV",
    });
    seen.add(key);
    report.imported++;
  }
  return report;
}

function importBinance(rows: string[][]): ImportReport {
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const report: ImportReport = { imported: 0, skipped: 0, errors: [], format: "binance" };
  const idx = (name: string) => header.indexOf(name);
  const iDate = idx("date(utc)") !== -1 ? idx("date(utc)") : idx("date");
  const [iPair, iSide, iPrice, iExec, iFee] = [
    idx("pair"),
    idx("side"),
    idx("price"),
    idx("executed"),
    idx("fee"),
  ];

  const seen = existingKeys();
  for (const row of rows.slice(1)) {
    const pair = (row[iPair] ?? "").trim();
    const sideRaw = (row[iSide] ?? "").trim().toUpperCase();
    if (sideRaw !== "BUY" && sideRaw !== "SELL") {
      report.skipped++;
      continue;
    }
    if (!pair.toUpperCase().endsWith("EUR")) {
      report.errors.push(`Ignoré ${pair} — seules les paires EUR sont importées automatiquement.`);
      report.skipped++;
      continue;
    }
    const ticker = stripQuote(pair);
    const date = parseDate(row[iDate] ?? "");
    const price = parseNumber(row[iPrice] ?? "");
    const qty = parseNumber(row[iExec] ?? "");
    const fee = iFee !== -1 ? parseNumber(row[iFee] ?? "0") || 0 : 0;
    if (!ticker || !date || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
      report.skipped++;
      continue;
    }
    const key = `${ticker}|${date}|${qty.toFixed(8)}|${price.toFixed(6)}`;
    if (seen.has(key)) {
      report.skipped++;
      continue;
    }
    addTransaction({
      ticker,
      name: ticker,
      assetClass: "crypto",
      side: sideRaw === "BUY" ? "buy" : "sell",
      quantity: qty,
      price,
      fees: fee,
      txDate: date,
      platform: "Binance",
      coingeckoId: resolveCoingeckoId(ticker),
      note: "Import Binance",
    });
    seen.add(key);
    report.imported++;
  }
  return report;
}

function importCoinbase(rows: string[][]): ImportReport {
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const report: ImportReport = { imported: 0, skipped: 0, errors: [], format: "coinbase" };
  const idx = (name: string) => header.indexOf(name);
  const iDate = idx("timestamp") !== -1 ? idx("timestamp") : idx("date");
  const iType = idx("transaction type");
  const iAsset = idx("asset");
  const iQty = idx("quantity transacted");
  const iSpot = idx("spot price at transaction");
  const iSpotCur = idx("spot price currency");
  const iFees = idx("fees") !== -1 ? idx("fees") : idx("fees and/or spread");

  const seen = existingKeys();
  for (const row of rows.slice(1)) {
    const typeRaw = (row[iType] ?? "").trim().toUpperCase();
    const isBuy = typeRaw.includes("BUY") || typeRaw.includes("RECEIVE");
    const isSell = typeRaw.includes("SELL") || typeRaw.includes("CONVERT");
    if (!isBuy && !isSell) {
      report.skipped++;
      continue;
    }
    if (iSpotCur !== -1 && (row[iSpotCur] ?? "").trim().toUpperCase() !== "EUR") {
      report.errors.push(`Ignoré ${row[iAsset]} — seules les lignes en EUR sont importées.`);
      report.skipped++;
      continue;
    }
    const ticker = (row[iAsset] ?? "").trim().toUpperCase();
    const date = parseDate(row[iDate] ?? "");
    const qty = parseNumber(row[iQty] ?? "");
    const price = parseNumber(row[iSpot] ?? "");
    const fees = iFees !== -1 ? parseNumber(row[iFees] ?? "0") || 0 : 0;
    if (!ticker || !date || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
      report.skipped++;
      continue;
    }
    const key = `${ticker}|${date}|${qty.toFixed(8)}|${price.toFixed(6)}`;
    if (seen.has(key)) {
      report.skipped++;
      continue;
    }
    addTransaction({
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
      note: "Import Coinbase",
    });
    seen.add(key);
    report.imported++;
  }
  return report;
}
