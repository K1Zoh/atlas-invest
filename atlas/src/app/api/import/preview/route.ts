import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { previewImport, type ExchangeId } from "@/lib/importers";
import type { AssetClass } from "@/lib/types";

export const dynamic = "force-dynamic";

const EXCHANGES: ExchangeId[] = ["auto", "kraken", "revolut", "binance", "coinbase", "generic"];

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const exchange = (form.get("exchange") as ExchangeId | null) ?? "auto";
    const assetClass = (form.get("assetClass") as AssetClass | null) ?? "crypto";
    if (!(file instanceof File)) return bad("Fichier manquant");
    if (!EXCHANGES.includes(exchange)) return bad("Exchange invalide");
    if (assetClass !== "stock" && assetClass !== "crypto") return bad("Classe invalide");

    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = previewImport(buffer, { exchange, assetClass });
    return ok(preview);
  } catch (e) {
    return oops(e);
  }
}
