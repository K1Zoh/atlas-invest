from datetime import date
import pandas as pd


def build_asset_analysis_prompt(
    ticker: str,
    name: str,
    asset_class: str,
    row: pd.Series,
    txs: list[dict],
) -> str:
    date_str = date.today().strftime("%d %B %Y")

    qty = row["Qté"]
    pru = row["PRU"]
    current = row["Cours actuel"]
    invested = row["Investi (€)"]
    value = row.get("Valeur (€)")
    gain = row.get("Gain/Perte (€)")
    perf = row.get("Perf (%)")

    tx_lines = []
    for t in sorted(txs, key=lambda x: x["tx_date"]):
        sign = "ACHAT" if t["quantity"] >= 0 else "VENTE/RETRAIT"
        total = abs(t["quantity"] * t["price"])
        tx_lines.append(
            f"  {t['tx_date']}  {sign:<15}  qty={t['quantity']:+.6f}"
            f"  prix={t['price']:.6f} €  total={total:.2f} €"
            + (f"  frais={t['fees']:.2f} €" if t["fees"] else "")
        )
    tx_table = "\n".join(tx_lines) if tx_lines else "  Aucune transaction enregistrée."

    asset_label = "Cryptomonnaie" if asset_class == "crypto" else "Action / ETF"

    def _fmt(v, fmt=".2f"):
        return f"{v:{fmt}}" if v is not None and pd.notna(v) else "N/A"

    return f"""Tu es un analyste financier et gestionnaire de portefeuille professionnel. \
Analyse cette position avec précision et sans complaisance. Pas de disclaimers légaux.

Date d'analyse : {date_str}

═══════════════════════════════════════════════════════
ACTIF ANALYSÉ
═══════════════════════════════════════════════════════
  Ticker / Symbole : {ticker}
  Nom              : {name}
  Type             : {asset_label}

═══════════════════════════════════════════════════════
HISTORIQUE DE MES TRANSACTIONS
═══════════════════════════════════════════════════════
{tx_table}

═══════════════════════════════════════════════════════
POSITION ACTUELLE
═══════════════════════════════════════════════════════
  Quantité détenue  : {qty:.6f}
  PRU (coût moyen)  : {_fmt(pru, ',.6f')} €
  Cours actuel      : {_fmt(current, ',.6f')} €
  Capital investi   : {_fmt(invested, ',.2f')} €
  Valeur de marché  : {_fmt(value, ',.2f')} €
  Gain / Perte      : {_fmt(gain, '+,.2f')} €
  Performance       : {_fmt(perf, '+.2f')} %

═══════════════════════════════════════════════════════
MISSION
═══════════════════════════════════════════════════════
Réponds de façon DIRECTE et STRUCTURÉE (max 350 mots) :

1. **Résumé de l'actif** (2 lignes) : rôle dans un portefeuille, catalyseurs principaux.
2. **Analyse de ma position** : timing d'entrée, momentum actuel, situation P&L.
3. **Recommandation** (une seule) :
   - 🟢 RENFORCER — si le potentiel dépasse clairement le risque
   - 🟡 CONSERVER — si la thèse tient mais sans urgence d'agir
   - 🔴 ALLÉGER — si le rapport risque/rendement s'est dégradé
   - ⛔ COUPER — si la thèse est cassée ou le capital mieux déployé ailleurs
4. **Conviction** : FORTE / MODÉRÉE / FAIBLE — en une phrase.
5. **Risque #1 à surveiller** : le facteur le plus critique pour cet actif en ce moment.
"""
