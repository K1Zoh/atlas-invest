#!/bin/bash
# ============================================================================
# Atlas — installation en une commande.
#
#   curl -fsSL https://raw.githubusercontent.com/K1Zoh/atlas-invest/main/install.sh | bash
#
# Ce script ne fait que deux choses : récupérer le code, puis passer la main à
# « atlas.sh » qui contient toute la logique (Node, dépendances, build, icône,
# démarrage automatique). Aucun mot de passe n'est demandé.
#
# Relancer la même commande plus tard met à jour sans toucher aux données.
# ============================================================================

set -euo pipefail

REPO_URL="https://github.com/K1Zoh/atlas-invest.git"
REPO_TARBALL="https://github.com/K1Zoh/atlas-invest/archive/refs/heads/main.tar.gz"
INSTALL_MODE="${ATLAS_INSTALL_MODE:-install}"

ATLAS_HOME_DIR="${ATLAS_HOME:-$HOME/.atlas}"
INSTALL_REGISTRY="$ATLAS_HOME_DIR/install-path"
SERVER_PLIST_PATH="$HOME/Library/LaunchAgents/local.atlas.server.plist"

bold() { printf "\n\033[1m%s\033[0m\n\n" "$1"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
info() { printf "  \033[2m%s\033[0m\n" "$1"; }
fail() { printf "\n  \033[31m✗ %s\033[0m\n\n" "$1" >&2; exit 1; }

# Un dossier est une installation Atlas s'il porte le script et l'app.
looks_like_install() {
  [ -f "$1/atlas.sh" ] && [ -f "$1/atlas/package.json" ]
}

# Où Atlas est-il réellement installé ? Par ordre de fiabilité : l'agent qui le
# lance, puis le registre écrit à l'installation. Sans quoi, rien.
#
# Sans cette détection, un « curl | bash » lancé depuis n'importe où crée une
# seconde installation à côté de la première au lieu de la mettre à jour.
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

DETECTED=""
if [ -n "${ATLAS_DIR:-}" ]; then
  INSTALL_DIR="$ATLAS_DIR"
else
  INSTALL_DIR="$HOME/Atlas"
  DETECTED="$(detect_live_install || true)"
  if [ -n "$DETECTED" ] && [ "$DETECTED" != "$INSTALL_DIR" ]; then
    INSTALL_DIR="$DETECTED"
  fi
fi

case "$INSTALL_DIR" in
  ""|/|"$HOME"|"$HOME"/) fail "Dossier d'installation refusé : $INSTALL_DIR" ;;
esac

case "$INSTALL_MODE" in
  install|update-local) ;;
  *) fail "Mode d'installation inconnu : $INSTALL_MODE" ;;
esac

case "$(uname -s)" in
  Darwin|Linux) ;;
  *) fail "Système non géré : $(uname -s). Atlas fonctionne sur macOS et Linux." ;;
esac

if [ "$INSTALL_MODE" = "update-local" ]; then
  bold "Mise à jour d'Atlas"
else
  bold "Installation d'Atlas"
fi

if [ -n "$DETECTED" ] && [ "$DETECTED" = "$INSTALL_DIR" ]; then
  info "Installation existante détectée : $INSTALL_DIR"
fi

# ── Récupération du code ─────────────────────────────────────────────────────

install_from_archive() {
  local tmp source
  tmp="$(mktemp -d)" || fail "Impossible de créer un dossier temporaire."
  source="$tmp/source"
  mkdir -p "$source"

  info "Téléchargement de la dernière version…"
  if ! curl -fsSL "$REPO_TARBALL" -o "$tmp/atlas.tar.gz"; then
    rm -rf "$tmp"
    fail "Le téléchargement a échoué. Vérifie ton accès au dépôt GitHub."
  fi
  if ! tar -xzf "$tmp/atlas.tar.gz" -C "$source" --strip-components=1; then
    rm -rf "$tmp"
    fail "L'archive téléchargée est illisible."
  fi

  mkdir -p "$INSTALL_DIR"
  if command -v rsync >/dev/null 2>&1; then
    # Le code est remplacé, mais les données, la configuration et les artefacts
    # locaux restent intacts. .git est également conservé en cas de migration.
    rsync -ac --delete \
      --exclude '/.git/' \
      --exclude '/.env' \
      --exclude '/OLD/' \
      --exclude '/atlas/data/' \
      --exclude '/atlas/node_modules/' \
      --exclude '/atlas/.next/' \
      "$source/" "$INSTALL_DIR/" \
      || { rm -rf "$tmp"; fail "La copie de la nouvelle version a échoué."; }
  else
    # Repli sans rsync : l'overlay ne supprime pas les anciens fichiers, mais
    # évite de toucher aux données personnelles.
    ( cd "$source" && tar -cf - \
        --exclude='.git' \
        --exclude='.env' \
        --exclude='OLD' \
        --exclude='atlas/data' \
        --exclude='atlas/node_modules' \
        --exclude='atlas/.next' . ) \
      | ( cd "$INSTALL_DIR" && tar -xf - ) \
      || { rm -rf "$tmp"; fail "La copie de la nouvelle version a échoué."; }
  fi

  rm -rf "$tmp"
}

if [ -d "$INSTALL_DIR/.git" ]; then
  ok "Dépôt Atlas déjà présent dans $INSTALL_DIR"
  command -v git >/dev/null 2>&1 \
    || fail "Cette installation utilise git, mais la commande git est introuvable."
  info "Récupération de la dernière version…"
  git -C "$INSTALL_DIR" pull --ff-only \
    || fail "La mise à jour git a échoué. Vérifie la connexion et les modifications locales."
elif [ -e "$INSTALL_DIR" ]; then
  # Installation par archive ou ancien dossier Atlas : un git clone dans un
  # dossier non vide échouerait, donc on met les fichiers en place directement.
  ok "Installation existante détectée dans $INSTALL_DIR"
  install_from_archive
  ok "Code mis à jour dans $INSTALL_DIR"
elif command -v git >/dev/null 2>&1 && git --version >/dev/null 2>&1; then
  info "Téléchargement du code…"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" >/dev/null 2>&1 \
    || fail "Le téléchargement a échoué. Vérifie ton accès au dépôt GitHub."
  ok "Code téléchargé dans $INSTALL_DIR"
else
  # Pas de git : on prend l'archive, ce qui évite d'installer les outils
  # de développement Apple sur un Mac neuf.
  install_from_archive
  ok "Code téléchargé dans $INSTALL_DIR"
fi

[ -f "$INSTALL_DIR/atlas.sh" ] || fail "Installation incomplète : atlas.sh introuvable."
chmod +x "$INSTALL_DIR/atlas.sh"

# Registre : la prochaine exécution retrouvera cette installation même si
# l'agent de démarrage automatique a été désactivé entre-temps.
mkdir -p "$ATLAS_HOME_DIR"
printf '%s\n' "$INSTALL_DIR" > "$INSTALL_REGISTRY"

# ── Le reste est géré par atlas.sh ───────────────────────────────────────────

exec "$INSTALL_DIR/atlas.sh" "$INSTALL_MODE"
