import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

afterEach(() => {
  delete process.env.ATLAS_BACKUP_DIR;
  vi.resetModules();
});

async function loadBackups(dir: string) {
  process.env.ATLAS_BACKUP_DIR = dir;
  vi.resetModules();
  return import("./backups");
}

function makeBackup(dir: string, name: string, rows: number): void {
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, name));
  db.exec("CREATE TABLE transactions (id INTEGER PRIMARY KEY, ticker TEXT)");
  const insert = db.prepare("INSERT INTO transactions (ticker) VALUES (?)");
  for (let i = 0; i < rows; i += 1) insert.run(`T${i}`);
  db.close();
}

describe("listBackups", () => {
  it("liste les sauvegardes, la plus récente d'abord, avec le nombre de transactions", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-bk-"));
    makeBackup(dir, "atlas-20260101-120000-manuel.db", 2);
    makeBackup(dir, "atlas-20260202-120000-pre-update.db", 7);
    // Horodatage explicite : le tri ne doit pas dépendre de l'ordre d'écriture.
    fs.utimesSync(path.join(dir, "atlas-20260101-120000-manuel.db"), 1000, 1000);
    fs.utimesSync(path.join(dir, "atlas-20260202-120000-pre-update.db"), 2000, 2000);

    const { listBackups } = await loadBackups(dir);
    const list = listBackups();

    expect(list).toHaveLength(2);
    expect(list[0].file).toBe("atlas-20260202-120000-pre-update.db");
    expect(list[0].transactions).toBe(7);
    expect(list[1].transactions).toBe(2);
    expect(list[0].bytes).toBeGreaterThan(0);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("renvoie une liste vide quand le dossier n'existe pas", async () => {
    const { listBackups } = await loadBackups(path.join(os.tmpdir(), "atlas-absent-xyz"));
    expect(listBackups()).toEqual([]);
  });

  it("ignore les fichiers qui ne sont pas des sauvegardes Atlas", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-bk2-"));
    makeBackup(dir, "atlas-20260101-120000-manuel.db", 1);
    fs.writeFileSync(path.join(dir, "notes.txt"), "bruit");
    fs.writeFileSync(path.join(dir, ".en-cours-123.db"), "temporaire");

    const { listBackups } = await loadBackups(dir);
    expect(listBackups().map((b) => b.file)).toEqual(["atlas-20260101-120000-manuel.db"]);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("liste une sauvegarde illisible sans compter ses transactions", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-bk7-"));
    fs.writeFileSync(path.join(dir, "atlas-20260101-120000-manuel.db"), "pas une base");

    const { listBackups } = await loadBackups(dir);
    const list = listBackups();
    expect(list).toHaveLength(1);
    expect(list[0].transactions).toBeNull();

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("resolveBackupPath", () => {
  it("résout un nom de sauvegarde connu", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-bk3-"));
    makeBackup(dir, "atlas-20260101-120000-manuel.db", 1);
    const { resolveBackupPath } = await loadBackups(dir);
    expect(resolveBackupPath("atlas-20260101-120000-manuel.db")).toBe(
      path.join(dir, "atlas-20260101-120000-manuel.db"),
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuse toute traversée de répertoire", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-bk4-"));
    const { resolveBackupPath } = await loadBackups(dir);
    expect(resolveBackupPath("../../etc/passwd")).toBeNull();
    expect(resolveBackupPath("/etc/passwd")).toBeNull();
    expect(resolveBackupPath("inconnu.db")).toBeNull();
    expect(resolveBackupPath("atlas-20260101-120000-../../x.db")).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("readBackupBytes", () => {
  it("lit les octets d'une sauvegarde connue", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-bk5-"));
    makeBackup(dir, "atlas-20260101-120000-manuel.db", 1);
    const { readBackupBytes } = await loadBackups(dir);
    const bytes = readBackupBytes("atlas-20260101-120000-manuel.db");
    expect(bytes).not.toBeNull();
    expect(bytes!.toString("utf-8", 0, 16)).toBe("SQLite format 3\0");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("renvoie null pour un nom refusé", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-bk6-"));
    const { readBackupBytes } = await loadBackups(dir);
    expect(readBackupBytes("../../etc/passwd")).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
