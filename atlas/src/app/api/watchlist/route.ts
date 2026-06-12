import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { getQuotes } from "@/lib/market";
import { addWatchlistItem, listWatchlist } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = listWatchlist();
    const { quotes } = await getQuotes(
      items.map((i) => ({ ticker: i.ticker, assetClass: i.assetClass, coingeckoId: i.coingeckoId })),
    );
    const enriched = items.map((i) => {
      const q = quotes.get(`${i.assetClass}:${i.ticker}`);
      const price = q?.priceEur ?? null;
      return {
        ...i,
        price,
        change24hPct: q?.change24hPct ?? null,
        distanceToTargetPct:
          price && i.targetPrice ? ((i.targetPrice - price) / price) * 100 : null,
      };
    });
    return ok({ items: enriched });
  } catch (e) {
    return oops(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      ticker?: string;
      name?: string;
      assetClass?: "stock" | "crypto";
      coingeckoId?: string | null;
      targetPrice?: number | null;
      note?: string | null;
    };
    if (!body.ticker?.trim() || !body.name?.trim()) return bad("ticker et nom requis");
    if (body.assetClass !== "stock" && body.assetClass !== "crypto") return bad("classe invalide");
    addWatchlistItem({
      ticker: body.ticker,
      name: body.name,
      assetClass: body.assetClass,
      coingeckoId: body.coingeckoId,
      targetPrice: body.targetPrice,
      note: body.note,
    });
    return ok({ added: true });
  } catch (e) {
    return oops(e);
  }
}
