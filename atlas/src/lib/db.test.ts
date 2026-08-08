import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ORIGINAL_ENV = process.env.ATLAS_DATA_DIR;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.ATLAS_DATA_DIR;
  else process.env.ATLAS_DATA_DIR = ORIGINAL_ENV;
  vi.resetModules();
});

async function loadDb(dataDir?: string) {
  if (dataDir === undefined) delete process.env.ATLAS_DATA_DIR;
  else process.env.ATLAS_DATA_DIR = dataDir;
  vi.resetModules();
  return import("./db");
}

describe("résolution du chemin de données", () => {
  it("utilise ~/.atlas/data par défaut, pas le dossier courant", async () => {
    const db = await loadDb(undefined);
    expect(db.DATA_DIR).toBe(path.join(os.homedir(), ".atlas", "data"));
    expect(db.DB_PATH).toBe(path.join(os.homedir(), ".atlas", "data", "atlas.db"));
  });

  it("suit ATLAS_HOME quand il est posé, comme atlas.sh", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-home-"));
    const previous = process.env.ATLAS_HOME;
    process.env.ATLAS_HOME = home;
    delete process.env.ATLAS_DATA_DIR;
    vi.resetModules();
    const db = await import("./db");
    expect(db.DATA_DIR).toBe(path.join(home, "data"));
    if (previous === undefined) delete process.env.ATLAS_HOME;
    else process.env.ATLAS_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("respecte ATLAS_DATA_DIR", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-datadir-"));
    const db = await loadDb(dir);
    expect(db.DATA_DIR).toBe(dir);
    expect(db.DB_PATH).toBe(path.join(dir, "atlas.db"));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("expose l'ancien emplacement pour la migration", async () => {
    const db = await loadDb(undefined);
    expect(db.LEGACY_DB_PATH).toBe(path.join(process.cwd(), "data", "atlas.db"));
  });
});

/** Crée une base Atlas plausible avec n transactions à l'ancien emplacement. */
function seedLegacy(cwdDir: string, count: number): string {
  const legacyDir = path.join(cwdDir, "data");
  fs.mkdirSync(legacyDir, { recursive: true });
  const file = path.join(legacyDir, "atlas.db");
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE transactions (id INTEGER PRIMARY KEY, ticker TEXT NOT NULL)");
  const insert = db.prepare("INSERT INTO transactions (ticker) VALUES (?)");
  for (let i = 0; i < count; i += 1) insert.run(`TCK${i}`);
  db.close();
  return file;
}

describe("migration de l'ancienne base", () => {
  it("déplace la base, vérifie l'intégrité et conserve l'original", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-migr-"));
    const dataDir = path.join(root, "newhome");
    const spy = vi.spyOn(process, "cwd").mockReturnValue(root);
    seedLegacy(root, 5);

    const db = await loadDb(dataDir);
    db.migrateLegacyDb();

    expect(fs.existsSync(path.join(dataDir, "atlas.db"))).toBe(true);
    const moved = new Database(path.join(dataDir, "atlas.db"), { readonly: true });
    expect(
      (moved.prepare("SELECT COUNT(*) n FROM transactions").get() as { n: number }).n,
    ).toBe(5);
    moved.close();

    expect(fs.existsSync(path.join(root, "data", "atlas.db"))).toBe(false);
    const kept = fs
      .readdirSync(path.join(root, "data"))
      .filter((f) => f.startsWith("atlas.db.migre-"));
    expect(kept).toHaveLength(1);

    spy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("est idempotente : ne touche à rien si la nouvelle base existe", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-migr2-"));
    const dataDir = path.join(root, "newhome");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "atlas.db"), "déjà là");
    const spy = vi.spyOn(process, "cwd").mockReturnValue(root);
    seedLegacy(root, 3);

    const db = await loadDb(dataDir);
    db.migrateLegacyDb();

    expect(fs.readFileSync(path.join(dataDir, "atlas.db"), "utf-8")).toBe("déjà là");
    expect(fs.existsSync(path.join(root, "data", "atlas.db"))).toBe(true);

    spy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("ne fait rien quand il n'y a pas d'ancienne base", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-migr3-"));
    const dataDir = path.join(root, "newhome");
    const spy = vi.spyOn(process, "cwd").mockReturnValue(root);

    const db = await loadDb(dataDir);
    expect(() => db.migrateLegacyDb()).not.toThrow();
    expect(fs.existsSync(path.join(dataDir, "atlas.db"))).toBe(false);

    spy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("abandonne sans détruire l'original si la source est illisible", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-migr4-"));
    const dataDir = path.join(root, "newhome");
    const spy = vi.spyOn(process, "cwd").mockReturnValue(root);
    const legacyDir = path.join(root, "data");
    fs.mkdirSync(legacyDir, { recursive: true });
    // En-tête SQLite valide, contenu illisible.
    const header = Buffer.from("SQLite format 3\0", "utf-8");
    fs.writeFileSync(
      path.join(legacyDir, "atlas.db"),
      Buffer.concat([header, Buffer.alloc(4096, 0x7f)]),
    );

    const db = await loadDb(dataDir);
    // Message précis : sans ça, le test passerait aussi si la fonction
    // n'existait pas (le TypeError satisferait un simple toThrow()).
    expect(() => db.migrateLegacyDb()).toThrow(
      /file is not a database|Migration annulée/,
    );
    expect(fs.existsSync(path.join(legacyDir, "atlas.db"))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, "atlas.db"))).toBe(false);
    // Aucun résidu de copie en cours.
    expect(fs.existsSync(path.join(dataDir, "atlas.db.migration"))).toBe(false);

    spy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("ne se copie pas sur elle-même quand les deux chemins coïncident", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-migr5-"));
    const spy = vi.spyOn(process, "cwd").mockReturnValue(root);
    seedLegacy(root, 2);

    const db = await loadDb(path.join(root, "data"));
    db.migrateLegacyDb();

    const moved = new Database(path.join(root, "data", "atlas.db"), { readonly: true });
    expect(
      (moved.prepare("SELECT COUNT(*) n FROM transactions").get() as { n: number }).n,
    ).toBe(2);
    moved.close();

    spy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });
});
