#!/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/atlas-install-test.XXXXXX")"
TEST_ROOT="$(cd "$TEST_ROOT" && pwd)"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

# Filet de sécurité : aucun test ne doit écrire dans le vrai dossier personnel.
# install.sh y écrit son registre, et un test qui oublie d'isoler HOME l'a déjà
# écrasé avec un chemin temporaire.
REAL_REGISTRY="$HOME/.atlas/install-path"
REAL_REGISTRY_BEFORE="$(cat "$REAL_REGISTRY" 2>/dev/null || printf '<absent>')"

assert_real_home_untouched() {
  local now
  now="$(cat "$REAL_REGISTRY" 2>/dev/null || printf '<absent>')"
  [ "$now" = "$REAL_REGISTRY_BEFORE" ] \
    || fail "un test a écrit dans le vrai \$HOME/.atlas — isole HOME dans ce test"
}

assert_file_contains() {
  local file="$1" expected="$2"
  [ -f "$file" ] || fail "$file should exist"
  [ "$(cat "$file")" = "$expected" ] \
    || fail "$file should contain '$expected', got '$(cat "$file")'"
}

assert_file_has_line() {
  local file="$1" expected="$2"
  [ -f "$file" ] || fail "$file should exist"
  grep -Fxq "$expected" "$file" \
    || fail "$file should contain the line '$expected'"
}

make_release_tarball() {
  local fixture_root="$TEST_ROOT/release"
  mkdir -p "$fixture_root/atlas-invest-main/atlas/data"
  printf 'new\n' > "$fixture_root/atlas-invest-main/atlas/version.txt"
  printf 'release-placeholder\n' > "$fixture_root/atlas-invest-main/atlas/data/portfolio.db"
  printf 'release-placeholder\n' > "$fixture_root/atlas-invest-main/.env"
  printf '#!/bin/bash\nprintf "new:%%s\\n" "$1" > "$ATLAS_TEST_RESULT"\n' \
    > "$fixture_root/atlas-invest-main/atlas.sh"
  chmod +x "$fixture_root/atlas-invest-main/atlas.sh"
  tar -czf "$TEST_ROOT/release.tar.gz" -C "$fixture_root" atlas-invest-main
}

make_fake_curl() {
  local bin_dir="$1"
  mkdir -p "$bin_dir"
  printf '%s\n' \
    '#!/bin/bash' \
    'output=""' \
    'while [ "$#" -gt 0 ]; do' \
    '  if [ "$1" = "-o" ]; then output="$2"; shift 2; else shift; fi' \
    'done' \
    'if [ -n "$output" ]; then' \
    '  cp "$ATLAS_TEST_DOWNLOAD" "$output"' \
    'fi' \
    > "$bin_dir/curl"
  chmod +x "$bin_dir/curl"
}

# git de substitution : « clone » déballe le tarball de test dans la cible, ce
# qui permet d'exercer le chemin « machine neuve » sans accès réseau.
make_fake_git() {
  local bin_dir="$1"
  mkdir -p "$bin_dir"
  printf '%s\n' \
    '#!/bin/bash' \
    'case "$1" in' \
    '  --version) echo "git version 0.0-fake" ;;' \
    '  clone)' \
    '    target="${@: -1}"' \
    '    mkdir -p "$target"' \
    '    tar -xzf "$ATLAS_TEST_DOWNLOAD" -C "$target" --strip-components=1' \
    '    ;;' \
    'esac' \
    'exit 0' \
    > "$bin_dir/git"
  chmod +x "$bin_dir/git"
}

# launchctl de substitution. Sans lui, un test qui active un agent en
# enregistrerait un VRAI dans launchd, pointant vers un dossier temporaire
# supprimé à la fin de la suite.
make_fake_launchctl() {
  local bin_dir="$1"
  mkdir -p "$bin_dir"
  printf '#!/bin/bash\nexit 0\n' > "$bin_dir/launchctl"
  chmod +x "$bin_dir/launchctl"
}

# Base SQLite minimale mais crédible, à l'emplacement des données.
seed_test_db() {
  local file="$1" rows="$2" i=0
  mkdir -p "$(dirname "$file")"
  sqlite3 "$file" \
    "CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY, ticker TEXT);"
  while [ "$i" -lt "$rows" ]; do
    sqlite3 "$file" "INSERT INTO transactions (ticker) VALUES ('T$i');"
    i=$((i + 1))
  done
}

# Installation minimale capable de faire tourner atlas.sh.
make_runnable_install() {
  local dir="$1"
  mkdir -p "$dir/atlas"
  cp "$PROJECT_DIR/atlas.sh" "$dir/atlas.sh"
}

# Plist minimal de l'agent serveur, tel que write_plist le produit.
write_server_plist() {
  local plist="$1" workdir="$2"
  mkdir -p "$(dirname "$plist")"
  printf '%s\n' \
    '<?xml version="1.0" encoding="UTF-8"?>' \
    '<plist version="1.0"><dict>' \
    '  <key>Label</key><string>local.atlas.server</string>' \
    "  <key>WorkingDirectory</key><string>$workdir</string>" \
    '</dict></plist>' \
    > "$plist"
}

# Squelette d'installation reconnaissable par looks_like_install.
make_install_skeleton() {
  local dir="$1"
  mkdir -p "$dir/atlas"
  printf '{}\n' > "$dir/atlas/package.json"
  printf '#!/bin/bash\nexit 0\n' > "$dir/atlas.sh"
  chmod +x "$dir/atlas.sh"
}

test_bootstrap_refreshes_archive_install() {
  local install_dir="$TEST_ROOT/existing-install"
  local fake_bin="$TEST_ROOT/bootstrap-bin"
  local result="$TEST_ROOT/bootstrap-result"

  mkdir -p "$install_dir/atlas/data" "$install_dir/atlas/node_modules" "$install_dir/OLD"
  printf 'old\n' > "$install_dir/atlas/version.txt"
  printf 'keep-data\n' > "$install_dir/atlas/data/portfolio.db"
  printf 'keep-env\n' > "$install_dir/.env"
  printf 'keep-modules\n' > "$install_dir/atlas/node_modules/local.txt"
  printf 'keep-legacy\n' > "$install_dir/OLD/legacy.db"
  printf 'remove-me\n' > "$install_dir/obsolete.txt"
  printf '#!/bin/bash\nprintf "old:%%s\\n" "$1" > "$ATLAS_TEST_RESULT"\n' \
    > "$install_dir/atlas.sh"
  chmod +x "$install_dir/atlas.sh"

  make_fake_curl "$fake_bin"
  make_fake_git "$fake_bin"

  # HOME isolé : install.sh écrit le registre dans $HOME/.atlas, et un test ne
  # doit jamais toucher au vrai dossier personnel.
  HOME="$TEST_ROOT/bootstrap-home" \
  ATLAS_DIR="$install_dir" \
  ATLAS_INSTALL_MODE=update-local \
  ATLAS_TEST_DOWNLOAD="$TEST_ROOT/release.tar.gz" \
  ATLAS_TEST_RESULT="$result" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$PROJECT_DIR/install.sh" >/dev/null

  assert_file_contains "$install_dir/atlas/version.txt" "new"
  assert_file_contains "$install_dir/atlas/data/portfolio.db" "keep-data"
  assert_file_contains "$install_dir/.env" "keep-env"
  assert_file_contains "$install_dir/atlas/node_modules/local.txt" "keep-modules"
  assert_file_contains "$install_dir/OLD/legacy.db" "keep-legacy"
  if command -v rsync >/dev/null 2>&1; then
    [ ! -e "$install_dir/obsolete.txt" ] || fail "obsolete tracked files should be removed"
  fi
  assert_file_contains "$result" "new:update-local"
}

test_atlas_update_bootstraps_archive_install() {
  local install_dir="$TEST_ROOT/archive-install"
  local atlas_home="$TEST_ROOT/atlas-home"
  local fake_bin="$TEST_ROOT/update-bin"
  local result="$TEST_ROOT/update-result"
  local remote_installer="$TEST_ROOT/remote-install.sh"

  mkdir -p "$install_dir/atlas/src" "$fake_bin" "$atlas_home/node/bin"
  cp "$PROJECT_DIR/atlas.sh" "$install_dir/atlas.sh"
  printf '{}\n' > "$install_dir/atlas/package.json"
  printf '{}\n' > "$install_dir/atlas/next.config.ts"
  printf '{}\n' > "$install_dir/atlas/tsconfig.json"
  printf '{}\n' > "$install_dir/atlas/postcss.config.mjs"

  printf '#!/bin/bash\necho v22.0.0\n' > "$atlas_home/node/bin/node"
  printf '#!/bin/bash\nexit 0\n' > "$atlas_home/node/bin/npm"
  chmod +x "$atlas_home/node/bin/node" "$atlas_home/node/bin/npm"
  mkdir -p "$install_dir/atlas/node_modules"
  printf '%s-node22\n' "$(uname -m)" > "$install_dir/atlas/node_modules/.atlas-arch"

  printf '#!/bin/bash\nprintf "%%s:%%s\\n" "$ATLAS_INSTALL_MODE" "$ATLAS_DIR" > "$ATLAS_TEST_RESULT"\n' \
    > "$remote_installer"
  chmod +x "$remote_installer"
  make_fake_curl "$fake_bin"
  make_fake_git "$fake_bin"

  HOME="$TEST_ROOT/home" \
  ATLAS_HOME="$atlas_home" \
  ATLAS_TEST_DOWNLOAD="$remote_installer" \
  ATLAS_TEST_RESULT="$result" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" update >/dev/null

  assert_file_contains "$result" "update-local:$install_dir"
}

test_update_local_syncs_dependencies() {
  local install_dir="$TEST_ROOT/local-update"
  local atlas_home="$TEST_ROOT/local-update-home"
  local fake_bin="$TEST_ROOT/local-update-bin"
  local npm_log="$TEST_ROOT/npm.log"

  mkdir -p "$install_dir/atlas/src" "$install_dir/atlas/node_modules" \
    "$atlas_home/node/bin" "$fake_bin"
  cp "$PROJECT_DIR/atlas.sh" "$install_dir/atlas.sh"
  printf '{}\n' > "$install_dir/atlas/package.json"
  printf '{}\n' > "$install_dir/atlas/next.config.ts"
  printf '{}\n' > "$install_dir/atlas/tsconfig.json"
  printf '{}\n' > "$install_dir/atlas/postcss.config.mjs"
  printf '%s-node22\n' "$(uname -m)" > "$install_dir/atlas/node_modules/.atlas-arch"

  printf '#!/bin/bash\necho v22.0.0\n' > "$atlas_home/node/bin/node"
  printf '%s\n' \
    '#!/bin/bash' \
    'printf "%s\n" "$*" >> "$ATLAS_NPM_LOG"' \
    'if [ "$*" = "run build" ]; then mkdir -p .next; touch .next/BUILD_ID; fi' \
    'exit 0' \
    > "$atlas_home/node/bin/npm"
  chmod +x "$atlas_home/node/bin/node" "$atlas_home/node/bin/npm"
  make_fake_curl "$fake_bin"
  make_fake_git "$fake_bin"

  HOME="$TEST_ROOT/home" \
  ATLAS_HOME="$atlas_home" \
  ATLAS_NPM_LOG="$npm_log" \
  ATLAS_TEST_DOWNLOAD="$TEST_ROOT/release.tar.gz" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" update-local >/dev/null

  assert_file_has_line "$npm_log" "install --no-audit --no-fund"
}

test_installer_adopts_running_install() {
  local live_dir="$TEST_ROOT/live-install"
  local fake_home="$TEST_ROOT/adopt-home"
  local fake_bin="$TEST_ROOT/adopt-bin"

  make_install_skeleton "$live_dir"
  write_server_plist \
    "$fake_home/Library/LaunchAgents/local.atlas.server.plist" "$live_dir/atlas"
  make_fake_curl "$fake_bin"
  make_fake_git "$fake_bin"

  # Aucun ATLAS_DIR : sans détection, la cible serait $HOME/Atlas.
  HOME="$fake_home" \
  ATLAS_TEST_DOWNLOAD="$TEST_ROOT/release.tar.gz" \
  ATLAS_TEST_RESULT="$TEST_ROOT/adopt-result" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$PROJECT_DIR/install.sh" >/dev/null

  assert_file_contains "$live_dir/atlas/version.txt" "new"
  [ ! -d "$fake_home/Atlas" ] \
    || fail "l'installeur ne doit pas créer un second dossier quand une install est active"
  assert_file_contains "$fake_home/.atlas/install-path" "$live_dir"
}

test_explicit_atlas_dir_wins_over_detection() {
  local live_dir="$TEST_ROOT/live-install-2"
  local forced_dir="$TEST_ROOT/forced-install"
  local fake_home="$TEST_ROOT/forced-home"
  local fake_bin="$TEST_ROOT/forced-bin"

  make_install_skeleton "$live_dir"
  mkdir -p "$forced_dir"
  write_server_plist \
    "$fake_home/Library/LaunchAgents/local.atlas.server.plist" "$live_dir/atlas"
  make_fake_curl "$fake_bin"
  make_fake_git "$fake_bin"

  HOME="$fake_home" \
  ATLAS_DIR="$forced_dir" \
  ATLAS_TEST_DOWNLOAD="$TEST_ROOT/release.tar.gz" \
  ATLAS_TEST_RESULT="$TEST_ROOT/forced-result" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$PROJECT_DIR/install.sh" >/dev/null

  assert_file_contains "$forced_dir/atlas/version.txt" "new"
  [ ! -f "$live_dir/atlas/version.txt" ] \
    || fail "ATLAS_DIR explicite doit l'emporter sur la détection"
}

test_fresh_machine_installs_to_default_quietly() {
  local fake_home="$TEST_ROOT/fresh-home"
  local fake_bin="$TEST_ROOT/fresh-bin"
  local output="$TEST_ROOT/fresh-output"

  mkdir -p "$fake_home"
  make_fake_curl "$fake_bin"
  make_fake_git "$fake_bin"

  HOME="$fake_home" \
  ATLAS_TEST_DOWNLOAD="$TEST_ROOT/release.tar.gz" \
  ATLAS_TEST_RESULT="$TEST_ROOT/fresh-result" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$PROJECT_DIR/install.sh" > "$output" 2>&1

  assert_file_contains "$fake_home/Atlas/atlas/version.txt" "new"
  if grep -q "Installation existante" "$output"; then
    fail "aucune détection ne doit être annoncée sur une machine neuve"
  fi
  assert_file_contains "$fake_home/.atlas/install-path" "$fake_home/Atlas"
}

test_backup_creates_verified_copy() {
  local atlas_home="$TEST_ROOT/bk-home"
  local data_dir="$TEST_ROOT/bk-data"
  local install_dir="$TEST_ROOT/bk-install"
  local fake_bin="$TEST_ROOT/bk-bin"

  make_runnable_install "$install_dir"
  make_fake_launchctl "$fake_bin"
  seed_test_db "$data_dir/atlas.db" 4

  HOME="$TEST_ROOT/home" \
  ATLAS_HOME="$atlas_home" \
  ATLAS_DATA_DIR="$data_dir" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" backup >/dev/null

  local count made
  count="$(find "$atlas_home/backups" -name 'atlas-*.db' | wc -l | tr -d ' ')"
  [ "$count" = "1" ] || fail "une sauvegarde devait être créée, trouvé $count"
  made="$(find "$atlas_home/backups" -name 'atlas-*.db' | head -1)"
  [ "$(sqlite3 "$made" 'SELECT COUNT(*) FROM transactions;')" = "4" ] \
    || fail "la sauvegarde doit contenir les 4 lignes"
}

test_backup_skips_identical_snapshot() {
  local atlas_home="$TEST_ROOT/bk2-home"
  local data_dir="$TEST_ROOT/bk2-data"
  local install_dir="$TEST_ROOT/bk2-install"
  local fake_bin="$TEST_ROOT/bk2-bin"

  make_runnable_install "$install_dir"
  make_fake_launchctl "$fake_bin"
  seed_test_db "$data_dir/atlas.db" 2

  local n=0
  while [ "$n" -lt 2 ]; do
    HOME="$TEST_ROOT/home" \
    ATLAS_HOME="$atlas_home" \
    ATLAS_DATA_DIR="$data_dir" \
    PATH="$fake_bin:/bin:/usr/bin" \
      /bin/bash "$install_dir/atlas.sh" backup >/dev/null
    sleep 1
    n=$((n + 1))
  done

  local count
  count="$(find "$atlas_home/backups" -name 'atlas-*.db' | wc -l | tr -d ' ')"
  [ "$count" = "1" ] \
    || fail "une base inchangée ne doit pas produire un second fichier, trouvé $count"
}

test_backup_without_database_is_silent_success() {
  local install_dir="$TEST_ROOT/bk3-install"
  local fake_bin="$TEST_ROOT/bk3-bin"

  make_runnable_install "$install_dir"
  make_fake_launchctl "$fake_bin"

  HOME="$TEST_ROOT/home" \
  ATLAS_HOME="$TEST_ROOT/bk3-home" \
  ATLAS_DATA_DIR="$TEST_ROOT/bk3-absent" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" backup >/dev/null \
    || fail "sans base, la sauvegarde doit réussir sans rien faire"
}

test_backup_rotation_caps_the_directory() {
  local atlas_home="$TEST_ROOT/bk4-home"
  local data_dir="$TEST_ROOT/bk4-data"
  local install_dir="$TEST_ROOT/bk4-install"
  local fake_bin="$TEST_ROOT/bk4-bin"

  make_runnable_install "$install_dir"
  make_fake_launchctl "$fake_bin"
  seed_test_db "$data_dir/atlas.db" 1

  local i=0
  while [ "$i" -lt 3 ]; do
    sqlite3 "$data_dir/atlas.db" "INSERT INTO transactions (ticker) VALUES ('R$i');"
    HOME="$TEST_ROOT/home" \
    ATLAS_HOME="$atlas_home" \
    ATLAS_DATA_DIR="$data_dir" \
    ATLAS_BACKUP_KEEP=2 \
    PATH="$fake_bin:/bin:/usr/bin" \
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
  local fake_bin="$TEST_ROOT/bk5-bin"

  make_runnable_install "$install_dir"
  make_fake_launchctl "$fake_bin"
  seed_test_db "$data_dir/atlas.db" 3

  HOME="$TEST_ROOT/home" ATLAS_HOME="$atlas_home" ATLAS_DATA_DIR="$data_dir" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" backup >/dev/null

  # La base source devient illisible : la sauvegarde doit échouer sans purger.
  printf 'SQLite format 3\000' > "$data_dir/atlas.db"
  dd if=/dev/zero bs=1024 count=4 2>/dev/null | tr '\000' '\177' >> "$data_dir/atlas.db"

  # L'échec est le comportement attendu ici : sans « || true », le set -e de la
  # suite ferait avorter tout le script sans message.
  HOME="$TEST_ROOT/home" ATLAS_HOME="$atlas_home" ATLAS_DATA_DIR="$data_dir" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" backup >/dev/null 2>&1 \
    && fail "une sauvegarde sur base illisible doit échouer, pas réussir"

  local count
  count="$(find "$atlas_home/backups" -name 'atlas-*.db' | wc -l | tr -d ' ')"
  [ "$count" = "1" ] \
    || fail "une sauvegarde ratée ne doit ni ajouter ni purger, trouvé $count"
  if find "$atlas_home/backups" -name '.en-cours-*' | grep -q .; then
    fail "aucun fichier temporaire ne doit rester après un échec"
  fi
}

test_backup_on_writes_daily_agent() {
  local atlas_home="$TEST_ROOT/bk6-home"
  local fake_home="$TEST_ROOT/bk6-fakehome"
  local install_dir="$TEST_ROOT/bk6-install"
  local fake_bin="$TEST_ROOT/bk6-bin"

  make_runnable_install "$install_dir"
  make_fake_launchctl "$fake_bin"
  mkdir -p "$fake_home/Library/LaunchAgents"

  HOME="$fake_home" ATLAS_HOME="$atlas_home" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" backup on >/dev/null 2>&1

  local plist="$fake_home/Library/LaunchAgents/local.atlas.backup.plist"
  [ -f "$plist" ] || fail "backup on doit écrire le plist de l'agent quotidien"
  grep -q "<integer>86400</integer>" "$plist" \
    || fail "l'agent doit tourner une fois par jour"
}

test_update_backs_up_first() {
  local install_dir="$TEST_ROOT/upbk-install"
  local atlas_home="$TEST_ROOT/upbk-home"
  local data_dir="$TEST_ROOT/upbk-data"
  local fake_bin="$TEST_ROOT/upbk-bin"

  mkdir -p "$install_dir/atlas/src" "$install_dir/atlas/node_modules" \
    "$atlas_home/node/bin"
  cp "$PROJECT_DIR/atlas.sh" "$install_dir/atlas.sh"
  printf '{}\n' > "$install_dir/atlas/package.json"
  printf '{}\n' > "$install_dir/atlas/next.config.ts"
  printf '{}\n' > "$install_dir/atlas/tsconfig.json"
  printf '{}\n' > "$install_dir/atlas/postcss.config.mjs"
  printf '%s-node22\n' "$(uname -m)" > "$install_dir/atlas/node_modules/.atlas-arch"
  make_fake_launchctl "$fake_bin"
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
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" update-local >/dev/null 2>&1 || true

  local made
  made="$(find "$atlas_home/backups" -name 'atlas-*-pre-update.db' | head -1)"
  [ -n "$made" ] || fail "une mise à jour doit sauvegarder avant de toucher au code"
  [ "$(sqlite3 "$made" 'SELECT COUNT(*) FROM transactions;')" = "3" ] \
    || fail "la sauvegarde pré-mise-à-jour doit contenir les données"
}

test_restore_replaces_database() {
  local install_dir="$TEST_ROOT/rst-install"
  local atlas_home="$TEST_ROOT/rst-home"
  local data_dir="$TEST_ROOT/rst-data"
  local fake_bin="$TEST_ROOT/rst-bin"

  make_runnable_install "$install_dir"
  make_fake_launchctl "$fake_bin"
  seed_test_db "$data_dir/atlas.db" 2

  # Sauvegarde de l'état à 2 lignes.
  HOME="$TEST_ROOT/home" ATLAS_HOME="$atlas_home" ATLAS_DATA_DIR="$data_dir" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" backup >/dev/null

  # La base évolue, et un WAL périmé traîne.
  sqlite3 "$data_dir/atlas.db" "INSERT INTO transactions (ticker) VALUES ('APRES');"
  [ "$(sqlite3 "$data_dir/atlas.db" 'SELECT COUNT(*) FROM transactions;')" = "3" ] \
    || fail "préparation du test invalide"
  printf 'périmé\n' > "$data_dir/atlas.db-wal"

  HOME="$TEST_ROOT/home" ATLAS_HOME="$atlas_home" ATLAS_DATA_DIR="$data_dir" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" restore latest >/dev/null

  [ "$(sqlite3 "$data_dir/atlas.db" 'SELECT COUNT(*) FROM transactions;')" = "2" ] \
    || fail "la restauration doit ramener l'état sauvegardé"
  [ ! -f "$data_dir/atlas.db-wal" ] \
    || fail "un -wal périmé doit être supprimé à la restauration"
  find "$atlas_home/backups" -name 'atlas-*-avant-restauration.db' | grep -q . \
    || fail "l'état courant doit être sauvegardé avant d'être écrasé"
}

test_restore_refuses_unknown_backup() {
  local install_dir="$TEST_ROOT/rst2-install"
  local atlas_home="$TEST_ROOT/rst2-home"
  local data_dir="$TEST_ROOT/rst2-data"
  local fake_bin="$TEST_ROOT/rst2-bin"

  make_runnable_install "$install_dir"
  make_fake_launchctl "$fake_bin"
  seed_test_db "$data_dir/atlas.db" 5

  HOME="$TEST_ROOT/home" ATLAS_HOME="$atlas_home" ATLAS_DATA_DIR="$data_dir" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" restore inexistante.db >/dev/null 2>&1 \
    && fail "restaurer une sauvegarde inconnue doit échouer"

  [ "$(sqlite3 "$data_dir/atlas.db" 'SELECT COUNT(*) FROM transactions;')" = "5" ] \
    || fail "un échec de restauration ne doit pas toucher à la base"
}

make_release_tarball
test_bootstrap_refreshes_archive_install
test_atlas_update_bootstraps_archive_install
test_update_local_syncs_dependencies
test_installer_adopts_running_install
test_explicit_atlas_dir_wins_over_detection
test_fresh_machine_installs_to_default_quietly
test_backup_creates_verified_copy
test_backup_skips_identical_snapshot
test_backup_without_database_is_silent_success
test_backup_rotation_caps_the_directory
test_backup_failure_preserves_existing_backups
test_backup_on_writes_daily_agent
test_update_backs_up_first
test_restore_replaces_database
test_restore_refuses_unknown_backup
assert_real_home_untouched

printf 'PASS: archive installation and update flows\n'
