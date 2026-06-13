import { buildTemplate } from "@/lib/importers";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(buildTemplate(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="atlas-modele-import.csv"',
    },
  });
}
