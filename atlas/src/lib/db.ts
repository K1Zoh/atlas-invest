import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "atlas.db");

declare global {
  // Reuse the connection across hot reloads in dev.
  var __atlasDb: Database.Database | undefined;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker        TEXT NOT NULL,
  name          TEXT NOT NULL,
  asset_class   TEXT NOT NULL CHECK (asset_class IN ('stock','crypto')),
  side          TEXT NOT NULL CHECK (side IN ('buy','sell')),
  quantity      REAL NOT NULL CHECK (quantity > 0),
  price         REAL NOT NULL CHECK (price >= 0),
  fees          REAL NOT NULL DEFAULT 0,
  tx_date       TEXT NOT NULL,
  platform      TEXT,
  coingecko_id  TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_ticker ON transactions (ticker, asset_class);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions (tx_date);

CREATE TABLE IF NOT EXISTS watchlist (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker        TEXT NOT NULL,
  name          TEXT NOT NULL,
  asset_class   TEXT NOT NULL CHECK (asset_class IN ('stock','crypto')),
  coingecko_id  TEXT,
  target_price  REAL,
  note          TEXT,
  added_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ticker, asset_class)
);

CREATE TABLE IF NOT EXISTS alerts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker        TEXT NOT NULL,
  asset_class   TEXT NOT NULL CHECK (asset_class IN ('stock','crypto')),
  coingecko_id  TEXT,
  kind          TEXT NOT NULL,
  threshold     REAL NOT NULL,
  label         TEXT NOT NULL DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1,
  triggered_at  TEXT,
  notified      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dividends (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker           TEXT NOT NULL,
  name             TEXT NOT NULL,
  ex_date          TEXT NOT NULL,
  pay_date         TEXT,
  amount_per_share REAL NOT NULL,
  quantity         REAL NOT NULL,
  total_received   REAL NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'EUR',
  note             TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_analyses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  scope           TEXT NOT NULL CHECK (scope IN ('portfolio','asset')),
  asset_class     TEXT NOT NULL DEFAULT 'all',
  ticker          TEXT,
  model           TEXT NOT NULL,
  content         TEXT NOT NULL,
  recommendations TEXT,
  snapshot        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_cache (
  ticker          TEXT NOT NULL,
  asset_class     TEXT NOT NULL,
  price_eur       REAL NOT NULL,
  change_24h_pct  REAL,
  native_currency TEXT NOT NULL DEFAULT 'EUR',
  native_price    REAL NOT NULL,
  spark_7d        TEXT,
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (ticker, asset_class)
);

CREATE TABLE IF NOT EXISTS history_cache (
  cache_key  TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/** Idempotent migrations applied after the base schema. */
function migrate(db: Database.Database): void {
  // ext_id: source-of-truth identifier from an exchange export (e.g. a Kraken
  // txid), used to dedupe re-imports precisely instead of guessing by value.
  const cols = db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "ext_id")) {
    db.exec("ALTER TABLE transactions ADD COLUMN ext_id TEXT");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_tx_ext ON transactions (ext_id)");
}

function createDb(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export function getDb(): Database.Database {
  if (!globalThis.__atlasDb) {
    globalThis.__atlasDb = createDb();
  }
  return globalThis.__atlasDb;
}
