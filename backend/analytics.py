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


# ── AI top investment picks ────────────────────────────────────────────────────

def compute_ai_top_picks(suggestions: list[dict]) -> pd.DataFrame:
    """
    Agrège les portefeuilles virtuels de toutes les suggestions IA.
    Retourne un DataFrame avec ticker, nom, poids moyen, nb modèles, conviction, rationale.
    """
    import json as _json
    from collections import defaultdict

    agg: dict[str, dict] = defaultdict(lambda: {
        "names": [], "pcts": [], "rationales": [], "models": set(),
    })

    for s in suggestions:
        raw = s.get("virtual_portfolio")
        if not raw:
            continue
        try:
            vp = _json.loads(raw) if isinstance(raw, str) else raw
        except Exception:
            continue
        items = vp.get("virtual_portfolio", []) if isinstance(vp, dict) else []
        model = s.get("model_name", "?")
        for item in items:
            ticker = str(item.get("ticker", "")).strip().upper()
            if not ticker or len(ticker) > 15:
                continue
            agg[ticker]["names"].append(str(item.get("name", ticker)))
            pct = item.get("pct") or item.get("weight") or 0
            try:
                agg[ticker]["pcts"].append(float(pct))
            except (TypeError, ValueError):
                pass
            rationale = str(item.get("rationale", "")).strip()
            if rationale:
                agg[ticker]["rationales"].append(rationale)
            agg[ticker]["models"].add(model)

    if not agg:
        return pd.DataFrame()

    total_models = len({s.get("model_name") for s in suggestions if s.get("virtual_portfolio")})
    rows = []
    for ticker, data in agg.items():
        nb = len(data["models"])
        avg_pct = sum(data["pcts"]) / total_models if data["pcts"] and total_models else 0
        name = data["names"][0] if data["names"] else ticker
        rationale = data["rationales"][0] if data["rationales"] else "—"
        if nb >= total_models:
            conviction = "★★★ Consensus"
        elif nb >= max(1, total_models // 2):
            conviction = "★★ Fort"
        else:
            conviction = "★ Faible"
        rows.append({
            "Ticker": ticker,
            "Titre": name,
            "Poids moyen": round(avg_pct, 1),
            "Modèles": nb,
            "Conviction": conviction,
            "Description": rationale[:120] + ("…" if len(rationale) > 120 else ""),
        })

    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    df = df.sort_values(["Modèles", "Poids moyen"], ascending=[False, False])
    return df.reset_index(drop=True)


# ── Investment gap recommendations ─────────────────────────────────────────────

def compute_investment_gaps(df: pd.DataFrame) -> list[dict]:
    """
    Recommandations rule-based avec suggestions concrètes d'ETF/actions.
    Chaque entrée : {priority, icon, title, action, suggestions: [{ticker, name, why}]}
    """
    recs = []
    values = df["Valeur (€)"].dropna()
    if values.empty:
        return recs
    total = values.sum()
    sectors = set(df["Ticker"].map(classify_sector).tolist())
    held = set(df["Ticker"].str.upper().tolist())
    hhi = compute_hhi(df)

    # ── Concentration élevée (priorité absolue) ────────────────────────────────
    if hhi > 0.18:
        dilution = []
        if "CW8.PA" not in held:
            dilution.append({"ticker": "CW8.PA", "name": "Amundi MSCI World (acc.)",
                             "why": "1 600 entreprises, 23 pays. Le meilleur outil de dilution à coût minimal (TER 0.12%)."})
        if "IWDA.AS" not in held:
            dilution.append({"ticker": "IWDA.AS", "name": "iShares Core MSCI World",
                             "why": "Alternative à CW8 sur Euronext Amsterdam, très liquide."})
        if "EXSA" not in held and "EXSA.DE" not in held:
            dilution.append({"ticker": "EXSA.DE", "name": "iShares STOXX Europe 600",
                             "why": "Contrepoids Europe aux titres US déjà détenus."})
        recs.append({
            "priority": "high", "icon": "📊",
            "title": f"Portefeuille concentré — HHI {hhi:.2f} (seuil 0.18)",
            "action": "Consacre les prochains achats à des ETF larges plutôt qu'à des titres individuels pour diluer le risque.",
            "suggestions": dilution[:3],
        })

    # ── Surexposition semi-conducteurs ─────────────────────────────────────────
    semi_mask = df["Ticker"].str.upper().isin(_SEMI_TICKERS)
    if semi_mask.any():
        semi_pct = df.loc[semi_mask, "Valeur (€)"].dropna().sum() / total
        if semi_pct > 0.20:
            recs.append({
                "priority": "high", "icon": "⚠️",
                "title": f"Semi-conducteurs {semi_pct*100:.0f}% — exposition cyclique élevée",
                "action": "Le secteur est au pic de valorisation. Redirige les flux vers des ETF diversifiés.",
                "suggestions": [
                    {"ticker": "CW8.PA", "name": "Amundi MSCI World",
                     "why": "Semis = ~6% du World. Dilue l'exposition sans sortir du secteur."},
                    {"ticker": "MEUD.PA", "name": "Amundi MSCI Europe",
                     "why": "0% exposition directe aux semis US, réduit la corrélation."},
                    {"ticker": "PAEM.PA", "name": "Amundi MSCI Emerging Markets",
                     "why": "Décorrélation forte vs semis US. Chine/Inde/Brésil."},
                ],
            })

    # ── Obligations absentes ───────────────────────────────────────────────────
    if not any("Obligation" in s or "Bond" in s for s in sectors):
        recs.append({
            "priority": "medium", "icon": "🔒",
            "title": "Obligations : 0% du portefeuille",
            "action": "5-10% en obligations réduit la volatilité de ~15% sans coût significatif sur le rendement long terme.",
            "suggestions": [
                {"ticker": "IEAG.L", "name": "iShares EUR Aggregate Bond",
                 "why": "Obligations EUR investment-grade. TER 0.10%. Corrélation négative aux actions en crise."},
                {"ticker": "XGLE.DE", "name": "Xtrackers EUR Govt Bond 1-3yr",
                 "why": "Duration courte = moins sensible aux taux. Plus défensif."},
                {"ticker": "IBTS.L", "name": "iShares $ Treasury Bond 1-3yr",
                 "why": "Bon du Trésor US court terme. Rendement ~5% actuel, risque minimal."},
            ],
        })

    # ── Marchés émergents absents ──────────────────────────────────────────────
    if not any("Emergent" in s or "Emerging" in s for s in sectors):
        recs.append({
            "priority": "low", "icon": "🌍",
            "title": "Marchés émergents absents",
            "action": "Les émergents représentent 40% du PIB mondial et ~12% du MSCI ACWI. Sous-pondérés = manque à gagner structurel.",
            "suggestions": [
                {"ticker": "PAEM.PA", "name": "Amundi MSCI Emerging Markets",
                 "why": "Le plus gros ETF EM européen. TER 0.20%. Chine 30%, Inde 18%, Taiwan 16%."},
                {"ticker": "IEMM.L", "name": "iShares MSCI EM IMI",
                 "why": "Couvre small caps EM en plus. Meilleure exposition à l'Inde et au Vietnam."},
                {"ticker": "IIND.L", "name": "iShares MSCI India",
                 "why": "Focus Inde : 7% de croissance/an attendu, démographie favorable. Plus concentré mais conviction forte."},
            ],
        })

    # ── Small & Mid caps absentes ──────────────────────────────────────────────
    if not any("Small" in s for s in sectors):
        recs.append({
            "priority": "low", "icon": "📈",
            "title": "Small caps absentes — prime historique non capturée",
            "action": "Les small caps US surperforment les large caps de 1-2%/an sur 30 ans (Fama-French factor). Faible corrélation aux mega-caps tech.",
            "suggestions": [
                {"ticker": "ZPRV.DE", "name": "SPDR MSCI USA Small Cap Value",
                 "why": "Small + Value = double prime Fama-French. TER 0.30%. Historique solide."},
                {"ticker": "IUSZ.L", "name": "iShares MSCI USA Small Cap",
                 "why": "Plus large (1 700 titres), moins de value-tilt. Bonne alternative neutre."},
                {"ticker": "ZNXR.DE", "name": "SPDR MSCI Europe Small Cap",
                 "why": "Small caps Europe : valorisations plus basses qu'aux US, upside potentiel élevé."},
            ],
        })

    # ── Or / actif refuge absent ───────────────────────────────────────────────
    has_gold = any("Gold" in s or "Or" in s or "Commodit" in s for s in sectors)
    if not has_gold and total > 2000:
        recs.append({
            "priority": "low", "icon": "🪙",
            "title": "Actif refuge absent (or / commodités)",
            "action": "5% en or améliore le ratio de Sharpe du portefeuille sans réduire le rendement espéré.",
            "suggestions": [
                {"ticker": "SGLD.L", "name": "Invesco Physical Gold ETC",
                 "why": "Or physique en EUR. TER 0.12% — le moins cher du marché."},
                {"ticker": "XGDU.L", "name": "Xtrackers Physical Gold ETC",
                 "why": "Alternative iShares/DWS, backing physique sécurisé à Zurich."},
                {"ticker": "LYTR.PA", "name": "Amundi Physical Gold ETC",
                 "why": "En EUR, cotation Euronext Paris. Accessible facilement via brokers FR."},
            ],
        })

    # ── Titre à fort momentum non détenu ──────────────────────────────────────
    momentum_candidates = [
        {"ticker": "MSFT", "name": "Microsoft", "why": "Azure +21% YoY, Copilot déployé sur 1B users. FCF $75Mds. PER 30x justifié."},
        {"ticker": "META", "name": "Meta Platforms", "why": "Machines IA internes réduisent les coûts infra. Croissance pub +16%. PER 22x."},
        {"ticker": "AMZN", "name": "Amazon", "why": "AWS reprend +17% de croissance. Marge opérationnelle x3 en 2 ans."},
        {"ticker": "ASML.AS", "name": "ASML Holding", "why": "Monopole mondial EUV lithography. Carnet de commandes 40Mds€. Clé de l'IA."},
        {"ticker": "NOVO-B.CO", "name": "Novo Nordisk", "why": "Ozempic/Wegovy : marché GLP-1 estimé 150Mds$ en 2030. Moat réglementaire fort."},
    ]
    # Filtre ceux déjà détenus
    missing_momentum = [c for c in momentum_candidates if c["ticker"] not in held]
    if missing_momentum and hhi < 0.30:
        recs.append({
            "priority": "low", "icon": "🚀",
            "title": "Opportunités à fort momentum",
            "action": "Titres individuels à conviction élevée, non détenus. À considérer en complément des ETF.",
            "suggestions": missing_momentum[:3],
        })

    return recs
