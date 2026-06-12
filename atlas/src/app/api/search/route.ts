import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { searchAll } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) return bad("Requête trop courte (2 caractères minimum)");
    const results = await searchAll(q);
    return ok({ results });
  } catch (e) {
    return oops(e);
  }
}
