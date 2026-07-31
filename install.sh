#!/bin/bash
# ============================================================================
# Atlas — installation en une commande.
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/K1Zoh/atlas-invest/main/install.sh)"
#
# Ce script ne fait que deux choses : récupérer le code, puis passer la main à
# « atlas.sh install » qui contient toute la logique (Node, dépendances, build,
# icône, démarrage automatique). Aucun mot de passe n'est demandé.
#
# Relancer la même commande plus tard met à jour sans toucher aux données.
# ============================================================================

set -euo pipefail

REPO_URL="https://github.com/K1Zoh/atlas-invest.git"
REPO_TARBALL="https://github.com/K1Zoh/atlas-invest/archive/refs/heads/main.tar.gz"
INSTALL_DIR="${ATLAS_DIR:-$HOME/Atlas}"

bold() { printf "\n\033[1m%s\033[0m\n\n" "$1"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
info() { printf "  \033[2m%s\033[0m\n" "$1"; }
fail() { printf "\n  \033[31m✗ %s\033[0m\n\n" "$1" >&2; exit 1; }

case "$(uname -s)" in
  Darwin|Linux) ;;
  *) fail "Système non géré : $(uname -s). Atlas fonctionne sur macOS et Linux." ;;
esac

bold "Installation d'Atlas"

# ── Récupération du code ─────────────────────────────────────────────────────

if [ -d "$INSTALL_DIR/atlas" ] && [ -f "$INSTALL_DIR/atlas.sh" ]; then
  ok "Atlas déjà présent dans $INSTALL_DIR"
  if [ -d "$INSTALL_DIR/.git" ] && command -v git >/dev/null 2>&1; then
    info "Récupération de la dernière version…"
    git -C "$INSTALL_DIR" pull --ff-only >/dev/null 2>&1 \
      || info "Modifications locales conservées, code inchangé"
  fi
elif command -v git >/dev/null 2>&1 && git --version >/dev/null 2>&1; then
  info "Téléchargement du code…"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" >/dev/null 2>&1 \
    || fail "Le téléchargement a échoué. Vérifie ton accès au dépôt GitHub."
  ok "Code téléchargé dans $INSTALL_DIR"
else
  # Pas de git : on prend l'archive, ce qui évite d'installer les outils
  # de développement Apple sur un Mac neuf.
  info "Téléchargement du code…"
  TMP="$(mktemp -d)"
  curl -fsSL "$REPO_TARBALL" -o "$TMP/atlas.tar.gz" \
    || fail "Le téléchargement a échoué. Vérifie ton accès au dépôt GitHub."
  mkdir -p "$INSTALL_DIR"
  tar -xzf "$TMP/atlas.tar.gz" -C "$INSTALL_DIR" --strip-components=1
  rm -rf "$TMP"
  ok "Code téléchargé dans $INSTALL_DIR"
fi

[ -f "$INSTALL_DIR/atlas.sh" ] || fail "Installation incomplète : atlas.sh introuvable."
chmod +x "$INSTALL_DIR/atlas.sh"

# ── Le reste est géré par atlas.sh ───────────────────────────────────────────

exec "$INSTALL_DIR/atlas.sh" install
