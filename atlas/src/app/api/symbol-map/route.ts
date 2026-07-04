import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { getStockQuotes } from "@/lib/market/yahoo";
import {
  deleteSymbolMapping,
  listSymbolMappings,
  saveSymbolMapping,
} from "@/lib/market/symbol-map";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ mappings: listSymbolMappings() });
  } catch (e) {
    return oops(e);
  }
}

/** Manual mapping: verified against Yahoo before being saved. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { ticker?: string; yahooSymbol?: string };
    const ticker = body.ticker?.trim().toUpperCase();
    const yahooSymbol = body.yahooSymbol?.trim().toUpperCase();
    if (!ticker || !yahooSymbol) return bad("ticker et symbole Yahoo requis");

    const quotes = await getStockQuotes([yahooSymbol]);
    const q = quotes.get(yahooSymbol);
    if (!q) return bad(`Yahoo ne connaît pas « ${yahooSymbol} » — vérifie le symbole (ex : VUAA.DE).`);

    saveSymbolMapping(ticker, yahooSymbol, { name: q.name, source: "manual" });
    return ok({ saved: true, name: q.name, price: q.price, currency: q.currency });
  } catch (e) {
    return oops(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ticker = req.nextUrl.searchParams.get("ticker");
    if (!ticker?.trim()) return bad("ticker requis");
    deleteSymbolMapping(ticker);
    return ok({ deleted: true });
  } catch (e) {
    return oops(e);
  }
}
