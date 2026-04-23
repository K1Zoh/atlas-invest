import sys
import os
import json
import re
from pathlib import Path
from datetime import date as _date

sys.path.insert(0, str(Path(__file__).parent.parent))

import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from backend.db import (
    init_db, get_positions, delete_position,
    add_transaction, delete_transaction, get_transactions,
    save_suggestion, get_suggestions, update_suggestion_scores,
)
from backend.collectors import search_tickers, verify_ticker, get_current_prices, get_normalized_history
from backend.analytics import (
    build_portfolio_df, portfolio_summary,
    compute_hhi, compute_concentration_alerts,
    compute_sector_allocation, compute_scoreboard, compute_investment_gaps,
)
from backend.analyzers.prompt import build_analysis_prompt
from backend.analyzers.runner import run_analysis

# ── Config ─────────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Stock Market Analyzer",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="collapsed",
)

init_db()

# ── Theme ──────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
/* Metric cards */
[data-testid="metric-container"] {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 10px;
    padding: 1rem 1.25rem;
}
[data-testid="stMetricValue"] { font-weight: 700 !important; }

/* Tabs */
.stTabs [data-baseweb="tab-list"] {
    gap: 4px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
}
.stTabs [data-baseweb="tab"] {
    padding: 0.5rem 1.2rem;
    border-radius: 6px 6px 0 0;
    font-weight: 600;
}

/* Dividers */
hr { border-color: rgba(255,255,255,0.08) !important; margin: 1.2rem 0 !important; }

/* Alerts */
[data-testid="stAlert"] { border-radius: 8px !important; }

/* Expander header */
details > summary { font-weight: 600; }

/* Tables */
[data-testid="stDataFrame"] { border-radius: 8px; }

/* Score badge */
.badge-high { color: #f85149; font-weight: 700; }
.badge-medium { color: #d29922; font-weight: 700; }
.badge-low { color: #3fb950; font-weight: 700; }
</style>
""", unsafe_allow_html=True)

# ── Plotly dark template ───────────────────────────────────────────────────────
_CHART = dict(
    template="plotly_dark",
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
    margin=dict(l=0, r=0, t=28, b=0),
    font=dict(family="system-ui, sans-serif", size=12),
)
_C_GAIN = "#3fb950"
_C_LOSS = "#f85149"
_C_ACCENT = "#58a6ff"

_TICKER_RE = re.compile(r"^[A-Z0-9.\-]{1,20}$")

# ── Session state ──────────────────────────────────────────────────────────────
for key, default in [
    ("search_results", []),
    ("prefill_ticker", ""),
    ("prefill_name", ""),
    ("price_hint", None),
    ("currency_hint", ""),
    ("last_analysis", None),
]:
    if key not in st.session_state:
        st.session_state[key] = default

# ── Helpers ────────────────────────────────────────────────────────────────────

def load_portfolio():
    positions = get_positions()
    if not positions:
        return None, {}
    tickers = [p["ticker"] for p in positions]
    prices = get_current_prices(tickers)
    df = build_portfolio_df(positions, prices)
    return df, prices


@st.cache_data(ttl=3600, show_spinner=False)
def cached_history(tickers_tuple: tuple, period: str) -> pd.DataFrame:
    return get_normalized_history(list(tickers_tuple), period)


def _color_val(v):
    if isinstance(v, (int, float)):
        if v < 0:
            return "color:#f85149"
        if v > 0:
            return "color:#3fb950"
    return ""


def _fmt_df(df: pd.DataFrame):
    fmt = {
        "PRU": "{:.4f}", "Cours actuel": "{:.4f}",
        "Investi (€)": "{:,.2f}", "Valeur (€)": "{:,.2f}",
        "Gain/Perte (€)": "{:+,.2f}", "Perf (%)": "{:+.2f}%",
    }
    existing_fmt = {k: v for k, v in fmt.items() if k in df.columns}
    color_cols = [c for c in ["Gain/Perte (€)", "Perf (%)"] if c in df.columns]
    styled = df.style.format(existing_fmt, na_rep="—")
    if color_cols:
        styled = styled.map(_color_val, subset=color_cols)
    return styled


def _render_virtual_portfolio(vp: dict):
    if not vp or "virtual_portfolio" not in vp:
        return
    rows = vp["virtual_portfolio"]
    if not rows:
        return
    df_vp = pd.DataFrame(rows)
    for col in ["ticker", "name", "amount_eur", "pct", "rationale"]:
        if col not in df_vp.columns:
            df_vp[col] = "—"
    df_vp = df_vp[["ticker", "name", "amount_eur", "pct", "rationale"]]
    df_vp.columns = ["Ticker", "Titre", "Montant (€)", "%", "Rationale"]
    st.dataframe(
        df_vp.style.format({"Montant (€)": "{:,.0f} €", "%": "{:.1f}%"}, na_rep="—"),
        width="stretch", hide_index=True,
    )
    m1, m2, m3 = st.columns(3)
    m1.metric("Benchmark", vp.get("benchmark", "—"))
    m2.metric("Conviction", str(vp.get("conviction_level", "—")).upper())
    m3.metric("Horizon", vp.get("expected_horizon", "—"))
    if vp.get("key_risks"):
        st.caption("**Risques :** " + " · ".join(vp["key_risks"]))


# ── Header ─────────────────────────────────────────────────────────────────────
h1, h2 = st.columns([7, 2])
with h1:
    st.title("📈 Stock Market Analyzer")
with h2:
    st.write("")
    if st.button("🔄 Actualiser les cours", use_container_width=True):
        st.cache_data.clear()
        st.rerun()

tab_overview, tab_manage, tab_ai = st.tabs(
    ["📊 Vue d'ensemble", "💼 Gérer mes positions", "🤖 Analyse IA"]
)


# ══════════════════════════════════════════════════════════════════════════════
# TAB 1 — Vue d'ensemble
# ══════════════════════════════════════════════════════════════════════════════

with tab_overview:
    df, prices = load_portfolio()

    if df is None:
        st.info("Aucune position. Va dans **💼 Gérer mes positions** pour commencer.")
    else:
        summary = portfolio_summary(df)
        hhi = compute_hhi(df)
        alerts = compute_concentration_alerts(df)

        # ── KPIs ──────────────────────────────────────────────────────────────
        k1, k2, k3, k4 = st.columns(4)
        k1.metric("💰 Capital investi", f"{summary['total_invested']:,.0f} €")
        k2.metric("📦 Valeur actuelle", f"{summary['total_value']:,.0f} €")
        gain_sign = "+" if summary["total_gain"] >= 0 else ""
        k3.metric(
            "📈 Gain / Perte",
            f"{gain_sign}{summary['total_gain']:,.0f} €",
            delta=f"{summary['total_gain_pct']:+.2f}%",
        )
        k4.metric("🧮 Positions", len(df))

        # ── Alerts ────────────────────────────────────────────────────────────
        if alerts:
            for level, msg in alerts:
                (st.error if level == "error" else st.warning)(msg)

        st.divider()

        # ── Row 1 : répartition + secteurs + HHI ──────────────────────────────
        c1, c2, c3 = st.columns([2.5, 2.5, 1.5])

        with c1:
            st.subheader("Répartition par valeur")
            df_v = df.dropna(subset=["Valeur (€)"])
            if not df_v.empty:
                fig = px.pie(df_v, names="Ticker", values="Valeur (€)", hole=0.45,
                             color_discrete_sequence=px.colors.qualitative.Set3)
                fig.update_traces(textposition="inside", textinfo="percent+label")
                fig.update_layout(**_CHART, showlegend=False)
                st.plotly_chart(fig, use_container_width=True)

        with c2:
            st.subheader("Répartition par secteur")
            df_sec = compute_sector_allocation(df_v) if not df_v.empty else pd.DataFrame()
            if not df_sec.empty:
                fig2 = px.pie(df_sec, names="Secteur", values="Valeur (€)", hole=0.45,
                              color_discrete_sequence=px.colors.qualitative.Pastel)
                fig2.update_traces(textposition="inside", textinfo="percent+label")
                fig2.update_layout(**_CHART, showlegend=False)
                st.plotly_chart(fig2, use_container_width=True)

        with c3:
            st.subheader("Concentration")
            hhi_color = _C_LOSS if hhi > 0.25 else "#d29922" if hhi > 0.15 else _C_GAIN
            fig_hhi = go.Figure(go.Indicator(
                mode="gauge+number",
                value=hhi,
                title={"text": "HHI", "font": {"size": 14}},
                number={"valueformat": ".3f", "font": {"size": 22}},
                gauge={
                    "axis": {"range": [0, 1], "tickformat": ".1f", "tickfont": {"size": 10}},
                    "bar": {"color": hhi_color, "thickness": 0.6},
                    "steps": [
                        {"range": [0, 0.15], "color": "rgba(63,185,80,0.15)"},
                        {"range": [0.15, 0.25], "color": "rgba(210,153,34,0.15)"},
                        {"range": [0.25, 1], "color": "rgba(248,81,73,0.15)"},
                    ],
                },
            ))
            fig_hhi.update_layout(**_CHART, height=200)
            st.plotly_chart(fig_hhi, use_container_width=True)
            # HHI legend
            st.caption("🟢 < 0.15 · 🟡 0.15-0.25 · 🔴 > 0.25")

        st.divider()

        # ── Performance bar ────────────────────────────────────────────────────
        st.subheader("Performance par ligne")
        df_perf = df.dropna(subset=["Perf (%)"]).sort_values("Perf (%)")
        if not df_perf.empty:
            fig_bar = go.Figure(go.Bar(
                x=df_perf["Perf (%)"],
                y=df_perf["Ticker"],
                orientation="h",
                marker_color=[_C_LOSS if v < 0 else _C_GAIN for v in df_perf["Perf (%)"]],
                text=[f"{v:+.2f}%" for v in df_perf["Perf (%)"]],
                textposition="outside",
            ))
            fig_bar.update_layout(**_CHART, height=max(200, len(df_perf) * 38),
                                  xaxis_title="Performance (%)")
            st.plotly_chart(fig_bar, use_container_width=True)

        st.divider()

        # ── Historical chart ───────────────────────────────────────────────────
        st.subheader("Évolution normalisée (base 100)")
        p_options = {"6 mois": "6mo", "1 an": "1y", "2 ans": "2y", "5 ans": "5y"}
        p_label = st.selectbox("Période", list(p_options.keys()), index=1, key="hist_p")
        tickers_tuple = tuple(df["Ticker"].tolist())
        with st.spinner("Chargement…"):
            df_hist = cached_history(tickers_tuple, p_options[p_label])
        if not df_hist.empty:
            fig_h = go.Figure()
            for col in df_hist.columns:
                fig_h.add_trace(go.Scatter(x=df_hist.index, y=df_hist[col],
                                           name=col, mode="lines", line=dict(width=2)))
            fig_h.add_hline(y=100, line_dash="dot", line_color="rgba(255,255,255,0.3)")
            fig_h.update_layout(**_CHART, height=360, hovermode="x unified",
                                yaxis_title="Base 100", xaxis_title="Date")
            st.plotly_chart(fig_h, use_container_width=True)
        else:
            st.caption("Historique indisponible pour certains tickers (codes broker non-standard).")

        st.divider()
        st.subheader("Détail des positions")
        st.dataframe(_fmt_df(df), width="stretch", hide_index=True)


# ══════════════════════════════════════════════════════════════════════════════
# TAB 2 — Gérer mes positions
# ══════════════════════════════════════════════════════════════════════════════

with tab_manage:
    # ── Import CSV ─────────────────────────────────────────────────────────────
    with st.expander("📥 Importer des transactions depuis un CSV", expanded=False):
        st.caption(
            "Format : export de ton courtier avec les colonnes `Date`, `Ticker`, `Type`, "
            "`Quantity`, `Price per share`. Seules les lignes **BUY** sont importées. Max 5 MB."
        )
        uploaded_csv = st.file_uploader("Sélectionne ton fichier CSV", type=["csv"], key="csv_upload")
        if uploaded_csv:
            if st.button("🚀 Importer", type="primary", key="do_import"):
                from backend.importer import import_csv
                raw_bytes = uploaded_csv.read()
                with st.spinner("Import en cours (résolution des noms…)"):
                    n_ok, n_skip, errs = import_csv(raw_bytes)
                if n_ok:
                    st.success(f"✅ {n_ok} achat(s) importé(s).")
                if n_skip:
                    st.info(f"⏭️ {n_skip} ligne(s) ignorée(s) (doublons / non-achat).")
                for e in errs:
                    st.warning(e)
                if n_ok:
                    st.rerun()

    st.divider()

    # ── Manual add ────────────────────────────────────────────────────────────
    st.subheader("Enregistrer un achat")
    st.caption("Tape un nom ou ticker — ex : *nvidia*, *amundi sp500*, *ishares cyber*")

    s_col, b_col = st.columns([5, 1])
    with s_col:
        query = st.text_input("Rechercher", placeholder="nvidia, amundi sp500, apple…",
                              label_visibility="collapsed")
    with b_col:
        do_search = st.button("🔍 Rechercher", use_container_width=True)

    if do_search and query.strip():
        # Security: sanitize query
        safe_query = query.strip()[:100]
        with st.spinner("Recherche…"):
            results = search_tickers(safe_query)
        if results:
            st.session_state.search_results = results
            st.session_state.prefill_ticker = ""
        else:
            st.error("Aucun résultat. Essaie un terme plus court (ex: NVDA, apple).")
            st.session_state.search_results = []

    if st.session_state.search_results:
        options = {
            f"{r['symbol']} — {r['name']} ({r['exchange']}, {r['type']})": r
            for r in st.session_state.search_results
        }
        chosen_label = st.selectbox("Sélectionne le bon titre :", list(options.keys()))
        chosen = options[chosen_label]
        if st.button("✅ Utiliser ce titre", type="primary"):
            with st.spinner("Vérification du cours actuel…"):
                info = verify_ticker(chosen["symbol"])
            st.session_state.prefill_ticker = chosen["symbol"]
            if info:
                st.session_state.prefill_name = info["name"]
                st.session_state.price_hint = info["price"]
                st.session_state.currency_hint = info["currency"]
            else:
                st.session_state.prefill_name = chosen["name"]
                st.session_state.price_hint = None
                st.session_state.currency_hint = ""
            st.session_state.search_results = []
            st.rerun()

    st.divider()

    if st.session_state.prefill_ticker:
        ticker_sel = st.session_state.prefill_ticker
        name_sel = st.session_state.prefill_name

        # Security: validate ticker before use
        if not _TICKER_RE.match(ticker_sel):
            st.error("Ticker invalide.")
            st.session_state.prefill_ticker = ""
        else:
            st.subheader(f"Achat : **{ticker_sel}** — {name_sel}")
            if st.session_state.price_hint:
                st.info(f"Cours actuel : **{st.session_state.price_hint:.2f} {st.session_state.currency_hint}**")

            with st.form("tx_form", clear_on_submit=True):
                c1, c2, c3, c4 = st.columns([2, 2, 2, 2])
                with c1:
                    tx_date = st.date_input("Date d'achat", value=_date.today())
                with c2:
                    qty = st.number_input("Nombre d'actions", min_value=0.000001,
                                          step=1.0, format="%.6f")
                with c3:
                    price = st.number_input("Prix payé / action", min_value=0.0001,
                                            step=0.01, format="%.4f")
                with c4:
                    fees = st.number_input("Frais courtage (€)", min_value=0.0,
                                           step=0.01, format="%.2f", value=0.0)
                if qty > 0:
                    computed_pru = (qty * price + fees) / qty
                    st.caption(f"PRU calculé : **{computed_pru:.4f}** (frais inclus)")
                save_btn = st.form_submit_button("💾 Enregistrer cet achat",
                                                 type="primary", use_container_width=True)

            if save_btn:
                if qty <= 0 or price <= 0:
                    st.error("Quantité et prix doivent être > 0.")
                else:
                    try:
                        add_transaction(ticker_sel, name_sel, tx_date.isoformat(),
                                        qty, price, fees)
                        st.success(f"✅ **{qty:.4f} × {ticker_sel}** enregistré — PRU mis à jour.")
                        for k in ("prefill_ticker", "prefill_name", "price_hint"):
                            st.session_state[k] = "" if k != "price_hint" else None
                        st.rerun()
                    except Exception as e:
                        st.error(f"Erreur : {e}")
    else:
        st.caption("⬆️ Recherche un titre ci-dessus pour l'ajouter.")

    st.divider()
    st.subheader("Mes positions")

    positions = get_positions()
    if not positions:
        st.info("Aucune position enregistrée.")
    else:
        for p in positions:
            txs = get_transactions(p["ticker"])
            total_qty = sum(t["quantity"] for t in txs)
            total_cost = sum(t["quantity"] * t["price"] + t["fees"] for t in txs)
            pru = p["avg_buy_price"]

            # Flag tickers without current price
            cur_price = prices.get(p["ticker"]) if (df is not None and 'prices' in dir()) else None
            price_warning = " ⚠️" if cur_price is None else ""

            with st.expander(
                f"**{p['ticker']}**{price_warning} — {p['name']} | "
                f"{total_qty:.4f} actions | PRU : **{pru:.4f}** | "
                f"Investi : **{total_cost:,.2f} €**"
            ):
                if cur_price is None:
                    st.caption(
                        "⚠️ Cours non disponible sur Yahoo Finance — ticker broker spécifique. "
                        "Le PRU et l'historique des achats sont corrects."
                    )

                st.markdown("**Historique des achats :**")
                hdr = st.columns([2, 2, 2, 2, 1])
                for col, lbl in zip(hdr, ["Date", "Quantité", "Prix/action", "Frais", ""]):
                    col.markdown(f"*{lbl}*")
                for t in txs:
                    tc1, tc2, tc3, tc4, tc5 = st.columns([2, 2, 2, 2, 1])
                    cur = t.get("currency", "EUR")
                    tc1.write(t["tx_date"])
                    tc2.write(f"{t['quantity']:.6f}")
                    tc3.write(f"{t['price']:.4f} {cur}")
                    tc4.write(f"{t['fees']:.2f} €" if t["fees"] else "—")
                    with tc5:
                        if st.button("🗑️", key=f"del_tx_{t['id']}"):
                            delete_transaction(t["id"])
                            st.rerun()

                st.markdown("---")
                if st.button(f"🗑️ Supprimer toute la position {p['ticker']}",
                             key=f"del_pos_{p['ticker']}"):
                    delete_position(p["ticker"])
                    st.rerun()


# ══════════════════════════════════════════════════════════════════════════════
# TAB 3 — Analyse IA
# ══════════════════════════════════════════════════════════════════════════════

with tab_ai:
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    groq_key = os.getenv("GROQ_API_KEY", "").strip()

    # ── API status ─────────────────────────────────────────────────────────────
    s1, s2, s3 = st.columns(3)
    s1.metric("Gemini 2.5 Pro", "✅ Configuré" if gemini_key else "❌ Clé manquante")
    s2.metric("Llama 3.3 70B (Groq)", "✅ Configuré" if groq_key else "❌ Clé manquante")
    s3.metric("Claude", "📋 Copy-paste manuel")

    if not gemini_key and not groq_key:
        st.warning("Ajoute tes clés API dans `.env` (voir `.env.example`).")

    st.divider()
    df_ai, _ = load_portfolio()

    if df_ai is None:
        st.info("Ajoute des positions dans **💼 Gérer mes positions** d'abord.")
    else:
        summary_ai = portfolio_summary(df_ai)
        hhi_ai = compute_hhi(df_ai)
        alerts_ai = compute_concentration_alerts(df_ai)
        prompt_text = build_analysis_prompt(df_ai, summary_ai, hhi_ai, alerts_ai)

        # ── Scoreboard ─────────────────────────────────────────────────────────
        all_suggestions = get_suggestions(limit=100)
        sb_df = compute_scoreboard(all_suggestions)

        st.subheader("🏆 Compétition IA")
        if sb_df.empty:
            st.caption("Lance une première analyse pour démarrer la compétition.")
        else:
            def _fmt_score(v):
                if v is None or (isinstance(v, float) and pd.isna(v)):
                    return "—"
                return f"{v:.1f}"
            sb_display = sb_df.copy()
            for col in ["Qualité analyse", "Discipline B&H"]:
                sb_display[col] = sb_display[col].map(lambda x: f"{x:.1f}/5" if pd.notna(x) else "—")
            sb_display["Score /10"] = sb_display["Score /10"].map(lambda x: f"{x:.1f}/10" if pd.notna(x) else "—")
            # Add rank
            sb_display.insert(0, "#", range(1, len(sb_display) + 1))
            st.dataframe(sb_display, width="stretch", hide_index=True)

        st.divider()

        # ── Investment plan ─────────────────────────────────────────────────────
        st.subheader("💡 Plan d'investissement personnalisé")

        gaps = compute_investment_gaps(df_ai)
        if gaps:
            priority_colors = {"high": "🔴", "medium": "🟡", "low": "🟢"}
            for g in gaps:
                icon = priority_colors.get(g["priority"], "•")
                st.markdown(f"{icon} **{g['title']}**  \n{g['action']}")
        else:
            st.success("Aucun écart majeur détecté — portefeuille bien structuré.")

        # Surface AI suggestions from latest analysis
        if all_suggestions:
            latest = all_suggestions[0]
            st.markdown(f"*Dernière analyse ({latest['model_name']}, {latest['created_at'][:10]}) :*")
            # Extract the "3 actions concrètes" section
            txt = latest["response_text"]
            if "ACTIONS CONCRÈTES" in txt or "Actions concrètes" in txt.lower():
                parts = txt.split("### 3")
                if len(parts) > 1:
                    actions_section = parts[1].split("---")[0].strip()
                    st.markdown(actions_section[:800] + ("…" if len(actions_section) > 800 else ""))
            st.caption("↓ Relance une analyse pour mettre à jour.")

        st.divider()

        # ── Launch analysis ────────────────────────────────────────────────────
        st.subheader("🧠 Lancer l'analyse")

        with st.expander("📄 Voir le prompt (identique pour les 3 IA)", expanded=False):
            st.code(prompt_text, language=None)

        la_col, _ = st.columns([2, 5])
        with la_col:
            launch = st.button(
                "🚀 Analyser (Gemini + Llama en parallèle)",
                type="primary", use_container_width=True,
                disabled=(not gemini_key and not groq_key),
            )

        if launch:
            with st.spinner("Gemini et Llama analysent en parallèle (~30-60 s)…"):
                results = run_analysis(prompt_text)
            for key, res in results.items():
                if not res.get("error") and res.get("text"):
                    save_suggestion(
                        model_name=res["model"],
                        prompt=prompt_text,
                        response_text=res["text"],
                        portfolio_snapshot=df_ai.to_dict(),
                        virtual_portfolio=res.get("virtual_portfolio"),
                        conviction_level=res.get("conviction_level"),
                    )
            st.session_state.last_analysis = results
            st.rerun()

        # ── Results ────────────────────────────────────────────────────────────
        if st.session_state.last_analysis:
            results = st.session_state.last_analysis
            st.subheader("Résultats")
            col_g, col_l = st.columns(2)
            for col, key, icon in [(col_g, "gemini", "🔵"), (col_l, "groq", "🟣")]:
                res = results.get(key, {})
                with col:
                    if res.get("error"):
                        # Security: don't expose raw API error (may contain key info)
                        st.error(f"{icon} **{key.capitalize()}** — Erreur lors de l'appel API. Vérifie ta clé dans `.env`.")
                    else:
                        st.markdown(f"### {icon} {res.get('model', key)}")
                        if res.get("virtual_portfolio"):
                            with st.expander("💼 Portefeuille virtuel 10 000 €", expanded=True):
                                _render_virtual_portfolio(res["virtual_portfolio"])
                        with st.expander("📝 Analyse complète", expanded=False):
                            st.markdown(res.get("text", ""))

        st.divider()

        # ── Claude copy-paste ──────────────────────────────────────────────────
        st.subheader("📋 Claude — 3ème voix (manuel)")
        st.caption("Copie ce prompt dans claude.ai — prompt identique à Gemini et Llama.")
        st.text_area("Prompt", prompt_text, height=180, key="claude_area")

        st.divider()

        # ── History ────────────────────────────────────────────────────────────
        st.subheader("📜 Historique des analyses")
        suggestions = get_suggestions(limit=50)

        if not suggestions:
            st.info("Aucune analyse enregistrée.")
        else:
            for s in suggestions:
                dt = s["created_at"][:16].replace("T", " ")
                conv = (s.get("conviction_level") or "?").upper()
                a_sc = s.get("analysis_score")
                d_sc = s.get("discipline_score")
                score_str = f" · Analyse {a_sc:.1f}/5 · Discipline {d_sc:.1f}/5" if a_sc else ""
                vp_data = json.loads(s["virtual_portfolio"]) if s.get("virtual_portfolio") else None

                with st.expander(f"**{s['model_name']}** — {dt} — {conv}{score_str}"):
                    if vp_data:
                        st.markdown("**Portefeuille virtuel suggéré :**")
                        _render_virtual_portfolio(vp_data)
                    with st.expander("Analyse complète", expanded=False):
                        st.markdown(s["response_text"])

                    st.markdown("---")
                    st.markdown("**Scoring :**")
                    sc1, sc2, sc3 = st.columns(3)
                    with sc1:
                        new_a = st.slider("Qualité analyse", 1.0, 5.0,
                                          value=float(a_sc) if a_sc else 3.0,
                                          step=0.5, key=f"a_{s['id']}")
                    with sc2:
                        new_d = st.slider("Discipline B&H", 1.0, 5.0,
                                          value=float(d_sc) if d_sc else 3.0,
                                          step=0.5, key=f"d_{s['id']}")
                    with sc3:
                        new_notes = st.text_input("Notes", value=s.get("notes") or "",
                                                  key=f"n_{s['id']}")
                    if st.button("💾 Enregistrer le score", key=f"save_{s['id']}"):
                        update_suggestion_scores(s["id"], new_a, new_d, new_notes)
                        st.success("Score enregistré.")
                        st.rerun()
