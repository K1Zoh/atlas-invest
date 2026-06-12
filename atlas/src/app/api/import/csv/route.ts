import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { importCsv } from "@/lib/importers";
import type { AssetClass } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const assetClass = (form.get("assetClass") as AssetClass | null) ?? "stock";
    if (!(file instanceof File)) return bad("Fichier manquant");
    if (assetClass !== "stock" && assetClass !== "crypto") return bad("classe invalide");
    const buffer = Buffer.from(await file.arrayBuffer());
    const report = importCsv(buffer, assetClass);
    return ok(report);
  } catch (e) {
    return oops(e);
  }
}
