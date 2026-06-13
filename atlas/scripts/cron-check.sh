#!/bin/bash
# Lancé par l'agent launchd d'Atlas. S'assure que le serveur tourne, puis
# déclenche la vérification des alertes (qui notifie Discord/Telegram/e-mail).
set -u

PORT="${ATLAS_PORT:-3000}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

is_up() { curl -s -o /dev/null --max-time 3 "http://localhost:$PORT"; }

if ! is_up; then
  cd "$APP_DIR" || exit 1
  [ -d .next ] || npm run build >/dev/null 2>&1
  PORT="$PORT" nohup npm run start >/tmp/atlas.log 2>&1 &
  for _ in $(seq 1 30); do
    is_up && break
    sleep 1
  done
fi

curl -s --max-time 90 "http://localhost:$PORT/api/cron/check" >> /tmp/atlas-alerts.log 2>&1
echo " — $(date)" >> /tmp/atlas-alerts.log
