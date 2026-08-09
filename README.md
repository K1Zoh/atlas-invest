# Atlas — Pilote ton patrimoine

Application locale de suivi d'investissements **actions / ETF / crypto** avec copilote IA :
cours en temps réel en EUR, rééquilibrage cible, journal d'investissement, fiscalité
française, analyse double modèle (Gemini + Groq) nourrie de ton portefeuille réel.

**Tes données restent sur ta machine** (SQLite local, aucune base cloud). Elles
vivent dans `~/.atlas/data`, **en dehors du dossier d'installation** : mettre à
jour, déplacer ou même réinstaller Atlas ne peut pas les atteindre. Une
sauvegarde est prise chaque jour et avant chaque mise à jour, restaurable en un
clic depuis l'application.

> L'application vit dans le dossier [`atlas/`](atlas/) — voir son
> [README](atlas/README.md) pour le détail des fonctionnalités et de l'architecture.

## Installation

Ouvre l'app **Terminal** (Cmd+Espace, tape « Terminal »), colle cette ligne et
appuie sur Entrée :

```bash
curl -fsSL https://raw.githubusercontent.com/K1Zoh/atlas-invest/main/install.sh | bash
```

C'est tout. Aucun prérequis, **aucun mot de passe demandé**. Le script télécharge
le code dans `~/Atlas`, installe sa propre copie de Node.js dans `~/.atlas/node`,
construit l'application, crée l'icône **Atlas** dans le Launchpad, active le
démarrage automatique et les sauvegardes quotidiennes, puis ouvre le navigateur.

Relancer la même commande plus tard met à jour l'installation existante. Le
script cherche d'abord où Atlas tourne réellement (le service de démarrage
automatique, puis un registre écrit à l'installation) et met celle-là à jour,
au lieu d'en créer une seconde à côté. Pour forcer un dossier précis :

```bash
ATLAS_DIR=/chemin/voulu bash -c "$(curl -fsSL https://raw.githubusercontent.com/K1Zoh/atlas-invest/main/install.sh)"
```

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
| `./atlas.sh backup` | sauvegarde tout de suite |
| `./atlas.sh backup list` | liste les sauvegardes disponibles |
| `./atlas.sh backup on` \| `off` | sauvegarde quotidienne automatique |
| `./atlas.sh backup icloud-on` \| `icloud-off` | copie des sauvegardes dans iCloud |
| `./atlas.sh restore` | remet la dernière sauvegarde |
| `./atlas.sh restore <fichier>` | remet une sauvegarde précise |
| `./atlas.sh uninstall` | retire icône, services et Node local — garde tes données |

Les scripts npm de la racine font la même chose : `npm start`, `npm stop`,
`npm run status`, `npm run update`, `npm run logs`, `npm run doctor`.

L'icône du Launchpad et les services macOS appellent ce même script — il
n'existe qu'une seule implémentation du démarrage.

### Développement

```bash
npm run dev     # serveur de développement (rechargement à chaud)
npm test        # tests de l'application et du cycle installation/mise à jour
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

## Où sont tes données

Tout ce qui t'appartient vit dans **`~/.atlas/`**, jamais dans le dossier
d'installation :

| Chemin | Contenu |
|---|---|
| `~/.atlas/data/atlas.db` | ta base : positions, transactions, watchlist, réglages |
| `~/.atlas/backups/` | les sauvegardes automatiques |

C'est délibéré. Le dossier d'installation ne contient que du code : le
supprimer, le déplacer ou le réinstaller ne coûte rien. Paramètres → Données
affiche l'emplacement exact et la liste des sauvegardes.

Si tu utilisais une version antérieure à août 2026, ta base était rangée dans
`atlas/data/`. Elle est déplacée automatiquement au premier démarrage, après
vérification de son intégrité — et l'ancien fichier est conservé sous
`atlas.db.migre-<date>`, jamais supprimé. Tu n'as rien à faire.

## Sauvegardes et restauration

Atlas sauvegarde **tout seul** : une fois par jour, et systématiquement avant
chaque mise à jour. Les sauvegardes vont dans `~/.atlas/backups`, plus une copie
dans ton iCloud Drive s'il est configuré sur la machine — voir
[Confidentialité](#confidentialité) pour couper cette copie.

Une sauvegarde n'est conservée que si elle passe un contrôle d'intégrité, et
une base inchangée ne crée pas de doublon — tu gardes donc 30 états réellement
différents, pas 30 copies du même jour. Un fichier corrompu ne remplace jamais
une sauvegarde saine.

**Pour revenir en arrière**, le plus simple est l'application : Paramètres →
Données → Sauvegardes automatiques. Chaque ligne indique sa date et son nombre
de transactions ; le bouton **Restaurer** remet cet état. L'état courant est
sauvegardé avant d'être remplacé, donc l'opération reste réversible.

Depuis le terminal :

```bash
~/Atlas/atlas.sh backup list   # voir les sauvegardes
~/Atlas/atlas.sh restore       # remettre la plus récente
```

Tu peux aussi télécharger un fichier de sauvegarde depuis Paramètres pour le
ranger où tu veux, et le réimporter plus tard depuis la même page.

## Mise à jour

Pour l'installation standard dans `~/Atlas` :

```bash
~/Atlas/atlas.sh update
```

Si tu travailles directement dans un clone placé ailleurs :

```bash
cd /chemin/vers/atlas-invest
./atlas.sh update
```

La commande prend d'abord une sauvegarde, puis récupère la dernière version,
synchronise les dépendances, reconstruit l'application et redémarre le serveur.
Elle fonctionne aussi pour une installation téléchargée sans git. Tes données et
tes clés locales ne sont jamais touchées — elles ne sont même pas dans le
dossier que la mise à jour manipule.

Tu peux également relancer la commande d'installation : elle détecte Atlas et
effectue la même remise à niveau sans supprimer les données.

```bash
curl -fsSL https://raw.githubusercontent.com/K1Zoh/atlas-invest/main/install.sh | bash
```

Dans un clone git qui contient des modifications locales incompatibles, la mise
à jour s'arrête avec un message au lieu d'écraser ton travail.

Atlas détecte aussi de lui-même un build devenu obsolète : si les sources ont
changé depuis la dernière construction, le démarrage reconstruit avant de servir.
Il ne sert donc jamais un build plus ancien que le code présent sur la machine.

## Structure du dépôt

```
atlas-invest/
├── atlas.sh        # tout le cycle de vie : install, start, stop, update, doctor…
├── install.sh      # installation en une commande depuis GitHub
├── atlas/          # l'application (Next.js + SQLite)
│   └── src/        # code (lib métier, pages, API, composants)
├── docs/           # specs et plans de conception
├── tests/          # cycle installation, mise à jour, sauvegarde, restauration
├── .env.example    # modèle de configuration locale
└── OLD/            # archive locale ignorée par Git, si présente sur ce Mac
```

Le dépôt ne contient **que du code**. Ce qu'Atlas écrit à côté :

| Chemin | Contenu |
|---|---|
| `~/.atlas/data/` | **ta base** |
| `~/.atlas/backups/` | **tes sauvegardes** |
| `~/.atlas/node/` | la copie de Node.js utilisée par Atlas |
| `~/.atlas/logs/` | journaux du serveur, des alertes et des sauvegardes |
| `~/.atlas/install-path` | où Atlas est installé, pour que les mises à jour retrouvent l'installation |
| `/Applications/Atlas.app` | l'icône (une simple coquille qui appelle `atlas.sh`) |
| `~/Library/LaunchAgents/local.atlas.*` | démarrage automatique, alertes, sauvegarde quotidienne |

`./atlas.sh uninstall` retire l'icône, les services et Node local d'un coup —
**sans toucher à `~/.atlas/data` ni à `~/.atlas/backups`**.

## En cas de souci

```bash
~/Atlas/atlas.sh doctor
```

Il vérifie ce que les messages d'erreur ne disent jamais : que Node est bien
exécutable **sur cette architecture** (un Node Intel sur un Mac Apple Silicon
existe mais ne démarre pas), que les modules natifs sont compilés pour la bonne
puce, que le port n'est pas occupé par un autre programme.

Depuis un clone placé ailleurs, utilise `./atlas.sh doctor`. Le port se change
au besoin : `ATLAS_PORT=3211 ~/Atlas/atlas.sh start`.

## Confidentialité

- Base de données, clés API et exports courtier vivent **hors du dépôt** et sont
  ignorés par git : un clone ne contient aucune donnée personnelle.
- **Une exception à « tout reste sur ta machine »** : si iCloud Drive est activé,
  une copie de chaque sauvegarde est déposée dans
  `~/Library/Mobile Documents/com~apple~CloudDocs/Atlas`. C'est ton propre
  iCloud, et ça te protège d'une panne de disque, mais tes positions quittent
  l'ordinateur. Pour couper, définitivement et y compris pour les sauvegardes
  automatiques :

  ```bash
  ~/Atlas/atlas.sh backup icloud-off   # icloud-on pour revenir en arrière
  ```

  Supprimer le dossier ne suffit pas : Atlas le recrée à la sauvegarde suivante.
  Les copies déjà déposées dans iCloud ne sont pas effacées — à toi de les
  retirer si tu le souhaites.
- Les seuls appels réseau sortants : Yahoo Finance et CoinGecko (cours), Gemini/Groq
  (si clés configurées), Discord/Telegram/SMTP (si notifications configurées).
