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
    compute_ai_top_picks,
)
from backend.analyzers.prompt import build_analysis_prompt
from backend.analyzers.runner import run_analysis

# ── Config ─────────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="STOCK_TERMINAL",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="collapsed",
)

init_db()

# ── Design system ───────────────────────────────────────────────────────────────
_C_GAIN    = "#10b981"   # emerald-500
_C_LOSS    = "#f87171"   # red-400
_C_WARN    = "#f59e0b"   # amber-500
_C_ACCENT  = "#ffb95f"   # secondary amber
_C_PRIMARY = "#4edea3"   # primary-fixed
_BG        = "#121212"
_SURFACE   = "#1a1a1a"
_BORDER    = "#2d2d2d"
_TEXT      = "#e1e2e8"
_MUTED     = "#94a3b8"

_CHART = dict(
    template="plotly_dark",
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(18,18,18,0)",
    margin=dict(l=0, r=0, t=28, b=0),
    font=dict(family="Space Grotesk, system-ui, sans-serif", size=12, color=_TEXT),
)
_PALETTE = [_C_GAIN, _C_ACCENT, "#60a5fa", "#c084fc", "#fb923c",
            "#34d399", "#fbbf24", "#a78bfa", "#f472b6", "#38bdf8"]

_TICKER_RE = re.compile(r"^[A-Z0-9.\-]{1,20}$")

# ── CSS injection ───────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;900&display=swap');

/* ── Font (scoped to app content only, not icon fonts) ── */
[data-testid="stAppViewContainer"] { font-family: 'Space Grotesk', sans-serif; }

/* ── Backgrounds ── */
[data-testid="stAppViewContainer"],
[data-testid="stAppViewContainer"] > .main,
.main { background-color: #121212 !important; }

[data-testid="stHeader"] {
    background-color: #1a1a1a !important;
    border-bottom: 1px solid #2d2d2d !important;
}
[data-testid="stToolbar"] { display: none; }

section[data-testid="stSidebar"] {
    background-color: #1a1a1a !important;
    border-right: 1px solid #2d2d2d !important;
}

.main .block-container {
    padding-top: 1.5rem !important;
    padding-bottom: 2rem !important;
    max-width: 1400px !important;
}

/* ── Streamlit content headings ── */
.stHeading h1 { color: #10b981 !important; font-family: 'Space Grotesk', sans-serif !important; font-size: 18px !important; }
.stHeading h2 { color: #94a3b8 !important; font-family: 'Space Grotesk', sans-serif !important; font-size: 15px !important; }
.stHeading h3 { color: #e1e2e8 !important; font-family: 'Space Grotesk', sans-serif !important; font-size: 13px !important; font-weight: 700 !important; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #2d2d2d; padding-bottom: 0.4rem; margin-bottom: 0.75rem; }

/* ── KPI / Metric cards ── */
[data-testid="metric-container"] {
    background-color: #1a1a1a !important;
    border: 1px solid #2d2d2d !important;
    border-radius: 0px !important;
    padding: 1.2rem 1.4rem !important;
    position: relative;
    overflow: hidden;
}
[data-testid="metric-container"]::before {
    content: '';
    position: absolute;
    top: 0; left: 0;
    width: 3px; height: 100%;
    background-color: #10b981;
}
[data-testid="stMetricLabel"] > div {
    font-size: 11px !important;
    text-transform: uppercase !important;
    letter-spacing: 0.07em !important;
    color: #94a3b8 !important;
    font-weight: 600 !important;
    white-space: normal !important;
    line-height: 1.4 !important;
    margin-bottom: 4px !important;
}
[data-testid="stMetricValue"] {
    font-size: 26px !important;
    font-weight: 700 !important;
    color: #e1e2e8 !important;
    line-height: 1.1 !important;
    letter-spacing: -0.01em !important;
}
[data-testid="stMetricDelta"] {
    font-size: 13px !important;
    font-weight: 600 !important;
}

/* ── Tabs ── */
.stTabs [data-baseweb="tab-list"] {
    gap: 0px !important;
    border-bottom: 1px solid #2d2d2d !important;
    background-color: transparent !important;
    padding-bottom: 0 !important;
}
.stTabs [data-baseweb="tab"] {
    padding: 0.75rem 1.4rem !important;
    border-radius: 0px !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.07em !important;
    color: #94a3b8 !important;
    border-bottom: 2px solid transparent !important;
    background-color: transparent !important;
    margin-bottom: -1px;
    white-space: nowrap !important;
}
.stTabs [aria-selected="true"] {
    color: #10b981 !important;
    border-bottom: 2px solid #10b981 !important;
    background-color: transparent !important;
}
.stTabs [data-baseweb="tab"]:hover { color: #e1e2e8 !important; }

/* ── Buttons ── */
.stButton > button {
    border-radius: 0px !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.06em !important;
    transition: all 0.15s ease !important;
    white-space: nowrap !important;
}
.stButton > button[kind="primary"] {
    background-color: #10b981 !important;
    color: #000000 !important;
    border: none !important;
}
.stButton > button[kind="primary"]:hover { background-color: #4edea3 !important; }
.stButton > button:not([kind="primary"]) {
    background-color: transparent !important;
    color: #e1e2e8 !important;
    border: 1px solid #2d2d2d !important;
}
.stButton > button:not([kind="primary"]):hover {
    border-color: #10b981 !important;
    color: #10b981 !important;
    background-color: rgba(16,185,129,0.05) !important;
}

/* ── Dividers ── */
hr { border-color: #2d2d2d !important; margin: 1.25rem 0 !important; }

/* ── Expanders ── */
[data-testid="stExpander"] {
    background-color: #1a1a1a !important;
    border: 1px solid #2d2d2d !important;
    border-radius: 0px !important;
}
[data-testid="stExpander"] details summary {
    font-size: 11px !important;
    font-weight: 600 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.06em !important;
    color: #94a3b8 !important;
    padding: 0.75rem 1rem !important;
    line-height: 1.4 !important;
}
[data-testid="stExpander"] details summary:hover { color: #10b981 !important; }
[data-testid="stExpander"] details[open] summary { color: #10b981 !important; }

/* ── Inputs ── */
.stTextInput input,
.stNumberInput input,
.stTextArea textarea {
    background-color: #1a1a1a !important;
    border: 1px solid #2d2d2d !important;
    border-radius: 0px !important;
    color: #e1e2e8 !important;
    font-size: 13px !important;
}
.stTextInput input:focus,
.stNumberInput input:focus,
.stTextArea textarea:focus {
    border-color: #10b981 !important;
    box-shadow: none !important;
    outline: none !important;
}

/* Input labels — scoped to specific Streamlit widget wrappers */
.stTextInput label,
.stNumberInput label,
.stTextArea label,
.stSelectbox label,
.stDateInput label,
.stSlider label,
.stFileUploader label {
    font-size: 11px !important;
    color: #94a3b8 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
    font-weight: 500 !important;
    margin-bottom: 4px !important;
}

/* ── Selectbox ── */
[data-baseweb="select"] > div:first-child {
    background-color: #1a1a1a !important;
    border: 1px solid #2d2d2d !important;
    border-radius: 0px !important;
    color: #e1e2e8 !important;
}
[data-baseweb="select"] > div:first-child:focus-within { border-color: #10b981 !important; }
[data-baseweb="popover"] { background-color: #1a1a1a !important; border: 1px solid #2d2d2d !important; }
[role="option"] { background-color: #1a1a1a !important; color: #e1e2e8 !important; }
[role="option"]:hover { background-color: #252525 !important; color: #10b981 !important; }

/* ── Date input ── */
.stDateInput input {
    background-color: #1a1a1a !important;
    border: 1px solid #2d2d2d !important;
    border-radius: 0px !important;
    color: #e1e2e8 !important;
}

/* ── Forms ── */
[data-testid="stForm"] {
    background-color: #1a1a1a !important;
    border: 1px solid #2d2d2d !important;
    border-radius: 0px !important;
    padding: 1.25rem !important;
}
[data-testid="stFormSubmitButton"] button {
    border-radius: 0px !important;
    background-color: #10b981 !important;
    color: #000 !important;
    border: none !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.06em !important;
}

/* ── Alerts ── */
[data-testid="stAlert"] { border-radius: 0px !important; border-left-width: 3px !important; }

/* ── DataFrames ── */
[data-testid="stDataFrame"] {
    border: 1px solid #2d2d2d !important;
    border-radius: 0px !important;
    background-color: #1a1a1a !important;
}

/* ── File uploader ── */
[data-testid="stFileUploader"] {
    background-color: #1a1a1a !important;
    border: 1px dashed #2d2d2d !important;
    border-radius: 0px !important;
}
[data-testid="stFileUploaderDropzone"] {
    background-color: #1a1a1a !important;
    border-color: #2d2d2d !important;
}

/* ── Captions ── */
[data-testid="stCaptionContainer"] p,
.stCaption p { color: #94a3b8 !important; font-size: 12px !important; }

/* ── Spinner ── */
[data-testid="stSpinner"] > div { border-top-color: #10b981 !important; }

/* ── Slider ── */
[data-baseweb="slider"] [role="slider"] { background-color: #10b981 !important; }

/* ── Custom components ── */
.term-panel {
    background-color: #1a1a1a;
    border: 1px solid #2d2d2d;
    padding: 1.25rem 1.5rem;
    margin-bottom: 1rem;
}
.term-panel-header {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #10b981;
    font-weight: 700;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #2d2d2d;
}
.model-card {
    background-color: #1a1a1a;
    border: 1px solid #2d2d2d;
    padding: 1.25rem;
    height: 100%;
    position: relative;
}
.model-card-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 700;
    margin-bottom: 5px;
}
.model-card-title {
    font-size: 17px;
    font-weight: 700;
    color: #e1e2e8;
    margin-bottom: 1rem;
    letter-spacing: -0.01em;
    line-height: 1.2;
}
.model-badge {
    display: inline-block;
    padding: 3px 8px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border: 1px solid;
}
.model-badge.active { background: rgba(16,185,129,0.1); border-color: #10b981; color: #10b981; }
.model-badge.standby { background: transparent; border-color: #2d2d2d; color: #94a3b8; }
.model-badge.evaluating { background: rgba(192,132,252,0.1); border-color: #c084fc; color: #c084fc; }
.metric-row { margin-bottom: 0.65rem; }
.metric-row-label {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    margin-bottom: 4px;
    color: #94a3b8;
}
.metric-row-label span:last-child { font-weight: 700; color: #e1e2e8; }
.progress-track { height: 3px; background-color: #2d2d2d; }
.progress-fill { height: 100%; }
.model-desc {
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.6;
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid #2d2d2d;
}
.gap-card {
    background-color: #1a1a1a;
    border: 1px solid #2d2d2d;
    border-left: 3px solid;
    padding: 1.1rem 1.4rem;
    margin-bottom: 0.75rem;
}
.gap-card.high { border-left-color: #f87171; }
.gap-card.medium { border-left-color: #f59e0b; }
.gap-card.low { border-left-color: #10b981; }
.gap-title { font-size: 14px; font-weight: 700; color: #e1e2e8; margin-bottom: 6px; line-height: 1.3; }
.gap-action { font-size: 13px; color: #94a3b8; line-height: 1.6; }
.hhi-panel {
    background-color: #1a1a1a;
    border: 1px solid #2d2d2d;
    padding: 1.25rem 1.4rem;
    height: 100%;
}
.hhi-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; font-weight: 600; margin-bottom: 12px; }
.hhi-value { font-size: 42px; font-weight: 900; letter-spacing: -0.03em; line-height: 1; margin-bottom: 6px; }
.hhi-status { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 16px; }
.hhi-bar-wrap { position: relative; height: 6px; background: #2d2d2d; margin-bottom: 8px; }
.hhi-bar-fill { position: absolute; top: 0; left: 0; height: 100%; }
.hhi-zones { display: flex; justify-content: space-between; font-size: 10px; letter-spacing: 0.04em; }
.api-status {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0.65rem 0;
    border-bottom: 1px solid #2d2d2d;
}
.api-status:last-child { border-bottom: none; }
.status-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.status-dot.ok { background-color: #10b981; }
.status-dot.err { background-color: #f87171; }
.status-dot.manual { background-color: #f59e0b; }
.status-name { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #e1e2e8; }
.status-label { font-size: 12px; color: #94a3b8; margin-left: auto; }
</style>
""", unsafe_allow_html=True)

# ── Session state ───────────────────────────────────────────────────────────────
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

# ── Helpers ─────────────────────────────────────────────────────────────────────

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
            return f"color:{_C_LOSS}"
        if v > 0:
            return f"color:{_C_GAIN}"
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
        st.caption("Risques : " + " · ".join(vp["key_risks"]))


def _model_card_html(
    label: str,
    title: str,
    badge: str,
    badge_class: str,
    label_color: str,
    score: float | None,
    quality: float | None,
    discipline: float | None,
    desc: str,
    bar_color: str,
) -> str:
    def score_bar(label_txt, val, max_val, color):
        if val is None:
            return ""
        pct = min(100, val / max_val * 100)
        return f"""
        <div class="metric-row">
            <div class="metric-row-label">
                <span>{label_txt}</span>
                <span style="color:{color};font-weight:700;">{val:.1f}/{max_val:.0f}</span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width:{pct:.0f}%;background-color:{color};"></div>
            </div>
        </div>"""

    score_html = score_bar("Score global", score, 10, bar_color)
    quality_html = score_bar("Qualité analyse", quality, 5, bar_color)
    disc_html = score_bar("Discipline B&amp;H", discipline, 5, _C_ACCENT)
    no_scores = not any([score_html, quality_html, disc_html])
    if no_scores:
        score_html = "<div style='font-size:11px;color:#94a3b8;margin:0.75rem 0;'>En attente de scoring…</div>"

    return f"""
    <div class="model-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem;">
            <div>
                <div class="model-card-label" style="color:{label_color};">{label}</div>
                <div class="model-card-title">{title}</div>
            </div>
            <span class="model-badge {badge_class}">{badge}</span>
        </div>
        {score_html}
        {quality_html}
        {disc_html}
        <div class="model-desc">{desc}</div>
    </div>"""


# ── AI helper functions ─────────────────────────────────────────────────────────

def _parse_vp_from_text(text: str) -> dict | None:
    m = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except Exception:
        return None


def _extract_actions(text: str) -> str:
    """Extrait la section '3 ACTIONS CONCRÈTES' d'une réponse IA."""
    for marker in ["### 3", "## 3", "**3.", "3."]:
        if marker in text:
            parts = text.split(marker, 1)
            if len(parts) > 1:
                section = parts[1].split("---")[0].split("###")[0].strip()
                return section[:1200]
    return ""


def _get_latest_per_model(suggestions: list[dict]) -> dict[str, dict]:
    """Retourne la dernière suggestion de chaque modèle."""
    seen: dict[str, dict] = {}
    for s in suggestions:
        key = s["model_name"].lower().split()[0]
        if key not in seen:
            seen[key] = s
    return seen


def _build_vp_consensus(per_model: dict[str, dict]) -> pd.DataFrame:
    """Fusionne les VP de tous les modèles — moyenne des allocations par ticker."""
    rows: dict[str, dict] = {}
    model_count = 0
    for s in per_model.values():
        vp_raw = s.get("virtual_portfolio")
        if not vp_raw:
            continue
        vp = json.loads(vp_raw) if isinstance(vp_raw, str) else vp_raw
        items = vp.get("virtual_portfolio", []) if isinstance(vp, dict) else []
        if not items:
            continue
        model_count += 1
        for item in items:
            ticker = str(item.get("ticker", "")).upper()
            if not ticker:
                continue
            if ticker not in rows:
                rows[ticker] = {"ticker": ticker, "name": item.get("name", ticker),
                                "total_pct": 0.0, "count": 0}
            rows[ticker]["total_pct"] += float(item.get("pct", 0))
            rows[ticker]["count"] += 1
    if not rows or model_count == 0:
        return pd.DataFrame()
    result = []
    for r in rows.values():
        avg_pct = r["total_pct"] / model_count
        consensus = r["count"] / model_count
        result.append({
            "Ticker": r["ticker"],
            "Titre": r["name"],
            "Poids moyen (%)": round(avg_pct, 1),
            "Consensus": f"{r['count']}/{model_count}",
            "Force": "★★★" if consensus == 1.0 else "★★" if consensus >= 0.5 else "★",
        })
    df = pd.DataFrame(result).sort_values("Poids moyen (%)", ascending=False)
    return df.reset_index(drop=True)


# ── Brand Header ────────────────────────────────────────────────────────────────
col_brand, col_refresh = st.columns([8, 2])
with col_brand:
    st.markdown("""
    <div style="padding:0.5rem 0 1rem;">
        <div style="font-size:22px;font-weight:900;color:#10b981;letter-spacing:-0.02em;text-transform:uppercase;line-height:1;">STOCK_TERMINAL</div>
        <div style="font-size:10px;color:#94a3b8;letter-spacing:0.1em;margin-top:2px;">V.2.0.0 — PERSONAL PORTFOLIO ENGINE</div>
    </div>
    """, unsafe_allow_html=True)
with col_refresh:
    st.write("")
    st.write("")
    if st.button("↻ ACTUALISER", use_container_width=True):
        st.cache_data.clear()
        st.rerun()

tab_overview, tab_manage, tab_ai = st.tabs(
    ["▣  Vue d'ensemble", "◈  Gérer mes positions", "◎  Analyse IA"]
)


# ══════════════════════════════════════════════════════════════════════════════
# TAB 1 — Vue d'ensemble
# ══════════════════════════════════════════════════════════════════════════════

with tab_overview:
    df, prices = load_portfolio()

    if df is None:
        st.info("Aucune position. Rendez-vous dans **Gérer mes positions** pour commencer.")
    else:
        summary = portfolio_summary(df)
        hhi = compute_hhi(df)
        alerts = compute_concentration_alerts(df)

        # ── KPIs ──────────────────────────────────────────────────────────────
        k1, k2, k3, k4 = st.columns(4)
        k1.metric("Capital investi", f"{summary['total_invested']:,.0f} €")
        k2.metric("Valeur actuelle", f"{summary['total_value']:,.0f} €")
        k3.metric(
            "Gain / Perte",
            f"{summary['total_gain']:+,.0f} €",
            delta=f"{summary['total_gain_pct']:+.2f}%",
        )
        k4.metric("Positions", len(df))

        # ── Alerts ────────────────────────────────────────────────────────────
        if alerts:
            for level, msg in alerts:
                (st.error if level == "error" else st.warning)(msg)

        st.divider()

        # ── Row 1 : allocation + secteurs + HHI ───────────────────────────────
        c1, c2, c3 = st.columns([2.5, 2.5, 1.5])

        df_v = df.dropna(subset=["Valeur (€)"])

        with c1:
            st.subheader("Répartition par valeur")
            if not df_v.empty:
                total_v = df_v["Valeur (€)"].sum()
                df_bar = df_v.assign(pct=df_v["Valeur (€)"] / total_v * 100).sort_values("pct", ascending=True)
                fig = go.Figure(go.Bar(
                    x=df_bar["pct"],
                    y=df_bar["Ticker"],
                    orientation="h",
                    marker=dict(
                        color=[_PALETTE[i % len(_PALETTE)] for i in range(len(df_bar))],
                        line=dict(width=0),
                    ),
                    text=[f"{p:.1f}%" for p in df_bar["pct"]],
                    textposition="outside",
                    textfont=dict(size=11, color=_TEXT),
                    hovertemplate="%{y}: %{x:.1f}%<extra></extra>",
                ))
                fig.update_layout(
                    **_CHART, height=max(220, len(df_bar) * 34),
                    xaxis=dict(showgrid=False, showticklabels=False, range=[0, df_bar["pct"].max() * 1.25]),
                    yaxis=dict(showgrid=False, tickfont=dict(size=12)),
                    bargap=0.3,
                )
                st.plotly_chart(fig, use_container_width=True)

        with c2:
            st.subheader("Répartition par secteur")
            df_sec = compute_sector_allocation(df_v) if not df_v.empty else pd.DataFrame()
            if not df_sec.empty:
                total_s = df_sec["Valeur (€)"].sum()
                df_sec = df_sec.assign(pct=df_sec["Valeur (€)"] / total_s * 100).sort_values("pct", ascending=True)
                fig2 = go.Figure(go.Bar(
                    x=df_sec["pct"],
                    y=df_sec["Secteur"],
                    orientation="h",
                    marker=dict(
                        color=[_PALETTE[i % len(_PALETTE)] for i in range(len(df_sec))],
                        line=dict(width=0),
                    ),
                    text=[f"{p:.1f}%" for p in df_sec["pct"]],
                    textposition="outside",
                    textfont=dict(size=11, color=_TEXT),
                    hovertemplate="%{y}: %{x:.1f}%<extra></extra>",
                ))
                fig2.update_layout(
                    **_CHART, height=max(220, len(df_sec) * 38),
                    xaxis=dict(showgrid=False, showticklabels=False, range=[0, df_sec["pct"].max() * 1.3]),
                    yaxis=dict(showgrid=False, tickfont=dict(size=11)),
                    bargap=0.3,
                )
                st.plotly_chart(fig2, use_container_width=True)

        with c3:
            hhi_color = _C_LOSS if hhi > 0.25 else _C_WARN if hhi > 0.15 else _C_GAIN
            hhi_status = "Concentré" if hhi > 0.25 else "Modéré" if hhi > 0.15 else "Bien diversifié"
            hhi_pct = min(100, hhi * 100)
            st.markdown(f"""
            <div class="hhi-panel">
                <div class="hhi-label">Concentration HHI</div>
                <div class="hhi-value" style="color:{hhi_color};">{hhi:.3f}</div>
                <div class="hhi-status" style="color:{hhi_color};">{hhi_status}</div>
                <div class="hhi-bar-wrap">
                    <div class="hhi-bar-fill" style="width:{hhi_pct:.1f}%;background:{hhi_color};"></div>
                </div>
                <div class="hhi-zones">
                    <span style="color:{_C_GAIN};">0.00</span>
                    <span style="color:{_C_WARN};">0.15</span>
                    <span style="color:{_C_LOSS};">0.25+</span>
                </div>
                <div style="margin-top:1.25rem;border-top:1px solid #2d2d2d;padding-top:0.75rem;">
                    <div style="font-size:11px;color:#94a3b8;line-height:1.8;">
                        <div><span style="color:{_C_GAIN};">■</span> &lt; 0.15 — Bien diversifié</div>
                        <div><span style="color:{_C_WARN};">■</span> 0.15–0.25 — Concentration modérée</div>
                        <div><span style="color:{_C_LOSS};">■</span> &gt; 0.25 — Très concentré</div>
                    </div>
                </div>
            </div>
            """, unsafe_allow_html=True)

        st.divider()

        # ── Performance bar ────────────────────────────────────────────────────
        st.subheader("Performance par position")
        df_perf = df.dropna(subset=["Perf (%)"]).sort_values("Perf (%)")
        if not df_perf.empty:
            fig_bar = go.Figure(go.Bar(
                x=df_perf["Perf (%)"],
                y=df_perf["Ticker"],
                orientation="h",
                marker_color=[_C_LOSS if v < 0 else _C_GAIN for v in df_perf["Perf (%)"]],
                text=[f"{v:+.2f}%" for v in df_perf["Perf (%)"]],
                textposition="outside",
                textfont=dict(size=11, color=_TEXT),
            ))
            fig_bar.update_layout(
                **_CHART,
                height=max(200, len(df_perf) * 40),
                xaxis_title="Performance (%)",
                xaxis=dict(gridcolor=_BORDER, zerolinecolor=_BORDER),
                yaxis=dict(gridcolor="rgba(0,0,0,0)"),
                bargap=0.35,
            )
            st.plotly_chart(fig_bar, use_container_width=True)

        st.divider()

        # ── Historical chart ───────────────────────────────────────────────────
        st.subheader("Évolution normalisée — base 100")
        p_options = {"6 mois": "6mo", "1 an": "1y", "2 ans": "2y", "5 ans": "5y"}
        p_label = st.selectbox("Période", list(p_options.keys()), index=1, key="hist_p")
        tickers_tuple = tuple(df["Ticker"].tolist())
        with st.spinner("Chargement…"):
            df_hist = cached_history(tickers_tuple, p_options[p_label])
        if not df_hist.empty:
            fig_h = go.Figure()
            for i, col in enumerate(df_hist.columns):
                fig_h.add_trace(go.Scatter(
                    x=df_hist.index, y=df_hist[col], name=col, mode="lines",
                    line=dict(width=2, color=_PALETTE[i % len(_PALETTE)]),
                ))
            fig_h.add_hline(y=100, line_dash="dot", line_color=_BORDER, line_width=1)
            fig_h.update_layout(
                **_CHART, height=360, hovermode="x unified",
                yaxis_title="Base 100",
                xaxis=dict(gridcolor=_BORDER),
                yaxis=dict(gridcolor=_BORDER),
                legend=dict(
                    bgcolor="rgba(26,26,26,0.9)", bordercolor=_BORDER, borderwidth=1,
                    font=dict(size=11),
                ),
            )
            st.plotly_chart(fig_h, use_container_width=True)
        else:
            st.caption("Historique indisponible — certains tickers sont des codes broker non-standard.")

        st.divider()
        st.subheader("Détail des positions")
        st.dataframe(_fmt_df(df), width="stretch", hide_index=True)


# ══════════════════════════════════════════════════════════════════════════════
# TAB 2 — Gérer mes positions
# ══════════════════════════════════════════════════════════════════════════════

with tab_manage:

    with st.expander("↧ Importer depuis un CSV (Trading 212 / courtier)", expanded=False):
        st.caption(
            "Colonnes requises : `Date`, `Ticker`, `Type`, `Quantity`, `Price per share`. "
            "Seules les lignes **BUY** sont importées. Taille max : 5 MB."
        )
        uploaded_csv = st.file_uploader("Sélectionne ton fichier CSV", type=["csv"], key="csv_upload")
        if uploaded_csv:
            if st.button("Importer", type="primary", key="do_import"):
                from backend.importer import import_csv
                raw_bytes = uploaded_csv.read()
                with st.spinner("Import en cours (résolution des noms…)"):
                    n_ok, n_skip, errs = import_csv(raw_bytes)
                if n_ok:
                    st.success(f"{n_ok} achat(s) importé(s).")
                if n_skip:
                    st.info(f"{n_skip} ligne(s) ignorée(s) (doublons / non-achat).")
                for e in errs:
                    st.warning(e)
                if n_ok:
                    st.rerun()

    st.divider()

    st.subheader("Enregistrer un achat")
    st.caption("Recherche par nom ou ticker — ex : nvidia, amundi sp500, ishares cyber")

    s_col, b_col = st.columns([5, 1])
    with s_col:
        query = st.text_input("Rechercher", placeholder="nvidia, amundi sp500, apple…",
                              label_visibility="collapsed")
    with b_col:
        do_search = st.button("Rechercher", use_container_width=True)

    if do_search and query.strip():
        safe_query = query.strip()[:100]
        with st.spinner("Recherche…"):
            results = search_tickers(safe_query)
        if results:
            st.session_state.search_results = results
            st.session_state.prefill_ticker = ""
        else:
            st.error("Aucun résultat. Essaie un terme plus court (ex : NVDA, apple).")
            st.session_state.search_results = []

    if st.session_state.search_results:
        options = {
            f"{r['symbol']} — {r['name']} ({r['exchange']}, {r['type']})": r
            for r in st.session_state.search_results
        }
        chosen_label = st.selectbox("Sélectionne le bon titre :", list(options.keys()))
        chosen = options[chosen_label]
        if st.button("Utiliser ce titre", type="primary"):
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

        if not _TICKER_RE.match(ticker_sel):
            st.error("Ticker invalide.")
            st.session_state.prefill_ticker = ""
        else:
            st.markdown(
                f"<div style='font-size:13px;font-weight:700;color:#e1e2e8;margin-bottom:4px;'>"
                f"<span style='color:#10b981;'>{ticker_sel}</span> — {name_sel}</div>",
                unsafe_allow_html=True,
            )
            if st.session_state.price_hint:
                st.markdown(
                    f"<div style='font-size:11px;color:#94a3b8;margin-bottom:1rem;'>"
                    f"Cours actuel : <span style='color:#10b981;font-weight:700;'>"
                    f"{st.session_state.price_hint:.2f} {st.session_state.currency_hint}</span></div>",
                    unsafe_allow_html=True,
                )

            with st.form("tx_form", clear_on_submit=True):
                c1, c2, c3, c4 = st.columns([2, 2, 2, 2])
                with c1:
                    tx_date = st.date_input("Date d'achat", value=_date.today())
                with c2:
                    qty = st.number_input("Nb d'actions", min_value=0.000001,
                                          step=1.0, format="%.6f")
                with c3:
                    price = st.number_input("Prix / action", min_value=0.0001,
                                            step=0.01, format="%.4f")
                with c4:
                    fees = st.number_input("Frais (€)", min_value=0.0,
                                           step=0.01, format="%.2f", value=0.0)
                if qty > 0:
                    computed_pru = (qty * price + fees) / qty
                    st.caption(f"PRU calculé : {computed_pru:.4f} (frais inclus)")
                save_btn = st.form_submit_button("Enregistrer cet achat",
                                                 type="primary", use_container_width=True)

            if save_btn:
                if qty <= 0 or price <= 0:
                    st.error("Quantité et prix doivent être > 0.")
                else:
                    try:
                        add_transaction(ticker_sel, name_sel, tx_date.isoformat(),
                                        qty, price, fees)
                        st.success(f"{qty:.4f} × {ticker_sel} enregistré — PRU mis à jour.")
                        for k in ("prefill_ticker", "prefill_name", "price_hint"):
                            st.session_state[k] = "" if k != "price_hint" else None
                        st.rerun()
                    except Exception as e:
                        st.error(f"Erreur : {e}")
    else:
        st.caption("Recherche un titre ci-dessus pour l'ajouter.")

    st.divider()
    st.subheader("Mes positions")

    positions = get_positions()
    if not positions:
        st.info("Aucune position enregistrée.")
    else:
        _, prices_manage = load_portfolio()
        for p in positions:
            txs = get_transactions(p["ticker"])
            total_qty = sum(t["quantity"] for t in txs)
            total_cost = sum(t["quantity"] * t["price"] + t["fees"] for t in txs)
            pru = p["avg_buy_price"]
            cur_price = prices_manage.get(p["ticker"])
            price_flag = " ⚠" if cur_price is None else ""

            with st.expander(
                f"{p['ticker']}{price_flag}  ·  {p['name']}  ·  "
                f"{total_qty:.4f} actions  ·  PRU {pru:.4f}  ·  {total_cost:,.2f} €"
            ):
                if cur_price is None:
                    st.caption(
                        "Cours non disponible sur Yahoo Finance — ticker broker spécifique. "
                        "PRU et historique sont corrects."
                    )

                st.caption("Historique des achats")
                hdr = st.columns([2, 2, 2, 2, 1])
                for col, lbl in zip(hdr, ["Date", "Quantité", "Prix/action", "Frais", ""]):
                    col.markdown(f"<span style='font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;'>{lbl}</span>", unsafe_allow_html=True)
                for t in txs:
                    tc1, tc2, tc3, tc4, tc5 = st.columns([2, 2, 2, 2, 1])
                    cur = t.get("currency", "EUR")
                    tc1.write(t["tx_date"])
                    tc2.write(f"{t['quantity']:.6f}")
                    tc3.write(f"{t['price']:.4f} {cur}")
                    tc4.write(f"{t['fees']:.2f} €" if t["fees"] else "—")
                    with tc5:
                        if st.button("✕", key=f"del_tx_{t['id']}"):
                            delete_transaction(t["id"])
                            st.rerun()

                st.markdown("---")
                if st.button(f"Supprimer la position {p['ticker']}",
                             key=f"del_pos_{p['ticker']}"):
                    delete_position(p["ticker"])
                    st.rerun()


# ══════════════════════════════════════════════════════════════════════════════
# TAB 3 — Analyse IA
# ══════════════════════════════════════════════════════════════════════════════

_MODEL_CFG = {
    "gemini": {"label": "Model Alpha", "badge": "AUTO",    "badge_class": "active",    "color": _C_GAIN,   "bar": _C_GAIN},
    "groq":   {"label": "Model Beta",  "badge": "AUTO",    "badge_class": "active",    "color": "#60a5fa", "bar": "#60a5fa"},
    "claude": {"label": "Model Gamma", "badge": "MANUEL",  "badge_class": "evaluating","color": "#c084fc", "bar": "#c084fc"},
    "llama":  {"label": "Model Beta",  "badge": "AUTO",    "badge_class": "active",    "color": "#60a5fa", "bar": "#60a5fa"},
}

with tab_ai:
    gemini_key = (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY", "")).strip()
    groq_key = os.getenv("GROQ_API_KEY", "").strip()

    # ── 1. Statut des moteurs ───────────────────────────────────────────────────
    s1, s2, s3 = st.columns(3)
    with s1:
        dot = "ok" if gemini_key else "err"
        lbl = "Clé OK — vérifier quota" if gemini_key else "Clé manquante"
        st.markdown(f"""<div class="api-status">
            <span class="status-dot {dot}"></span>
            <span class="status-name">Gemini</span>
            <span class="status-label">{lbl}</span>
        </div>""", unsafe_allow_html=True)
    with s2:
        dot = "ok" if groq_key else "err"
        lbl = "Configuré" if groq_key else "Clé manquante"
        st.markdown(f"""<div class="api-status">
            <span class="status-dot {dot}"></span>
            <span class="status-name">Llama 3.3 (Groq)</span>
            <span class="status-label">{lbl}</span>
        </div>""", unsafe_allow_html=True)
    with s3:
        st.markdown("""<div class="api-status">
            <span class="status-dot manual"></span>
            <span class="status-name">Claude</span>
            <span class="status-label">Copy-paste → stocké en DB</span>
        </div>""", unsafe_allow_html=True)


    st.divider()
    df_ai, _ = load_portfolio()

    if df_ai is None:
        st.info("Ajoute des positions dans **Gérer mes positions** d'abord.")
    else:
        summary_ai = portfolio_summary(df_ai)
        hhi_ai = compute_hhi(df_ai)
        alerts_ai = compute_concentration_alerts(df_ai)
        prompt_text = build_analysis_prompt(df_ai, summary_ai, hhi_ai, alerts_ai)
        all_suggestions = get_suggestions(limit=200)
        sb_df = compute_scoreboard(all_suggestions)
        per_model = _get_latest_per_model(all_suggestions)

        # ── 2. Competition — Model cards + graphiques ───────────────────────────
        st.subheader("IA Engine Competition")

        if sb_df.empty:
            st.caption("Lance une première analyse pour alimenter la compétition.")
        else:
            # Cartes modèles
            card_cols = st.columns(max(len(sb_df), 1))
            for i, (_, row) in enumerate(sb_df.iterrows()):
                mk = row["Modèle"].lower().split()[0]
                cfg = _MODEL_CFG.get(mk, {
                    "label": f"Model {chr(65+i)}", "badge": "ACTIF",
                    "badge_class": "active", "color": _PALETTE[i % len(_PALETTE)],
                    "bar": _PALETTE[i % len(_PALETTE)],
                })
                descs = {
                    "gemini": "Analyse fondamentale approfondie. Quota Gemini à vérifier.",
                    "groq":   "Paramètres de risque stricts. Haute cohérence en marché volatile.",
                    "claude": "Analyse qualitative supérieure. Entrée manuelle via copy-paste.",
                    "llama":  "Paramètres de risque stricts. Haute cohérence en marché volatile.",
                }
                with card_cols[i]:
                    st.markdown(_model_card_html(
                        label=cfg["label"], title=row["Modèle"],
                        badge=cfg["badge"], badge_class=cfg["badge_class"],
                        label_color=cfg["color"],
                        score=row.get("Score /10"),
                        quality=row.get("Qualité analyse"),
                        discipline=row.get("Discipline B&H"),
                        desc=f"{row['Analyses']} analyse(s). {descs.get(mk, '')}",
                        bar_color=cfg["bar"],
                    ), unsafe_allow_html=True)

            st.write("")

            # Graphique évolution des scores dans le temps
            scored = [s for s in all_suggestions if s.get("analysis_score") is not None]
            if len(scored) >= 2:
                score_rows = []
                for s in scored:
                    a = s.get("analysis_score") or 0
                    d = s.get("discipline_score") or 0
                    score_rows.append({
                        "date": s["created_at"][:10],
                        "Modèle": s["model_name"],
                        "Score": round(a + d, 1),
                    })
                df_scores = pd.DataFrame(score_rows).sort_values("date")

                fig_line = go.Figure()
                model_colors_map = {}
                for i, model in enumerate(df_scores["Modèle"].unique()):
                    mk = model.lower().split()[0]
                    color = _MODEL_CFG.get(mk, {"bar": _PALETTE[i % len(_PALETTE)]})["bar"]
                    model_colors_map[model] = color
                    sub = df_scores[df_scores["Modèle"] == model]
                    fig_line.add_trace(go.Scatter(
                        x=sub["date"], y=sub["Score"], name=model, mode="lines+markers",
                        line=dict(color=color, width=2),
                        marker=dict(size=7, color=color, symbol="circle"),
                    ))
                fig_line.update_layout(
                    **_CHART, height=260, hovermode="x unified",
                    yaxis=dict(title="Score /10", range=[0, 10], gridcolor=_BORDER),
                    xaxis=dict(gridcolor=_BORDER),
                    legend=dict(bgcolor="rgba(26,26,26,0.9)", bordercolor=_BORDER,
                                borderwidth=1, font=dict(size=11)),
                    title=dict(text="Évolution du score dans le temps", font=dict(size=12, color=_MUTED)),
                )
                st.plotly_chart(fig_line, use_container_width=True)

            # Radar comparison si ≥ 2 modèles scorés
            if len(sb_df) >= 2:
                scored_sb = sb_df.dropna(subset=["Qualité analyse", "Discipline B&H"])
                if len(scored_sb) >= 2:
                    categories = ["Qualité analyse", "Discipline B&H"]
                    fig_radar = go.Figure()
                    for i, (_, row) in enumerate(scored_sb.iterrows()):
                        mk = row["Modèle"].lower().split()[0]
                        color = _MODEL_CFG.get(mk, {"bar": _PALETTE[i]})["bar"]
                        vals = [
                            float(row["Qualité analyse"]) * 2,
                            float(row["Discipline B&H"]) * 2,
                        ]
                        fig_radar.add_trace(go.Scatterpolar(
                            r=vals + [vals[0]],
                            theta=["Qualité (×2)", "Discipline (×2)", "Qualité (×2)"],
                            name=row["Modèle"],
                            fill="toself",
                            fillcolor=color.replace(")", ",0.1)").replace("rgb", "rgba") if "rgb" in color else color + "1a",
                            line=dict(color=color, width=2),
                        ))
                    fig_radar.update_layout(
                        **_CHART, height=300,
                        polar=dict(
                            bgcolor=_SURFACE,
                            radialaxis=dict(visible=True, range=[0, 10],
                                           gridcolor=_BORDER, tickcolor=_MUTED,
                                           tickfont=dict(size=9, color=_MUTED)),
                            angularaxis=dict(gridcolor=_BORDER,
                                            tickfont=dict(size=11, color=_TEXT)),
                        ),
                        legend=dict(bgcolor="rgba(26,26,26,0.9)", bordercolor=_BORDER,
                                    borderwidth=1, font=dict(size=11)),
                        title=dict(text="Comparaison multi-dimensionnelle", font=dict(size=12, color=_MUTED)),
                    )
                    st.plotly_chart(fig_radar, use_container_width=True)

        st.divider()

        # ── 3. Recommandations consolidées ─────────────────────────────────────
        st.subheader("Recommandations consolidées")

        _PRIORITY_LABEL = {"high": ("PRIORITÉ HAUTE", _C_LOSS), "medium": ("PRIORITÉ MOYENNE", _C_WARN), "low": ("FAIBLE", _MUTED)}

        gaps = compute_investment_gaps(df_ai)
        if gaps:
            st.caption(f"{len(gaps)} écart(s) détecté(s) — cliquez pour voir les détails et suggestions.")
            for g in gaps:
                p_label, p_color = _PRIORITY_LABEL.get(g["priority"], ("—", _MUTED))
                header_label = (
                    f"{g['icon']}  {g['title']}   "
                    f"— {p_label}"
                )
                with st.expander(header_label, expanded=False):
                    st.markdown(
                        f"<div style='color:{_TEXT};font-size:14px;line-height:1.6;"
                        f"padding:4px 0 12px;'>{g['action']}</div>",
                        unsafe_allow_html=True,
                    )
                    sugg = g.get("suggestions", [])
                    if sugg:
                        st.markdown(
                            f"<div style='font-size:11px;color:{_MUTED};text-transform:uppercase;"
                            f"letter-spacing:0.07em;margin-bottom:8px;'>Suggestions d'investissement</div>",
                            unsafe_allow_html=True,
                        )
                        s_cols = st.columns(min(len(sugg), 3))
                        for sc, s in zip(s_cols, sugg):
                            with sc:
                                st.markdown(
                                    f"<div style='background:{_SURFACE};border:1px solid {_BORDER};"
                                    f"padding:12px;height:100%;'>"
                                    f"<div style='color:{_C_GAIN};font-weight:700;font-size:15px;"
                                    f"letter-spacing:0.04em;'>{s['ticker']}</div>"
                                    f"<div style='color:{_TEXT};font-size:12px;margin:4px 0 6px;'>{s['name']}</div>"
                                    f"<div style='color:{_MUTED};font-size:11px;line-height:1.5;'>{s['why']}</div>"
                                    f"</div>",
                                    unsafe_allow_html=True,
                                )
        else:
            st.success("Aucun écart majeur détecté — portefeuille bien structuré.")

        # Actions des modèles — sélecteur pour afficher un modèle à la fois
        if per_model:
            st.write("")
            st.markdown(
                f"<div style='font-size:11px;color:{_MUTED};text-transform:uppercase;"
                f"letter-spacing:0.07em;margin-bottom:0.5rem;'>Actions recommandées par modèle</div>",
                unsafe_allow_html=True,
            )
            model_names = {mk: s["model_name"] for mk, s in per_model.items()}
            selected_mk = st.radio(
                "Modèle",
                options=list(model_names.keys()),
                format_func=lambda k: model_names[k],
                horizontal=True,
                label_visibility="collapsed",
            )
            s = per_model[selected_mk]
            color = _MODEL_CFG.get(selected_mk, {"color": _MUTED})["color"]
            st.markdown(
                f"<div style='font-size:11px;font-weight:700;color:{color};"
                f"text-transform:uppercase;letter-spacing:0.06em;margin:0.75rem 0 0.25rem;'>"
                f"{s['model_name']}</div>",
                unsafe_allow_html=True,
            )
            actions = _extract_actions(s["response_text"])
            if actions:
                st.markdown(actions)
            else:
                st.caption("Pas de section actions trouvée dans cette analyse.")
            st.caption(f"Analyse du {s['created_at'][:10]}")

        # Consensus des portefeuilles virtuels
        consensus_df = _build_vp_consensus(per_model)
        if not consensus_df.empty:
            st.write("")
            st.markdown(
                f"<div style='font-size:11px;color:{_MUTED};text-transform:uppercase;"
                f"letter-spacing:0.07em;margin-bottom:0.75rem;'>Portefeuille virtuel — consensus 10 000 €</div>",
                unsafe_allow_html=True,
            )
            with st.expander("Voir le consensus IA", expanded=False):
                c_left, c_right = st.columns([2, 3])
                with c_left:
                    st.dataframe(
                        consensus_df.style.format({"Poids moyen (%)": "{:.1f}%"}, na_rep="—"),
                        use_container_width=True, hide_index=True,
                    )
                with c_right:
                    fig_cons = px.bar(
                        consensus_df.sort_values("Poids moyen (%)", ascending=True),
                        x="Poids moyen (%)", y="Ticker", orientation="h",
                        color_discrete_sequence=[_C_GAIN],
                        text="Poids moyen (%)",
                    )
                    fig_cons.update_traces(
                        texttemplate="%{text:.1f}%", textposition="outside",
                        marker_color=_C_GAIN,
                    )
                    fig_cons.update_layout(
                        **{**_CHART, "margin": dict(l=0, r=40, t=10, b=0)},
                        height=max(180, len(consensus_df) * 32),
                        xaxis=dict(showgrid=False, showticklabels=False, title=""),
                        yaxis=dict(title="", tickfont=dict(size=12)),
                    )
                    st.plotly_chart(fig_cons, use_container_width=True)

        # ── Top picks IA ──────────────────────────────────────────────────────
        top_picks_df = compute_ai_top_picks(all_suggestions)
        if not top_picks_df.empty:
            st.write("")
            st.markdown(
                f"<div style='font-size:11px;color:{_MUTED};text-transform:uppercase;"
                f"letter-spacing:0.07em;margin-bottom:0.5rem;'>Top Picks IA — Opportunités identifiées</div>",
                unsafe_allow_html=True,
            )
            st.caption(
                "Agrégat des portefeuilles virtuels recommandés par chaque IA. "
                "Conviction = nombre de modèles en accord."
            )
            pick_tickers = top_picks_df["Ticker"].tolist()
            with st.spinner("Récupération des cours…"):
                pick_prices = get_current_prices(pick_tickers)

            top_picks_df["Cours actuel"] = top_picks_df["Ticker"].map(
                lambda t: f"{pick_prices[t.upper()]:.2f}" if t.upper() in pick_prices else "—"
            )
            cols_order = ["Ticker", "Titre", "Cours actuel", "Poids moyen", "Conviction", "Description"]
            display_df = top_picks_df[[c for c in cols_order if c in top_picks_df.columns]]

            def _conviction_color(v):
                if "Consensus" in str(v):
                    return f"color:{_C_GAIN};font-weight:700;"
                if "Fort" in str(v):
                    return f"color:{_C_WARN};font-weight:700;"
                return f"color:{_MUTED};"

            styled = display_df.style.format({"Poids moyen": "{:.1f}%"}, na_rep="—")
            styled = styled.map(lambda v: _conviction_color(v), subset=["Conviction"])
            st.dataframe(styled, use_container_width=True, hide_index=True)

        st.divider()

        # ── 4. Lancer une analyse automatique ──────────────────────────────────
        st.subheader("Lancer une analyse automatique")

        with st.expander("Voir le prompt envoyé aux IA", expanded=False):
            st.code(prompt_text, language=None)

        la_col, _ = st.columns([3, 5])
        with la_col:
            launch = st.button(
                "Analyser — Gemini + Llama en parallèle",
                type="primary", use_container_width=True,
                disabled=(not gemini_key and not groq_key),
            )

        if launch:
            with st.spinner("Gemini et Llama analysent en parallèle (~30-60 s)…"):
                results = run_analysis(prompt_text)
            saved_any = False
            for key, res in results.items():
                if res.get("error"):
                    st.error(f"**{key.capitalize()}** — {res['error'][:200]}")
                elif res.get("text"):
                    save_suggestion(
                        model_name=res["model"],
                        prompt=prompt_text,
                        response_text=res["text"],
                        portfolio_snapshot=df_ai.to_dict(),
                        virtual_portfolio=res.get("virtual_portfolio"),
                        conviction_level=res.get("conviction_level"),
                    )
                    saved_any = True
            st.session_state.last_analysis = results
            if saved_any:
                st.rerun()

        if st.session_state.last_analysis:
            results = st.session_state.last_analysis
            col_g, col_l = st.columns(2)
            for col, key, model_color in [
                (col_g, "gemini", _C_GAIN),
                (col_l, "groq", "#60a5fa"),
            ]:
                res = results.get(key, {})
                with col:
                    if not res:
                        continue
                    if res.get("error"):
                        st.error(f"**{key.capitalize()}** — Erreur. Vérifie quota/clé dans `.env`.")
                    else:
                        st.markdown(
                            f"<div style='font-size:12px;font-weight:700;color:{model_color};"
                            f"text-transform:uppercase;letter-spacing:0.06em;margin:0.75rem 0;'>"
                            f"{res.get('model', key)}</div>",
                            unsafe_allow_html=True,
                        )
                        if res.get("virtual_portfolio"):
                            with st.expander("Portefeuille virtuel 10 000 €", expanded=True):
                                _render_virtual_portfolio(res["virtual_portfolio"])
                        with st.expander("Analyse complète", expanded=False):
                            st.markdown(res.get("text", ""))

        st.divider()

        # ── 5. Soumettre une analyse Claude ────────────────────────────────────
        st.markdown("""
        <div style="background:#1a1a1a;border:1px solid #c084fc;border-left:3px solid #c084fc;
                    padding:1rem 1.25rem;margin-bottom:0.5rem;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;
                        letter-spacing:0.1em;color:#c084fc;margin-bottom:4px;">Model Gamma</div>
            <div style="font-size:16px;font-weight:700;color:#e1e2e8;">Claude — Analyse manuelle</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:4px;">
                Copie le prompt → colle dans claude.ai → reviens coller la réponse ici pour l'intégrer à la compétition.
            </div>
        </div>
        """, unsafe_allow_html=True)

        with st.expander("Voir le prompt à copier pour Claude", expanded=False):
            st.code(prompt_text, language=None)

        with st.form("claude_submit_form"):
            claude_response = st.text_area(
                "Réponse de Claude (colle ici)",
                placeholder="Colle ici la réponse complète de Claude…",
                height=280,
            )
            conv_level = st.selectbox(
                "Niveau de conviction annoncé",
                ["high", "medium", "low", "—"],
            )
            submit_claude = st.form_submit_button(
                "Enregistrer dans la compétition",
                type="primary", use_container_width=True,
            )

        if submit_claude:
            if not claude_response.strip():
                st.error("La réponse est vide.")
            else:
                vp = _parse_vp_from_text(claude_response)
                cl = conv_level if conv_level != "—" else None
                if vp and not cl:
                    cl = vp.get("conviction_level")
                save_suggestion(
                    model_name="Claude (Manual)",
                    prompt=prompt_text,
                    response_text=claude_response,
                    portfolio_snapshot=df_ai.to_dict(),
                    virtual_portfolio=vp,
                    conviction_level=cl,
                )
                st.success("Analyse Claude enregistrée — scoreboard mis à jour.")
                st.rerun()

        st.divider()

        # ── 6. Historique avec scoring ─────────────────────────────────────────
        st.subheader("Historique des analyses")
        suggestions = get_suggestions(limit=50)

        if not suggestions:
            st.info("Aucune analyse enregistrée.")
        else:
            for s in suggestions:
                dt = s["created_at"][:16].replace("T", " ")
                conv = (s.get("conviction_level") or "—").upper()
                a_sc = s.get("analysis_score")
                d_sc = s.get("discipline_score")
                score_str = f"  ·  A:{a_sc:.1f}  D:{d_sc:.1f}" if a_sc else ""
                vp_data = json.loads(s["virtual_portfolio"]) if s.get("virtual_portfolio") else None

                with st.expander(f"{s['model_name']}  ·  {dt}  ·  {conv}{score_str}"):
                    if vp_data:
                        st.caption("Portefeuille virtuel suggéré")
                        _render_virtual_portfolio(vp_data)
                    with st.expander("Analyse complète", expanded=False):
                        st.markdown(s["response_text"])

                    st.markdown("---")
                    st.caption("Scoring de cette analyse")
                    sc1, sc2, sc3 = st.columns(3)
                    with sc1:
                        new_a = st.slider("Qualité analyse /5", 1.0, 5.0,
                                          value=float(a_sc) if a_sc else 3.0,
                                          step=0.5, key=f"a_{s['id']}")
                    with sc2:
                        new_d = st.slider("Discipline B&H /5", 1.0, 5.0,
                                          value=float(d_sc) if d_sc else 3.0,
                                          step=0.5, key=f"d_{s['id']}")
                    with sc3:
                        new_notes = st.text_input("Notes", value=s.get("notes") or "",
                                                  key=f"n_{s['id']}")
                    if st.button("Enregistrer le score", key=f"save_{s['id']}"):
                        update_suggestion_scores(s["id"], new_a, new_d, new_notes)
                        st.success("Score enregistré.")
                        st.rerun()
