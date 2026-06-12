import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { getSingleQuote } from "@/lib/market";
import type { AssetClass } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ticker = req.nextUrl.searchParams.get("ticker");
    const assetClass = req.nextUrl.searchParams.get("class") as AssetClass | null;
    const coingeckoId = req.nextUrl.searchParams.get("cgId");
    if (!ticker || !assetClass) return bad("ticker et class sont requis");
    const quote = await getSingleQuote({ ticker, assetClass, coingeckoId });
    return ok({ quote });
  } catch (e) {
    return oops(e);
  }
}
