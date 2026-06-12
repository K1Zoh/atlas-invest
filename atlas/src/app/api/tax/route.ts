import type { NextRequest } from "next/server";
import { ok, oops } from "@/lib/api-helpers";
import { availableTaxYears, computeCryptoTax, computeStockRealized } from "@/lib/tax";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const yearParam = req.nextUrl.searchParams.get("year");
    const year = yearParam ? Number(yearParam) : undefined;
    const stockLines = computeStockRealized(year);
    const crypto = computeCryptoTax(year);
    const stockNet = stockLines.reduce((s, l) => s + l.pnl, 0);
    return ok({
      years: availableTaxYears(),
      stock: {
        lines: stockLines,
        net: Math.round(stockNet * 100) / 100,
        pfuEstimate: Math.round(Math.max(0, stockNet) * 30) / 100,
      },
      crypto,
    });
  } catch (e) {
    return oops(e);
  }
}
