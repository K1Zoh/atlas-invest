import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { rateFromEur } from "@/lib/market/fx";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["EUR", "USD", "GBP", "CHF"]);

export async function GET(req: NextRequest) {
  try {
    const to = (req.nextUrl.searchParams.get("to") ?? "EUR").toUpperCase();
    if (!ALLOWED.has(to)) return bad("Devise non supportée");
    const rate = await rateFromEur(to);
    return ok({ currency: to, rate });
  } catch (e) {
    return oops(e);
  }
}
