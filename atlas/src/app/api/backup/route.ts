import { snapshotDb } from "@/lib/db";
import { oops } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** Download a consistent snapshot of the local database. */
export async function GET() {
  try {
    const bytes = snapshotDb();
    const date = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="atlas-sauvegarde-${date}.db"`,
        "content-length": String(bytes.length),
      },
    });
  } catch (e) {
    return oops(e);
  }
}
