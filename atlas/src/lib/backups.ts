import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Dossier des sauvegardes produites par atlas.sh. Hors du dossier
 * d'installation : ni une mise à jour ni une réinstallation ne l'atteignent.
 * Doit rester aligné sur BACKUP_DIR dans atlas.sh.
 */
const ATLAS_HOME = process.env.ATLAS_HOME ?? path.join(os.homedir(), ".atlas");
export const BACKUP_DIR =
  process.env.ATLAS_BACKUP_DIR ?? path.join(ATLAS_HOME, "backups");

/** Nom produit par do_backup : atlas-<horodatage>-<motif>.db */
const BACKUP_NAME = /^atlas-\d{8}-\d{6}-[a-z-]+\.db$/;

export interface BackupEntry {
  file: string;
  bytes: number;
  modifiedAt: string;
  /** null si la sauvegarde est illisible — elle reste listée, pas proposée. */
  transactions: number | null;
}

function countTransactions(file: string): number | null {
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      const row = db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as
        | { n: number }
        | undefined;
      return row?.n ?? null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  } finally {
    // Les sauvegardes sont en mode WAL : les ouvrir, même en lecture seule,
    // crée leurs sidecars. Sans cette purge, une paire s'accumulerait par
    // sauvegarde à chaque affichage de la liste.
    for (const ext of ["-wal", "-shm"]) {
      try {
        fs.rmSync(file + ext, { force: true });
      } catch {
        // Un sidecar qu'on ne peut pas retirer n'empêche pas de lister.
      }
    }
  }
}

/** Les sauvegardes disponibles, la plus récente d'abord. */
export function listBackups(): BackupEntry[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => BACKUP_NAME.test(name))
    .map((name) => {
      const full = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(full);
      return {
        file: name,
        bytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        transactions: countTransactions(full),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

/**
 * Chemin absolu d'une sauvegarde à partir de son nom. Renvoie null si le nom
 * ne correspond pas au format attendu ou si le fichier n'existe pas — ce qui
 * ferme la porte à toute traversée de répertoire depuis l'API.
 */
export function resolveBackupPath(file: string): string | null {
  if (!BACKUP_NAME.test(file)) return null;
  const full = path.join(BACKUP_DIR, file);
  if (path.dirname(full) !== BACKUP_DIR) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

/** Octets d'une sauvegarde, ou null si le nom est refusé ou le fichier absent. */
export function readBackupBytes(file: string): Buffer | null {
  const full = resolveBackupPath(file);
  if (!full) return null;
  return fs.readFileSync(full);
}
