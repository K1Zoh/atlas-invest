#!/bin/bash
# Atlas — lanceur double-clic pour macOS.
# Installe les dépendances au premier lancement, construit l'app si besoin,
# puis démarre le serveur et ouvre le navigateur.

set -e
cd "$(dirname "$0")/atlas"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js n'est pas installé sur ce Mac."
  echo "   Installe-le depuis https://nodejs.org (version LTS), puis relance ce fichier."
  open "https://nodejs.org/fr"
  read -r -p "Appuie sur Entrée pour fermer…"
  exit 1
fi

echo "🟢 Atlas — préparation…"

if [ ! -d node_modules ]; then
  echo "📦 Premier lancement : installation des dépendances (2-3 min)…"
  npm install --no-audit --no-fund
fi

if [ ! -d .next ] || [ ! -f .next/BUILD_ID ]; then
  echo "🔨 Construction de l'application…"
  npm run build
fi

PORT="${PORT:-3000}"
echo "🚀 Atlas démarre sur http://localhost:${PORT} (laisse cette fenêtre ouverte)"
( sleep 2 && open "http://localhost:${PORT}" ) &
PORT="$PORT" npm run start
