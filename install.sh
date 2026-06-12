#!/bin/bash
# ============================================================================
# Atlas — installeur automatique pour macOS
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/K1Zoh/atlas-invest/main/install.sh)"
#
# Ce script :
#   1. installe Node.js s'il manque (Homebrew si présent, sinon paquet officiel — sudo demandé)
#   2. télécharge Atlas dans ~/Atlas (mise à jour sans toucher à tes données si déjà installé)
#   3. installe les dépendances et construit l'application
#   4. te propose de saisir tes clés IA (optionnel, configurable plus tard dans l'app)
#   5. crée l'application « Atlas » dans /Applications (icône dans le Launchpad/Dock)
#   6. démarre Atlas et ouvre ton navigateur
# ============================================================================

set -euo pipefail

REPO_TARBALL="https://github.com/K1Zoh/atlas-invest/archive/refs/heads/main.tar.gz"
INSTALL_DIR="$HOME/Atlas"
PORT="${PORT:-3000}"

bold()  { printf "\033[1m%s\033[0m\n" "$1"; }
ok()    { printf "  \033[32m✓\033[0m %s\n" "$1"; }
info()  { printf "  \033[36m→\033[0m %s\n" "$1"; }
fail()  { printf "  \033[31m✗ %s\033[0m\n" "$1"; exit 1; }

# Interactive answers must come from the terminal, not the curl pipe.
ask() { local answer; read -r answer < /dev/tty || answer=""; printf "%s" "$answer"; }

[ "$(uname)" = "Darwin" ] || fail "Ce script est prévu pour macOS."

bold "🟢 Installation d'Atlas"

# ── 1. Node.js ───────────────────────────────────────────────────────────────
if command -v node >/dev/null 2>&1 && [ "$(node -e 'console.log(process.versions.node.split(".")[0])')" -ge 20 ]; then
  ok "Node.js $(node --version) déjà installé"
else
  info "Node.js absent ou trop ancien, installation…"
  if command -v brew >/dev/null 2>&1; then
    brew install node
  else
    ARCH="$(uname -m)" # arm64 ou x86_64
    [ "$ARCH" = "x86_64" ] && ARCH="x64"
    NODE_VERSION="$(curl -fsSL https://nodejs.org/dist/index.json | grep -o '"version":"v22[^"]*"' | head -1 | cut -d'"' -f4)"
    [ -n "$NODE_VERSION" ] || NODE_VERSION="v22.16.0"
    PKG="/tmp/node-installer.pkg"
    info "Téléchargement de Node.js ${NODE_VERSION} (officiel nodejs.org)…"
    curl -fSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}.pkg" -o "$PKG"
    info "Installation (ton mot de passe Mac va être demandé)…"
    sudo installer -pkg "$PKG" -target / < /dev/tty
    rm -f "$PKG"
    export PATH="/usr/local/bin:$PATH"
  fi
  command -v node >/dev/null 2>&1 || fail "Node.js n'a pas pu être installé. Installe-le depuis https://nodejs.org puis relance."
  ok "Node.js $(node --version) installé"
fi

# ── 2. Téléchargement / mise à jour du code ──────────────────────────────────
info "Téléchargement d'Atlas…"
TMP="$(mktemp -d)"
curl -fsSL "$REPO_TARBALL" | tar -xz -C "$TMP"
SRC="$(find "$TMP" -maxdepth 1 -type d -name "atlas-invest-*" | head -1)"
[ -n "$SRC" ] || fail "Téléchargement impossible. Vérifie ta connexion."

mkdir -p "$INSTALL_DIR"
if [ -d "$INSTALL_DIR/atlas/data" ]; then
  info "Installation existante détectée : mise à jour (tes données sont conservées)."
fi
# rsync préserve data/ (base locale), .env (clés) et les node_modules existants.
rsync -a --delete \
  --exclude "atlas/data" \
  --exclude "atlas/node_modules" \
  --exclude "atlas/.next" \
  --exclude ".env" \
  "$SRC/" "$INSTALL_DIR/"
rm -rf "$TMP"
ok "Code installé dans $INSTALL_DIR"

# ── 3. Dépendances + build ───────────────────────────────────────────────────
cd "$INSTALL_DIR/atlas"
info "Installation des dépendances (1-2 min la première fois)…"
npm install --no-audit --no-fund --loglevel=error
info "Construction de l'application…"
npm run build >/dev/null
ok "Application construite"

# ── 4. Clés IA (optionnel) ───────────────────────────────────────────────────
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ] || ! grep -q "GOOGLE_API_KEY=." "$ENV_FILE" 2>/dev/null; then
  echo ""
  bold "🤖 Clés IA (optionnel — Entrée pour passer, configurable plus tard dans Paramètres)"
  printf "  Clé Gemini (gratuite sur https://aistudio.google.com/apikey) : "
  GEMINI_KEY="$(ask)"
  printf "  Clé Groq (gratuite sur https://console.groq.com) : "
  GROQ_KEY="$(ask)"
  {
    [ -n "$GEMINI_KEY" ] && echo "GOOGLE_API_KEY=$GEMINI_KEY"
    [ -n "$GROQ_KEY" ] && echo "GROQ_API_KEY=$GROQ_KEY"
  } >> "$ENV_FILE" 2>/dev/null || true
  [ -n "$GEMINI_KEY$GROQ_KEY" ] && ok "Clés enregistrées (en local uniquement)" || info "Aucune clé saisie, l'IA pourra être activée plus tard."
fi

# ── 5. Application macOS (icône Dock/Launchpad, sans avertissement) ─────────
APP_PARENT="/Applications"
[ -w "$APP_PARENT" ] || { APP_PARENT="$HOME/Applications"; mkdir -p "$APP_PARENT"; }
APP="$APP_PARENT/Atlas.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Atlas</string>
  <key>CFBundleDisplayName</key><string>Atlas</string>
  <key>CFBundleIdentifier</key><string>local.atlas.portfolio</string>
  <key>CFBundleVersion</key><string>3.0</string>
  <key>CFBundleExecutable</key><string>atlas</string>
  <key>CFBundleIconFile</key><string>atlas.icns</string>
  <key>LSUIElement</key><false/>
</dict></plist>
PLIST

cat > "$APP/Contents/MacOS/atlas" <<LAUNCHER
#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:\$PATH"
PORT=$PORT
if curl -s -o /dev/null --max-time 2 "http://localhost:\$PORT"; then
  open "http://localhost:\$PORT"; exit 0
fi
cd "$INSTALL_DIR/atlas" || exit 1
[ -d .next ] || npm run build >/dev/null 2>&1
nohup npm run start >/tmp/atlas.log 2>&1 &
for _ in \$(seq 1 30); do
  curl -s -o /dev/null --max-time 1 "http://localhost:\$PORT" && break
  sleep 1
done
open "http://localhost:\$PORT"
LAUNCHER
chmod +x "$APP/Contents/MacOS/atlas"

# Icône .icns générée depuis le logo
LOGO_FILE="$INSTALL_DIR/atlas/public/logo.png"
if [ -f "$LOGO_FILE" ]; then
  ICONSET="$(mktemp -d)/atlas.iconset"
  mkdir -p "$ICONSET"
  for SIZE in 16 32 64 128 256 512; do
    sips -z $SIZE $SIZE "$LOGO_FILE" --out "$ICONSET/icon_${SIZE}x${SIZE}.png" >/dev/null 2>&1
    DOUBLE=$((SIZE * 2))
    sips -z $DOUBLE $DOUBLE "$LOGO_FILE" --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" >/dev/null 2>&1
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/atlas.icns" 2>/dev/null || true
fi
ok "Application « Atlas » créée dans $APP_PARENT"

# ── 6. Lancement ─────────────────────────────────────────────────────────────
echo ""
bold "🚀 Lancement…"
open "$APP"
sleep 2
echo ""
bold "✅ Atlas est installé !"
echo "   • Ouvre-le depuis le Launchpad ou $APP_PARENT (icône Atlas)"
echo "   • Adresse : http://localhost:$PORT"
echo "   • Clés IA : dans l'app, Paramètres → Intelligence artificielle"
echo "   • Pour mettre à jour : relance simplement cette commande"
