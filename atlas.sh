#!/bin/bash
# =============================================================================
# Atlas — script unique de cycle de vie.
#
#   ./atlas.sh              démarre Atlas si besoin, puis ouvre le navigateur
#   ./atlas.sh install      installe tout (Node compris) et crée l'icône
#   ./atlas.sh start        démarre le serveur
#   ./atlas.sh stop         arrête le serveur
#   ./atlas.sh restart      redémarre
#   ./atlas.sh status       où en est Atlas
#   ./atlas.sh update       récupère la dernière version et reconstruit
#   ./atlas.sh logs         affiche le journal en continu
#   ./atlas.sh doctor       diagnostic
#   ./atlas.sh alerts on    alertes de prix même app fermée (off pour couper)
#   ./atlas.sh autostart on démarrage automatique à l'ouverture de session
#   ./atlas.sh uninstall    retire icône, services et Node local (garde tes données)
#
# L'icône du Launchpad et les services macOS appellent ce script : il n'existe
# qu'une seule implémentation du démarrage.
# =============================================================================

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$REPO_DIR/atlas"

ATLAS_HOME="${ATLAS_HOME:-$HOME/.atlas}"
NODE_DIR="$ATLAS_HOME/node"
LOG_DIR="$ATLAS_HOME/logs"
LOG_FILE="$LOG_DIR/atlas.log"
ALERTS_LOG="$LOG_DIR/alerts.log"

# Les données et les sauvegardes vivent hors du dossier d'installation : une
# mise à jour, un déplacement ou une réinstallation ne peuvent plus les
# atteindre. Doit rester aligné sur src/lib/db.ts.
DATA_DIR="${ATLAS_DATA_DIR:-$ATLAS_HOME/data}"
DB_FILE="$DATA_DIR/atlas.db"
BACKUP_DIR="${ATLAS_BACKUP_DIR:-$ATLAS_HOME/backups}"
ICLOUD_BACKUP_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Atlas"
# Surchargeable pour que les tests vérifient la rotation sans écrire 31 fichiers.
BACKUP_KEEP="${ATLAS_BACKUP_KEEP:-30}"

PORT="${ATLAS_PORT:-3210}"
URL="http://localhost:$PORT"

MIN_NODE_MAJOR=20
NODE_FALLBACK_VERSION="v22.21.1"
UPDATE_INSTALLER_URL="https://raw.githubusercontent.com/K1Zoh/atlas-invest/main/install.sh"

SERVER_LABEL="local.atlas.server"
ALERTS_LABEL="local.atlas.alerts"
AGENTS_DIR="$HOME/Library/LaunchAgents"
SERVER_PLIST="$AGENTS_DIR/$SERVER_LABEL.plist"
ALERTS_PLIST="$AGENTS_DIR/$ALERTS_LABEL.plist"
BACKUP_LABEL="local.atlas.backup"
BACKUP_PLIST="$AGENTS_DIR/$BACKUP_LABEL.plist"
APP_BUNDLE="/Applications/Atlas.app"

NODE_BIN=""
NPM_BIN=""

# ── Affichage ────────────────────────────────────────────────────────────────

if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_GREEN=$'\033[32m'; C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_GREEN=""; C_RED=""; C_YELLOW=""
fi

step() { printf "%s→ %s%s\n" "$C_BOLD" "$1" "$C_RESET"; }
ok()   { printf "  %s✓%s %s\n" "$C_GREEN" "$C_RESET" "$1"; }
warn() { printf "  %s!%s %s\n" "$C_YELLOW" "$C_RESET" "$1"; }
info() { printf "  %s%s%s\n" "$C_DIM" "$1" "$C_RESET"; }

die() {
  printf "\n%s✗ %s%s\n" "$C_RED$C_BOLD" "$1" "$C_RESET" >&2
  shift
  for line in "$@"; do printf "  %s\n" "$line" >&2; done
  printf "\n" >&2
  exit 1
}

# ── Node : résolution et installation ────────────────────────────────────────
#
# On ne se contente jamais de « le fichier existe ». Un binaire Node compilé
# pour Intel est présent et visible sur un Mac Apple Silicon sans Rosetta, mais
# refuse de s'exécuter. On exige donc que `node -v` réussisse pour de vrai.

node_runs() { [ -x "$1" ] && "$1" -v >/dev/null 2>&1; }

node_major() { "$1" -v 2>/dev/null | sed 's/^v//; s/\..*//'; }

node_usable() {
  node_runs "$1" || return 1
  local major
  major="$(node_major "$1")"
  [ -n "$major" ] && [ "$major" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null
}

# Renseigne NODE_BIN/NPM_BIN. Retourne 1 si aucun Node utilisable.
find_node() {
  local candidate
  for candidate in \
      "${ATLAS_NODE_BIN:-}" \
      "$NODE_DIR/bin/node" \
      "$(command -v node 2>/dev/null)"; do
    [ -n "$candidate" ] || continue
    if node_usable "$candidate"; then
      NODE_BIN="$candidate"
      NPM_BIN="$(dirname "$candidate")/npm"
      [ -x "$NPM_BIN" ] || NPM_BIN="$(command -v npm 2>/dev/null)"
      PATH="$(dirname "$NODE_BIN"):$PATH"
      export PATH
      return 0
    fi
  done
  return 1
}

node_platform() {
  local os arch
  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *)      return 1 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) arch="arm64" ;;
    x86_64)        arch="x64" ;;
    *)             return 1 ;;
  esac
  printf "%s-%s" "$os" "$arch"
}

latest_lts_version() {
  # index.json est une longue ligne ; on la découpe sur '{' pour obtenir une
  # entrée par ligne. Les versions LTS portent un nom ("lts":"Jod"), les
  # autres "lts":false. La première rencontrée est la plus récente.
  curl -fsSL --max-time 20 https://nodejs.org/dist/index.json 2>/dev/null \
    | tr '{' '\n' \
    | grep '"lts":"' \
    | head -1 \
    | sed -n 's/.*"version":"\(v[0-9][0-9.]*\)".*/\1/p'
}

install_node() {
  local platform version url tmp
  platform="$(node_platform)" || die \
    "Système non reconnu : $(uname -s) $(uname -m)." \
    "Atlas gère macOS et Linux, en Intel comme en ARM."

  step "Installation de Node.js (aucun mot de passe requis)"

  version="$(latest_lts_version)"
  if [ -z "$version" ]; then
    version="$NODE_FALLBACK_VERSION"
    warn "Version LTS non récupérable en ligne, repli sur $version"
  fi

  url="https://nodejs.org/dist/$version/node-$version-$platform.tar.gz"
  tmp="$(mktemp -d)" || die "Impossible de créer un dossier temporaire."

  info "Téléchargement de Node $version ($platform)…"
  if ! curl -fL --progress-bar --max-time 300 "$url" -o "$tmp/node.tar.gz"; then
    rm -rf "$tmp"
    die "Le téléchargement de Node a échoué." \
        "Vérifie ta connexion internet, puis relance :" \
        "  $0 install"
  fi

  info "Installation dans $NODE_DIR…"
  rm -rf "$NODE_DIR"
  mkdir -p "$NODE_DIR"
  if ! tar -xzf "$tmp/node.tar.gz" -C "$NODE_DIR" --strip-components=1; then
    rm -rf "$tmp"
    die "L'archive Node est illisible. Relance : $0 install"
  fi
  rm -rf "$tmp"

  node_usable "$NODE_DIR/bin/node" || die \
    "Node vient d'être installé mais refuse de s'exécuter." \
    "Lance « $0 doctor » et envoie la sortie."

  find_node
  ok "Node $("$NODE_BIN" -v) prêt"
}

# Node utilisable, en l'installant si nécessaire.
require_node() {
  find_node && return 0

  local system_node
  system_node="$(command -v node 2>/dev/null)"
  if [ -n "$system_node" ] && ! node_runs "$system_node"; then
    warn "Le Node.js présent sur cette machine ne peut pas s'exécuter"
    info "$system_node — compilé pour une autre architecture que $(uname -m)"
    info "Atlas installe sa propre copie, sans y toucher."
  fi

  install_node
}

# ── Dépendances ──────────────────────────────────────────────────────────────
#
# better-sqlite3 est un module natif : il est compilé pour une architecture
# donnée. Changer de Node sans réinstaller donne un « invalid ELF header » ou
# un « mach-o file, but is an incompatible architecture ». On mémorise donc
# l'architecture et la version majeure ayant servi à l'installation.

deps_marker() { printf "%s/node_modules/.atlas-arch" "$APP_DIR"; }

deps_signature() { printf "%s-node%s" "$(uname -m)" "$(node_major "$NODE_BIN")"; }

deps_are_current() {
  [ -d "$APP_DIR/node_modules" ] || return 1
  [ -f "$(deps_marker)" ] || return 1
  [ "$(cat "$(deps_marker)" 2>/dev/null)" = "$(deps_signature)" ]
}

install_deps() {
  local reason="$1"
  step "Installation des dépendances ($reason)"
  info "Quelques minutes au premier lancement…"
  rm -rf "$APP_DIR/node_modules"
  ( cd "$APP_DIR" && "$NPM_BIN" install --no-audit --no-fund ) \
    || die "L'installation des dépendances a échoué." \
           "Relance : $0 install"
  deps_signature > "$(deps_marker)"
  ok "Dépendances prêtes"
}

# Une mise à jour peut ajouter ou retirer des paquets sans changer de version de
# Node. npm install est incrémental ici : il synchronise le lockfile sans jeter
# tous les modules ni recompiler inutilement les dépendances natives.
sync_deps() {
  step "Synchronisation des dépendances"
  ( cd "$APP_DIR" && "$NPM_BIN" install --no-audit --no-fund ) \
    || die "La mise à jour des dépendances a échoué." \
           "Relance : $0 update"
  deps_signature > "$(deps_marker)"
  ok "Dépendances à jour"
}

ensure_deps() {
  if deps_are_current; then
    return 0
  elif [ -d "$APP_DIR/node_modules" ]; then
    install_deps "changement de Node ou d'architecture"
  else
    install_deps "premier lancement"
  fi
}

# ── Build ────────────────────────────────────────────────────────────────────
#
# L'ancien test était « [ -d .next ] || build » : après une mise à jour, l'app
# servait indéfiniment l'ancien build. On compare désormais la date du build
# à celle des sources.

BUILD_ID="$APP_DIR/.next/BUILD_ID"

build_is_stale() {
  [ -f "$BUILD_ID" ] || return 0
  local newer
  newer="$(find "$APP_DIR/src" "$APP_DIR/package.json" "$APP_DIR/next.config.ts" \
                "$APP_DIR/tsconfig.json" "$APP_DIR/postcss.config.mjs" \
                -newer "$BUILD_ID" -print -quit 2>/dev/null)"
  [ -n "$newer" ]
}

run_build() {
  step "Construction de l'application"
  ( cd "$APP_DIR" && "$NPM_BIN" run build ) \
    || die "La construction a échoué." \
           "Le détail de l'erreur est affiché juste au-dessus."
  ok "Application construite"
}

ensure_build() {
  if build_is_stale; then
    run_build
  fi
}

# ── Serveur ──────────────────────────────────────────────────────────────────

port_pid() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1; }

# Le processus qui écoute est-il bien Atlas ? On compare son répertoire de
# travail à celui de l'app, plutôt que de deviner d'après la réponse HTTP.
pid_is_atlas() {
  local pid="$1" cwd
  [ -n "$pid" ] || return 1
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  [ "$cwd" = "$APP_DIR" ]
}

pid_command() { ps -p "$1" -o comm= 2>/dev/null | sed 's#.*/##'; }

is_running() {
  local pid
  pid="$(port_pid)"
  [ -n "$pid" ] && pid_is_atlas "$pid"
}

responds() { curl -fsS -o /dev/null --max-time 3 "$URL" 2>/dev/null; }

autostart_enabled() { [ -f "$SERVER_PLIST" ]; }

# Le port est-il squatté par autre chose qu'Atlas ? On refuse alors d'ouvrir
# le navigateur à l'aveugle sur le site d'un autre projet.
guard_port() {
  local pid
  pid="$(port_pid)"
  [ -n "$pid" ] || return 0
  pid_is_atlas "$pid" && return 0
  die "Le port $PORT est déjà utilisé par un autre programme." \
      "Processus $pid ($(pid_command "$pid"))." \
      "" \
      "Soit tu l'arrêtes, soit tu choisis un autre port pour Atlas :" \
      "  ATLAS_PORT=3211 $0 start"
}

wait_until_up() {
  local i
  for i in $(seq 1 45); do
    responds && return 0
    sleep 1
  done
  return 1
}

cmd_start() {
  require_node
  ensure_deps
  ensure_build

  if is_running; then
    ok "Atlas tourne déjà sur $URL"
    return 0
  fi

  guard_port
  mkdir -p "$LOG_DIR"

  step "Démarrage d'Atlas"
  if autostart_enabled; then
    launchctl bootstrap "gui/$(id -u)" "$SERVER_PLIST" 2>/dev/null \
      || launchctl kickstart "gui/$(id -u)/$SERVER_LABEL" 2>/dev/null
  else
    ( cd "$APP_DIR" && PORT="$PORT" nohup "$NPM_BIN" run start \
        >>"$LOG_FILE" 2>&1 & )
  fi

  if wait_until_up; then
    ok "Atlas est en ligne sur $URL"
  else
    die "Atlas n'a pas répondu dans le temps imparti." \
        "Les dernières lignes du journal :" \
        "$(tail -20 "$LOG_FILE" 2>/dev/null)" \
        "" \
        "Journal complet : $0 logs"
  fi
}

cmd_stop() {
  local pid stopped=0

  if autostart_enabled; then
    launchctl bootout "gui/$(id -u)/$SERVER_LABEL" 2>/dev/null && stopped=1
  fi

  pid="$(port_pid)"
  if [ -n "$pid" ] && pid_is_atlas "$pid"; then
    kill "$pid" 2>/dev/null && stopped=1
    local i
    for i in $(seq 1 10); do
      is_running || break
      sleep 1
    done
    pid="$(port_pid)"
    if [ -n "$pid" ] && pid_is_atlas "$pid"; then
      kill -9 "$pid" 2>/dev/null
    fi
  fi

  if [ "$stopped" -eq 1 ]; then
    ok "Atlas est arrêté"
  else
    info "Atlas ne tournait pas"
  fi
}

# Mode premier plan, utilisé par le service macOS (KeepAlive a besoin d'un
# processus qui ne rend pas la main).
cmd_serve() {
  require_node
  ensure_deps
  ensure_build
  cd "$APP_DIR" || exit 1
  export PORT
  exec "$NPM_BIN" run start
}

cmd_open() {
  cmd_start
  open "$URL" 2>/dev/null || info "Ouvre $URL dans ton navigateur."
}

# ── Statut et diagnostic ─────────────────────────────────────────────────────

cmd_status() {
  printf "\n%sAtlas%s\n\n" "$C_BOLD" "$C_RESET"

  if find_node; then
    printf "  Node.js       %s (%s)\n" "$("$NODE_BIN" -v)" "$NODE_BIN"
  else
    printf "  Node.js       %saucun utilisable%s\n" "$C_RED" "$C_RESET"
  fi

  if is_running; then
    printf "  Serveur       %sen ligne%s — %s (PID %s)\n" \
      "$C_GREEN" "$C_RESET" "$URL" "$(port_pid)"
  else
    local pid; pid="$(port_pid)"
    if [ -n "$pid" ]; then
      printf "  Serveur       %sport %s occupé par %s (PID %s)%s\n" \
        "$C_YELLOW" "$PORT" "$(pid_command "$pid")" "$pid" "$C_RESET"
    else
      printf "  Serveur       arrêté\n"
    fi
  fi

  if [ -n "$NODE_BIN" ] && deps_are_current; then
    printf "  Dépendances   à jour\n"
  elif [ -d "$APP_DIR/node_modules" ]; then
    printf "  Dépendances   %sà réinstaller%s\n" "$C_YELLOW" "$C_RESET"
  else
    printf "  Dépendances   absentes\n"
  fi

  if [ ! -f "$BUILD_ID" ]; then
    printf "  Build         absent\n"
  elif build_is_stale; then
    printf "  Build         %sobsolète — sera reconstruit au démarrage%s\n" \
      "$C_YELLOW" "$C_RESET"
  else
    printf "  Build         à jour\n"
  fi

  autostart_enabled \
    && printf "  Démarrage     automatique à l'ouverture de session\n" \
    || printf "  Démarrage     manuel\n"

  [ -f "$ALERTS_PLIST" ] \
    && printf "  Alertes       actives (toutes les 15 min)\n" \
    || printf "  Alertes       inactives\n"

  [ -d "$APP_BUNDLE" ] \
    && printf "  Icône         installée\n" \
    || printf "  Icône         absente\n"

  printf "\n  Données       %s\n" "$APP_DIR/data"
  printf "  Journal       %s\n\n" "$LOG_FILE"
}

cmd_doctor() {
  printf "\n%sDiagnostic Atlas%s\n\n" "$C_BOLD" "$C_RESET"
  printf "  Machine       %s %s\n" "$(uname -s)" "$(uname -m)"
  printf "  Dépôt         %s\n\n" "$REPO_DIR"

  local system_node
  system_node="$(command -v node 2>/dev/null)"
  if [ -n "$system_node" ]; then
    if node_runs "$system_node"; then
      local major; major="$(node_major "$system_node")"
      if [ "$major" -ge "$MIN_NODE_MAJOR" ] 2>/dev/null; then
        ok "Node du système : $("$system_node" -v) — convient"
      else
        warn "Node du système : $("$system_node" -v) — trop ancien (minimum $MIN_NODE_MAJOR)"
      fi
    else
      warn "Node du système présent mais INEXÉCUTABLE : $system_node"
      info "$(file "$system_node" 2>/dev/null | sed 's/.*: //')"
      info "Cette machine est en $(uname -m). Le binaire vise une autre architecture."
      info "Atlas installera sa propre copie : $0 install"
    fi
  else
    info "Aucun Node dans le PATH du système"
  fi

  if node_usable "$NODE_DIR/bin/node"; then
    ok "Node privé d'Atlas : $("$NODE_DIR/bin/node" -v)"
  else
    info "Pas de Node privé dans $NODE_DIR"
  fi

  printf "\n"
  if find_node; then
    ok "Node retenu : $NODE_BIN"
    local native
    native="$(find "$APP_DIR/node_modules/better-sqlite3" -name '*.node' 2>/dev/null | head -1)"
    if [ -n "$native" ]; then
      local desc; desc="$(file "$native" 2>/dev/null | sed 's/.*: //')"
      case "$desc" in
        *"$(uname -m)"*) ok "Module natif better-sqlite3 : $desc" ;;
        *) warn "Module natif compilé pour une autre architecture : $desc"
           info "Sera recompilé automatiquement au prochain démarrage." ;;
      esac
    fi
    deps_are_current && ok "Dépendances alignées sur ce Node" \
                     || warn "Dépendances à réinstaller"
  else
    warn "Aucun Node utilisable — lance : $0 install"
  fi

  printf "\n"
  local pid; pid="$(port_pid)"
  if [ -z "$pid" ]; then
    info "Port $PORT libre"
  elif pid_is_atlas "$pid"; then
    ok "Atlas écoute sur le port $PORT (PID $pid)"
  else
    warn "Port $PORT occupé par $(pid_command "$pid") (PID $pid) — pas Atlas"
  fi

  responds && ok "L'application répond sur $URL" || info "Aucune réponse sur $URL"

  printf "\n"
}

cmd_logs() {
  mkdir -p "$LOG_DIR"
  touch "$LOG_FILE"
  info "Ctrl-C pour quitter — $LOG_FILE"
  tail -n 50 -f "$LOG_FILE"
}

# ── Icône dans le Launchpad ──────────────────────────────────────────────────

make_icon() {
  local src="$APP_DIR/public/logo.png" iconset tmp
  [ -f "$src" ] || return 1
  command -v sips >/dev/null 2>&1 || return 1
  command -v iconutil >/dev/null 2>&1 || return 1

  tmp="$(mktemp -d)" || return 1
  iconset="$tmp/atlas.iconset"
  mkdir -p "$iconset"
  local size
  for size in 16 32 64 128 256 512 1024; do
    sips -z "$size" "$size" "$src" --out "$iconset/icon_${size}x${size}.png" \
      >/dev/null 2>&1
  done
  # Noms attendus par iconutil pour les variantes @2x.
  cp "$iconset/icon_32x32.png"     "$iconset/icon_16x16@2x.png"   2>/dev/null
  cp "$iconset/icon_64x64.png"     "$iconset/icon_32x32@2x.png"   2>/dev/null
  cp "$iconset/icon_256x256.png"   "$iconset/icon_128x128@2x.png" 2>/dev/null
  cp "$iconset/icon_512x512.png"   "$iconset/icon_256x256@2x.png" 2>/dev/null
  cp "$iconset/icon_1024x1024.png" "$iconset/icon_512x512@2x.png" 2>/dev/null
  rm -f "$iconset/icon_64x64.png" "$iconset/icon_1024x1024.png"

  if iconutil -c icns "$iconset" -o "$tmp/atlas.icns" >/dev/null 2>&1; then
    printf "%s" "$tmp/atlas.icns"
    return 0
  fi
  rm -rf "$tmp"
  return 1
}

create_app_bundle() {
  step "Création de l'icône Atlas"

  rm -rf "$APP_BUNDLE"
  mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources" \
    || { warn "Pas les droits d'écrire dans /Applications, icône ignorée"; return 1; }

  # Le bundle ne contient aucune logique : il appelle ce script.
  cat > "$APP_BUNDLE/Contents/MacOS/atlas" <<EOF
#!/bin/bash
exec "$REPO_DIR/atlas.sh" open
EOF
  chmod +x "$APP_BUNDLE/Contents/MacOS/atlas"

  local icns
  icns="$(make_icon)"
  if [ -n "$icns" ] && [ -f "$icns" ]; then
    cp "$icns" "$APP_BUNDLE/Contents/Resources/atlas.icns"
    rm -rf "$(dirname "$icns")"
  fi

  cat > "$APP_BUNDLE/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Atlas</string>
  <key>CFBundleDisplayName</key><string>Atlas</string>
  <key>CFBundleIdentifier</key><string>local.atlas.app</string>
  <key>CFBundleVersion</key><string>2.0</string>
  <key>CFBundleShortVersionString</key><string>2.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>atlas</string>
  <key>CFBundleIconFile</key><string>atlas</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
EOF

  touch "$APP_BUNDLE"
  ok "Icône « Atlas » disponible dans le Launchpad"
}

# ── Services macOS ───────────────────────────────────────────────────────────

write_plist() {
  local path="$1" label="$2" interval="$3"
  shift 3
  mkdir -p "$AGENTS_DIR"
  {
    printf '<?xml version="1.0" encoding="UTF-8"?>\n'
    printf '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    printf '<plist version="1.0"><dict>\n'
    printf '  <key>Label</key><string>%s</string>\n' "$label"
    printf '  <key>ProgramArguments</key><array>\n'
    local arg
    for arg in "$@"; do printf '    <string>%s</string>\n' "$arg"; done
    printf '  </array>\n'
    printf '  <key>EnvironmentVariables</key><dict>\n'
    printf '    <key>ATLAS_PORT</key><string>%s</string>\n' "$PORT"
    printf '  </dict>\n'
    printf '  <key>RunAtLoad</key><true/>\n'
    if [ "$interval" = "keepalive" ]; then
      printf '  <key>KeepAlive</key><true/>\n'
    else
      printf '  <key>StartInterval</key><integer>%s</integer>\n' "$interval"
    fi
    printf '  <key>StandardOutPath</key><string>%s</string>\n' "$LOG_FILE"
    printf '  <key>StandardErrorPath</key><string>%s</string>\n' "$LOG_FILE"
    printf '  <key>WorkingDirectory</key><string>%s</string>\n' "$APP_DIR"
    printf '</dict></plist>\n'
  } > "$path"
}

load_agent() {
  local label="$1" path="$2"
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null
  launchctl bootstrap "gui/$(id -u)" "$path" 2>/dev/null \
    || launchctl load "$path" 2>/dev/null
}

unload_agent() {
  local label="$1" path="$2"
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null \
    || launchctl unload "$path" 2>/dev/null
  rm -f "$path"
}

cmd_autostart() {
  mkdir -p "$LOG_DIR"
  case "${1:-on}" in
    on)
      step "Démarrage automatique"
      write_plist "$SERVER_PLIST" "$SERVER_LABEL" keepalive \
        /bin/bash "$REPO_DIR/atlas.sh" serve
      load_agent "$SERVER_LABEL" "$SERVER_PLIST"
      ok "Atlas démarrera tout seul à chaque ouverture de session"
      ;;
    off)
      unload_agent "$SERVER_LABEL" "$SERVER_PLIST"
      ok "Démarrage automatique désactivé"
      ;;
    *) die "Usage : $0 autostart on|off" ;;
  esac
}

cmd_alerts() {
  mkdir -p "$LOG_DIR"
  case "${1:-on}" in
    on)
      step "Alertes de prix en arrière-plan"
      write_plist "$ALERTS_PLIST" "$ALERTS_LABEL" 900 \
        /bin/bash "$APP_DIR/scripts/cron-check.sh"
      load_agent "$ALERTS_LABEL" "$ALERTS_PLIST"
      ok "Vérification toutes les 15 minutes, même app fermée"
      info "Configure les canaux dans Atlas → Paramètres → Notifications"
      info "Journal : $ALERTS_LOG"
      ;;
    off)
      unload_agent "$ALERTS_LABEL" "$ALERTS_PLIST"
      ok "Alertes en arrière-plan désactivées"
      ;;
    *) die "Usage : $0 alerts on|off" ;;
  esac
}

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
    warn "Sauvegarde impossible (base verrouillée ou illisible)"
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

cmd_restore() {
  local wanted="${1:-latest}" source resume=0

  case "$wanted" in
    latest) source="$(ls -1t "$BACKUP_DIR"/atlas-*.db 2>/dev/null | head -1)" ;;
    /*)     source="$wanted" ;;
    *)      source="$BACKUP_DIR/$wanted" ;;
  esac

  [ -n "$source" ] && [ -f "$source" ] \
    || die "Sauvegarde introuvable : $wanted" \
           "Lance « $0 backup list » pour voir les sauvegardes disponibles."

  command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 est nécessaire pour restaurer."
  [ "$(sqlite3 "$source" 'PRAGMA integrity_check;' 2>/dev/null)" = "ok" ] \
    || die "Cette sauvegarde est illisible : $source"

  step "Restauration depuis $(basename "$source")"

  # On ne relance que ce qui tournait. Mais si le démarrage automatique est
  # actif, l'agent doit repartir : le laisser déchargé le condamnerait jusqu'à
  # la prochaine ouverture de session.
  if is_running || autostart_enabled; then resume=1; fi
  if [ "$resume" -eq 1 ]; then cmd_stop; fi

  do_backup avant-restauration || warn "État courant non sauvegardé"

  mkdir -p "$DATA_DIR"
  cp "$source" "$DB_FILE"
  # Un WAL périmé se réappliquerait par-dessus la base restaurée.
  rm -f "$DB_FILE-wal" "$DB_FILE-shm"
  ok "Base restaurée"

  if [ "$resume" -eq 1 ]; then cmd_start; fi
}

# ── Installation, mise à jour, désinstallation ───────────────────────────────

cmd_install() {
  printf "\n%sInstallation d'Atlas%s\n\n" "$C_BOLD" "$C_RESET"
  mkdir -p "$LOG_DIR"

  require_node
  ensure_deps
  run_build

  [ -f "$REPO_DIR/.env" ] || [ ! -f "$REPO_DIR/.env.example" ] \
    || cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"

  create_app_bundle
  cmd_autostart on

  if wait_until_up; then
    ok "Atlas est en ligne sur $URL"
  else
    warn "Atlas met plus de temps que prévu à démarrer — voir $0 logs"
  fi

  printf "\n%sTout est prêt.%s\n\n" "$C_GREEN$C_BOLD" "$C_RESET"
  printf "  Ouvrir Atlas     l'icône %sAtlas%s dans le Launchpad, ou %s\n" \
    "$C_BOLD" "$C_RESET" "$URL"
  printf "  Depuis le code   ./atlas.sh status, ./atlas.sh update, ./atlas.sh logs\n"
  printf "  Alertes de prix  ./atlas.sh alerts on\n\n"

  open "$URL" 2>/dev/null
}

cmd_update() {
  step "Mise à jour d'Atlas"

  if [ -d "$REPO_DIR/.git" ]; then
    ( cd "$REPO_DIR" && git pull --ff-only ) \
      || die "La mise à jour a échoué." \
             "Tu as probablement des modifications locales non enregistrées." \
             "Enregistre-les (git commit) ou annule-les, puis relance."
  else
    local tmp status
    info "Installation par archive détectée, récupération du nouvel installeur…"
    tmp="$(mktemp -d)" || die "Impossible de créer un dossier temporaire."
    if ! curl -fsSL --max-time 60 "$UPDATE_INSTALLER_URL" -o "$tmp/install.sh"; then
      rm -rf "$tmp"
      die "Impossible de télécharger la mise à jour." \
          "Vérifie ta connexion internet, puis relance : $0 update"
    fi
    ATLAS_DIR="$REPO_DIR" ATLAS_INSTALL_MODE=update-local \
      /bin/bash "$tmp/install.sh"
    status=$?
    rm -rf "$tmp"
    return "$status"
  fi

  cmd_update_local
}

# Termine une mise à jour une fois les nouvelles sources récupérées. Cette
# commande interne est aussi appelée par install.sh pour les installations sans
# dépôt git, afin d'éviter une boucle de téléchargement.
cmd_update_local() {
  # Avant tout : un point de retour. C'est le passage obligé de toutes les
  # routes de mise à jour, donc le seul endroit où ce filet est garanti.
  do_backup pre-update || warn "Mise à jour poursuivie sans sauvegarde préalable"
  require_node
  sync_deps
  run_build
  cmd_restart
}

cmd_restart() {
  cmd_stop
  cmd_start
}

cmd_uninstall() {
  step "Désinstallation"
  cmd_stop
  unload_agent "$SERVER_LABEL" "$SERVER_PLIST"
  unload_agent "$ALERTS_LABEL" "$ALERTS_PLIST"
  rm -rf "$APP_BUNDLE"
  rm -rf "$NODE_DIR"
  ok "Icône, services et Node local retirés"
  info "Tes données sont intactes : $APP_DIR/data"
  info "Le code est intact : $REPO_DIR"
}

cmd_help() {
  sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

# ── Aiguillage ───────────────────────────────────────────────────────────────

[ -d "$APP_DIR" ] || die \
  "Dossier introuvable : $APP_DIR" \
  "Lance ce script depuis le dépôt Atlas."

case "${1:-open}" in
  open|"")    cmd_open ;;
  install)    cmd_install ;;
  start)      cmd_start ;;
  stop)       cmd_stop ;;
  restart)    cmd_restart ;;
  serve)      cmd_serve ;;
  status)     cmd_status ;;
  update)     cmd_update ;;
  update-local) cmd_update_local ;;
  logs)       cmd_logs ;;
  doctor)     cmd_doctor ;;
  alerts)     cmd_alerts "${2:-on}" ;;
  backup)     cmd_backup "${2:-now}" ;;
  restore)    cmd_restore "${2:-latest}" ;;
  autostart)  cmd_autostart "${2:-on}" ;;
  uninstall)  cmd_uninstall ;;
  help|-h|--help) cmd_help ;;
  *) die "Commande inconnue : $1" "Lance « $0 help » pour la liste." ;;
esac
