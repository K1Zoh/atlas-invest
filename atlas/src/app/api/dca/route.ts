import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { getSetting, setSetting } from "@/lib/settings";
import type { AssetClass } from "@/lib/types";

export const dynamic = "force-dynamic";

interface DcaPlan {
  id: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  coingeckoId: string | null;
  amount: number;
}

const KEY = "dca.plans";

function read(): DcaPlan[] {
  try {
    const raw = getSetting(KEY);
    return raw ? (JSON.parse(raw) as DcaPlan[]) : [];
  } catch {
    return [];
  }
}

function write(plans: DcaPlan[]): void {
  setSetting(KEY, JSON.stringify(plans));
}

export async function GET() {
  try {
    return ok({ plans: read() });
  } catch (e) {
    return oops(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<DcaPlan>;
    if (!body.ticker?.trim()) return bad("ticker requis");
    if (body.assetClass !== "stock" && body.assetClass !== "crypto") return bad("classe invalide");
    if (!body.amount || body.amount <= 0) return bad("montant invalide");

    const plans = read();
    const ticker = body.ticker.toUpperCase().trim();
    // One plan per asset: update the amount if it already exists.
    const existing = plans.find((p) => p.ticker === ticker && p.assetClass === body.assetClass);
    if (existing) {
      existing.amount = body.amount;
      existing.name = body.name ?? existing.name;
    } else {
      plans.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ticker,
        name: body.name ?? ticker,
        assetClass: body.assetClass,
        coingeckoId: body.coingeckoId ?? null,
        amount: body.amount,
      });
    }
    write(plans);
    return ok({ plans });
  } catch (e) {
    return oops(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return bad("id requis");
    write(read().filter((p) => p.id !== id));
    return ok({ deleted: true });
  } catch (e) {
    return oops(e);
  }
}
