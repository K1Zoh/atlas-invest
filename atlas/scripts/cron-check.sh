#!/bin/bash
# Lancé toutes les 15 minutes par le service macOS « local.atlas.alerts ».
# Déclenche la vérification des alertes de prix, qui notifie Discord / Telegram
# / e-mail quand un seuil est franchi.
#
# Ce script ne démarre plus le serveur : c'est le rôle du service
# « local.atlas.server » (voir ./atlas.sh autostart on). Séparer les deux évite
# qu'une alerte relance un serveur qu'on venait d'arrêter volontairement.

set -u

PORT="${ATLAS_PORT:-3210}"
LOG="${ATLAS_HOME:-$HOME/.atlas}/logs/alerts.log"

mkdir -p "$(dirname "$LOG")"

if curl -fsS --max-time 90 "http://localhost:$PORT/api/cron/check" >> "$LOG" 2>&1; then
  printf ' — %s\n' "$(date '+%Y-%m-%d %H:%M')" >> "$LOG"
else
  printf 'Atlas injoignable sur le port %s — %s\n' \
    "$PORT" "$(date '+%Y-%m-%d %H:%M')" >> "$LOG"
fi
