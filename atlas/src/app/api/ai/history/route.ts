import type { NextRequest } from "next/server";
import { ok, oops } from "@/lib/api-helpers";
import { listAnalyses } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const scope = req.nextUrl.searchParams.get("scope") as "portfolio" | "asset" | null;
    const ticker = req.nextUrl.searchParams.get("ticker") ?? undefined;
    return ok({
      analyses: listAnalyses({ scope: scope ?? undefined, ticker, limit: 40 }),
    });
  } catch (e) {
    return oops(e);
  }
}
