import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";
import { setSetting } from "./settings";
import type { AssetClass } from "./types";

/**
 * One-click migration from the previous Streamlit app
 * (../data/portfolio.db + ../data/settings.json, relative to atlas/).
 */

const LEGACY_DIR = path.resolve(process.cwd(), "..", "data");
const LEGACY_DB = path.join(LEGACY_DIR, "portfolio.db");
const LEGACY_SETTINGS = path.join(LEGACY_DIR, "settings.json");

export function legacyDbAvailable(): boolean {
  return fs.existsSync(LEGACY_DB);
}

interface LegacyTx {
  ticker: string;
  name: string;
  tx_date: string;
  quantity: number;
  price: number;
  fees: number;
  asset_class: string | null;
  coingecko_id: string | null;
  platform: string | null;
}

interface LegacyWl {
  ticker: string;
  name: string;
  asset_class: string | null;
  coingecko_id: string | null;
  note: string | null;
}

interface LegacyDiv {
  ticker: string;
  name: string;
  ex_date: string;
  pay_date: string | null;
  amount_per_share: number;
  quantity: number;
  total_received: number;
  currency: string;
  notes: string | null;
}

export interface MigrationReport {
  transactions: number;
  skipped: number;
  watchlist: number;
  dividends: number;
  settings: number;
  errors: string[];
}

export function migrateFromLegacy(): MigrationReport {
  const report: MigrationReport = {
    transactions: 0,
    skipped: 0,
    watchlist: 0,
    dividends: 0,
    settings: 0,
    errors: [],
  };
  if (!legacyDbAvailable()) {
    report.errors.push(`Ancienne base introuvable : ${LEGACY_DB}`);
    return report;
  }

  const legacy = new Database(LEGACY_DB, { readonly: true, fileMustExist: true });
  const db = getDb();

  try {
    const txs = legacy
      .prepare(
        "SELECT ticker, name, tx_date, quantity, price, fees, asset_class, coingecko_id, platform FROM transactions ORDER BY tx_date, id",
      )
      .all() as LegacyTx[];

    const exists = db.prepare(
      `SELECT 1 FROM transactions
       WHERE ticker = ? AND asset_class = ? AND tx_date = ? AND side = ?
         AND ABS(quantity - ?) < 1e-9 AND ABS(price - ?) < 1e-9`,
    );
    const insert = db.prepare(
      `INSERT INTO transactions (ticker, name, asset_class, side, quantity, price, fees, tx_date, platform, coingecko_id, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Importé de STOCK_TERMINAL')`,
    );

    const insertAll = db.transaction((rows: LegacyTx[]) => {
      for (const t of rows) {
        const assetClass: AssetClass = t.asset_class === "crypto" ? "crypto" : "stock";
        const side = t.quantity >= 0 ? "buy" : "sell";
        const qty = Math.abs(t.quantity);
        if (qty <= 1e-12) {
          report.skipped++;
          continue;
        }
        if (exists.get(t.ticker.toUpperCase(), assetClass, t.tx_date, side, qty, t.price)) {
          report.skipped++;
          continue;
        }
        insert.run(
          t.ticker.toUpperCase(),
          t.name ?? t.ticker,
          assetClass,
          side,
          qty,
          t.price,
          t.fees ?? 0,
          t.tx_date,
          t.platform ?? null,
          t.coingecko_id ?? null,
        );
        report.transactions++;
      }
    });
    insertAll(txs);
  } catch (e) {
    report.errors.push(`Transactions : ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const wl = legacy
      .prepare("SELECT ticker, name, asset_class, coingecko_id, note FROM watchlist")
      .all() as LegacyWl[];
    const insertWl = db.prepare(
      `INSERT INTO watchlist (ticker, name, asset_class, coingecko_id, note)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (ticker, asset_class) DO NOTHING`,
    );
    for (const w of wl) {
      const res = insertWl.run(
        w.ticker.toUpperCase(),
        w.name ?? w.ticker,
        w.asset_class === "crypto" ? "crypto" : "stock",
        w.coingecko_id ?? null,
        w.note ?? null,
      );
      if (res.changes > 0) report.watchlist++;
    }
  } catch (e) {
    report.errors.push(`Watchlist : ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const divs = legacy
      .prepare(
        "SELECT ticker, name, ex_date, pay_date, amount_per_share, quantity, total_received, currency, notes FROM dividends",
      )
      .all() as LegacyDiv[];
    const existsDiv = db.prepare(
      "SELECT 1 FROM dividends WHERE ticker = ? AND ex_date = ? AND ABS(total_received - ?) < 1e-9",
    );
    const insertDiv = db.prepare(
      `INSERT INTO dividends (ticker, name, ex_date, pay_date, amount_per_share, quantity, total_received, currency, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const d of divs) {
      if (existsDiv.get(d.ticker.toUpperCase(), d.ex_date, d.total_received)) continue;
      insertDiv.run(
        d.ticker.toUpperCase(),
        d.name ?? d.ticker,
        d.ex_date,
        d.pay_date ?? null,
        d.amount_per_share,
        d.quantity,
        d.total_received,
        d.currency ?? "EUR",
        d.notes ?? null,
      );
      report.dividends++;
    }
  } catch (e) {
    report.errors.push(`Dividendes : ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    if (fs.existsSync(LEGACY_SETTINGS)) {
      const raw = JSON.parse(fs.readFileSync(LEGACY_SETTINGS, "utf-8")) as Record<
        string,
        Record<string, unknown>
      >;
      const mapping: [string, string, string][] = [
        ["smtp", "host", "smtp.host"],
        ["smtp", "port", "smtp.port"],
        ["smtp", "user", "smtp.user"],
        ["smtp", "pass_", "smtp.pass"],
        ["smtp", "to", "smtp.to"],
        ["telegram", "bot_token", "notify.telegram_token"],
        ["telegram", "chat_id", "notify.telegram_chat_id"],
        ["discord", "webhook_url", "notify.discord_webhook"],
      ];
      for (const [section, key, target] of mapping) {
        const v = raw[section]?.[key];
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          setSetting(target, String(v).trim());
          report.settings++;
        }
      }
    }
  } catch (e) {
    report.errors.push(`Paramètres : ${e instanceof Error ? e.message : String(e)}`);
  }

  legacy.close();
  return report;
}
