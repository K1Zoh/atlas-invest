import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Les données vivent hors du dossier d'installation : une mise à jour, un
 * déplacement du dossier ou une réinstallation ne doivent jamais les atteindre.
 *
 * ATLAS_HOME est respecté pour rester aligné sur atlas.sh, qui l'utilise déjà
 * pour Node, les journaux et les sauvegardes — sans quoi le shell et l'app
 * pourraient viser deux bases différentes en silence. ATLAS_DATA_DIR reste
 * disponible pour les tests et les cas particuliers.
 */
const ATLAS_HOME = process.env.ATLAS_HOME ?? path.join(os.homedir(), ".atlas");
export const DATA_DIR = process.env.ATLAS_DATA_DIR ?? path.join(ATLAS_HOME, "data");
export const DB_PATH = path.join(DATA_DIR, "atlas.db");

/** Emplacement historique, à l'intérieur du dossier d'installation. */
export const LEGACY_DB_PATH = path.join(process.cwd(), "data", "atlas.db");

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

CREATE TABLE IF NOT EXISTS symbol_map (
  ticker        TEXT PRIMARY KEY,
  yahoo_symbol  TEXT NOT NULL,
  name          TEXT,
  source        TEXT NOT NULL DEFAULT 'auto',
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
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
  // account: fiscal envelope for stock/ETF lines ('pea' or 'cto', NULL = unknown/CTO).
  if (!cols.some((c) => c.name === "account")) {
    db.exec("ALTER TABLE transactions ADD COLUMN account TEXT");
  }
}

/**
 * Apply the base schema and idempotent migrations to a connection. Exported so
 * tests can build a throwaway in-memory database through the exact same DDL as
 * production, instead of duplicating (and drifting from) the schema.
 */
export function initSchema(db: Database.Database): void {
  db.exec(SCHEMA);
  migrate(db);
}

/**
 * Déplace la base de l'ancien emplacement (dans le dossier d'installation) vers
 * le nouveau, une seule fois. Ordre imposé, du plus sûr au plus destructeur :
 * checkpoint, copie, vérification, bascule, mise de côté de l'original.
 *
 * Tout est synchrone : appelée pendant l'initialisation de getDb(), avant que
 * quiconque puisse écrire. C'est aussi pourquoi on replie le WAL à la main
 * plutôt que d'utiliser l'API backup() de better-sqlite3, qui est asynchrone.
 *
 * L'original n'est jamais supprimé, seulement renommé.
 */
export function migrateLegacyDb(): void {
  if (path.resolve(DB_PATH) === path.resolve(LEGACY_DB_PATH)) return;
  if (fs.existsSync(DB_PATH)) return;
  if (!fs.existsSync(LEGACY_DB_PATH)) return;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const staging = `${DB_PATH}.migration`;
  fs.rmSync(staging, { force: true });

  // Replier le WAL dans le fichier principal, sinon la copie serait incomplète.
  const source = new Database(LEGACY_DB_PATH);
  try {
    source.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    source.close();
  }

  fs.copyFileSync(LEGACY_DB_PATH, staging);

  let healthy = false;
  try {
    const probe = new Database(staging, { readonly: true, fileMustExist: true });
    try {
      healthy = probe.pragma("integrity_check", { simple: true }) === "ok";
    } finally {
      probe.close();
    }
  } catch {
    healthy = false;
  }

  if (!healthy) {
    fs.rmSync(staging, { force: true });
    throw new Error(
      `Migration annulée : la copie de ${LEGACY_DB_PATH} n'a pas passé integrity_check. ` +
        `L'original est intact.`,
    );
  }

  fs.renameSync(staging, DB_PATH);
  // Ouvrir une base WAL, même en lecture seule, crée ses -wal/-shm : ils
  // porteraient le nom du fichier de travail et survivraient à la bascule.
  for (const ext of ["-wal", "-shm"]) {
    fs.rmSync(staging + ext, { force: true });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.renameSync(LEGACY_DB_PATH, `${LEGACY_DB_PATH}.migre-${stamp}`);
  // Un -wal orphelin se réappliquerait lors d'une restauration ultérieure.
  for (const ext of ["-wal", "-shm"]) {
    fs.rmSync(LEGACY_DB_PATH + ext, { force: true });
  }
}

function createDb(): Database.Database {
  migrateLegacyDb();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

export function getDb(): Database.Database {
  if (!globalThis.__atlasDb) {
    globalThis.__atlasDb = createDb();
  }
  return globalThis.__atlasDb;
}

/**
 * Produce a consistent snapshot of the database as a Buffer (checkpoints the
 * WAL into the main file first so nothing is missing). Used by backup export.
 */
export function snapshotDb(): Buffer {
  const db = getDb();
  db.pragma("wal_checkpoint(TRUNCATE)");
  return fs.readFileSync(DB_PATH);
}

/**
 * Replace the database file with new bytes (restore). The caller is expected to
 * have validated the bytes. Closes the live connection, swaps the file, and
 * drops the cached handle so the next getDb() reopens the restored database.
 */
export function replaceDb(bytes: Buffer): void {
  if (globalThis.__atlasDb) {
    globalThis.__atlasDb.close();
    globalThis.__atlasDb = undefined;
  }
  fs.writeFileSync(DB_PATH, bytes);
  // Stale WAL/SHM would otherwise be applied on top of the restored file.
  for (const ext of ["-wal", "-shm"]) {
    try {
      fs.rmSync(DB_PATH + ext, { force: true });
    } catch {
      // ignore
    }
  }
}
