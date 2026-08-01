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

  HOME="$TEST_ROOT/home" \
  ATLAS_HOME="$atlas_home" \
  ATLAS_NPM_LOG="$npm_log" \
  ATLAS_TEST_DOWNLOAD="$TEST_ROOT/release.tar.gz" \
  PATH="$fake_bin:/bin:/usr/bin" \
    /bin/bash "$install_dir/atlas.sh" update-local >/dev/null

  assert_file_has_line "$npm_log" "install --no-audit --no-fund"
}

make_release_tarball
test_bootstrap_refreshes_archive_install
test_atlas_update_bootstraps_archive_install
test_update_local_syncs_dependencies

printf 'PASS: archive installation and update flows\n'
