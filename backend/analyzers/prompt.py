from datetime import date
import pandas as pd


def build_analysis_prompt(
    df: pd.DataFrame,
    summary: dict,
    hhi: float,
    alerts: list[tuple[str, str]],
) -> str:
    date_str = date.today().strftime("%d %B %Y")

    cols = ["Ticker", "Nom", "Qté", "PRU", "Cours actuel", "Valeur (€)", "Perf (%)"]
    df_fmt = df[cols].copy()
    df_fmt["Cours actuel"] = df_fmt["Cours actuel"].map(lambda x: f"{x:.2f}" if pd.notna(x) else "N/A")
    df_fmt["Valeur (€)"] = df_fmt["Valeur (€)"].map(lambda x: f"{x:,.0f} €" if pd.notna(x) else "N/A")
    df_fmt["Perf (%)"] = df_fmt["Perf (%)"].map(lambda x: f"{x:+.1f}%" if pd.notna(x) else "N/A")
    portfolio_table = df_fmt.to_string(index=False)

    if hhi > 0.25:
        hhi_label = "TRÈS CONCENTRÉ"
    elif hhi > 0.15:
        hhi_label = "Modérément concentré"
    else:
        hhi_label = "Bien diversifié"

    alerts_text = "\n".join(f"  • {msg}" for _, msg in alerts) if alerts else "  • Aucune alerte active"

    values = df["Valeur (€)"].dropna()
    total = values.sum()
    if total > 0:
        weights = (values / total * 100).sort_values(ascending=False)
        top1_ticker = df.loc[weights.index[0], "Ticker"]
        top1_pct = weights.iloc[0]
        top3_pct = weights.iloc[:3].sum() if len(weights) >= 3 else weights.sum()
    else:
        top1_ticker, top1_pct, top3_pct = "N/A", 0, 0

    return f"""Tu es un gestionnaire de portefeuille professionnel et expérimenté. Tu analyses des portefeuilles réels et proposes des stratégies d'investissement long terme sérieuses. Tu es direct, sans complaisance — tu ne filtre pas les mauvaises nouvelles.

Date d'analyse : {date_str}

═══════════════════════════════════════════════════════════
MON PORTEFEUILLE RÉEL
═══════════════════════════════════════════════════════════
{portfolio_table}

Résumé :
  • Capital investi    : {summary['total_invested']:,.0f} €
  • Valeur actuelle    : {summary['total_value']:,.0f} €
  • Performance totale : {summary['total_gain']:+,.0f} € ({summary['total_gain_pct']:+.1f}%)
  • Nombre de lignes   : {len(df)}

═══════════════════════════════════════════════════════════
ANALYSE DE RISQUE & CONCENTRATION
═══════════════════════════════════════════════════════════
  • HHI (Herfindahl-Hirschman) : {hhi:.4f} — {hhi_label}
    (0.00 = diversification parfaite / 1.00 = tout sur 1 titre)
  • Top position  : {top1_ticker} ({top1_pct:.1f}%)
  • Top 3 positions : {top3_pct:.1f}% du portefeuille

Alertes actives :
{alerts_text}

═══════════════════════════════════════════════════════════
PROFIL DE L'INVESTISSEUR
═══════════════════════════════════════════════════════════
  • Horizon          : buy & hold passif, 5-10+ ans
  • Tolérance risque : modérée-élevée
  • Budget outils    : 0 € (pas d'abonnements, pas de données payantes)
  • Contexte pro     : ingénieur cybersécurité
  • Biais identifié  : forte concentration tech US / semi-conducteurs

═══════════════════════════════════════════════════════════
TES MISSIONS — RÉPONSE STRUCTURÉE OBLIGATOIRE
═══════════════════════════════════════════════════════════

### 1. BILAN CRITIQUE (5-7 phrases)
Analyse honnête et directe. Identifie les forces, les risques structurels, les biais. Contredis-moi si nécessaire.

### 2. PORTEFEUILLE VIRTUEL (10 000 € fictifs)
Tu reçois 10 000 € fictifs pour construire un portefeuille optimal aujourd'hui avec un horizon 5-10 ans.
Réponds avec le JSON strict ci-dessous entre balises ```json et ```:

```json
{{
  "virtual_portfolio": [
    {{
      "ticker": "XXX",
      "name": "Nom complet du titre",
      "amount_eur": 2500,
      "pct": 25.0,
      "rationale": "Raison du choix en 1-2 phrases"
    }}
  ],
  "benchmark": "CW8.PA",
  "conviction_level": "high",
  "key_risks": ["risque 1", "risque 2", "risque 3"],
  "expected_horizon": "5-10 ans"
}}
```

### 3. ACTIONS CONCRÈTES SUR MON VRAI PORTEFEUILLE
Propose 3 actions précises et réalistes à envisager dans les 3 prochains mois, cohérentes avec une stratégie buy & hold long terme.

---
⚠️ Rappelle en fin de réponse que cette analyse ne constitue pas un conseil financier officiel et que l'utilisateur reste seul responsable de ses décisions d'investissement."""
