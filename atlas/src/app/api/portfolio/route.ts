import type { NextRequest } from "next/server";
import {
  allocationByAsset,
  allocationByCategory,
  allocationByClass,
  computeHhi,
  concentrationAlerts,
  loadPortfolio,
} from "@/lib/analytics";
import { ok, oops } from "@/lib/api-helpers";
import { fillStockSparks } from "@/lib/market";
import { notifyTriggeredAlerts, type TriggeredAlertInfo } from "@/lib/notify";
import { getPositions, listAlerts, markAlertTriggered } from "@/lib/repo";
import type { PriceAlert, Quote } from "@/lib/types";

export const dynamic = "force-dynamic";

function alertCondition(alert: PriceAlert, price: number): boolean {
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

async function checkAlerts(quotes: Map<string, Quote>): Promise<TriggeredAlertInfo[]> {
  const triggered: TriggeredAlertInfo[] = [];
  for (const alert of listAlerts(true)) {
    const q = quotes.get(`${alert.assetClass}:${alert.ticker}`);
    if (!q) continue;
    if (alertCondition(alert, q.priceEur)) {
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

export async function GET(req: NextRequest) {
  try {
    const force = req.nextUrl.searchParams.get("force") === "1";
    const positions = getPositions();
    const { views, summary, quotes, errors } = await loadPortfolio(positions, force);
    await fillStockSparks(
      positions.map((p) => ({ ticker: p.ticker, assetClass: p.assetClass, coingeckoId: p.coingeckoId })),
      quotes,
    );
    // Re-attach sparks filled above.
    for (const v of views) {
      const q = quotes.get(`${v.assetClass}:${v.ticker}`);
      if (q?.spark7d) v.spark7d = q.spark7d;
    }

    const triggeredAlerts = await checkAlerts(quotes);

    return ok({
      views,
      summary,
      hhi: computeHhi(views),
      concentration: concentrationAlerts(views),
      allocations: {
        byClass: allocationByClass(views),
        byCategory: allocationByCategory(views),
        byAsset: allocationByAsset(views),
      },
      triggeredAlerts,
      errors,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return oops(e);
  }
}
