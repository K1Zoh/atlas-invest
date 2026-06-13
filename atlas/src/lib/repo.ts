import { getDb } from "./db";
import type {
  AiAnalysis,
  AiRecommendation,
  AlertKind,
  AssetClass,
  Position,
  PriceAlert,
  Transaction,
  TxSide,
  WatchlistItem,
} from "./types";

// ── Transactions ────────────────────────────────────────────────────────────

interface TxRow {
  id: number;
  ticker: string;
  name: string;
  asset_class: AssetClass;
  side: TxSide;
  quantity: number;
  price: number;
  fees: number;
  tx_date: string;
  platform: string | null;
  coingecko_id: string | null;
  note: string | null;
  created_at: string;
}

function mapTx(r: TxRow): Transaction {
  return {
    id: r.id,
    ticker: r.ticker,
    name: r.name,
    assetClass: r.asset_class,
    side: r.side,
    quantity: r.quantity,
    price: r.price,
    fees: r.fees,
    txDate: r.tx_date,
    platform: r.platform,
    coingeckoId: r.coingecko_id,
    note: r.note,
    createdAt: r.created_at,
  };
}

export interface NewTransaction {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  side: TxSide;
  quantity: number;
  price: number;
  fees?: number;
  txDate: string;
  platform?: string | null;
  coingeckoId?: string | null;
  note?: string | null;
  extId?: string | null;
}

export function addTransaction(tx: NewTransaction): number {
  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO transactions (ticker, name, asset_class, side, quantity, price, fees, tx_date, platform, coingecko_id, note, ext_id)
       VALUES (@ticker, @name, @assetClass, @side, @quantity, @price, @fees, @txDate, @platform, @coingeckoId, @note, @extId)`,
    )
    .run({
      ...tx,
      ticker: tx.ticker.toUpperCase().trim(),
      fees: tx.fees ?? 0,
      platform: tx.platform ?? null,
      coingeckoId: tx.coingeckoId ?? null,
      note: tx.note ?? null,
      extId: tx.extId ?? null,
    });
  return Number(res.lastInsertRowid);
}

/** Insert many transactions in one transaction (used by CSV/exchange import). */
export function addTransactions(txs: NewTransaction[]): number {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO transactions (ticker, name, asset_class, side, quantity, price, fees, tx_date, platform, coingecko_id, note, ext_id)
     VALUES (@ticker, @name, @assetClass, @side, @quantity, @price, @fees, @txDate, @platform, @coingeckoId, @note, @extId)`,
  );
  const run = db.transaction((rows: NewTransaction[]) => {
    for (const tx of rows) {
      insert.run({
        ...tx,
        ticker: tx.ticker.toUpperCase().trim(),
        fees: tx.fees ?? 0,
        platform: tx.platform ?? null,
        coingeckoId: tx.coingeckoId ?? null,
        note: tx.note ?? null,
        extId: tx.extId ?? null,
      });
    }
  });
  run(txs);
  return txs.length;
}

/** Set of source identifiers already imported, for precise dedupe. */
export function existingExtIds(): Set<string> {
  const rows = getDb()
    .prepare("SELECT ext_id FROM transactions WHERE ext_id IS NOT NULL")
    .all() as { ext_id: string }[];
  return new Set(rows.map((r) => r.ext_id));
}

/** Value-based fingerprints for rows that have no source id (manual CSV). */
export function existingFingerprints(): Set<string> {
  return new Set(
    listTransactions().map(
      (t) => `${t.ticker}|${t.txDate}|${t.quantity.toFixed(8)}|${t.price.toFixed(6)}`,
    ),
  );
}

export function updateTransaction(id: number, tx: Partial<NewTransaction>): void {
  const existing = getDb()
    .prepare("SELECT * FROM transactions WHERE id = ?")
    .get(id) as TxRow | undefined;
  if (!existing) throw new Error(`Transaction ${id} introuvable`);
  const merged = { ...mapTx(existing), ...tx };
  getDb()
    .prepare(
      `UPDATE transactions SET ticker=@ticker, name=@name, asset_class=@assetClass, side=@side,
       quantity=@quantity, price=@price, fees=@fees, tx_date=@txDate, platform=@platform,
       coingecko_id=@coingeckoId, note=@note WHERE id=@id`,
    )
    .run({
      id,
      ticker: merged.ticker.toUpperCase().trim(),
      name: merged.name,
      assetClass: merged.assetClass,
      side: merged.side,
      quantity: merged.quantity,
      price: merged.price,
      fees: merged.fees ?? 0,
      txDate: merged.txDate,
      platform: merged.platform ?? null,
      coingeckoId: merged.coingeckoId ?? null,
      note: merged.note ?? null,
    });
}

export function deleteTransaction(id: number): void {
  getDb().prepare("DELETE FROM transactions WHERE id = ?").run(id);
}

export function listTransactions(filter?: {
  ticker?: string;
  assetClass?: AssetClass;
}): Transaction[] {
  let sql = "SELECT * FROM transactions WHERE 1=1";
  const params: Record<string, string> = {};
  if (filter?.ticker) {
    sql += " AND ticker = @ticker";
    params.ticker = filter.ticker.toUpperCase();
  }
  if (filter?.assetClass) {
    sql += " AND asset_class = @assetClass";
    params.assetClass = filter.assetClass;
  }
  sql += " ORDER BY tx_date DESC, id DESC";
  return (getDb().prepare(sql).all(params) as TxRow[]).map(mapTx);
}

/**
 * Aggregate transactions into open positions using average cost (PRU).
 * Sells reduce the cost basis proportionally and accrue realized P&L.
 */
export function getPositions(assetClass?: AssetClass): Position[] {
  const txs = listTransactions(assetClass ? { assetClass } : undefined)
    .slice()
    .sort((a, b) => (a.txDate === b.txDate ? a.id - b.id : a.txDate.localeCompare(b.txDate)));

  const acc = new Map<string, Position>();
  for (const t of txs) {
    const key = `${t.assetClass}:${t.ticker}`;
    let p = acc.get(key);
    if (!p) {
      p = {
        ticker: t.ticker,
        name: t.name,
        assetClass: t.assetClass,
        quantity: 0,
        avgCost: 0,
        invested: 0,
        realizedPnl: 0,
        platform: t.platform,
        coingeckoId: t.coingeckoId,
        firstBuy: t.txDate,
      };
      acc.set(key, p);
    }
    if (t.coingeckoId) p.coingeckoId = t.coingeckoId;
    if (t.platform) p.platform = t.platform;
    p.name = t.name || p.name;

    if (t.side === "buy") {
      p.invested += t.quantity * t.price + t.fees;
      p.quantity += t.quantity;
    } else {
      const qtyBefore = p.quantity;
      if (qtyBefore <= 1e-12) continue;
      const sellQty = Math.min(t.quantity, qtyBefore);
      const pru = p.invested / qtyBefore;
      const proceeds = sellQty * t.price - t.fees;
      p.realizedPnl += proceeds - pru * sellQty;
      const keptFraction = Math.max(0, qtyBefore - sellQty) / qtyBefore;
      p.quantity = qtyBefore - sellQty;
      p.invested *= keptFraction;
    }
    if (p.quantity > 1e-12) p.avgCost = p.invested / p.quantity;
  }

  return [...acc.values()]
    .filter((p) => p.quantity > 1e-9)
    .map((p) => ({ ...p, avgCost: p.quantity > 0 ? p.invested / p.quantity : 0 }));
}

export function totalRealizedPnl(assetClass?: AssetClass): number {
  // Realized P&L including fully-closed positions.
  const txs = listTransactions(assetClass ? { assetClass } : undefined)
    .slice()
    .sort((a, b) => (a.txDate === b.txDate ? a.id - b.id : a.txDate.localeCompare(b.txDate)));
  const acc = new Map<string, { qty: number; cost: number; realized: number }>();
  for (const t of txs) {
    const key = `${t.assetClass}:${t.ticker}`;
    let p = acc.get(key);
    if (!p) {
      p = { qty: 0, cost: 0, realized: 0 };
      acc.set(key, p);
    }
    if (t.side === "buy") {
      p.cost += t.quantity * t.price + t.fees;
      p.qty += t.quantity;
    } else if (p.qty > 1e-12) {
      const sellQty = Math.min(t.quantity, p.qty);
      const pru = p.cost / p.qty;
      p.realized += sellQty * t.price - t.fees - pru * sellQty;
      const kept = Math.max(0, p.qty - sellQty) / p.qty;
      p.qty -= sellQty;
      p.cost *= kept;
    }
  }
  return [...acc.values()].reduce((s, p) => s + p.realized, 0);
}

// ── Watchlist ───────────────────────────────────────────────────────────────

interface WlRow {
  id: number;
  ticker: string;
  name: string;
  asset_class: AssetClass;
  coingecko_id: string | null;
  target_price: number | null;
  note: string | null;
  added_at: string;
}

export function listWatchlist(): WatchlistItem[] {
  return (
    getDb().prepare("SELECT * FROM watchlist ORDER BY added_at DESC").all() as WlRow[]
  ).map((r) => ({
    id: r.id,
    ticker: r.ticker,
    name: r.name,
    assetClass: r.asset_class,
    coingeckoId: r.coingecko_id,
    targetPrice: r.target_price,
    note: r.note,
    addedAt: r.added_at,
  }));
}

export function addWatchlistItem(item: {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  coingeckoId?: string | null;
  targetPrice?: number | null;
  note?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO watchlist (ticker, name, asset_class, coingecko_id, target_price, note)
       VALUES (@ticker, @name, @assetClass, @coingeckoId, @targetPrice, @note)
       ON CONFLICT (ticker, asset_class) DO UPDATE SET
         name = excluded.name, target_price = excluded.target_price, note = excluded.note`,
    )
    .run({
      ticker: item.ticker.toUpperCase().trim(),
      name: item.name,
      assetClass: item.assetClass,
      coingeckoId: item.coingeckoId ?? null,
      targetPrice: item.targetPrice ?? null,
      note: item.note ?? null,
    });
}

export function updateWatchlistItem(
  id: number,
  fields: { targetPrice?: number | null; note?: string | null },
): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  if ("targetPrice" in fields) {
    sets.push("target_price = @targetPrice");
    params.targetPrice = fields.targetPrice ?? null;
  }
  if ("note" in fields) {
    sets.push("note = @note");
    params.note = fields.note ?? null;
  }
  if (!sets.length) return;
  getDb().prepare(`UPDATE watchlist SET ${sets.join(", ")} WHERE id = @id`).run(params);
}

export function deleteWatchlistItem(id: number): void {
  getDb().prepare("DELETE FROM watchlist WHERE id = ?").run(id);
}

// ── Alerts ──────────────────────────────────────────────────────────────────

interface AlertRow {
  id: number;
  ticker: string;
  asset_class: AssetClass;
  coingecko_id: string | null;
  kind: AlertKind;
  threshold: number;
  label: string;
  active: number;
  triggered_at: string | null;
  created_at: string;
}

function mapAlert(r: AlertRow): PriceAlert {
  return {
    id: r.id,
    ticker: r.ticker,
    assetClass: r.asset_class,
    coingeckoId: r.coingecko_id,
    kind: r.kind,
    threshold: r.threshold,
    label: r.label,
    active: !!r.active,
    triggeredAt: r.triggered_at,
    createdAt: r.created_at,
  };
}

export function listAlerts(activeOnly = false): PriceAlert[] {
  const sql = activeOnly
    ? "SELECT * FROM alerts WHERE active = 1 ORDER BY created_at DESC"
    : "SELECT * FROM alerts ORDER BY active DESC, created_at DESC";
  return (getDb().prepare(sql).all() as AlertRow[]).map(mapAlert);
}

export function addAlert(a: {
  ticker: string;
  assetClass: AssetClass;
  coingeckoId?: string | null;
  kind: AlertKind;
  threshold: number;
  label?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO alerts (ticker, asset_class, coingecko_id, kind, threshold, label)
       VALUES (@ticker, @assetClass, @coingeckoId, @kind, @threshold, @label)`,
    )
    .run({
      ticker: a.ticker.toUpperCase().trim(),
      assetClass: a.assetClass,
      coingeckoId: a.coingeckoId ?? null,
      kind: a.kind,
      threshold: a.threshold,
      label: a.label ?? "",
    });
}

export function deleteAlert(id: number): void {
  getDb().prepare("DELETE FROM alerts WHERE id = ?").run(id);
}

export function setAlertActive(id: number, active: boolean): void {
  getDb()
    .prepare("UPDATE alerts SET active = ?, triggered_at = CASE WHEN ? = 1 THEN NULL ELSE triggered_at END WHERE id = ?")
    .run(active ? 1 : 0, active ? 1 : 0, id);
}

export function markAlertTriggered(id: number): void {
  getDb()
    .prepare("UPDATE alerts SET active = 0, triggered_at = datetime('now'), notified = 1 WHERE id = ?")
    .run(id);
}

// ── AI analyses ─────────────────────────────────────────────────────────────

interface AnalysisRow {
  id: number;
  scope: "portfolio" | "asset";
  asset_class: AssetClass | "all";
  ticker: string | null;
  model: string;
  content: string;
  recommendations: string | null;
  snapshot: string | null;
  created_at: string;
}

export function saveAnalysis(a: {
  scope: "portfolio" | "asset";
  assetClass: AssetClass | "all";
  ticker?: string | null;
  model: string;
  content: string;
  recommendations?: AiRecommendation[] | null;
  snapshot?: string | null;
}): number {
  const res = getDb()
    .prepare(
      `INSERT INTO ai_analyses (scope, asset_class, ticker, model, content, recommendations, snapshot)
       VALUES (@scope, @assetClass, @ticker, @model, @content, @recommendations, @snapshot)`,
    )
    .run({
      scope: a.scope,
      assetClass: a.assetClass,
      ticker: a.ticker ?? null,
      model: a.model,
      content: a.content,
      recommendations: a.recommendations ? JSON.stringify(a.recommendations) : null,
      snapshot: a.snapshot ?? null,
    });
  return Number(res.lastInsertRowid);
}

export function listAnalyses(filter?: {
  scope?: "portfolio" | "asset";
  ticker?: string;
  limit?: number;
}): AiAnalysis[] {
  let sql = "SELECT * FROM ai_analyses WHERE 1=1";
  const params: Record<string, unknown> = {};
  if (filter?.scope) {
    sql += " AND scope = @scope";
    params.scope = filter.scope;
  }
  if (filter?.ticker) {
    sql += " AND ticker = @ticker";
    params.ticker = filter.ticker.toUpperCase();
  }
  sql += " ORDER BY created_at DESC LIMIT @limit";
  params.limit = filter?.limit ?? 50;
  return (getDb().prepare(sql).all(params) as AnalysisRow[]).map((r) => ({
    id: r.id,
    scope: r.scope,
    assetClass: r.asset_class,
    ticker: r.ticker,
    model: r.model,
    content: r.content,
    recommendations: r.recommendations
      ? (JSON.parse(r.recommendations) as AiRecommendation[])
      : null,
    snapshot: r.snapshot,
    createdAt: r.created_at,
  }));
}

// ── Dividends ───────────────────────────────────────────────────────────────

export interface Dividend {
  id: number;
  ticker: string;
  name: string;
  exDate: string;
  payDate: string | null;
  amountPerShare: number;
  quantity: number;
  totalReceived: number;
  currency: string;
  note: string | null;
}

export function listDividends(): Dividend[] {
  interface Row {
    id: number;
    ticker: string;
    name: string;
    ex_date: string;
    pay_date: string | null;
    amount_per_share: number;
    quantity: number;
    total_received: number;
    currency: string;
    note: string | null;
  }
  return (
    getDb().prepare("SELECT * FROM dividends ORDER BY ex_date DESC").all() as Row[]
  ).map((r) => ({
    id: r.id,
    ticker: r.ticker,
    name: r.name,
    exDate: r.ex_date,
    payDate: r.pay_date,
    amountPerShare: r.amount_per_share,
    quantity: r.quantity,
    totalReceived: r.total_received,
    currency: r.currency,
    note: r.note,
  }));
}

export function addDividend(d: {
  ticker: string;
  name: string;
  exDate: string;
  payDate?: string | null;
  amountPerShare: number;
  quantity: number;
  note?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO dividends (ticker, name, ex_date, pay_date, amount_per_share, quantity, total_received, note)
       VALUES (@ticker, @name, @exDate, @payDate, @amountPerShare, @quantity, @totalReceived, @note)`,
    )
    .run({
      ticker: d.ticker.toUpperCase().trim(),
      name: d.name,
      exDate: d.exDate,
      payDate: d.payDate ?? null,
      amountPerShare: d.amountPerShare,
      quantity: d.quantity,
      totalReceived: d.amountPerShare * d.quantity,
      note: d.note ?? null,
    });
}

export function deleteDividend(id: number): void {
  getDb().prepare("DELETE FROM dividends WHERE id = ?").run(id);
}
