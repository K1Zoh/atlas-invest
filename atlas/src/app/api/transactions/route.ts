import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { addTransaction, listTransactions, type NewTransaction } from "@/lib/repo";
import type { AssetClass } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ticker = req.nextUrl.searchParams.get("ticker") ?? undefined;
    const assetClass = (req.nextUrl.searchParams.get("class") as AssetClass | null) ?? undefined;
    return ok({ transactions: listTransactions({ ticker, assetClass }) });
  } catch (e) {
    return oops(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<NewTransaction>;
    const errors: string[] = [];
    if (!body.ticker?.trim()) errors.push("ticker manquant");
    if (!body.name?.trim()) errors.push("nom manquant");
    if (body.assetClass !== "stock" && body.assetClass !== "crypto") errors.push("classe invalide");
    if (body.side !== "buy" && body.side !== "sell") errors.push("sens invalide (buy/sell)");
    if (!body.quantity || body.quantity <= 0) errors.push("quantité invalide");
    if (body.price === undefined || body.price < 0) errors.push("prix invalide");
    if (!body.txDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.txDate)) errors.push("date invalide");
    if (errors.length) return bad(errors.join(", "));

    const id = addTransaction(body as NewTransaction);
    return ok({ id });
  } catch (e) {
    return oops(e);
  }
}
