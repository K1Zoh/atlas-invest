import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { setPositionAccount } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** Tag a stock position with its fiscal envelope (PEA / CTO / none). */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { ticker?: string; account?: string | null };
    if (!body.ticker?.trim()) return bad("ticker requis");
    const account =
      body.account === "pea" || body.account === "cto" ? body.account : null;
    if (body.account != null && account === null) return bad("compte invalide (pea/cto)");
    const updated = setPositionAccount(body.ticker, account);
    return ok({ updated });
  } catch (e) {
    return oops(e);
  }
}
