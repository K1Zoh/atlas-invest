import type { NextRequest } from "next/server";
import { buildTimeline } from "@/lib/analytics";
import { ok, oops } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const days = Math.min(1825, Math.max(7, Number(req.nextUrl.searchParams.get("days") ?? 365)));
    const benchmark = req.nextUrl.searchParams.get("benchmark") === "1";
    const points = await buildTimeline(days, benchmark);
    return ok({ points });
  } catch (e) {
    return oops(e);
  }
}
