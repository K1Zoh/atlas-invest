# Atlas — Pilote ton patrimoine

Application locale de suivi d'investissements **actions / ETF / crypto** avec copilote IA :
cours en temps réel en EUR, rééquilibrage cible, journal d'investissement, fiscalité
française, analyse double modèle (Gemini + Groq) nourrie de ton portefeuille réel.

**Tes données restent sur ta machine** (SQLite local, aucune base cloud).

> L'application vit dans le dossier [`atlas/`](atlas/) — voir son
> [README](atlas/README.md) pour le détail des fonctionnalités et de l'architecture.

## Installation sur un nouveau Mac

### Méthode 1 — une seule commande (recommandée)

Ouvre l'app **Terminal** (Cmd+Espace, tape « Terminal »), colle cette ligne et
appuie sur Entrée :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/K1Zoh/stock-market-analyzer/main/install.sh)"
```

Le script s'occupe de tout : Node.js si absent (mot de passe Mac demandé),
téléchargement, construction, saisie optionnelle des clés IA, et création d'une
**application « Atlas » dans le Launchpad** (sans avertissement de sécurité,
l'app étant créée localement). À la fin, le navigateur s'ouvre tout seul.
Relancer la même commande plus tard met à jour sans toucher aux données.

> Prérequis : rien. Le script installe Node.js lui-même si besoin.

### Méthode 2 — terminal

```bash
git clone https://github.com/K1Zoh/stock-market-analyzer.git
cd stock-market-analyzer
npm install --prefix atlas
npm run dev          # mode développement, http://localhost:3000
# ou pour un usage quotidien :
npm run build && npm run start
```

## Premier démarrage

L'app démarre vide et t'accompagne :

1. **Ajoute ta première position** avec le bouton `+` ou `⌘K` : tape un ticker ou un
   nom (AAPL, bitcoin, MC.PA…), saisis le **montant en €** ou la quantité, le cours
   se pré-remplit automatiquement (même pour une date passée).
2. **Ou importe un CSV** (générique, Binance, Coinbase) dans Paramètres → Données.
3. **Clés IA (optionnel, gratuit)** dans Paramètres → Intelligence artificielle :
   - Gemini : https://aistudio.google.com/apikey
   - Groq : https://console.groq.com
4. **App mobile / Dock** : Atlas est une PWA — dans Chrome/Edge « Installer Atlas »,
   sur iPhone Safari « Ajouter à l'écran d'accueil ».

Si tu viens de l'ancienne app Streamlit : Paramètres → Données → **Migrer mes données**
récupère transactions, watchlist et réglages en un clic si l'ancienne base locale est
encore présente dans `data/` ou dans l'archive locale `OLD/data/`.

## Mise à jour

```bash
git pull
cd atlas && npm install && npm run build
```

## Structure du dépôt

```
stock-market-analyzer/
├── Lancer Atlas.command   # lanceur macOS double-clic
├── install.sh             # installeur macOS en une commande
├── atlas/                 # l'application (Next.js + SQLite)
│   ├── src/               # code (lib métier, pages, API, composants)
│   └── data/              # ta base locale (jamais versionnée)
├── .env.example           # modèle de configuration locale
└── OLD/                   # archive locale ignorée par Git, si présente sur ce Mac
```

## Confidentialité

- Base de données, clés API et exports courtier sont **ignorés par git** : un clone
  du dépôt ne contient aucune donnée personnelle.
- Les seuls appels réseau sortants : Yahoo Finance et CoinGecko (cours), Gemini/Groq
  (si clés configurées), Discord/Telegram/SMTP (si notifications configurées).
