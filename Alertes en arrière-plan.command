#!/bin/bash
# ============================================================================
# Atlas — active (ou désactive) les alertes de prix en arrière-plan.
#
# Installe un agent macOS (launchd) qui vérifie tes alertes toutes les 15 min,
# même quand l'app est fermée, et t'envoie une notification Discord / Telegram
# / e-mail quand un seuil est franchi. Démarre le serveur Atlas si besoin.
# ============================================================================

set -u
cd "$(dirname "$0")"

LABEL="local.atlas.alerts"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT="$(pwd)/atlas/scripts/cron-check.sh"
INTERVAL=900 # 15 minutes

bold() { printf "\033[1m%s\033[0m\n" "$1"; }

if [ "${1:-}" = "off" ] || [ "${1:-}" = "--off" ]; then
  launchctl unload "$PLIST" 2>/dev/null
  rm -f "$PLIST"
  bold "🔕 Alertes en arrière-plan désactivées."
  read -r -p "Appuie sur Entrée pour fermer…" < /dev/tty
  exit 0
fi

chmod +x "$SCRIPT" 2>/dev/null
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT</string>
  </array>
  <key>StartInterval</key><integer>$INTERVAL</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/atlas-alerts.log</string>
  <key>StandardErrorPath</key><string>/tmp/atlas-alerts.log</string>
</dict></plist>
PLISTEOF

launchctl unload "$PLIST" 2>/dev/null
launchctl load "$PLIST" 2>/dev/null

bold "🔔 Alertes en arrière-plan activées."
echo "   • Vérification toutes les 15 minutes (même app fermée)."
echo "   • Configure les canaux dans Atlas → Paramètres → Notifications."
echo "   • Journal : /tmp/atlas-alerts.log"
echo "   • Pour désactiver : relance ce fichier en tapant d'abord 'off' dans le Terminal,"
echo "     ou supprime $PLIST"
read -r -p "Appuie sur Entrée pour fermer…" < /dev/tty
