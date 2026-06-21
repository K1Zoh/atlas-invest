import type { NextRequest } from "next/server";
import { buildPositionsTemplate, buildTemplate } from "@/lib/importers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const positions = req.nextUrl.searchParams.get("type") === "positions";
  const body = positions ? buildPositionsTemplate() : buildTemplate();
  const filename = positions ? "atlas-modele-positions.csv" : "atlas-modele-import.csv";
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
