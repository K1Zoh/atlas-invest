"""
Calcul fiscal des plus-values réalisées.

Actions / ETF : méthode PRU (coût moyen pondéré).
Crypto        : formule officielle formulaire 2086 (BOFiP – IS 2019).

Formule 2086 :
    PV = Prix_cession_net
         - (Σ Prix_acquisition_global × Prix_cession_net / Valeur_globale_portefeuille)

Valeur_globale_portefeuille = valeur de marché TOTALE de toutes les cryptos détenues
AVANT la cession. Pour les cryptos dont on ne possède pas le cours historique exact,
on utilise le PRU comme proxy (estimation — annotée dans les résultats).

Mise à jour du coût global après chaque cession :
    new_cost = old_cost × (1 - Prix_cession_net / Valeur_globale)
"""

from __future__ import annotations
from backend.db import get_transactions

_PFU = 0.30  # 12.8 % IR + 17.2 % PS


def compute_stock_pv(year: int | None = None) -> list[dict]:
    """PV/MV réalisées pour les actions/ETF (méthode PRU).

    Retourne une liste de dicts, une entrée par transaction de vente,
    triée par date chronologique.
    """
    txs = get_transactions(asset_class="stock")
    txs.sort(key=lambda t: (t["tx_date"], t["id"]))

    cost_basis: dict[str, dict] = {}  # ticker → {qty, total_cost}
    lines: list[dict] = []

    for t in txs:
        tk = t["ticker"]
        cb = cost_basis.setdefault(tk, {"qty": 0.0, "total_cost": 0.0})

        if t["quantity"] >= 0:                      # Achat
            cb["qty"]        += t["quantity"]
            cb["total_cost"] += t["quantity"] * t["price"] + t["fees"]
        else:                                        # Vente
            qty_sold   = abs(t["quantity"])
            qty_before = cb["qty"]
            if qty_before <= 1e-9:
                continue

            pru           = cb["total_cost"] / qty_before
            prix_cession  = qty_sold * t["price"] - t["fees"]
            cout_achat    = pru * qty_sold
            pv            = prix_cession - cout_achat

            # Mise à jour du coût résiduel (proportionnel)
            fraction_kept       = max(0.0, qty_before - qty_sold) / qty_before
            cb["qty"]           = qty_before - qty_sold
            cb["total_cost"]   *= fraction_kept

            tx_year = t["tx_date"][:4]
            if year and tx_year != str(year):
                continue

            lines.append({
                "date":             t["tx_date"],
                "ticker":           tk,
                "name":             t["name"],
                "qty_sold":         qty_sold,
                "prix_vente_unit":  t["price"],
                "frais":            t["fees"],
                "prix_cession_net": round(prix_cession, 4),
                "cout_achat":       round(cout_achat, 4),
                "pru":              round(pru, 6),
                "pv_mv":            round(pv, 4),
                "pfu_estime":       round(max(0.0, pv) * _PFU, 4),
                "currency":         t.get("currency", "EUR"),
            })

    return lines


def _portfolio_value_at_sale(
    portfolio: dict[str, dict],
    sold_ticker: str,
    sale_price: float,
) -> float:
    """Valeur globale du portefeuille juste avant la vente.

    Pour le ticker vendu : qty × prix de vente (exact).
    Pour les autres : qty × PRU (approximation — faute de prix historique exact).
    """
    total = 0.0
    for tk, p in portfolio.items():
        if p["qty"] <= 1e-9:
            continue
        if tk == sold_ticker:
            total += p["qty"] * sale_price
        else:
            pru_proxy = p["total_cost"] / p["qty"]
            total += p["qty"] * pru_proxy
    return total


def compute_crypto_pv_2086(year: int | None = None) -> dict:
    """PV/MV crypto selon la formule 2086 du BOFiP.

    Retourne :
        lines        – liste de dicts, une par cession crypto
        total_pv     – somme des plus-values (€)
        total_mv     – somme des moins-values (en valeur absolue, €)
        total_net    – PV nette imposable (€)
        pfu_estime   – PFU estimé à 30 % sur la PV nette positive (€)
    """
    txs = get_transactions(asset_class="crypto")
    txs.sort(key=lambda t: (t["tx_date"], t["id"]))

    portfolio: dict[str, dict] = {}   # ticker → {qty, total_cost}
    total_cost_global = 0.0           # Σ coûts d'acquisition de TOUT le portefeuille crypto
    lines: list[dict] = []

    for t in txs:
        tk = t["ticker"]
        p  = portfolio.setdefault(tk, {"qty": 0.0, "total_cost": 0.0})

        if t["quantity"] >= 0:                      # Achat
            p["qty"]           += t["quantity"]
            p["total_cost"]    += t["quantity"] * t["price"] + t["fees"]
            total_cost_global  += t["quantity"] * t["price"] + t["fees"]

        else:                                        # Vente / retrait
            qty_sold   = abs(t["quantity"])
            qty_before = p["qty"]
            if qty_before <= 1e-9:
                continue

            prix_cession_net    = qty_sold * t["price"] - t["fees"]
            total_portfolio_val = _portfolio_value_at_sale(portfolio, tk, t["price"])

            if total_portfolio_val <= 0:
                continue

            # Formule 2086
            pv_2086 = prix_cession_net - (
                total_cost_global * prix_cession_net / total_portfolio_val
            )

            # Mise à jour du coût global (formule officielle)
            new_total_cost = total_cost_global * (
                1.0 - prix_cession_net / total_portfolio_val
            )

            # Mise à jour position individuelle
            fraction_kept    = max(0.0, qty_before - qty_sold) / qty_before
            p["qty"]         = qty_before - qty_sold
            p["total_cost"] *= fraction_kept
            total_cost_global = max(0.0, new_total_cost)

            tx_year = t["tx_date"][:4]
            if year and tx_year != str(year):
                continue

            lines.append({
                "date":                  t["tx_date"],
                "ticker":                tk,
                "name":                  t["name"],
                "qty_sold":              qty_sold,
                "prix_vente_unit":       t["price"],
                "frais":                 t["fees"],
                "prix_cession_net":      round(prix_cession_net, 4),
                "total_cost_global":     round(total_cost_global + (total_cost_global - new_total_cost + 0), 4),
                "valeur_globale_portef": round(total_portfolio_val, 4),
                "pv_mv_2086":            round(pv_2086, 4),
                "pfu_estime":            round(max(0.0, pv_2086) * _PFU, 4),
                "approx_valeur":         True,  # valeur portefeuille estimée (PRU proxy)
            })

    lines_in_scope = [l for l in lines] if not year else lines
    total_pv  = sum(l["pv_mv_2086"] for l in lines_in_scope if l["pv_mv_2086"] > 0)
    total_mv  = sum(l["pv_mv_2086"] for l in lines_in_scope if l["pv_mv_2086"] < 0)
    total_net = total_pv + total_mv

    return {
        "lines":      lines_in_scope,
        "total_pv":   round(total_pv, 2),
        "total_mv":   round(abs(total_mv), 2),
        "total_net":  round(total_net, 2),
        "pfu_estime": round(max(0.0, total_net) * _PFU, 2),
    }


def available_years() -> list[int]:
    """Retourne la liste des années pour lesquelles il existe au moins une vente."""
    txs_stk  = [t for t in get_transactions(asset_class="stock")  if t["quantity"] < 0]
    txs_cry  = [t for t in get_transactions(asset_class="crypto") if t["quantity"] < 0]
    years = {int(t["tx_date"][:4]) for t in txs_stk + txs_cry}
    return sorted(years, reverse=True)
