import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { getAssetHistory } from "@/lib/market";
import type { AssetClass } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ticker = req.nextUrl.searchParams.get("ticker");
    const assetClass = req.nextUrl.searchParams.get("class") as AssetClass | null;
    const coingeckoId = req.nextUrl.searchParams.get("cgId");
    const days = Math.min(1825, Math.max(7, Number(req.nextUrl.searchParams.get("days") ?? 365)));
    if (!ticker || !assetClass) return bad("ticker et class sont requis");
    const points = await getAssetHistory({ ticker, assetClass, coingeckoId }, days);
    return ok({ points });
  } catch (e) {
    return oops(e);
  }
}
