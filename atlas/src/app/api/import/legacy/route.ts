import { ok, oops } from "@/lib/api-helpers";
import { legacyDbAvailable, migrateFromLegacy } from "@/lib/legacy";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ available: legacyDbAvailable() });
  } catch (e) {
    return oops(e);
  }
}

export async function POST() {
  try {
    const report = migrateFromLegacy();
    return ok(report);
  } catch (e) {
    return oops(e);
  }
}
