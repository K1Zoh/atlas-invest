# Lancement simplifié d'Atlas — design

Date : 2026-07-31
Statut : validé par KiZoh, en implémentation

## Problème

Atlas ne démarrait plus du tout sur le Mac de KiZoh, sans qu'aucun message ne le
signale, et cinq chemins de lancement concurrents se partageaient une logique
dupliquée.

### Cause racine

La machine est en `arm64`. Le seul Node installé est un binaire Homebrew
`x86_64` (`/usr/local/Cellar/node/25.9.0_1`), et Rosetta est absent — aucun
daemon `oahd`, `arch -x86_64 /usr/bin/true` échoue. Toute exécution de `node`
renvoie `Bad CPU type in executable`.

Le défaut de conception qui a rendu la panne invisible : les deux lanceurs
testaient Node avec `command -v node`, qui vérifie l'existence du fichier et
jamais son exécutabilité. Le script continuait, `npm` mourait, et l'erreur
partait dans `/tmp/atlas.log` que personne ne lit.

Conséquence secondaire : `atlas/node_modules/better-sqlite3/build/Release/better_sqlite3.node`
est un binaire `x86_64`, inutilisable une fois Node passé en ARM. Un simple
changement de Node ne suffit donc pas.

### Défauts structurels

| Chemin | Défaut |
|---|---|
| `Lancer Atlas.command` | fenêtre Terminal captive ; `command -v node` |
| `/Applications/Atlas.app` | chemin absolu en dur ; logique de lancement dupliquée |
| `install.sh` (165 l.) | mêle bootstrap et cycle de vie |
| `Alertes en arrière-plan.command` | l'agent d'alertes démarre le serveur en effet de bord |
| `npm run dev` racine | piège connu : dev sur un `.next` buildé → 404 |

Les deux lanceurs testaient `[ -d .next ] || build` : après un `git pull`, l'app
servait l'ancien build sans prévenir.

## Décisions

1. **Service permanent + icône.** Atlas tourne dès l'ouverture de session via
   launchd ; cliquer l'icône ouvre le navigateur, sans attente.
2. **Installable par quiconque a accès au dépôt GitHub**, Intel comme ARM.
3. **Double accès** : icône pour l'usage courant, terminal pour KiZoh qui a le code.
4. **Port 3210**, hors de la zone disputée du 3000.
5. **Node sans mot de passe** : archive officielle extraite dans `~/.atlas/node`,
   pas de `.pkg` système ni de `sudo`. Un non-technicien ne rencontre aucun
   prompt de mot de passe, et la désinstallation est un `rm -rf`.

## Architecture

```
atlas-invest/
├── atlas.sh        # unique implémentation du cycle de vie
├── install.sh      # bootstrap une-commande depuis GitHub → délègue à atlas.sh
├── atlas/          # l'application (Next.js + SQLite)
├── package.json    # npm start/stop/status → atlas.sh
└── README.md
```

Le nom `atlas.sh` est contraint : `atlas` est déjà le dossier de l'application,
deux entrées ne peuvent pas partager un nom dans un même répertoire.

`Atlas.app` et les agents launchd ne contiennent aucune logique — ils appellent
`atlas.sh`. Une seule implémentation à maintenir et à corriger.

### Interface

```
./atlas.sh              démarre si besoin puis ouvre le navigateur
./atlas.sh install      Node, dépendances, build, Atlas.app, service, alertes
./atlas.sh start|stop|restart|status
./atlas.sh update       git pull + dépendances + rebuild + restart
./atlas.sh logs         suit le journal
./atlas.sh doctor       diagnostic
./atlas.sh alerts on|off
./atlas.sh autostart on|off
./atlas.sh uninstall    retire app, agents et Node local ; ne touche pas aux données
```

### Résolution de Node

Ordre, en retenant le premier qui **s'exécute réellement** (`node -v` réussit) :

1. `$ATLAS_NODE_BIN` si défini
2. `~/.atlas/node/bin/node`
3. le `node` du PATH, à condition que sa version majeure soit ≥ 20
4. sinon : téléchargement de l'archive LTS officielle correspondant à
   `uname -m` (`darwin-arm64` ou `darwin-x64`) vers `~/.atlas/node`

La version LTS est résolue dynamiquement via `https://nodejs.org/dist/index.json`,
avec repli sur une version épinglée si le réseau ou `python3` manquent.

### Cohérence des dépendances natives

`atlas/node_modules/.atlas-arch` mémorise `<arch>-<major node>`. Toute
divergence déclenche une réinstallation complète des dépendances, ce qui
recompile `better-sqlite3` pour la bonne architecture.

### Fraîcheur du build

Remplace `[ -d .next ] || build`. Le build est obsolète si `atlas/.next/BUILD_ID`
est absent, ou si une source est plus récente que lui :

```sh
find atlas/src atlas/package.json atlas/next.config.ts atlas/tsconfig.json \
     -newer atlas/.next/BUILD_ID -print -quit
```

Sortie non vide → rebuild avant démarrage.

### Agents launchd

| Label | Rôle |
|---|---|
| `local.atlas.server` | `RunAtLoad` + `KeepAlive` : Atlas tourne dès la session, redémarre seul |
| `local.atlas.alerts` | `StartInterval` 900 s : un `curl` sur `/api/cron/check` |

L'agent d'alertes n'est plus responsable du cycle de vie du serveur.

## Gestion des erreurs

Le principe directeur est l'inverse du comportement actuel : **échouer fort, jamais en silence.**

- Node absent ou incompatible → message explicite et installation proposée,
  jamais un `npm` qui meurt dans un log.
- Port 3210 occupé par autre chose qu'Atlas → PID et nom du processus affichés,
  aucune ouverture de navigateur à l'aveugle.
- Build en échec → sortie de `next build` affichée, pas de démarrage sur un
  build périmé.
- Les erreurs partent sur stderr et dans `~/.atlas/logs/atlas.log`, que
  `./atlas.sh logs` expose en une commande.

## Vérification

Bash — pas de tests unitaires. Vérification réelle sur la machine, dans l'ordre :

1. `doctor` sur le Node cassé doit signaler l'incompatibilité
2. installation du Node ARM, `node -v` fonctionnel
3. `install` complet, `better_sqlite3.node` en `arm64`
4. `start`, page HTTP 200 sur 3210
5. `status` cohérent, `stop` effectif
6. source modifiée → `start` déclenche un rebuild
7. `alerts on` → entrée dans le journal
8. `shellcheck` si disponible

## Hors périmètre

Renommer `atlas/` en `app/` (mécanique mais touche gitignore, docs, AGENTS.md
et chemins launchd, sans rapport avec le lancement). Toute modification du code
applicatif Next.js.
