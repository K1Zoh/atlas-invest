import { getQuotes, type AssetRef } from "./market";
import { notifyTriggeredAlerts, type TriggeredAlertInfo } from "./notify";
import { listAlerts, markAlertTriggered } from "./repo";
import type { PriceAlert, Quote } from "./types";

/** Whether an alert's threshold condition is met at the given price. */
export function alertConditionMet(alert: PriceAlert, price: number): boolean {
  switch (alert.kind) {
    case "above":
    case "sell_target":
    case "take_profit":
      return price >= alert.threshold;
    case "below":
    case "buy_target":
    case "stop_loss":
      return price <= alert.threshold;
    default:
      return false;
  }
}

/**
 * Evaluate a set of already-fetched quotes against active alerts, mark the
 * triggered ones, and fire notifications. Shared by the dashboard fetch and
 * the background cron so the logic stays identical.
 */
export async function evaluateAlerts(quotes: Map<string, Quote>): Promise<TriggeredAlertInfo[]> {
  const triggered: TriggeredAlertInfo[] = [];
  for (const alert of listAlerts(true)) {
    const q = quotes.get(`${alert.assetClass}:${alert.ticker}`);
    if (!q) continue;
    if (alertConditionMet(alert, q.priceEur)) {
      markAlertTriggered(alert.id);
      triggered.push({
        ticker: alert.ticker,
        assetClass: alert.assetClass,
        kind: alert.kind,
        threshold: alert.threshold,
        currentPrice: q.priceEur,
        label: alert.label,
      });
    }
  }
  if (triggered.length) {
    await notifyTriggeredAlerts(triggered).catch(() => undefined);
  }
  return triggered;
}

/**
 * Self-contained alert run for the background cron: fetches fresh quotes for
 * every active alert's asset, then evaluates + notifies. Returns a summary.
 */
export async function runScheduledAlertCheck(): Promise<{
  checked: number;
  triggered: TriggeredAlertInfo[];
  errors: string[];
}> {
  const alerts = listAlerts(true);
  if (!alerts.length) return { checked: 0, triggered: [], errors: [] };

  const refs = new Map<string, AssetRef>();
  for (const a of alerts) {
    const key = `${a.assetClass}:${a.ticker}`;
    if (!refs.has(key)) {
      refs.set(key, { ticker: a.ticker, assetClass: a.assetClass, coingeckoId: a.coingeckoId });
    }
  }
  const { quotes, errors } = await getQuotes([...refs.values()], true);
  const triggered = await evaluateAlerts(quotes);
  return { checked: alerts.length, triggered, errors };
}
