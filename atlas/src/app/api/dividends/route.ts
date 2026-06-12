import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { addDividend, deleteDividend, listDividends } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ dividends: listDividends() });
  } catch (e) {
    return oops(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      ticker?: string;
      name?: string;
      exDate?: string;
      payDate?: string | null;
      amountPerShare?: number;
      quantity?: number;
      note?: string | null;
    };
    if (!body.ticker?.trim()) return bad("ticker requis");
    if (!body.exDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.exDate)) return bad("date invalide");
    if (!body.amountPerShare || body.amountPerShare <= 0) return bad("montant invalide");
    if (!body.quantity || body.quantity <= 0) return bad("quantité invalide");
    addDividend({
      ticker: body.ticker,
      name: body.name ?? body.ticker,
      exDate: body.exDate,
      payDate: body.payDate,
      amountPerShare: body.amountPerShare,
      quantity: body.quantity,
      note: body.note,
    });
    return ok({ added: true });
  } catch (e) {
    return oops(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id)) return bad("id invalide");
    deleteDividend(id);
    return ok({ deleted: true });
  } catch (e) {
    return oops(e);
  }
}
