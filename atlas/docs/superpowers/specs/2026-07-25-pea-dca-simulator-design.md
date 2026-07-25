# Spec — Simulateur DCA + Liberté financière (PEA)

Date : 2026-07-25 · App : Atlas (`atlas/`) · Statut : validé (design), à implémenter

## 1. Contexte & objectif

Ajouter à la page PEA (`atlas/src/app/pea/page.tsx`) un **simulateur de versements
programmés (DCA)** qui projette la valeur d'un portefeuille d'ETF dans le temps.

Le *pourquoi* est explicite (référence : *Libre à 40 ans en Suisse*, Marc Pittet) :
**prise de conscience** et **visualisation de la liberté financière à long terme**
pour **motiver à continuer d'investir**. L'outil ne répond donc pas seulement à
« combien j'aurai », mais à « quand est-ce que ça me rend libre ».

Ce n'est pas un outil de précision : il donne un **ordre de grandeur** honnête à
partir d'hypothèses que l'utilisateur choisit. **Ce n'est pas un conseil en
investissement** — c'est un calculateur piloté par les hypothèses de l'utilisateur.

## 2. Périmètre

### Inclus (v1)
- Saisie libre de lignes ETF : nom, versement mensuel (€), rendement attendu (%/an) éditable.
- Capital de départ optionnel (pré-rempli avec la valeur réelle du PEA, modifiable, `0` possible).
- Presets rapides d'ETF PEA courants + « Depuis mon PEA » (pré-remplissage depuis les positions réelles).
- Trois scénarios : pessimiste / attendu / optimiste (fourchette).
- Graphe de projection : bande pess.→optim., courbe attendue, courbe « total versé ».
- Tableau des horizons : 3 mois, 1, 5, 10, 20, 40 ans.
- Bloc « Tester un ETF » : un ETF candidat inclus/exclu, avec son **impact marginal** chiffré.
- Couche « liberté financière » : objectif en **revenu passif mensuel**, converti en
  capital-cible via la **règle des 4 %** (ajustable), **date de liberté** estimée, et
  **revenu passif** estimé par horizon.
- Persistance de la configuration via le `/api/settings` existant (clé `pea.sim`).

### Hors périmètre (à noter comme évolutions possibles)
- Simulation de Monte-Carlo / percentiles statistiques (la fourchette déterministe suffit).
- Rendements réels (nets d'inflation) — v1 en **nominal** ; toggle « pouvoir d'achat » plus tard.
- Fiscalité à la sortie / drawdown fiscalisé.
- Deltas de scénario éditables, scénarios multiples sauvegardés, comparaison A/B complète.
- Récupération automatique de rendements historiques réels pour suggérer les défauts.

## 3. Architecture & fichiers

| Fichier | Rôle |
|---|---|
| `atlas/src/lib/projection.ts` | **Calcul pur** : `projectDca(config) → ProjectionResult`. Aucune I/O. Testable. |
| `atlas/src/lib/projection.test.ts` | Tests unitaires du calcul (runner à confirmer/ajouter — cf. §8). |
| `atlas/src/components/charts.tsx` | Nouveau `ProjectionChart` (bande + courbes + ligne objectif). |
| `atlas/src/components/pea-projection.tsx` | La section (saisie + résultats). Importée par la page PEA. |
| `atlas/src/app/pea/page.tsx` | Rendu de `<PeaProjection />` sous le contenu existant. |
| `atlas/src/lib/i18n.tsx` | Clés `pea.sim.*` (FR + EN). |

Persistance : réutilise `/api/settings` (`GET`/`POST` déjà utilisés par la page PEA),
clé `pea.sim`. **Pas de nouvelle route API.** Le calcul est 100 % côté client
(instantané, aucune dépendance aux données de marché — la projection part des
versements en €, pas d'un cours).

## 4. Modèle de données (config persistée `pea.sim`)

```ts
interface SimLine {
  id: string;
  ticker: string;        // identifiant/étiquette (ex. "WPEA"), pas requis pour le calcul
  name: string;
  monthly: number;       // € / mois, ≥ 0
  annualReturnPct: number; // rendement attendu, ex. 7
}

interface SimConfig {
  startCapital: number;              // P0, ≥ 0
  lines: SimLine[];                  // allocation de base
  candidate: (SimLine & { included: boolean }) | null; // « Tester un ETF »
  targetMonthlyIncome: number | null; // rente visée €/mois (objectif liberté)
  withdrawalRatePct: number;         // règle des 4 % → défaut 4
  currentAge: number | null;         // optionnel, pour « à tes X ans »
}
```

## 5. Le calcul (`projection.ts`)

Horizons (mois) : `[3, 12, 60, 120, 240, 480]`. Le graphe échantillonne **par année**
(points 0..40) ; le tableau utilise les valeurs **exactes** aux mois d'horizon.

### 5.1 Valeur future d'une ligne
Pour un rendement annuel `a` (décimal), taux mensuel `r = (1 + a)^(1/12) − 1`.
Pour `n` mois, versement mensuel `C` (fin de mois, rente ordinaire), capital initial de ligne `p` :

```
valeur(n) = p·(1 + r)^n + C · ((1 + r)^n − 1) / r
```

Cas limite `r = 0` : `valeur(n) = p + C·n` (éviter la division par zéro).

### 5.2 Capital de départ (P0)
`P0` est réparti entre les **lignes de base** au prorata du versement mensuel :
`p_i = P0 · monthly_i / Σ monthly`. Si `Σ monthly = 0` mais `P0 > 0`, répartition
égale entre les lignes de base. **L'ETF candidat ne reçoit pas de P0** (c'est une
position nouvelle qu'on teste).

### 5.3 Scénarios
Trois trajectoires, en décalant le rendement de **chaque** ligne :
- pessimiste : `a − 3 pts`
- attendu : `a`
- optimiste : `a + 2 pts`

(Deltas fixes en v1, appliqués en points de %.) La **fourchette** = [pessimiste, optimiste],
l'accroche et la date de liberté utilisent l'**attendu**.

### 5.4 Totaux, versé, plus-value, impact marginal
- `valeurTotale(n, s)` = Σ lignes de base + (candidat si `included`).
- `valeurSansCandidat(n, s)` = Σ lignes de base seules.
- **Impact marginal du candidat** = `valeurTotale − valeurSansCandidat` (valeur et plus-value).
- `versé(n)` = `P0 + (Σ monthly incluant le candidat si inclus) · n`.
- `plusValue(n, s)` = `valeurTotale(n, s) − versé(n)`.

### 5.5 Liberté financière
- `capitalCible` = `targetMonthlyIncome · 12 / (withdrawalRatePct / 100)` (rente → capital ; 4 % ⇒ ×300).
- `revenuPassif(valeur)` = `valeur · (withdrawalRatePct / 100) / 12` (capital → €/mois).
- **Date de liberté** = plus petit mois `n` où `valeurTotale(n, attendu) ≥ capitalCible`.
  Recherche jusqu'à un plafond (720 mois / 60 ans) ; au-delà → « au-delà de l'horizon ».
  Rendu : année civile (`aujourd'hui + n mois`) et, si `currentAge` fourni, l'âge = `currentAge + ⌊n/12⌋`.
- Revenu passif estimé par horizon = `revenuPassif(valeurTotale(horizon, attendu))`.

### 5.6 Sortie
```ts
interface ProjectionResult {
  yearly: { year: number; invested: number; expected: number; low: number; high: number; target: number | null }[];
  horizons: { months: number; invested: number; expected: number; low: number; high: number; passiveIncome: number }[];
  freedom: { reached: boolean; months: number | null; year: number | null; age: number | null; capitalTarget: number | null } | null;
  candidateImpact: { valueDelta: number; gainDelta: number; extraInvested: number } | null; // à un horizon de référence (20 ans)
}
```

## 6. Hypothèses par défaut (éditables, ordre de grandeur historique nominal)

| ETF (preset) | Rendement défaut %/an |
|---|---|
| MSCI World | 7 |
| S&P 500 | 8 |
| MSCI Emerging Markets | 7 |
| MSCI Europe / Stoxx 600 | 6 |
| Nasdaq 100 | 10 |
| autre / inconnu | 7 |

- Deltas de scénario : pessimiste **−3 pts**, optimiste **+2 pts**.
- Taux de retrait : **4 %** (éditable).
- Seed initial (aucune config sauvegardée) : si des positions PEA existent, mettre en
  avant « Depuis mon PEA » ; sinon deux lignes d'exemple (World 70 € / Émergents 30 €,
  rendements par défaut) pour que l'écran soit immédiatement parlant.

## 7. UX / composants (`pea-projection.tsx`)

Section sous le contenu PEA existant, mêmes composants et conventions qu'Atlas
(`Card`/`CardHeader`, `Button`, `Input`, `Field`, `Badge`, `Segmented`, `fmtEur`,
`fmtPct`, classes `tnum`/`fade-up`, tokens `--accent`/`--muted`/`--surface-2`…).

1. **Saisie** — capital de départ (pré-rempli valeur PEA) ; lignes ETF (nom · €/mois ·
   %/an · supprimer) ; chips presets + « Depuis mon PEA » + « Autre… » (recherche via
   l'infra tickers existante) ; budget mensuel total dérivé (somme des lignes).
2. **Tester un ETF** — bloc distinct, un ETF candidat + switch « Inclure ».
3. **Objectif liberté** — champ « revenu passif visé (€/mois) » ; taux de retrait (défaut 4 %) ;
   âge actuel (optionnel). Affiche le capital-cible correspondant.
4. **Résultats** — accroche (« Dans 20 ans : ≈ X € dont ≈ Y € de plus-value ») ;
   `ProjectionChart` (bande + attendu + versé + ligne objectif & repère date de liberté) ;
   **carte liberté** (date de liberté / âge, revenu passif estimé) ; **tableau horizons**
   (Horizon · Versé · Valeur estimée *(fourchette en sous-ligne)* · Plus-value · Rente/mois 4 %) ;
   **encart impact** du candidat (neutre : « écart lié à l'hypothèse que tu saisis ») ;
   **avertissement**.

Persistance : charger `pea.sim` au montage ; autosave *debounced* (~600 ms) sur changement
vers `/api/settings`.

Responsive : suivre le pattern mobile d'Atlas (tableau → vue empilée ou scroll horizontal
contrôlé sous `lg`).

## 8. Tests

`projection.ts` est pur → tests unitaires prioritaires :
- FV d'une rente sur valeurs connues ; cas `r = 0` ; croissance de `P0` seul.
- Répartition de `P0` par poids de versement ; candidat sans `P0`.
- Impact marginal = avec − sans candidat.
- `capitalCible` depuis la rente ; `revenuPassif` depuis le capital ; réciprocité à 4 %.
- Détection de la date de liberté (franchissement monotone) ; « non atteint » au plafond.
- Cohérence des horizons (valeur ≥ versé quand rendement ≥ 0 ; monotonie temporelle).

Runner : confirmer la présence d'un runner de test dans `atlas/` (`package.json`).
S'il n'y en a pas, ajouter le strict nécessaire (ex. `node --test` ou `vitest`) sans
remanier la config du projet.

## 9. Garde-fous (cadrage « pas un conseil »)

- Avertissement visible : *« Estimations à titre indicatif, basées sur des hypothèses de
  rendement que tu choisis. Les performances passées ne préjugent pas des performances
  futures. Ceci n'est pas un conseil en investissement. »*
- L'outil **ne classe jamais** les ETF de lui-même : c'est l'utilisateur qui saisit les
  hypothèses. L'encart d'impact rappelle explicitement que l'écart **reflète l'hypothèse saisie**.
- Règle des 4 % présentée comme **repère ajustable**, pas comme une vérité.
- Aucun vocabulaire de recommandation (« meilleur », « conseillé », « tu devrais »).

## 10. Risques & hypothèses

- Les rendements par défaut sont des **hypothèses** (ordre de grandeur), pas des prévisions.
- La **date de liberté** est très sensible aux hypothèses → toujours accompagnée de la
  fourchette pour transmettre l'incertitude.
- Projection **nominale** : le pouvoir d'achat réel sera plus faible (évolution : toggle inflation).
- Répartition de `P0` par poids de versement = hypothèse simplificatrice (le PEA réel
  reflète en général l'allocation cible).
- Versements en fin de mois (rente ordinaire) → légèrement conservateur.

## 11. Étapes (macro)

1. `projection.ts` + tests (cœur sécurisé d'abord).
2. `ProjectionChart` dans `charts.tsx`.
3. `pea-projection.tsx` (saisie → résultats) + i18n.
4. Câblage dans `page.tsx` + persistance `pea.sim`.
5. Vérification navigateur (preview) + passe responsive.
