import type { NextRequest } from "next/server";
import { ok, oops } from "@/lib/api-helpers";
import { availableTaxYears, computeCryptoTax, computeStockTax } from "@/lib/tax";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const yearParam = req.nextUrl.searchParams.get("year");
    const year = yearParam ? Number(yearParam) : undefined;
    return ok({
      years: availableTaxYears(),
      stock: computeStockTax(year),
      crypto: computeCryptoTax(year),
    });
  } catch (e) {
    return oops(e);
  }
}
