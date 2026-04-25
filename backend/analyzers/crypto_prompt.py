from datetime import date
import pandas as pd


def build_crypto_analysis_prompt(
    df: pd.DataFrame,
    summary: dict,
    hhi: float,
    alerts: list[tuple[str, str]],
) -> str:
    date_str = date.today().strftime("%d %B %Y")

    cols = ["Ticker", "Nom", "Qté", "PRU", "Cours actuel", "Valeur (€)", "Perf (%)"]
    df_fmt = df[[c for c in cols if c in df.columns]].copy()
    if "Cours actuel" in df_fmt.columns:
        df_fmt["Cours actuel"] = df_fmt["Cours actuel"].map(
            lambda x: f"{x:,.4f}" if pd.notna(x) else "N/A"
        )
    if "Valeur (€)" in df_fmt.columns:
        df_fmt["Valeur (€)"] = df_fmt["Valeur (€)"].map(
            lambda x: f"{x:,.0f} €" if pd.notna(x) else "N/A"
        )
    if "Perf (%)" in df_fmt.columns:
        df_fmt["Perf (%)"] = df_fmt["Perf (%)"].map(
            lambda x: f"{x:+.1f}%" if pd.notna(x) else "N/A"
        )
    portfolio_table = df_fmt.to_string(index=False)

    if hhi > 0.50:
        hhi_label = "TRÈS CONCENTRÉ"
    elif hhi > 0.30:
        hhi_label = "Concentré"
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

    return f"""Tu es un gestionnaire de portefeuille crypto professionnel et expérimenté. Tu analyses des portefeuilles réels et proposes des stratégies d'investissement long terme sérieuses. Tu es direct, sans complaisance — tu ne filtres pas les mauvaises nouvelles.

Date d'analyse : {date_str}

═══════════════════════════════════════════════════════════
MON PORTEFEUILLE CRYPTO RÉEL
═══════════════════════════════════════════════════════════
{portfolio_table}

Résumé :
  • Capital investi    : {summary['total_invested']:,.0f} €
  • Valeur actuelle    : {summary['total_value']:,.0f} €
  • Performance totale : {summary['total_gain']:+,.0f} € ({summary['total_gain_pct']:+.1f}%)
  • Nombre de positions: {len(df)}

═══════════════════════════════════════════════════════════
ANALYSE DE RISQUE & CONCENTRATION
═══════════════════════════════════════════════════════════
  • HHI (Herfindahl-Hirschman) : {hhi:.4f} — {hhi_label}
    (0.00 = diversification parfaite / 1.00 = tout sur 1 crypto)
  • Top position    : {top1_ticker} ({top1_pct:.1f}%)
  • Top 3 positions : {top3_pct:.1f}% du portefeuille

Alertes actives :
{alerts_text}

═══════════════════════════════════════════════════════════
PROFIL DE L'INVESTISSEUR
═══════════════════════════════════════════════════════════
  • Horizon          : long terme, 3-5+ ans minimum
  • Tolérance risque : élevée (crypto = haute volatilité acceptée)
  • Stratégie        : buy & hold + DCA opportuniste
  • Budget outils    : 0 € (pas d'abonnements)
  • Contexte pro     : ingénieur cybersécurité
  • Biais identifié  : profil tech, sensible à l'infra blockchain

═══════════════════════════════════════════════════════════
TES MISSIONS — RÉPONSE STRUCTURÉE OBLIGATOIRE
═══════════════════════════════════════════════════════════

### 1. BILAN CRITIQUE (5-7 phrases)
Analyse honnête et directe du portefeuille crypto. Identifie les forces, les risques structurels (custody, liquidité, corrélation BTC, régulation), les biais. Contextualise par rapport au cycle de marché actuel (bull/bear/accumulation). Contredis-moi si nécessaire.

### 2. PORTEFEUILLE VIRTUEL CRYPTO (10 000 € fictifs)
Tu reçois 10 000 € fictifs pour construire un portefeuille crypto optimal aujourd'hui avec un horizon 3-5 ans.
Réponds avec le JSON strict ci-dessous entre balises ```json et ```:

```json
{{
  "virtual_portfolio": [
    {{
      "ticker": "BTC",
      "name": "Bitcoin",
      "amount_eur": 5000,
      "pct": 50.0,
      "rationale": "Raison du choix en 1-2 phrases"
    }}
  ],
  "benchmark": "BTC",
  "conviction_level": "high",
  "key_risks": ["régulation", "corrélation BTC", "liquidité"],
  "expected_horizon": "3-5 ans"
}}
```

### 3. ACTIONS CONCRÈTES SUR MON VRAI PORTEFEUILLE CRYPTO
Propose 3 actions précises et réalistes à envisager dans les 3 prochains mois, cohérentes avec une stratégie buy & hold long terme et le cycle de marché actuel (DCA, rééquilibrage, prise de profit partielle si pertinent).

---
⚠️ Rappelle en fin de réponse que cette analyse ne constitue pas un conseil financier officiel, que les cryptomonnaies sont des actifs hautement spéculatifs pouvant perdre 100% de leur valeur, et que l'utilisateur reste seul responsable de ses décisions d'investissement."""
