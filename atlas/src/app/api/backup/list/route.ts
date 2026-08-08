import { BACKUP_DIR, listBackups } from "@/lib/backups";
import { DATA_DIR } from "@/lib/db";
import { ok, oops } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** Sauvegardes disponibles, et où vivent les données. */
export async function GET() {
  try {
    return ok({ backups: listBackups(), backupDir: BACKUP_DIR, dataDir: DATA_DIR });
  } catch (e) {
    return oops(e);
  }
}
