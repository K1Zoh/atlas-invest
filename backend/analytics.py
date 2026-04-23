import pandas as pd

# ── Sector classification ──────────────────────────────────────────────────────

_SECTOR_MAP: dict[str, str] = {
    # Semi-conducteurs
    "NVDA": "Semi-conducteurs", "AMD": "Semi-conducteurs", "AVGO": "Semi-conducteurs",
    "TSM": "Semi-conducteurs", "INTC": "Semi-conducteurs", "QCOM": "Semi-conducteurs",
    "ASML": "Semi-conducteurs", "ASML.AS": "Semi-conducteurs", "MU": "Semi-conducteurs",
    "MRVL": "Semi-conducteurs", "AMAT": "Semi-conducteurs", "LRCX": "Semi-conducteurs",
    # Services financiers
    "MSCI": "Services financiers", "SPGI": "Services financiers",
    "ICE": "Services financiers", "CME": "Services financiers",
    # ETF – Monde
    "CW8.PA": "ETF – Monde", "MWRD.AS": "ETF – Monde", "6AQQ": "ETF – Monde",
    "IWDA.AS": "ETF – Monde", "LCWD.PA": "ETF – Monde",
    # ETF – US / S&P 500
    "10AP": "ETF – US", "P500.PA": "ETF – US", "PE500.PA": "ETF – US",
    "500USD.SW": "ETF – US", "SPY": "ETF – US", "VOO": "ETF – US", "IVV": "ETF – US",
    # ETF – Nasdaq / Tech
    "ANX.PA": "ETF – Nasdaq/Tech", "ANXP.PA": "ETF – Nasdaq/Tech",
    "PANX.PA": "ETF – Nasdaq/Tech", "LQQ.PA": "ETF – Nasdaq/Tech",
    "QQQ": "ETF – Nasdaq/Tech", "EQQQ.L": "ETF – Nasdaq/Tech",
    "XAMZ": "ETF – Big Tech",
    # ETF – Cyber / Digital Security
    "L0CK": "ETF – Cyber", "LOCK.L": "ETF – Cyber", "ISPY.L": "ETF – Cyber",
    "HACK": "ETF – Cyber", "CIBR": "ETF – Cyber", "BUG": "ETF – Cyber",
    # ETF – Europe
    "EXSA": "ETF – Europe", "EXSA.DE": "ETF – Europe", "IUSE.L": "ETF – Europe",
    "MEUD.PA": "ETF – Europe", "DXS2.DE": "ETF – Europe",
}

_SEMI_TICKERS = {
    "NVDA", "AMD", "AVGO", "TSM", "INTC", "QCOM",
    "ASML", "ASML.AS", "MU", "MRVL", "AMAT", "LRCX",
}


def classify_sector(ticker: str) -> str:
    return _SECTOR_MAP.get(ticker.upper(), _SECTOR_MAP.get(ticker, "Autre"))


# ── Core portfolio calculations ────────────────────────────────────────────────

def build_portfolio_df(positions: list[dict], current_prices: dict[str, float]) -> pd.DataFrame:
    rows = []
    for p in positions:
        ticker = p["ticker"]
        qty = p["quantity"]
        buy_price = p["avg_buy_price"]
        current = current_prices.get(ticker)
        invested = qty * buy_price
        current_value = qty * current if current else None
        gain = (current_value - invested) if current_value is not None else None
        gain_pct = (gain / invested * 100) if (gain is not None and invested) else None
        rows.append({
            "Ticker": ticker,
            "Nom": p["name"],
            "Qté": qty,
            "PRU": buy_price,
            "Cours actuel": current,
            "Investi (€)": invested,
            "Valeur (€)": current_value,
            "Gain/Perte (€)": gain,
            "Perf (%)": gain_pct,
        })
    return pd.DataFrame(rows)


def portfolio_summary(df: pd.DataFrame) -> dict:
    total_invested = df["Investi (€)"].sum()
    valid = df["Valeur (€)"].notna()
    total_value = df.loc[valid, "Valeur (€)"].sum()
    invested_for_valued = df.loc[valid, "Investi (€)"].sum()
    total_gain = total_value - invested_for_valued
    total_gain_pct = (total_gain / invested_for_valued * 100) if invested_for_valued else 0
    return {
        "total_invested": total_invested,
        "total_value": total_value,
        "total_gain": total_gain,
        "total_gain_pct": total_gain_pct,
    }


# ── Concentration & risk ───────────────────────────────────────────────────────

def compute_hhi(df: pd.DataFrame) -> float:
    values = df["Valeur (€)"].dropna()
    if values.empty or values.sum() == 0:
        return 0.0
    weights = values / values.sum()
    return float((weights ** 2).sum())


def compute_concentration_alerts(df: pd.DataFrame) -> list[tuple[str, str]]:
    alerts = []
    values = df["Valeur (€)"].dropna()
    if values.empty:
        return alerts
    total = values.sum()
    sorted_vals = values.sort_values(ascending=False)
    top1_pct = sorted_vals.iloc[0] / total
    top1_ticker = df.loc[sorted_vals.index[0], "Ticker"]
    if top1_pct > 0.15:
        alerts.append(("warning", f"Top position **{top1_ticker}** = {top1_pct*100:.1f}% (seuil 15%)"))
    if len(sorted_vals) >= 3 and sorted_vals.iloc[:3].sum() / total > 0.50:
        alerts.append(("warning", f"Top 3 positions = {sorted_vals.iloc[:3].sum()/total*100:.1f}% (seuil 50%)"))
    hhi = compute_hhi(df)
    if hhi > 0.25:
        alerts.append(("error", f"HHI = {hhi:.3f} — concentration très élevée"))
    elif hhi > 0.15:
        alerts.append(("warning", f"HHI = {hhi:.3f} — concentration modérée"))
    semi_mask = df["Ticker"].str.upper().isin(_SEMI_TICKERS)
    if semi_mask.any():
        semi_pct = df.loc[semi_mask, "Valeur (€)"].dropna().sum() / total
        if semi_pct > 0.15:
            alerts.append(("error", f"Semi-conducteurs = {semi_pct*100:.1f}% (seuil 15%)"))
    return alerts


def compute_sector_allocation(df: pd.DataFrame) -> pd.DataFrame:
    df2 = df.copy()
    df2["Secteur"] = df2["Ticker"].map(classify_sector)
    return (
        df2.groupby("Secteur")["Valeur (€)"]
        .sum().dropna().reset_index()
        .sort_values("Valeur (€)", ascending=False)
    )


# ── AI scoreboard ──────────────────────────────────────────────────────────────

def compute_scoreboard(suggestions: list[dict]) -> pd.DataFrame:
    from collections import defaultdict
    stats: dict = defaultdict(lambda: {"n": 0, "a": [], "d": []})
    for s in suggestions:
        m = s["model_name"]
        stats[m]["n"] += 1
        if s.get("analysis_score") is not None:
            stats[m]["a"].append(float(s["analysis_score"]))
        if s.get("discipline_score") is not None:
            stats[m]["d"].append(float(s["discipline_score"]))
    rows = []
    for model, data in stats.items():
        avg_a = sum(data["a"]) / len(data["a"]) if data["a"] else None
        avg_d = sum(data["d"]) / len(data["d"]) if data["d"] else None
        composite = (avg_a + avg_d) if (avg_a is not None and avg_d is not None) else None
        rows.append({
            "Modèle": model,
            "Analyses": data["n"],
            "Qualité analyse": avg_a,
            "Discipline B&H": avg_d,
            "Score /10": composite,
        })
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows).sort_values("Score /10", ascending=False, na_position="last")
    return df.reset_index(drop=True)


# ── Investment gap recommendations ─────────────────────────────────────────────

def compute_investment_gaps(df: pd.DataFrame) -> list[dict]:
    """Recommandations rule-based basées sur les lacunes du portefeuille."""
    recs = []
    values = df["Valeur (€)"].dropna()
    if values.empty:
        return recs
    total = values.sum()
    sectors = set(df["Ticker"].map(classify_sector).tolist())

    # Obligations absentes
    if not any("Obligation" in s or "Bond" in s for s in sectors):
        recs.append({
            "priority": "medium", "icon": "🔒",
            "title": "Obligations : 0% de ton portefeuille",
            "action": "Envisage 5-10% sur IEAG.L (iShares EUR Aggregate Bond) pour réduire la volatilité sans sacrifier le rendement long terme.",
        })

    # Émergents absents
    if not any("Emergent" in s or "Emerging" in s for s in sectors):
        recs.append({
            "priority": "low", "icon": "🌍",
            "title": "Marchés émergents absents",
            "action": "PAEM.PA (Amundi MSCI Emerging Markets) ou IEMM.L — représentent 40% du PIB mondial pour ~0% de ton portfolio.",
        })

    # Surexposition semis
    semi_mask = df["Ticker"].str.upper().isin(_SEMI_TICKERS)
    if semi_mask.any():
        semi_pct = df.loc[semi_mask, "Valeur (€)"].dropna().sum() / total
        if semi_pct > 0.20:
            recs.append({
                "priority": "high", "icon": "⚠️",
                "title": f"Semi-conducteurs : {semi_pct*100:.0f}% — exposition élevée",
                "action": "Redirige les prochaines mises vers CW8.PA ou EXSA pour diluer le risque sectoriel.",
            })

    # Concentration HHI
    hhi = compute_hhi(df)
    if hhi > 0.18:
        recs.append({
            "priority": "high", "icon": "📊",
            "title": f"Portefeuille concentré (HHI {hhi:.2f})",
            "action": "Prochains achats : priorise les ETF larges (CW8.PA, EXSA) plutôt que des titres individuels.",
        })

    # Small caps absentes
    if not any("Small" in s for s in sectors):
        recs.append({
            "priority": "low", "icon": "📈",
            "title": "Small caps absentes",
            "action": "ZPRV (SPDR MSCI USA Small Cap) ou IUSZ.L — prime historique de 1-2%/an sur le long terme.",
        })

    return recs
