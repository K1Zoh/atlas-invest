# Atlas — Pilote ton patrimoine

Application locale de suivi d'investissements **actions / ETF / crypto** avec copilote IA :
cours en temps réel en EUR, rééquilibrage cible, journal d'investissement, fiscalité
française, analyse double modèle (Gemini + Groq) nourrie de ton portefeuille réel.

**Tes données restent sur ta machine** (SQLite local, aucune base cloud).

> L'application vit dans le dossier [`atlas/`](atlas/) — voir son
> [README](atlas/README.md) pour le détail des fonctionnalités et de l'architecture.

## Installation

Ouvre l'app **Terminal** (Cmd+Espace, tape « Terminal »), colle cette ligne et
appuie sur Entrée :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/K1Zoh/atlas-invest/main/install.sh)"
```

C'est tout. Aucun prérequis, **aucun mot de passe demandé**. Le script télécharge
le code dans `~/Atlas`, installe sa propre copie de Node.js dans `~/.atlas/node`,
construit l'application, crée l'icône **Atlas** dans le Launchpad, active le
démarrage automatique, puis ouvre le navigateur.

Si tu as déjà cloné le dépôt, va dans le dossier et lance :

```bash
./atlas.sh install
```

## Lancer Atlas au quotidien

Atlas démarre tout seul à l'ouverture de ta session et reste disponible en
arrière-plan. Deux manières de l'ouvrir :

- **Icône** — clique **Atlas** dans le Launchpad ou le Dock. Le navigateur
  s'ouvre immédiatement.
- **Navigateur** — <http://localhost:3210>, à mettre en favori.

## Depuis le terminal

Tout passe par un seul script, `atlas.sh`, à la racine du dépôt :

| Commande | Effet |
|---|---|
| `./atlas.sh` | démarre si besoin et ouvre le navigateur |
| `./atlas.sh start` / `stop` / `restart` | contrôle du serveur |
| `./atlas.sh status` | Node, port, dépendances, build, services |
| `./atlas.sh update` | récupère la dernière version, reconstruit, redémarre |
| `./atlas.sh logs` | journal en direct |
| `./atlas.sh doctor` | diagnostic quand quelque chose cloche |
| `./atlas.sh alerts on` \| `off` | alertes de prix même app fermée |
| `./atlas.sh autostart on` \| `off` | démarrage à l'ouverture de session |
| `./atlas.sh uninstall` | retire icône, services et Node local — garde tes données |

Les scripts npm de la racine font la même chose : `npm start`, `npm stop`,
`npm run status`, `npm run update`, `npm run logs`, `npm run doctor`.

L'icône du Launchpad et les services macOS appellent ce même script — il
n'existe qu'une seule implémentation du démarrage.

### Développement

```bash
npm run dev     # serveur de développement (rechargement à chaud)
npm test        # tests vitest de la logique financière
```

Après un `npm run dev`, purge `atlas/.next` avant de repasser en mode normal :
le build de développement et celui de production ne cohabitent pas.

## Premier démarrage

L'app démarre vide et t'accompagne :

1. **Ajoute ta première position** avec le bouton `+` ou `⌘K` : tape un ticker ou un
   nom (AAPL, bitcoin, MC.PA…), saisis le **montant en €** ou la quantité, le cours
   se pré-remplit automatiquement (même pour une date passée).
2. **Ou importe un CSV** (générique, Binance, Coinbase, Kraken, Revolut) ou colle
   un relevé de courtier dans Paramètres → Données.
3. **Clés IA (optionnel, gratuit)** dans Paramètres → Intelligence artificielle :
   - Gemini : https://aistudio.google.com/apikey
   - Groq : https://console.groq.com
4. **App mobile / Dock** : Atlas est une PWA — dans Chrome/Edge « Installer Atlas »,
   sur iPhone Safari « Ajouter à l'écran d'accueil ».

## Mise à jour

```bash
./atlas.sh update
```

Récupère la dernière version, réinstalle ce qui doit l'être, reconstruit et
redémarre. Tes données ne sont jamais touchées.

Atlas détecte aussi de lui-même un build devenu obsolète : si les sources ont
changé depuis la dernière construction, le démarrage reconstruit avant de servir.
Tu ne peux plus te retrouver sur une ancienne version sans le savoir.

## Structure du dépôt

```
atlas-invest/
├── atlas.sh        # tout le cycle de vie : install, start, stop, update, doctor…
├── install.sh      # installation en une commande depuis GitHub
├── atlas/          # l'application (Next.js + SQLite)
│   ├── src/        # code (lib métier, pages, API, composants)
│   └── data/       # ta base locale (jamais versionnée)
├── docs/           # specs de conception
├── .env.example    # modèle de configuration locale
└── OLD/            # archive locale ignorée par Git, si présente sur ce Mac
```

Ce qu'Atlas écrit en dehors du dépôt :

| Chemin | Contenu |
|---|---|
| `~/.atlas/node/` | la copie de Node.js utilisée par Atlas |
| `~/.atlas/logs/` | journaux du serveur et des alertes |
| `/Applications/Atlas.app` | l'icône (une simple coquille qui appelle `atlas.sh`) |
| `~/Library/LaunchAgents/local.atlas.*` | démarrage automatique et alertes |

`./atlas.sh uninstall` retire tout cela d'un coup, sans toucher à tes données.

## En cas de souci

```bash
./atlas.sh doctor
```

Il vérifie ce que les messages d'erreur ne disent jamais : que Node est bien
exécutable **sur cette architecture** (un Node Intel sur un Mac Apple Silicon
existe mais ne démarre pas), que les modules natifs sont compilés pour la bonne
puce, que le port n'est pas occupé par un autre programme.

Le port se change au besoin : `ATLAS_PORT=3211 ./atlas.sh start`.

## Confidentialité

- Base de données, clés API et exports courtier sont **ignorés par git** : un clone
  du dépôt ne contient aucune donnée personnelle.
- Les seuls appels réseau sortants : Yahoo Finance et CoinGecko (cours), Gemini/Groq
  (si clés configurées), Discord/Telegram/SMTP (si notifications configurées).
