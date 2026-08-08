import { afterEach, describe, expect, it, vi } from "vitest";
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
