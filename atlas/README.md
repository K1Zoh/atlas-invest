# Atlas — Pilote ton patrimoine

Refonte complète de STOCK_TERMINAL v2.0 (Streamlit) en application web moderne.
Suivi unifié actions / ETF / crypto, copilote IA nourri de ton portefeuille réel,
fiscalité française, le tout **en local** : tes données ne quittent pas ta machine.

## Lancement

```bash
cd atlas
npm install        # première fois uniquement
npm run dev        # http://localhost:3000
```

Pour un usage quotidien plus rapide :

```bash
npm run build      # une fois
npm start          # serveur de production
```

Depuis la racine du dépôt, les raccourcis équivalents sont :

```bash
npm install --prefix atlas
npm run dev
npm run build
npm run start
```

## Premier démarrage

1. Ouvre l'app → **Paramètres → Données → Migrer mes données** : récupère en un clic
   les transactions, la watchlist, les dividendes et la config de l'ancienne app
   (`../data/portfolio.db` ou `../OLD/data/portfolio.db`). Relançable sans doublons.
2. Les clés API du `.env` de l'ancienne app (racine du repo) sont lues automatiquement.
   Tu peux aussi les saisir dans **Paramètres → Intelligence artificielle** :
   - Gemini (gratuit) : https://aistudio.google.com/apikey
   - Groq (gratuit) : https://console.groq.com
3. `⌘K` (ou le bouton **+**) ouvre l'ajout rapide : tape un ticker ou un nom,
   le cours actuel se pré-remplit, la transaction s'enregistre en ~10 secondes.

## Fonctionnalités

| Page | Contenu |
|---|---|
| **Tableau de bord** | Patrimoine total animé, P/L latent + réalisé, variation du jour, courbe d'évolution vs investi, allocation (classe / catégorie / actif), top movers, alertes de concentration (HHI) |
| **Portefeuille** | Table unifiée actions + crypto : PRU, cours EUR, sparkline 7j, P/L, poids, tri par colonne |
| **Fiche actif** | Graphique avec MM20/MM50 + RSI, ma position, mes transactions, analyse IA de l'actif, création d'alerte |
| **Transactions** | Historique complet, édition/suppression, achat **et** vente |
| **Watchlist** | Prix cible, écart à la cible, note, passage à l'achat en un clic + alertes de prix (6 types) |
| **Copilote IA** | Analyse double modèle (Gemini + Groq) du portefeuille réel, chat streaming contextuel, **scoreboard de fiabilité** (« l'IA avait-elle raison ? »), historique |
| **Fiscal** | PV réalisées actions (méthode PRU) + crypto (formule 2086), PFU 30 % estimé, par année |
| **Paramètres** | Clés API, notifications (Discord / Telegram / e-mail SMTP testables), import CSV (générique, Binance, Coinbase), migration legacy, langue FR/EN, thème sombre/clair |

## Architecture

```
atlas/
├── src/lib/            # logique métier (TypeScript pur, testable)
│   ├── db.ts           # SQLite (better-sqlite3), schéma + WAL
│   ├── repo.ts         # CRUD + agrégation des positions (PRU)
│   ├── analytics.ts    # résumé, HHI, allocations, timeline
│   ├── tax.ts          # fiscalité FR (port de backend/tax.py)
│   ├── market/         # Yahoo Finance + CoinGecko + FX, cache SQLite,
│   │                   #   throttling CoinGecko, fallback Yahoo crypto
│   ├── ai/             # Gemini + Groq en REST direct, prompts, parsing recos
│   ├── importers.ts    # CSV générique / Binance / Coinbase
│   ├── legacy.ts       # migration depuis l'ancienne app
│   └── notify.ts       # Discord, Telegram, SMTP
├── src/app/api/        # 19 routes API (validation aux frontières)
├── src/app/            # 8 pages (App Router)
└── src/components/     # shell, quick-add ⌘K, charts, UI kit
```

Décisions clés :

- **Données locales** : SQLite dans `atlas/data/atlas.db` (gitignored). Aucun cloud.
- **Cours en EUR** partout : conversion FX automatique (USD, GBp/pence…).
- **Cache serveur** : cours 5 min, historiques 30 min — les APIs gratuites tiennent.
- **Fournisseurs isolés** derrière `src/lib/market/` : remplaçables sans toucher l'UI.
- **L'IA ne donne jamais d'ordre** : pistes argumentées + conviction 1-5, et chaque
  recommandation passée est confrontée à l'évolution réelle du cours (scoreboard).

## Dépannage

- **429 Gemini** : quota gratuit épuisé sur `gemini-2.5-pro` → passe sur
  `gemini-2.5-flash` dans Paramètres (plus de quota, plus rapide).
- **Cours manquant sur un ETF européen** : ajoute le suffixe de place dans le ticker
  (ex. `EXSA.DE`) ou complète `BROKER_TO_YF` dans `src/lib/market/yahoo.ts`.
- **Timeline lente au premier affichage** : normal (30 historiques à froid, CoinGecko
  throttlé) — le cache rend les chargements suivants quasi instantanés.
