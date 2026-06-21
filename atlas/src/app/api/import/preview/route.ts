import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { previewImport, type ExchangeId } from "@/lib/importers";
import type { AssetClass } from "@/lib/types";

export const dynamic = "force-dynamic";

const EXCHANGES: ExchangeId[] = [
  "auto",
  "kraken",
  "revolut",
  "binance",
  "coinbase",
  "generic",
  "positions",
];

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const text = form.get("text");
    const exchange = (form.get("exchange") as ExchangeId | null) ?? "auto";
    const assetClass = (form.get("assetClass") as AssetClass | null) ?? "crypto";
    const asOfDate = (form.get("asOfDate") as string | null) ?? undefined;
    if (!EXCHANGES.includes(exchange)) return bad("Exchange invalide");
    if (assetClass !== "stock" && assetClass !== "crypto") return bad("Classe invalide");

    // Accept either an uploaded file or pasted text (positions list).
    let buffer: Buffer;
    if (file instanceof File) {
      buffer = Buffer.from(await file.arrayBuffer());
    } else if (typeof text === "string" && text.trim()) {
      buffer = Buffer.from(text, "utf-8");
    } else {
      return bad("Fichier ou liste manquant");
    }

    const preview = previewImport(buffer, { exchange, assetClass, asOfDate });
    return ok(preview);
  } catch (e) {
    return oops(e);
  }
}
