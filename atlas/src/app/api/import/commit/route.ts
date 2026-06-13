import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { commitImport, type ParsedRow } from "@/lib/importers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { rows?: ParsedRow[] };
    if (!Array.isArray(body.rows)) return bad("rows requis");
    const result = commitImport(body.rows);
    return ok(result);
  } catch (e) {
    return oops(e);
  }
}
