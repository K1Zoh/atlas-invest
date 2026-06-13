import type { NextRequest } from "next/server";
import {
  allocationByAsset,
  allocationByCategory,
  allocationByClass,
  computeHhi,
  concentrationAlerts,
  loadPortfolio,
} from "@/lib/analytics";
import { evaluateAlerts } from "@/lib/alert-engine";
import { ok, oops } from "@/lib/api-helpers";
import { fillStockSparks } from "@/lib/market";
import { getPositions } from "@/lib/repo";

export const dynamic = "force-dynamic";

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

    const triggeredAlerts = await evaluateAlerts(quotes);

    // Real freshness = age of the oldest quote actually used (cache-aware),
    // not the response time. Lets the UI show how stale prices really are.
    let quotesAsOf: string | null = null;
    for (const v of views) {
      const q = quotes.get(`${v.assetClass}:${v.ticker}`);
      if (q?.updatedAt && (quotesAsOf === null || q.updatedAt < quotesAsOf)) {
        quotesAsOf = q.updatedAt;
      }
    }

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
      quotesAsOf,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return oops(e);
  }
}
