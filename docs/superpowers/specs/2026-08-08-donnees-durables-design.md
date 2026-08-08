# Données durables et récupérables — design

Date : 2026-08-08
Statut : validé par KiZoh, en implémentation

## Problème

Le 2026-08-01, KiZoh lance la mise à jour depuis GitHub et retrouve une app
vide. Ses 83 transactions semblent perdues.

Elles ne l'étaient pas. L'installeur avait créé une **seconde installation en
parallèle**, avec sa propre base vierge, pendant que les données réelles
dormaient intactes dans le dépôt de développement.

### Cause racine

`install.sh:16` choisit son dossier par défaut :

```bash
INSTALL_DIR="${ATLAS_DIR:-$HOME/Atlas}"
```

Le `curl … | bash` ne connaît pas le dépôt de développement
`~/K1Zoh/stock-market-analyzer`. Il a donc créé `~/Atlas`, puis y a posé le
LaunchAgent `local.atlas.server` (`WorkingDirectory` = `/Users/test/Atlas/atlas`).
À partir de là, l'app servie était celle de `~/Atlas`, dont la base ne contenait
rien.

La logique de préservation du script n'est pas en cause : le
`rsync -ac --delete --exclude '/atlas/data/'` protège correctement le dossier
qu'il met à jour. Le défaut est ailleurs.

### Le défaut de conception

```
DATA_DIR = path.join(process.cwd(), "data")     // db.ts:5
```

**Les données vivent à l'intérieur du dossier d'installation.** Tout le reste en
découle :

- une mise à jour manipule le dossier qui contient la base ;
- il faut un `--exclude` défensif dans le `rsync`, donc une règle à ne jamais
  oublier ;
- deux installations ne partagent rien ;
- déplacer, renommer ou désinstaller le dossier met les données en jeu.

Détecter les installations parallèles traiterait le symptôme. Séparer les
données du code supprime la classe de bugs.

### Contrainte nouvelle

KiZoh ne sera pas le seul utilisateur. Installation, mise à jour et sauvegarde
doivent être utilisables par quelqu'un qui ne connaît pas l'informatique, sans
terminal et sans décision à prendre.

## Design

### 1. Sortir les données du dossier d'installation

```
DATA_DIR = process.env.ATLAS_DATA_DIR ?? path.join(os.homedir(), ".atlas", "data")
```

`~/.atlas/` héberge déjà Node, les journaux et les agents : les données y sont
chez elles. Le chemin reste technique **volontairement** — un dossier visible
dans `~/Documents` invite à être déplacé ou rangé.

`ATLAS_DATA_DIR` reste disponible pour les tests et les cas particuliers.

Portée du changement : `DATA_DIR` et `DB_PATH` ne sont importés par aucun autre
module (vérifié). Le rayon d'action se limite à `db.ts`.

### 2. Migration automatique

Déclenchée à l'initialisation de `getDb()`, et **pas** dans `atlas.sh` : c'est le
seul point de passage garanti, quel que soit le mode de lancement — `npm run dev`
court-circuite le script.

Ordre imposé, du plus sûr au plus destructeur :

1. si `~/.atlas/data/atlas.db` existe → ne rien faire (idempotence) ;
2. chercher `<cwd>/data/atlas.db` ; absent → ne rien faire, base neuve ;
3. ouvrir la source, `PRAGMA wal_checkpoint(TRUNCATE)` pour replier le WAL dans
   le fichier principal, fermer ;
4. `fs.copyFileSync` vers `~/.atlas/data/atlas.db.tmp` ;
5. ouvrir le temporaire, `PRAGMA integrity_check` ; échec → abandon, source
   intacte, erreur explicite dans les journaux ;
6. `fs.renameSync` du temporaire en `atlas.db` ;
7. renommer l'original en `atlas.db.migre-<horodatage>`, supprimer ses `-wal` et
   `-shm` désormais vides.

Tout est synchrone : la migration s'exécute pendant l'initialisation de
`getDb()`, avant que quiconque puisse écrire. C'est aussi la raison du
checkpoint plutôt que de l'API `backup()` de better-sqlite3, qui est asynchrone.

L'original n'est **jamais supprimé**. Un `-wal` orphelin laissé à côté d'une
base renommée se réappliquerait sur une restauration ultérieure (piège déjà
documenté dans `replaceDb`), d'où leur purge après checkpoint.

### 3. `install.sh` — détection rétrogradée

Une fois les données hors du dossier d'installation, un second dossier ne fait
plus perdre de données : il gaspille de l'espace et duplique une icône. La
détection reste donc utile, mais devient informative.

`detect_live_install()` interroge trois sources, dans l'ordre :

| Source | Ce qu'elle vaut |
|---|---|
| `WorkingDirectory` du plist `local.atlas.server` | autorité sur l'installation qui tourne |
| `~/.atlas/install-path` (registre, écrit à chaque install) | survit à la désactivation de l'autostart |
| `$HOME/Atlas` | le défaut historique |

Un candidat compte s'il contient un `atlas.sh` et un `atlas/package.json`. Le
critère ne porte plus sur la base : elle n'est plus là.

Comportement : si `ATLAS_DIR` est posé explicitement, il gagne toujours.
Sinon, une installation détectée devient la cible, annoncée en une ligne. Aucun
avertissement — sur une machine neuve, rien ne s'affiche.

### 4. Sauvegardes

**Activées à l'installation, pas en opt-in.** Un utilisateur non technique ne
lancera jamais `atlas.sh backup on`.

Mécanique : `sqlite3 "$DB" ".backup"` en shell pur. Fonctionne serveur éteint,
sûr avec le WAL, sans dépendance à l'app — contrairement à `/api/backup`.
`sqlite3` est livré avec macOS.

Déclencheurs :

- **avant chaque mise à jour**, en tête de `cmd_update_local`, point de passage
  obligé de toutes les routes de mise à jour ;
- **quotidien**, agent `local.atlas.backup`, `StartInterval 86400` ;
- **à la demande**, `./atlas.sh backup`.

Destination `~/.atlas/backups/`, plus une copie dans
`~/Library/Mobile Documents/com~apple~CloudDocs/Atlas/` si iCloud Drive est
présent. Absent → ignoré en silence, jamais d'erreur.

Ordre des opérations dans `do_backup`, où se cachent les vrais pièges :

1. `.backup` vers un fichier temporaire ;
2. `integrity_check` → si KO, abandon **sans rien purger** ;
3. empreinte comparée à la dernière sauvegarde → identique, temporaire jeté
   (30 états distincts valent mieux que 30 copies du même jour) ;
4. mise en place, copie iCloud, **puis seulement** rotation au-delà de 30.

Un backup corrompu ne doit jamais chasser un backup sain.

### 5. Restauration depuis l'app

C'est ce qui décide de l'utilisabilité pour un non-technicien. Le terminal n'est
pas une option pour eux.

- `GET /api/backup/list` → date, taille, nombre de transactions par fichier ;
- `POST /api/backup/restore` étendu pour accepter `{ file }`, un nom de fichier
  du dossier de sauvegardes, en plus des octets téléversés existants ;
- section Paramètres : liste « 8 août · 83 transactions » + bouton Restaurer
  avec confirmation.

La restauration sauvegarde l'état courant avant d'écraser, réutilise `replaceDb`
(qui gère déjà la fermeture de connexion et la purge des `-wal`/`-shm`).

`./atlas.sh restore latest|<fichier>` reste, pour l'usage en ligne de commande.

Paramètres affiche aussi l'emplacement des données et la date de la dernière
sauvegarde. Rassurant, et ça coupe court aux « où est ma base ? ».

## Hors périmètre

- chiffrement des sauvegardes ;
- purge par âge — 30 états distincts suffisent ;
- multi-utilisateur sur une même machine : chaque compte macOS a son `~/.atlas`,
  comportement attendu ;
- synchronisation entre machines : iCloud sert d'archive, pas de réplication.

## Tests

`tests/install-update.test.sh` fournit déjà un harnais hermétique (dossiers
temporaires, faux `curl`/`node`/`npm`). Il est étendu, pas remplacé.

| Cas | Vérifie |
|---|---|
| migration depuis une install existante | base déplacée, intégrité vérifiée, original conservé |
| migration idempotente | second appel sans effet |
| migration avec base source corrompue | abandon, source intacte |
| `detect_live_install` via plist | adopte le dossier de l'agent |
| `ATLAS_DIR` explicite | gagne toujours sur la détection |
| machine neuve | aucune détection, aucune sortie parasite |
| `do_backup` | fichier créé, intégrité ok |
| `do_backup` deux fois sans changement | pas de doublon |
| rotation | plafond à 30, ne purge pas après un échec d'intégrité |
| `restore` | données remplacées, `-wal`/`-shm` absents ensuite |

Migration validée sur une copie de la base réelle (83 transactions) avant
livraison.

## Risque principal

La migration déplace une base vivante. C'est le seul geste destructeur du lot.
Mitigé par l'ordre copie → vérification → bascule, et par la conservation de
l'original sous un nom horodaté.

Le dossier `~/.atlas` devient le point unique de défaillance : le perdre, c'est
tout perdre. D'où les sauvegardes activées d'office et la copie iCloud.
