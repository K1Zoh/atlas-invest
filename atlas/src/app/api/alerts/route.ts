import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { addAlert, listAlerts } from "@/lib/repo";
import type { AlertKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const KINDS: AlertKind[] = ["above", "below", "buy_target", "sell_target", "stop_loss", "take_profit"];

export async function GET() {
  try {
    return ok({ alerts: listAlerts() });
  } catch (e) {
    return oops(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      ticker?: string;
      assetClass?: "stock" | "crypto";
      coingeckoId?: string | null;
      kind?: AlertKind;
      threshold?: number;
      label?: string;
    };
    if (!body.ticker?.trim()) return bad("ticker requis");
    if (body.assetClass !== "stock" && body.assetClass !== "crypto") return bad("classe invalide");
    if (!body.kind || !KINDS.includes(body.kind)) return bad("type d'alerte invalide");
    if (!body.threshold || body.threshold <= 0) return bad("seuil invalide");
    addAlert({
      ticker: body.ticker,
      assetClass: body.assetClass,
      coingeckoId: body.coingeckoId,
      kind: body.kind,
      threshold: body.threshold,
      label: body.label,
    });
    return ok({ added: true });
  } catch (e) {
    return oops(e);
  }
}
