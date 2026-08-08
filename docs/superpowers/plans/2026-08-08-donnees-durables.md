# Données durables et récupérables — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sortir la base Atlas du dossier d'installation vers `~/.atlas/data`, la migrer automatiquement, et garantir des sauvegardes automatiques restaurables depuis l'app par un utilisateur non technique.

**Architecture:** `db.ts` résout `DATA_DIR` depuis le répertoire personnel au lieu de `process.cwd()`, et migre l'ancienne base au premier accès. `install.sh` détecte l'installation active pour ne plus en créer une seconde. `atlas.sh` gagne `backup` / `restore` et un agent launchd quotidien. Une API et une section Paramètres exposent la liste des sauvegardes et la restauration en un clic.

**Tech Stack:** Bash, launchd, SQLite (`sqlite3` CLI + better-sqlite3), Next.js 16 App Router, React, TypeScript, vitest.

**Lire avant de coder :** `atlas/AGENTS.md` impose de consulter `atlas/node_modules/next/dist/docs/` avant d'écrire du code Next.js — cette version a des ruptures d'API par rapport aux versions connues. Concerne les tâches 9 à 11.

**Spec :** `docs/superpowers/specs/2026-08-08-donnees-durables-design.md`

---

## Structure des fichiers

| Fichier | Responsabilité | Action |
|---|---|---|
| `atlas/src/lib/db.ts` | résolution du chemin de données, migration, accès SQLite | modifier |
| `atlas/src/lib/db.test.ts` | tests de résolution de chemin et de migration | créer |
| `atlas/src/lib/backups.ts` | lecture du dossier de sauvegardes (liste, résolution de nom) | créer |
| `atlas/src/lib/backups.test.ts` | tests de listing et de garde anti-traversée | créer |
| `atlas/src/app/api/backup/list/route.ts` | `GET` liste des sauvegardes | créer |
| `atlas/src/app/api/backup/restore/route.ts` | `POST` restauration (téléversement **ou** fichier local) | modifier |
| `atlas/src/components/backup-section.tsx` | UI sauvegarde / restauration | créer (extraction) |
| `atlas/src/app/parametres/page.tsx` | page Paramètres (978 lignes) | modifier — retire `BackupSection`, importe le composant |
| `atlas/src/lib/i18n.tsx` | libellés FR/EN | modifier |
| `install.sh` | bootstrap + détection d'installation | modifier |
| `atlas.sh` | cycle de vie + sauvegardes | modifier |
| `tests/install-update.test.sh` | tests shell | modifier |

`parametres/page.tsx` fait déjà 978 lignes. La section sauvegarde y gagne une liste, un chargement et une confirmation : elle est extraite dans son propre fichier plutôt que d'alourdir la page. Aucun autre découpage n'est entrepris.

---

## Phase 1 — Sortir les données du dossier d'installation

### Task 1: Résolution du chemin de données

**Files:**
- Modify: `atlas/src/lib/db.ts:1-6`
- Test: `atlas/src/lib/db.test.ts` (créer)

- [ ] **Step 1: Write the failing test**

`DATA_DIR` est calculé à l'import du module. Les tests doivent donc poser la variable d'environnement **avant** d'importer, via `vi.resetModules()` et un import dynamique.

```ts
// atlas/src/lib/db.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix atlas -- src/lib/db.test.ts`
Expected: FAIL — `DATA_DIR` vaut `<cwd>/data`, et `LEGACY_DB_PATH` n'existe pas (`undefined`).

- [ ] **Step 3: Write minimal implementation**

Remplacer `atlas/src/lib/db.ts:1-6` par :

```ts
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Les données vivent hors du dossier d'installation : une mise à jour, un
 * déplacement du dossier ou une réinstallation ne doivent jamais les atteindre.
 *
 * ATLAS_HOME est respecté pour rester aligné sur atlas.sh, qui l'utilise déjà
 * pour Node, les journaux et les sauvegardes — sans quoi le shell et l'app
 * pourraient viser deux bases différentes en silence. ATLAS_DATA_DIR reste
 * disponible pour les tests et les cas particuliers.
 */
const ATLAS_HOME = process.env.ATLAS_HOME ?? path.join(os.homedir(), ".atlas");
export const DATA_DIR = process.env.ATLAS_DATA_DIR ?? path.join(ATLAS_HOME, "data");
export const DB_PATH = path.join(DATA_DIR, "atlas.db");

/** Emplacement historique, à l'intérieur du dossier d'installation. */
export const LEGACY_DB_PATH = path.join(process.cwd(), "data", "atlas.db");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix atlas -- src/lib/db.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Run the whole suite to catch regressions**

Run: `npm test --prefix atlas`
Expected: PASS. Les tests existants montent des bases `:memory:` via `initSchema` et ne touchent pas `DATA_DIR` — aucun ne doit casser.

- [ ] **Step 6: Commit**

```bash
git add atlas/src/lib/db.ts atlas/src/lib/db.test.ts
git commit -m "feat(db): résoudre le chemin des données hors du dossier d'installation"
```

---

### Task 2: Migration automatique de l'ancienne base

**Files:**
- Modify: `atlas/src/lib/db.ts` (ajouter `migrateLegacyDb`, l'appeler dans `createDb`)
- Test: `atlas/src/lib/db.test.ts` (compléter)

- [ ] **Step 1: Write the failing test**

Ajouter à `atlas/src/lib/db.test.ts` :

```ts
import Database from "better-sqlite3";

/** Crée une base Atlas plausible avec n transactions. */
function seedLegacy(cwdDir: string, count: number): string {
  const legacyDir = path.join(cwdDir, "data");
  fs.mkdirSync(legacyDir, { recursive: true });
  const file = path.join(legacyDir, "atlas.db");
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(
    "CREATE TABLE transactions (id INTEGER PRIMARY KEY, ticker TEXT NOT NULL)",
  );
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

  it("abandonne sans détruire l'original si la copie est corrompue", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-migr4-"));
    const dataDir = path.join(root, "newhome");
    const spy = vi.spyOn(process, "cwd").mockReturnValue(root);
    const legacyDir = path.join(root, "data");
    fs.mkdirSync(legacyDir, { recursive: true });
    // En-tête SQLite valide, contenu illisible : passe l'ouverture, échoue le check.
    const header = Buffer.from("SQLite format 3\0", "utf-8");
    fs.writeFileSync(
      path.join(legacyDir, "atlas.db"),
      Buffer.concat([header, Buffer.alloc(4096, 0x7f)]),
    );

    const db = await loadDb(dataDir);
    expect(() => db.migrateLegacyDb()).toThrow();
    expect(fs.existsSync(path.join(legacyDir, "atlas.db"))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, "atlas.db"))).toBe(false);

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix atlas -- src/lib/db.test.ts`
Expected: FAIL — `db.migrateLegacyDb is not a function`.

- [ ] **Step 3: Write minimal implementation**

Ajouter dans `atlas/src/lib/db.ts`, juste avant `function createDb()` :

```ts
/**
 * Déplace la base de l'ancien emplacement (dans le dossier d'installation) vers
 * le nouveau, une seule fois. Ordre imposé, du plus sûr au plus destructeur :
 * checkpoint, copie, vérification, bascule, mise de côté de l'original.
 *
 * Tout est synchrone : appelée pendant l'initialisation de getDb(), avant que
 * quiconque puisse écrire. C'est aussi pourquoi on replie le WAL à la main
 * plutôt que d'utiliser l'API backup() de better-sqlite3, qui est asynchrone.
 *
 * L'original n'est jamais supprimé, seulement renommé.
 */
export function migrateLegacyDb(): void {
  if (path.resolve(DB_PATH) === path.resolve(LEGACY_DB_PATH)) return;
  if (fs.existsSync(DB_PATH)) return;
  if (!fs.existsSync(LEGACY_DB_PATH)) return;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const staging = `${DB_PATH}.migration`;
  fs.rmSync(staging, { force: true });

  // Replier le WAL dans le fichier principal, sinon la copie serait incomplète.
  const source = new Database(LEGACY_DB_PATH);
  try {
    source.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    source.close();
  }

  fs.copyFileSync(LEGACY_DB_PATH, staging);

  let healthy = false;
  try {
    const probe = new Database(staging, { readonly: true, fileMustExist: true });
    try {
      healthy = probe.pragma("integrity_check", { simple: true }) === "ok";
    } finally {
      probe.close();
    }
  } catch {
    healthy = false;
  }

  if (!healthy) {
    fs.rmSync(staging, { force: true });
    throw new Error(
      `Migration annulée : la copie de ${LEGACY_DB_PATH} n'a pas passé integrity_check. ` +
        `L'original est intact.`,
    );
  }

  fs.renameSync(staging, DB_PATH);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.renameSync(LEGACY_DB_PATH, `${LEGACY_DB_PATH}.migre-${stamp}`);
  // Un -wal orphelin se réappliquerait lors d'une restauration ultérieure.
  for (const ext of ["-wal", "-shm"]) {
    fs.rmSync(LEGACY_DB_PATH + ext, { force: true });
  }
}
```

Puis modifier `createDb()` pour l'appeler en premier :

```ts
function createDb(): Database.Database {
  migrateLegacyDb();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix atlas -- src/lib/db.test.ts`
Expected: PASS — 8 tests (3 de la tâche 1 + 5 de migration).

- [ ] **Step 5: Run the whole suite**

Run: `npm test --prefix atlas`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add atlas/src/lib/db.ts atlas/src/lib/db.test.ts
git commit -m "feat(db): migrer automatiquement l'ancienne base vers ~/.atlas/data"
```

---

### Task 3: Valider la migration sur la base réelle

Étape de vérification manuelle. La spec l'exige avant livraison : la migration déplace une base vivante.

**Files:** aucun (vérification)

- [ ] **Step 1: Fabriquer un bac à sable depuis la vraie base**

```bash
SANDBOX="$(mktemp -d)"
mkdir -p "$SANDBOX/cwd/data" "$SANDBOX/home"
cp /Users/test/K1Zoh/stock-market-analyzer/atlas/data/atlas.db "$SANDBOX/cwd/data/atlas.db"
sqlite3 "$SANDBOX/cwd/data/atlas.db" "SELECT COUNT(*) FROM transactions;"
```

Expected: `83`

- [ ] **Step 2: Lancer la migration dans le bac à sable**

vitest sert de harnais : il charge le TypeScript sans build, et `process.cwd()`
y est simulable. Créer `atlas/src/lib/db.realdata.test.ts`, fichier temporaire
supprimé à l'étape 3 :

```ts
import { expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";

it("migre la base réelle sans perte", async () => {
  const sandbox = process.env.SANDBOX!;
  vi.spyOn(process, "cwd").mockReturnValue(path.join(sandbox, "cwd"));
  process.env.ATLAS_DATA_DIR = path.join(sandbox, "home", "data");
  vi.resetModules();
  const db = await import("./db");
  db.migrateLegacyDb();
  const moved = new Database(db.DB_PATH, { readonly: true });
  const n = (moved.prepare("SELECT COUNT(*) n FROM transactions").get() as { n: number }).n;
  moved.close();
  expect(n).toBe(83);
});
```

Puis :

```bash
cd /Users/test/K1Zoh/stock-market-analyzer/atlas
SANDBOX="$SANDBOX" npx vitest run src/lib/db.realdata.test.ts
```

Expected: PASS, `83` transactions retrouvées. Vérifier aussi que l'original du
bac à sable a été mis de côté sans être détruit :

```bash
ls "$SANDBOX/cwd/data/"
```

Expected: un seul fichier, `atlas.db.migre-<horodatage>`.

- [ ] **Step 3: Nettoyer**

```bash
rm -f /Users/test/K1Zoh/stock-market-analyzer/atlas/src/lib/db.realdata.test.ts
rm -rf "$SANDBOX"
```

- [ ] **Step 4: Aucun commit** — étape de vérification seulement.

---

## Phase 2 — `install.sh` ne crée plus de doublon

### Task 4: Détection de l'installation active

**Files:**
- Modify: `install.sh:16` et la section de récupération du code
- Test: `tests/install-update.test.sh` (ajouter deux cas)

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/install-update.test.sh`, avant la liste d'appels en fin de fichier :

```bash
test_installer_adopts_running_install() {
  local live_dir="$TEST_ROOT/live-install"
  local fake_home="$TEST_ROOT/adopt-home"
  local fake_bin="$TEST_ROOT/adopt-bin"
  local result="$TEST_ROOT/adopt-result"

  # Installation « vivante », désignée par le plist de l'agent.
  mkdir -p "$live_dir/atlas" "$fake_home/Library/LaunchAgents"
  printf '{}\n' > "$live_dir/atlas/package.json"
  printf '#!/bin/bash\nprintf "adopted:%%s\\n" "$1" > "$ATLAS_TEST_RESULT"\n' \
    > "$live_dir/atlas.sh"
  chmod +x "$live_dir/atlas.sh"
  printf '%s\n' \
    '<?xml version="1.0" encoding="UTF-8"?>' \
    '<plist version="1.0"><dict>' \
    '  <key>Label</key><string>local.atlas.server</string>' \
    "  <key>WorkingDirectory</key><string>$live_dir/atlas</string>" \
    '</dict></plist>' \
    > "$fake_home/Library/LaunchAgents/local.atlas.server.plist"

  make_fake_curl "$fake_bin"

  # Aucun ATLAS_DIR : la cible par défaut serait $HOME/Atlas.
  HOME="$fake_home" \
  ATLAS_TEST_DOWNLOAD="$TEST_ROOT/release.tar.gz" \
  ATLAS_TEST_RESULT="$result" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$PROJECT_DIR/install.sh" >/dev/null

  assert_file_contains "$result" "adopted:install"
  [ ! -d "$fake_home/Atlas" ] \
    || fail "l'installeur ne doit pas créer un second dossier quand une install est active"
}

test_explicit_atlas_dir_wins_over_detection() {
  local live_dir="$TEST_ROOT/live-install-2"
  local forced_dir="$TEST_ROOT/forced-install"
  local fake_home="$TEST_ROOT/forced-home"
  local fake_bin="$TEST_ROOT/forced-bin"
  local result="$TEST_ROOT/forced-result"

  mkdir -p "$live_dir/atlas" "$forced_dir" "$fake_home/Library/LaunchAgents"
  printf '{}\n' > "$live_dir/atlas/package.json"
  printf '#!/bin/bash\nexit 0\n' > "$live_dir/atlas.sh"
  chmod +x "$live_dir/atlas.sh"
  printf '%s\n' \
    '<?xml version="1.0" encoding="UTF-8"?>' \
    '<plist version="1.0"><dict>' \
    "  <key>WorkingDirectory</key><string>$live_dir/atlas</string>" \
    '</dict></plist>' \
    > "$fake_home/Library/LaunchAgents/local.atlas.server.plist"

  make_fake_curl "$fake_bin"

  HOME="$fake_home" \
  ATLAS_DIR="$forced_dir" \
  ATLAS_TEST_DOWNLOAD="$TEST_ROOT/release.tar.gz" \
  ATLAS_TEST_RESULT="$result" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$PROJECT_DIR/install.sh" >/dev/null

  assert_file_contains "$result" "new:install"
  [ -f "$forced_dir/atlas/version.txt" ] \
    || fail "ATLAS_DIR explicite doit l'emporter sur la détection"
}
```

```bash
test_fresh_machine_installs_to_default_quietly() {
  local fake_home="$TEST_ROOT/fresh-home"
  local fake_bin="$TEST_ROOT/fresh-bin"
  local result="$TEST_ROOT/fresh-result"
  local output="$TEST_ROOT/fresh-output"

  mkdir -p "$fake_home"
  make_fake_curl "$fake_bin"

  HOME="$fake_home" \
  ATLAS_TEST_DOWNLOAD="$TEST_ROOT/release.tar.gz" \
  ATLAS_TEST_RESULT="$result" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$PROJECT_DIR/install.sh" > "$output" 2>&1

  [ -f "$fake_home/Atlas/atlas/version.txt" ] \
    || fail "sur une machine neuve, l'installation doit aller dans \$HOME/Atlas"
  grep -q "Installation existante détectée" "$output" \
    && fail "aucune détection ne doit être annoncée sur une machine neuve"
  assert_file_contains "$result" "new:install"
}
```

Et les appeler en fin de fichier, avant le `printf 'PASS: …'` :

```bash
test_installer_adopts_running_install
test_explicit_atlas_dir_wins_over_detection
test_fresh_machine_installs_to_default_quietly
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/install-update.test.sh`
Expected: FAIL sur `test_installer_adopts_running_install` — l'installeur crée `$fake_home/Atlas` au lieu d'adopter `$live_dir`.

- [ ] **Step 3: Write minimal implementation**

Dans `install.sh`, remplacer la ligne 16 :

```bash
INSTALL_DIR="${ATLAS_DIR:-$HOME/Atlas}"
```

par :

```bash
ATLAS_HOME_DIR="${ATLAS_HOME:-$HOME/.atlas}"
INSTALL_REGISTRY="$ATLAS_HOME_DIR/install-path"
SERVER_PLIST_PATH="$HOME/Library/LaunchAgents/local.atlas.server.plist"

# Un dossier est une installation Atlas s'il porte le script et l'app.
looks_like_install() {
  [ -f "$1/atlas.sh" ] && [ -f "$1/atlas/package.json" ]
}

# Où Atlas est-il réellement installé ? Par ordre de fiabilité : l'agent qui le
# lance, puis le registre écrit à l'installation. Sans quoi, rien.
detect_live_install() {
  local candidate
  if [ -f "$SERVER_PLIST_PATH" ]; then
    candidate="$(sed -n \
      's|.*<key>WorkingDirectory</key><string>\(.*\)</string>.*|\1|p' \
      "$SERVER_PLIST_PATH" | head -1)"
    candidate="${candidate%/atlas}"
    if [ -n "$candidate" ] && looks_like_install "$candidate"; then
      printf '%s\n' "$candidate"; return 0
    fi
  fi
  if [ -f "$INSTALL_REGISTRY" ]; then
    candidate="$(head -1 "$INSTALL_REGISTRY")"
    if [ -n "$candidate" ] && looks_like_install "$candidate"; then
      printf '%s\n' "$candidate"; return 0
    fi
  fi
  return 1
}

if [ -n "${ATLAS_DIR:-}" ]; then
  INSTALL_DIR="$ATLAS_DIR"
else
  INSTALL_DIR="$HOME/Atlas"
  DETECTED="$(detect_live_install || true)"
  if [ -n "$DETECTED" ] && [ "$DETECTED" != "$INSTALL_DIR" ]; then
    INSTALL_DIR="$DETECTED"
  fi
fi
```

Les fonctions d'affichage (`bold`, `ok`, `info`, `fail`) sont définies plus bas dans le fichier : ne pas les appeler ici. L'annonce se fait après leur définition. Juste après le bloc `case "$INSTALL_MODE" in … esac`, ajouter :

```bash
if [ -n "${DETECTED:-}" ] && [ "$DETECTED" = "$INSTALL_DIR" ]; then
  info "Installation existante détectée : $INSTALL_DIR"
fi
```

Enfin, écrire le registre après la mise en place du code, juste avant le `exec` final :

```bash
mkdir -p "$ATLAS_HOME_DIR"
printf '%s\n' "$INSTALL_DIR" > "$INSTALL_REGISTRY"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/install-update.test.sh`
Expected: PASS — `PASS: archive installation and update flows`.

- [ ] **Step 5: Commit**

```bash
git add install.sh tests/install-update.test.sh
git commit -m "feat(install): adopter l'installation active au lieu d'en créer une seconde"
```

---

## Phase 3 — Sauvegardes automatiques

### Task 5: `do_backup` dans atlas.sh

**Files:**
- Modify: `atlas.sh` (constantes en tête, nouvelle fonction avant `cmd_install`)
- Test: `tests/install-update.test.sh`

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/install-update.test.sh` :

```bash
seed_test_db() {
  local file="$1" rows="$2"
  mkdir -p "$(dirname "$file")"
  sqlite3 "$file" \
    "CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY, ticker TEXT);"
  local i=0
  while [ "$i" -lt "$rows" ]; do
    sqlite3 "$file" "INSERT INTO transactions (ticker) VALUES ('T$i');"
    i=$((i + 1))
  done
}

test_backup_creates_verified_copy() {
  local atlas_home="$TEST_ROOT/bk-home"
  local data_dir="$TEST_ROOT/bk-data"
  local install_dir="$TEST_ROOT/bk-install"

  mkdir -p "$install_dir/atlas"
  cp "$PROJECT_DIR/atlas.sh" "$install_dir/atlas.sh"
  seed_test_db "$data_dir/atlas.db" 4

  HOME="$TEST_ROOT/home" \
  ATLAS_HOME="$atlas_home" \
  ATLAS_DATA_DIR="$data_dir" \
  PATH="/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" backup >/dev/null

  local count
  count="$(find "$atlas_home/backups" -name 'atlas-*.db' | wc -l | tr -d ' ')"
  [ "$count" = "1" ] || fail "une sauvegarde devait être créée, trouvé $count"

  local made
  made="$(find "$atlas_home/backups" -name 'atlas-*.db' | head -1)"
  [ "$(sqlite3 "$made" 'SELECT COUNT(*) FROM transactions;')" = "4" ] \
    || fail "la sauvegarde doit contenir les 4 lignes"
}

test_backup_skips_identical_snapshot() {
  local atlas_home="$TEST_ROOT/bk2-home"
  local data_dir="$TEST_ROOT/bk2-data"
  local install_dir="$TEST_ROOT/bk2-install"

  mkdir -p "$install_dir/atlas"
  cp "$PROJECT_DIR/atlas.sh" "$install_dir/atlas.sh"
  seed_test_db "$data_dir/atlas.db" 2

  for _ in 1 2; do
    HOME="$TEST_ROOT/home" \
    ATLAS_HOME="$atlas_home" \
    ATLAS_DATA_DIR="$data_dir" \
    PATH="/bin:/usr/bin" \
      /bin/bash "$install_dir/atlas.sh" backup >/dev/null
    sleep 1
  done

  local count
  count="$(find "$atlas_home/backups" -name 'atlas-*.db' | wc -l | tr -d ' ')"
  [ "$count" = "1" ] \
    || fail "une base inchangée ne doit pas produire un second fichier, trouvé $count"
}

test_backup_without_database_is_silent_success() {
  local atlas_home="$TEST_ROOT/bk3-home"
  local install_dir="$TEST_ROOT/bk3-install"

  mkdir -p "$install_dir/atlas"
  cp "$PROJECT_DIR/atlas.sh" "$install_dir/atlas.sh"

  HOME="$TEST_ROOT/home" \
  ATLAS_HOME="$atlas_home" \
  ATLAS_DATA_DIR="$TEST_ROOT/bk3-absent" \
  PATH="/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" backup >/dev/null \
    || fail "sans base, la sauvegarde doit réussir sans rien faire"
}
```

```bash
test_backup_rotation_caps_the_directory() {
  local atlas_home="$TEST_ROOT/bk4-home"
  local data_dir="$TEST_ROOT/bk4-data"
  local install_dir="$TEST_ROOT/bk4-install"

  mkdir -p "$install_dir/atlas"
  cp "$PROJECT_DIR/atlas.sh" "$install_dir/atlas.sh"
  seed_test_db "$data_dir/atlas.db" 1

  # Trois sauvegardes distinctes, plafond à 2.
  local i=0
  while [ "$i" -lt 3 ]; do
    sqlite3 "$data_dir/atlas.db" "INSERT INTO transactions (ticker) VALUES ('R$i');"
    HOME="$TEST_ROOT/home" \
    ATLAS_HOME="$atlas_home" \
    ATLAS_DATA_DIR="$data_dir" \
    ATLAS_BACKUP_KEEP=2 \
    PATH="/bin:/usr/bin" \
      /bin/bash "$install_dir/atlas.sh" backup >/dev/null
    sleep 1
    i=$((i + 1))
  done

  local count
  count="$(find "$atlas_home/backups" -name 'atlas-*.db' | wc -l | tr -d ' ')"
  [ "$count" = "2" ] || fail "la rotation doit plafonner à 2, trouvé $count"
}

test_backup_failure_preserves_existing_backups() {
  local atlas_home="$TEST_ROOT/bk5-home"
  local data_dir="$TEST_ROOT/bk5-data"
  local install_dir="$TEST_ROOT/bk5-install"

  mkdir -p "$install_dir/atlas"
  cp "$PROJECT_DIR/atlas.sh" "$install_dir/atlas.sh"
  seed_test_db "$data_dir/atlas.db" 3

  HOME="$TEST_ROOT/home" ATLAS_HOME="$atlas_home" ATLAS_DATA_DIR="$data_dir" \
  PATH="/bin:/usr/bin" /bin/bash "$install_dir/atlas.sh" backup >/dev/null

  # La base source devient illisible : la sauvegarde doit échouer sans purger.
  printf 'SQLite format 3\000' > "$data_dir/atlas.db"
  dd if=/dev/urandom bs=1024 count=4 >> "$data_dir/atlas.db" 2>/dev/null

  HOME="$TEST_ROOT/home" ATLAS_HOME="$atlas_home" ATLAS_DATA_DIR="$data_dir" \
  PATH="/bin:/usr/bin" /bin/bash "$install_dir/atlas.sh" backup >/dev/null 2>&1

  local count
  count="$(find "$atlas_home/backups" -name 'atlas-*.db' | wc -l | tr -d ' ')"
  [ "$count" = "1" ] \
    || fail "une sauvegarde ratée ne doit ni ajouter ni purger, trouvé $count"
  find "$atlas_home/backups" -name '.en-cours-*' | grep -q . \
    && fail "aucun fichier temporaire ne doit rester après un échec"
}

test_backup_on_writes_daily_agent() {
  local atlas_home="$TEST_ROOT/bk6-home"
  local fake_home="$TEST_ROOT/bk6-fakehome"
  local install_dir="$TEST_ROOT/bk6-install"

  mkdir -p "$install_dir/atlas" "$fake_home/Library/LaunchAgents"
  cp "$PROJECT_DIR/atlas.sh" "$install_dir/atlas.sh"

  HOME="$fake_home" ATLAS_HOME="$atlas_home" PATH="/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" backup on >/dev/null 2>&1

  local plist="$fake_home/Library/LaunchAgents/local.atlas.backup.plist"
  [ -f "$plist" ] || fail "backup on doit écrire le plist de l'agent quotidien"
  grep -q "<integer>86400</integer>" "$plist" \
    || fail "l'agent doit tourner une fois par jour"
}
```

Les appeler en fin de fichier :

```bash
test_backup_creates_verified_copy
test_backup_skips_identical_snapshot
test_backup_without_database_is_silent_success
test_backup_rotation_caps_the_directory
test_backup_failure_preserves_existing_backups
test_backup_on_writes_daily_agent
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/install-update.test.sh`
Expected: FAIL — `Commande inconnue : backup`.

- [ ] **Step 3: Write minimal implementation**

Dans `atlas.sh`, après la ligne `ALERTS_LOG="$LOG_DIR/alerts.log"` (ligne 32), ajouter :

```bash
DATA_DIR="${ATLAS_DATA_DIR:-$ATLAS_HOME/data}"
DB_FILE="$DATA_DIR/atlas.db"
BACKUP_DIR="${ATLAS_BACKUP_DIR:-$ATLAS_HOME/backups}"
ICLOUD_BACKUP_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Atlas"
# Surchargeable pour que les tests vérifient la rotation sans écrire 31 fichiers.
BACKUP_KEEP="${ATLAS_BACKUP_KEEP:-30}"
```

Et après la ligne `ALERTS_PLIST="$AGENTS_DIR/$ALERTS_LABEL.plist"` :

```bash
BACKUP_LABEL="local.atlas.backup"
BACKUP_PLIST="$AGENTS_DIR/$BACKUP_LABEL.plist"
```

Puis, avant `cmd_install()`, ajouter :

```bash
# ── Sauvegardes ──────────────────────────────────────────────────────────────

# Une sauvegarde vérifiée, ou rien. Un fichier corrompu ne doit jamais chasser
# une sauvegarde saine : la rotation n'a lieu qu'après integrity_check.
do_backup() {
  local reason="${1:-manuel}" stamp staging dest sum previous

  [ -f "$DB_FILE" ] || { info "Aucune base à sauvegarder pour l'instant"; return 0; }
  command -v sqlite3 >/dev/null 2>&1 \
    || { warn "sqlite3 introuvable, sauvegarde ignorée"; return 0; }

  mkdir -p "$BACKUP_DIR"
  stamp="$(date +%Y%m%d-%H%M%S)"
  staging="$BACKUP_DIR/.en-cours-$stamp.db"

  if ! sqlite3 "$DB_FILE" ".backup '$staging'" 2>/dev/null; then
    rm -f "$staging"
    warn "Sauvegarde impossible (base verrouillée ?)"
    return 1
  fi

  if [ "$(sqlite3 "$staging" 'PRAGMA integrity_check;' 2>/dev/null)" != "ok" ]; then
    rm -f "$staging"
    warn "Sauvegarde corrompue, abandon — les sauvegardes existantes sont conservées"
    return 1
  fi

  # Une base inchangée ne mérite pas un second fichier : on préfère 30 états
  # distincts à 30 copies du même jour.
  sum="$(shasum -a 256 "$staging" | cut -d' ' -f1)"
  previous="$(ls -1t "$BACKUP_DIR"/atlas-*.db 2>/dev/null | head -1)"
  if [ -n "$previous" ] \
     && [ "$(shasum -a 256 "$previous" | cut -d' ' -f1)" = "$sum" ]; then
    rm -f "$staging"
    info "Base inchangée depuis la dernière sauvegarde"
    return 0
  fi

  dest="$BACKUP_DIR/atlas-$stamp-$reason.db"
  mv "$staging" "$dest"
  ok "Sauvegarde : $dest"

  # iCloud si présent, silence sinon — jamais d'erreur pour ça.
  if [ -d "$(dirname "$ICLOUD_BACKUP_DIR")" ]; then
    mkdir -p "$ICLOUD_BACKUP_DIR" 2>/dev/null \
      && cp "$dest" "$ICLOUD_BACKUP_DIR/" 2>/dev/null \
      && info "Copie iCloud effectuée"
  fi

  # Rotation, une fois la nouvelle sauvegarde en place et vérifiée.
  ls -1t "$BACKUP_DIR"/atlas-*.db 2>/dev/null \
    | tail -n +$((BACKUP_KEEP + 1)) \
    | while IFS= read -r old; do rm -f "$old"; done

  return 0
}

cmd_backup() {
  case "${1:-now}" in
    now) step "Sauvegarde"; do_backup manuel ;;
    list)
      step "Sauvegardes disponibles"
      if [ -d "$BACKUP_DIR" ] && ls "$BACKUP_DIR"/atlas-*.db >/dev/null 2>&1; then
        ls -1t "$BACKUP_DIR"/atlas-*.db | while IFS= read -r f; do
          printf "  %s  %s\n" "$(date -r "$f" '+%Y-%m-%d %H:%M')" "$(basename "$f")"
        done
      else
        info "Aucune sauvegarde pour l'instant"
      fi
      ;;
    on)
      step "Sauvegarde quotidienne"
      mkdir -p "$LOG_DIR"
      write_plist "$BACKUP_PLIST" "$BACKUP_LABEL" 86400 \
        /bin/bash "$REPO_DIR/atlas.sh" backup
      load_agent "$BACKUP_LABEL" "$BACKUP_PLIST"
      ok "Une sauvegarde par jour dans $BACKUP_DIR"
      ;;
    off)
      unload_agent "$BACKUP_LABEL" "$BACKUP_PLIST"
      ok "Sauvegarde quotidienne désactivée"
      ;;
    *) die "Usage : $0 backup [now|list|on|off]" ;;
  esac
}
```

Enfin, ajouter l'aiguillage dans le `case` final, après la ligne `alerts)` :

```bash
  backup)     cmd_backup "${2:-now}" ;;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/install-update.test.sh`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add atlas.sh tests/install-update.test.sh
git commit -m "feat(atlas): sauvegardes vérifiées avec rotation et dédoublonnage"
```

---

### Task 6: Sauvegarde avant chaque mise à jour

**Files:**
- Modify: `atlas.sh` — `cmd_update_local()`
- Test: `tests/install-update.test.sh`

- [ ] **Step 1: Write the failing test**

```bash
test_update_backs_up_first() {
  local install_dir="$TEST_ROOT/upbk-install"
  local atlas_home="$TEST_ROOT/upbk-home"
  local data_dir="$TEST_ROOT/upbk-data"

  mkdir -p "$install_dir/atlas/src" "$install_dir/atlas/node_modules" \
    "$atlas_home/node/bin"
  cp "$PROJECT_DIR/atlas.sh" "$install_dir/atlas.sh"
  printf '{}\n' > "$install_dir/atlas/package.json"
  printf '{}\n' > "$install_dir/atlas/next.config.ts"
  printf '{}\n' > "$install_dir/atlas/tsconfig.json"
  printf '{}\n' > "$install_dir/atlas/postcss.config.mjs"
  printf '%s-node22\n' "$(uname -m)" > "$install_dir/atlas/node_modules/.atlas-arch"
  seed_test_db "$data_dir/atlas.db" 3

  printf '#!/bin/bash\necho v22.0.0\n' > "$atlas_home/node/bin/node"
  printf '%s\n' \
    '#!/bin/bash' \
    'if [ "$*" = "run build" ]; then mkdir -p .next; touch .next/BUILD_ID; fi' \
    'exit 0' \
    > "$atlas_home/node/bin/npm"
  chmod +x "$atlas_home/node/bin/node" "$atlas_home/node/bin/npm"

  HOME="$TEST_ROOT/home" \
  ATLAS_HOME="$atlas_home" \
  ATLAS_DATA_DIR="$data_dir" \
  PATH="/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" update-local >/dev/null 2>&1

  local made
  made="$(find "$atlas_home/backups" -name 'atlas-*-pre-update.db' | head -1)"
  [ -n "$made" ] || fail "une mise à jour doit sauvegarder avant de toucher au code"
  [ "$(sqlite3 "$made" 'SELECT COUNT(*) FROM transactions;')" = "3" ] \
    || fail "la sauvegarde pré-mise-à-jour doit contenir les données"
}
```

L'appeler en fin de fichier :

```bash
test_update_backs_up_first
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/install-update.test.sh`
Expected: FAIL — aucun fichier `atlas-*-pre-update.db`.

- [ ] **Step 3: Write minimal implementation**

Dans `atlas.sh`, modifier `cmd_update_local()` :

```bash
cmd_update_local() {
  # Avant tout : un point de retour. C'est le passage obligé de toutes les
  # routes de mise à jour, donc le seul endroit où ce filet est garanti.
  do_backup pre-update || warn "Mise à jour poursuivie sans sauvegarde préalable"
  require_node
  sync_deps
  run_build
  cmd_restart
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/install-update.test.sh`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add atlas.sh tests/install-update.test.sh
git commit -m "feat(atlas): sauvegarder avant chaque mise à jour"
```

---

### Task 7: `restore` en ligne de commande

**Files:**
- Modify: `atlas.sh` — ajouter `cmd_restore`, aiguillage
- Test: `tests/install-update.test.sh`

- [ ] **Step 1: Write the failing test**

```bash
test_restore_replaces_database() {
  local install_dir="$TEST_ROOT/rst-install"
  local atlas_home="$TEST_ROOT/rst-home"
  local data_dir="$TEST_ROOT/rst-data"

  mkdir -p "$install_dir/atlas"
  cp "$PROJECT_DIR/atlas.sh" "$install_dir/atlas.sh"
  seed_test_db "$data_dir/atlas.db" 2

  # Sauvegarde de l'état à 2 lignes.
  HOME="$TEST_ROOT/home" ATLAS_HOME="$atlas_home" ATLAS_DATA_DIR="$data_dir" \
  PATH="/bin:/usr/bin" /bin/bash "$install_dir/atlas.sh" backup >/dev/null

  # La base évolue.
  sqlite3 "$data_dir/atlas.db" "INSERT INTO transactions (ticker) VALUES ('APRES');"
  [ "$(sqlite3 "$data_dir/atlas.db" 'SELECT COUNT(*) FROM transactions;')" = "3" ] \
    || fail "préparation du test invalide"
  # Un WAL périmé doit disparaître à la restauration.
  printf 'périmé\n' > "$data_dir/atlas.db-wal"

  HOME="$TEST_ROOT/home" ATLAS_HOME="$atlas_home" ATLAS_DATA_DIR="$data_dir" \
  PATH="/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" restore latest >/dev/null

  [ "$(sqlite3 "$data_dir/atlas.db" 'SELECT COUNT(*) FROM transactions;')" = "2" ] \
    || fail "la restauration doit ramener l'état sauvegardé"
  [ ! -f "$data_dir/atlas.db-wal" ] \
    || fail "un -wal périmé doit être supprimé à la restauration"
  find "$atlas_home/backups" -name 'atlas-*-avant-restauration.db' | grep -q . \
    || fail "l'état courant doit être sauvegardé avant d'être écrasé"
}
```

L'appeler en fin de fichier :

```bash
test_restore_replaces_database
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/install-update.test.sh`
Expected: FAIL — `Commande inconnue : restore`.

- [ ] **Step 3: Write minimal implementation**

Dans `atlas.sh`, après `cmd_backup()` :

```bash
cmd_restore() {
  local wanted="${1:-latest}" source

  case "$wanted" in
    latest) source="$(ls -1t "$BACKUP_DIR"/atlas-*.db 2>/dev/null | head -1)" ;;
    /*)     source="$wanted" ;;
    *)      source="$BACKUP_DIR/$wanted" ;;
  esac

  [ -n "$source" ] && [ -f "$source" ] \
    || die "Sauvegarde introuvable : $wanted" "Lance « $0 backup list » pour voir les sauvegardes."

  command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 est nécessaire pour restaurer."
  [ "$(sqlite3 "$source" 'PRAGMA integrity_check;' 2>/dev/null)" = "ok" ] \
    || die "Cette sauvegarde est illisible : $source"

  step "Restauration depuis $(basename "$source")"
  cmd_stop
  do_backup avant-restauration || warn "État courant non sauvegardé"

  mkdir -p "$DATA_DIR"
  cp "$source" "$DB_FILE"
  # Un WAL périmé se réappliquerait par-dessus la base restaurée.
  rm -f "$DB_FILE-wal" "$DB_FILE-shm"
  ok "Base restaurée"
  cmd_start
}
```

Ajouter l'aiguillage après `backup)` :

```bash
  restore)    cmd_restore "${2:-latest}" ;;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/install-update.test.sh`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add atlas.sh tests/install-update.test.sh
git commit -m "feat(atlas): restauration depuis une sauvegarde locale"
```

---

### Task 8: Activer les sauvegardes à l'installation

**Files:**
- Modify: `atlas.sh` — `cmd_install()`, `cmd_uninstall()`, l'en-tête d'aide

**Pas de test hermétique ici, et c'est délibéré.** `cmd_install` télécharge Node,
lance un build et écrit dans `/Applications` : le simuler coûterait plus qu'il
ne prouve. Le comportement de `backup on` est déjà verrouillé par
`test_backup_on_writes_daily_agent` (tâche 5) ; il ne reste que le câblage,
vérifié pour de bon à la tâche 12 sur l'installation réelle.

- [ ] **Step 1: Write minimal implementation**

Dans `cmd_install()`, après `cmd_autostart on`, ajouter :

```bash
  cmd_backup on
```

Dans `cmd_uninstall()`, après la ligne qui décharge `ALERTS_LABEL`, ajouter :

```bash
  unload_agent "$BACKUP_LABEL" "$BACKUP_PLIST"
```

et compléter le message final :

```bash
  info "Tes sauvegardes sont intactes : $BACKUP_DIR"
```

Dans l'en-tête du fichier (lignes 2-25, source de `cmd_help`), ajouter après la ligne `alerts on` :

```
#   ./atlas.sh backup       sauvegarde immédiate (list, on, off)
#   ./atlas.sh restore      restaure la dernière sauvegarde
```

Attention : `cmd_help` lit `sed -n '2,25p'`. L'ajout de deux lignes décale la fin de l'en-tête — porter la plage à `'2,27p'`.

- [ ] **Step 2: Run tests**

Run: `bash tests/install-update.test.sh`
Expected: PASS — aucune régression sur les cas des tâches précédentes.

Run: `bash atlas.sh help`
Expected: la sortie liste `backup` et `restore`, et se termine par la ligne sur l'unicité de l'implémentation du démarrage.

- [ ] **Step 3: Commit**

```bash
git add atlas.sh
git commit -m "feat(atlas): activer la sauvegarde quotidienne dès l'installation"
```

---

## Phase 4 — Restauration depuis l'app

### Task 9: Lecture du dossier de sauvegardes

**Files:**
- Create: `atlas/src/lib/backups.ts`
- Test: `atlas/src/lib/backups.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// atlas/src/lib/backups.test.ts
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
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix atlas -- src/lib/backups.test.ts`
Expected: FAIL — `Cannot find module './backups'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// atlas/src/lib/backups.ts
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Dossier des sauvegardes produites par atlas.sh. Hors du dossier
 * d'installation : ni une mise à jour ni une réinstallation ne l'atteignent.
 */
export const BACKUP_DIR =
  process.env.ATLAS_BACKUP_DIR ?? path.join(os.homedir(), ".atlas", "backups");

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
      const row = db
        .prepare("SELECT COUNT(*) AS n FROM transactions")
        .get() as { n: number } | undefined;
      return row?.n ?? null;
    } finally {
      db.close();
    }
  } catch {
    return null;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix atlas -- src/lib/backups.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add atlas/src/lib/backups.ts atlas/src/lib/backups.test.ts
git commit -m "feat(backups): lister et résoudre les sauvegardes locales"
```

---

### Task 10: API de listing et de restauration locale

**Files:**
- Create: `atlas/src/app/api/backup/list/route.ts`
- Modify: `atlas/src/app/api/backup/restore/route.ts`

**Lire d'abord :** `atlas/node_modules/next/dist/docs/` pour les conventions de Route Handlers de cette version de Next.

- [ ] **Step 1: Write the failing test**

Ces routes sont des enveloppes minces. Le test porte sur la logique de sélection de la source, extraite pour être testable :

```ts
// ajouter à atlas/src/lib/backups.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix atlas -- src/lib/backups.test.ts`
Expected: FAIL — `readBackupBytes is not a function`.

- [ ] **Step 3: Write minimal implementation**

Ajouter à `atlas/src/lib/backups.ts` :

```ts
/** Octets d'une sauvegarde, ou null si le nom est refusé ou le fichier absent. */
export function readBackupBytes(file: string): Buffer | null {
  const full = resolveBackupPath(file);
  if (!full) return null;
  return fs.readFileSync(full);
}
```

Créer `atlas/src/app/api/backup/list/route.ts` :

```ts
import { listBackups, BACKUP_DIR } from "@/lib/backups";
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
```

Modifier `atlas/src/app/api/backup/restore/route.ts` pour accepter un nom de sauvegarde locale en plus du téléversement. Remplacer le début de `POST` :

```ts
export async function POST(req: NextRequest) {
  try {
    let bytes: Buffer;

    // Deux sources : un fichier téléversé, ou une sauvegarde locale par son nom.
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as { file?: unknown };
      if (typeof body.file !== "string") return bad("Nom de sauvegarde manquant");
      const local = readBackupBytes(body.file);
      if (!local) return bad("Sauvegarde introuvable.");
      bytes = local;
    } else {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return bad("Fichier manquant");
      bytes = Buffer.from(await file.arrayBuffer());
    }

    // …la suite (validation magic SQLite, sonde 'transactions', .bak, replaceDb)
    // reste inchangée.
```

Ajouter l'import en tête du fichier :

```ts
import { readBackupBytes } from "@/lib/backups";
```

- [ ] **Step 4: Run tests**

Run: `npm test --prefix atlas -- src/lib/backups.test.ts`
Expected: PASS — 8 tests.

Run: `npm run build --prefix atlas`
Expected: build réussi, sans erreur TypeScript.

- [ ] **Step 5: Commit**

```bash
git add atlas/src/lib/backups.ts atlas/src/lib/backups.test.ts \
  atlas/src/app/api/backup/list/route.ts atlas/src/app/api/backup/restore/route.ts
git commit -m "feat(api): lister les sauvegardes et restaurer depuis une sauvegarde locale"
```

---

### Task 11: Section Paramètres — sauvegardes et restauration

**Files:**
- Create: `atlas/src/components/backup-section.tsx`
- Modify: `atlas/src/app/parametres/page.tsx` (retirer `BackupSection` défini ligne 924, importer le composant)
- Modify: `atlas/src/lib/i18n.tsx`

**Lire d'abord :** `atlas/node_modules/next/dist/docs/` — conventions de composants client de cette version.

- [ ] **Step 1: Ajouter les libellés**

Dans `atlas/src/lib/i18n.tsx`, ajouter aux dictionnaires FR puis EN, à côté des clés `set.backup.*` existantes :

```
"set.backup.list.title"    fr: "Sauvegardes automatiques"        en: "Automatic backups"
"set.backup.list.hint"     fr: "Une sauvegarde par jour et une avant chaque mise à jour. Choisis un point de retour."
                           en: "One backup a day, plus one before every update. Pick a restore point."
"set.backup.list.empty"    fr: "Aucune sauvegarde pour l'instant."   en: "No backups yet."
"set.backup.list.restore"  fr: "Restaurer"                       en: "Restore"
"set.backup.list.txCount"  fr: "{n} transactions"                en: "{n} transactions"
"set.backup.list.unreadable" fr: "illisible"                     en: "unreadable"
"set.backup.where"         fr: "Données : {dir}"                 en: "Data: {dir}"
"set.backup.restored"      fr: "Sauvegarde restaurée."           en: "Backup restored."
"set.backup.confirmLocal"  fr: "Remplacer les données actuelles par la sauvegarde du {date} ? L'état courant est sauvegardé avant."
                           en: "Replace current data with the backup from {date}? The current state is backed up first."
```

Respecter le format d'interpolation déjà utilisé par `t()` dans ce fichier (voir `set.symbolMap.saved`, qui prend `{ticker}` et `{symbol}`).

- [ ] **Step 2: Extraire et étendre le composant**

Créer `atlas/src/components/backup-section.tsx` avec le contenu de `BackupSection` (`parametres/page.tsx:924` jusqu'à la fin de la fonction), plus la liste. Le composant garde l'export/import de fichier existant et gagne :

```tsx
interface BackupEntry {
  file: string;
  bytes: number;
  modifiedAt: string;
  transactions: number | null;
}

const { data, reload } = useApi<{
  backups: BackupEntry[];
  backupDir: string;
  dataDir: string;
}>("/api/backup/list");

const restoreLocal = async (entry: BackupEntry) => {
  const date = new Date(entry.modifiedAt).toLocaleString();
  if (!window.confirm(t("set.backup.confirmLocal", { date }))) return;
  setRestoring(true);
  try {
    await postJson("/api/backup/restore", { file: entry.file });
    toast(t("set.backup.restored"));
    reload();
    refresh(true);
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), "error");
  } finally {
    setRestoring(false);
  }
};
```

Rendu de la liste, sous les boutons existants :

```tsx
<div className="mt-5 border-t border-border/60 pt-5">
  <p className="text-sm font-medium">{t("set.backup.list.title")}</p>
  <p className="mt-0.5 text-xs leading-relaxed text-muted">
    {t("set.backup.list.hint")}
  </p>
  {data?.dataDir ? (
    <p className="mt-1 text-xs text-muted">
      {t("set.backup.where", { dir: data.dataDir })}
    </p>
  ) : null}

  {(data?.backups.length ?? 0) === 0 ? (
    <p className="mt-3 text-xs text-muted">{t("set.backup.list.empty")}</p>
  ) : (
    <ul className="mt-3 flex flex-col gap-1.5">
      {data!.backups.map((entry) => (
        <li
          key={entry.file}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
        >
          <span className="text-xs">
            {new Date(entry.modifiedAt).toLocaleString()}
            <span className="ml-2 text-muted">
              {entry.transactions === null
                ? t("set.backup.list.unreadable")
                : t("set.backup.list.txCount", { n: String(entry.transactions) })}
            </span>
          </span>
          <button
            type="button"
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface disabled:opacity-50"
            disabled={restoring || entry.transactions === null}
            onClick={() => restoreLocal(entry)}
          >
            {t("set.backup.list.restore")}
          </button>
        </li>
      ))}
    </ul>
  )}
</div>
```

Une sauvegarde illisible reste visible mais n'est pas proposée : `disabled` quand `transactions === null`.

Reprendre les imports nécessaires depuis `parametres/page.tsx` (`useI18n`, `useToast`, `useRefresh`, `useApi`, `postJson`, `useRef`, `useState`) et marquer le fichier `"use client"` si la page l'est déjà en tête.

- [ ] **Step 3: Brancher le composant**

Dans `atlas/src/app/parametres/page.tsx` : supprimer la fonction `BackupSection` (ligne 924 jusqu'à sa fermeture) et ajouter en tête :

```tsx
import { BackupSection } from "@/components/backup-section";
```

L'appel `<BackupSection />` ligne 799 reste inchangé.

- [ ] **Step 4: Vérifier**

Run: `npm run build --prefix atlas`
Expected: build réussi.

Run: `npm test --prefix atlas`
Expected: PASS.

Vérification manuelle :

```bash
./atlas.sh backup
./atlas.sh restart
curl -s http://localhost:3210/api/backup/list | head -c 400
```

Expected: JSON listant au moins une sauvegarde avec `transactions`, `backupDir` et `dataDir`.

Ouvrir `http://localhost:3210/parametres` : la section liste la sauvegarde, avec sa date et son nombre de transactions.

- [ ] **Step 5: Commit**

```bash
git add atlas/src/components/backup-section.tsx atlas/src/app/parametres/page.tsx \
  atlas/src/lib/i18n.tsx
git commit -m "feat(ui): restaurer une sauvegarde en un clic depuis les Paramètres"
```

---

## Task 12: Vérification de bout en bout

**Files:** aucun (vérification)

- [ ] **Step 1: Suite complète**

Run: `npm test`
Expected: PASS — `test:app` (vitest) et `test:install` (bash).

- [ ] **Step 2: Migration réelle sur l'installation active**

```bash
ls -la ~/.atlas/data/ 2>/dev/null || echo "pas encore migré"
cd /Users/test/Atlas && ./atlas.sh restart
sleep 8
sqlite3 ~/.atlas/data/atlas.db "SELECT COUNT(*) FROM transactions;"
ls -la /Users/test/Atlas/atlas/data/
```

Expected: `83`, et l'ancien dossier ne contient plus qu'un `atlas.db.migre-<horodatage>`.

- [ ] **Step 3: L'app sert bien les données migrées**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3210/
curl -s http://localhost:3210/api/portfolio | head -c 200
```

Expected: `200`, et un JSON avec `summary.positionsCount` à 34.

- [ ] **Step 4: Sauvegarde et rotation**

```bash
./atlas.sh backup
./atlas.sh backup list
ls ~/Library/Mobile\ Documents/com~apple~CloudDocs/Atlas/ 2>/dev/null || echo "iCloud absent"
```

Expected: au moins une sauvegarde listée ; copie iCloud présente si iCloud Drive est configuré.

- [ ] **Step 5: Le dossier d'installation ne porte plus de données**

**Ne pas lancer `install.sh` pour de vrai ici.** Une installation complète
réécrit le LaunchAgent vers le dossier cible et détournerait l'app en service.
Le cas « seconde installation » est déjà couvert de façon hermétique par
`test_installer_adopts_running_install` (tâche 4).

La propriété qui reste à constater sur la machine est que le dossier
d'installation est devenu jetable :

```bash
ls /Users/test/Atlas/atlas/data/
sed -n 's|.*<key>WorkingDirectory</key><string>\(.*\)</string>.*|\1|p' \
  ~/Library/LaunchAgents/local.atlas.server.plist
cat ~/.atlas/install-path
```

Expected: plus aucun `atlas.db` dans le dossier d'installation — seulement un
`atlas.db.migre-<horodatage>` ; l'agent pointe toujours sur
`/Users/test/Atlas/atlas` ; le registre contient `/Users/test/Atlas`.

À partir de là, supprimer le dossier d'installation ne coûterait que le code :
la panne d'origine est refermée.

- [ ] **Step 6: Commit final si des ajustements ont été nécessaires**

```bash
git add -A
git commit -m "fix: ajustements après vérification de bout en bout"
```
