
import sys
import os
import json
import re
from pathlib import Path
from datetime import date as _date

sys.path.insert(0, str(Path(__file__).parent.parent))

import streamlit as st
import streamlit.components.v1 as components
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from backend.db import (
    init_db, get_positions, delete_position,
    add_transaction, update_transaction, delete_transaction, get_transactions,
    save_suggestion, get_suggestions, update_suggestion_scores,
    add_watchlist_item, get_watchlist, delete_watchlist_item, update_watchlist_note,
    add_dividend, get_dividends, delete_dividend,
)
from backend.collectors import (
    search_tickers, verify_ticker, get_current_prices, get_normalized_history,
    get_raw_history, get_ticker_info, get_multi_raw_history_df, get_dividend_info,
)
from backend.crypto_collectors import (
    search_crypto, verify_crypto, get_crypto_prices, get_crypto_normalized_history,
    get_crypto_raw_history, get_crypto_multi_raw_history_df,
)
from backend.analytics import (
    build_portfolio_df, portfolio_summary,
    compute_hhi, compute_concentration_alerts,
    compute_sector_allocation, compute_scoreboard, compute_investment_gaps,
    compute_ai_top_picks,
    classify_crypto_category, compute_crypto_sector_allocation,
    compute_crypto_concentration_alerts, compute_crypto_investment_gaps,
    compute_geographic_allocation, compute_risk_metrics,
    build_portfolio_timeline, simulate_dca,
)
from backend.crypto_importer import import_crypto_csv
from backend.alerts import (
    add_alert, get_alerts, delete_alert, rearm_alert,
    check_alerts, send_alert_email, smtp_configured,
    ALERT_PURPOSE_META,
)
from backend.notifiers import (
    send_telegram, send_discord,
    telegram_configured, discord_configured,
    send_telegram_test, send_discord_test,
)
from backend.exchanges import (
    get_exchanges_for_asset, build_exchange_url, get_exchange_info,
    CRYPTO_PLATFORM_NAMES, STOCK_PLATFORM_NAMES,
)
from backend.db import get_position_platform

from backend.analyzers.prompt import build_analysis_prompt
from backend.analyzers.crypto_prompt import build_crypto_analysis_prompt
from backend.analyzers.runner import run_analysis

# ── Config ─────────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="STOCK_TERMINAL",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="collapsed",
)

init_db()

# ── Ethereal animated background ────────────────────────────────────────────────
components.html("""<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden;background:transparent">
<script>
(function() {
  var doc = window.parent.document;
  if (doc.getElementById('ethereal-bg')) return;

  // ── Keyframe animations ──
  var style = doc.createElement('style');
  style.id = 'ethereal-styles';
  style.textContent = [
    '@keyframes eth-drift-1{',
      '0%{transform:translate(0,0) scale(1)}',
      '33%{transform:translate(5%,-7%) scale(1.10)}',
      '66%{transform:translate(-3%,4%) scale(0.95)}',
      '100%{transform:translate(2%,-3%) scale(1.04)}',
    '}',
    '@keyframes eth-drift-2{',
      '0%{transform:translate(0,0) scale(1)}',
      '33%{transform:translate(-6%,5%) scale(1.14)}',
      '66%{transform:translate(4%,-3%) scale(0.92)}',
      '100%{transform:translate(-2%,1%) scale(1.06)}',
    '}',
    '@keyframes eth-drift-3{',
      '0%{transform:translate(0,0) scale(1);opacity:0.6}',
      '50%{transform:translate(3%,-4%) scale(1.08);opacity:1}',
      '100%{transform:translate(-2%,3%) scale(0.93);opacity:0.4}',
    '}'
  ].join('');
  doc.head.appendChild(style);

  // ── SVG displacement filter ──
  var svgNS = 'http://www.w3.org/2000/svg';
  var svg = doc.createElementNS(svgNS, 'svg');
  svg.id = 'ethereal-svg';
  svg.setAttribute('style','position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  svg.setAttribute('aria-hidden','true');
  svg.innerHTML = '<defs>' +
    '<filter id="eth-filter" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">' +
      '<feTurbulence result="undulation" numOctaves="2" baseFrequency="0.00035,0.00165" seed="3" type="turbulence"/>' +
      '<feColorMatrix id="eth-hue" in="undulation" type="hueRotate" values="180"/>' +
      '<feColorMatrix in="dist" result="circ" type="matrix" values="4 0 0 0 1 4 0 0 0 1 4 0 0 0 1 1 0 0 0 0"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="circ" scale="75" result="dist"/>' +
      '<feDisplacementMap in="dist" in2="undulation" scale="75" result="output"/>' +
    '</filter>' +
  '</defs>';
  doc.body.appendChild(svg);

  // ── Background container ──
  var bg = doc.createElement('div');
  bg.id = 'ethereal-bg';
  bg.style.cssText = 'position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;background:#090911';
  bg.innerHTML =
    // Displaced glow layer
    '<div style="position:absolute;inset:-75px;filter:url(#eth-filter) blur(10px)">' +
      // Emerald — bottom-left
      '<div style="position:absolute;bottom:-15%;left:-8%;width:80vw;height:80vh;border-radius:50%;' +
        'background:radial-gradient(circle,rgba(16,185,129,0.40) 0%,rgba(16,185,129,0.12) 38%,transparent 68%);' +
        'animation:eth-drift-1 20s ease-in-out infinite alternate"></div>' +
      // Violet — top-right
      '<div style="position:absolute;top:-8%;right:-6%;width:65vw;height:65vh;border-radius:50%;' +
        'background:radial-gradient(circle,rgba(139,92,246,0.32) 0%,rgba(99,102,241,0.10) 42%,transparent 68%);' +
        'animation:eth-drift-2 24s ease-in-out infinite alternate"></div>' +
      // Amber accent — centre
      '<div style="position:absolute;top:30%;left:22%;width:50vw;height:50vh;border-radius:50%;' +
        'background:radial-gradient(circle,rgba(251,191,36,0.10) 0%,transparent 62%);' +
        'animation:eth-drift-3 28s ease-in-out infinite alternate"></div>' +
    '</div>' +
    // Edge vignette
    '<div style="position:absolute;inset:0;background:' +
      'linear-gradient(to bottom,rgba(9,9,17,0.55) 0%,transparent 25%,transparent 72%,rgba(9,9,17,0.65) 100%),' +
      'linear-gradient(to right,rgba(9,9,17,0.30) 0%,transparent 18%,transparent 82%,rgba(9,9,17,0.30) 100%)' +
    '"></div>';
  doc.body.insertBefore(bg, doc.body.firstChild);

  // ── Animate SVG hue rotation ──
  var hue = 0;
  (function tick() {
    hue = (hue + 0.22) % 360;
    var el = doc.getElementById('eth-hue');
    if (el) el.setAttribute('values', String(hue));
    requestAnimationFrame(tick);
  })();
})();
</script>
</body></html>""", height=1)

# ── Dot-matrix canvas (adapted from CanvasRevealEffect shader) ─────────────────
components.html("""<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden;background:transparent">
<script>
(function() {
  var doc = window.parent.document;
  if (doc.getElementById('dot-matrix-canvas')) return;

  var canvas = doc.createElement('canvas');
  canvas.id = 'dot-matrix-canvas';
  canvas.style.cssText = [
    'position:fixed', 'inset:0', 'width:100vw', 'height:100vh',
    'z-index:0', 'pointer-events:none',
    'opacity:0.28', 'mix-blend-mode:screen'
  ].join(';');

  var ctx = canvas.getContext('2d');

  // Grid parameters (matching DotMatrix defaults)
  var TOTAL = 22;   // cell size in px
  var DOT   = 2.5;  // dot radius
  var SPEED = 0.28; // reveal speed multiplier
  var FREQ  = 5;    // flicker frequency (seconds)

  // Deterministic hash → [0,1)
  function h(x, y) {
    var s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  var cells = [];
  var startTime = performance.now();

  function buildCells() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    cells = [];

    var cols = Math.ceil(canvas.width  / TOTAL) + 1;
    var rows = Math.ceil(canvas.height / TOTAL) + 1;
    var cx = cols / 2, cy = rows / 2;

    // Offset grid to center like the shader
    var offX = Math.abs(Math.floor((canvas.width  % TOTAL - DOT) * 0.5));
    var offY = Math.abs(Math.floor((canvas.height % TOTAL - DOT) * 0.5));

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var dist  = Math.sqrt((c - cx) * (c - cx) + (r - cy) * (r - cy));
        var seed  = h(c, r);
        // Timing: intro from center (matches timing_offset_intro in shader)
        var timing = dist * 0.012 + seed * 0.18;
        cells.push({
          c: c, r: r,
          x: c * TOTAL - offX,
          y: r * TOTAL - offY,
          timing: timing,
          seed: seed
        });
      }
    }
  }

  buildCells();
  window.addEventListener('resize', buildCells);

  var OP_BUCKETS = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1.0];

  function frame() {
    var elapsed = (performance.now() - startTime) / 1000;
    var t = elapsed * SPEED;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var len = cells.length;
    for (var i = 0; i < len; i++) {
      var cell = cells[i];

      // Reveal: dot fades in when elapsed passes its timing offset
      if (t < cell.timing) continue;
      var reveal = Math.min(1.0, (t - cell.timing) / 0.10);

      // Periodic flicker: re-pick opacity bucket every FREQ seconds
      var tick = Math.floor(elapsed / FREQ + cell.seed + FREQ);
      var s2   = h(cell.c * 7.3 + tick, cell.r * 3.7 + tick);
      var base = OP_BUCKETS[Math.floor(s2 * 10)] * reveal;

      // Subtle pulse
      var pulse = 0.82 + 0.18 * Math.sin(elapsed * 1.8 + cell.seed * 6.28318);

      var alpha = base * pulse * 0.50;
      if (alpha < 0.01) continue; // skip invisible dots

      ctx.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(3) + ')';
      ctx.fillRect(cell.x, cell.y, DOT, DOT);
    }
    requestAnimationFrame(frame);
  }

  frame();
  doc.body.appendChild(canvas);
})();
</script>
</body></html>""", height=1)

# ── Design system ───────────────────────────────────────────────────────────────
_C_GAIN    = "#10b981"   # emerald-500
_C_LOSS    = "#f87171"   # red-400
_C_WARN    = "#f59e0b"   # amber-500
_C_ACCENT  = "#ffb95f"   # secondary amber
_C_PRIMARY = "#4edea3"   # primary-fixed
_C_CRYPTO  = "#f7931a"   # bitcoin orange
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

_PFU = 0.30   # Prélèvement Forfaitaire Unique : 12.8% IR + 17.2% prélèvements sociaux

_TICKER_RE = re.compile(r"^[A-Z0-9.\-]{1,20}$")
_PRIORITY_LABEL = {
    "high":   ("PRIORITÉ HAUTE",   _C_LOSS),
    "medium": ("PRIORITÉ MOYENNE", _C_WARN),
    "low":    ("FAIBLE",           _MUTED),
}

# ── CSS injection ───────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;900&display=swap');

/* ── Font (scoped to app content only, not icon fonts) ── */
[data-testid="stAppViewContainer"] { font-family: 'Space Grotesk', sans-serif; }

/* ── Root & body transparent so fixed ethereal bg shows through ── */
html, body {
    background-color: transparent !important;
    background: transparent !important;
}

/* ── Hide the 1px injection iframes ── */
iframe[title="components.html"] {
    display: block !important;
    height: 1px !important;
    min-height: 0 !important;
    overflow: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
}

/* ── Backgrounds ── */
[data-testid="stApp"],
[data-testid="stAppViewContainer"],
[data-testid="stAppViewContainer"] > .main,
[data-testid="stMain"],
.main {
    background-color: transparent !important;
    background: transparent !important;
}

/* Ensure Streamlit content sits above the fixed ethereal bg */
[data-testid="stAppViewContainer"] {
    position: relative !important;
    z-index: 1 !important;
}

[data-testid="stHeader"] {
    background-color: rgba(9,9,17,0.75) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    border-bottom: 1px solid rgba(16,185,129,0.15) !important;
}
[data-testid="stToolbar"] { display: none; }

section[data-testid="stSidebar"] {
    background-color: rgba(15,15,22,0.88) !important;
    backdrop-filter: blur(16px) !important;
    -webkit-backdrop-filter: blur(16px) !important;
    border-right: 1px solid rgba(45,45,45,0.6) !important;
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
    background-color: rgba(20,20,30,0.72) !important;
    backdrop-filter: blur(14px) !important;
    -webkit-backdrop-filter: blur(14px) !important;
    border: 1px solid rgba(16,185,129,0.18) !important;
    border-radius: 0px !important;
    padding: 1.2rem 1.4rem !important;
    position: relative;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04) !important;
    transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
}
[data-testid="metric-container"]:hover {
    border-color: rgba(16,185,129,0.40) !important;
    box-shadow: 0 4px 32px rgba(16,185,129,0.08), 0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04) !important;
}
[data-testid="metric-container"]::before {
    content: '';
    position: absolute;
    top: 0; left: 0;
    width: 3px; height: 100%;
    background: linear-gradient(to bottom, #10b981, rgba(16,185,129,0.3));
    box-shadow: 0 0 8px rgba(16,185,129,0.5);
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
    background-color: rgba(20,20,30,0.70) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    border: 1px solid rgba(45,45,65,0.7) !important;
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
    background-color: rgba(20,20,30,0.78) !important;
    backdrop-filter: blur(14px) !important;
    -webkit-backdrop-filter: blur(14px) !important;
    border: 1px solid rgba(45,45,65,0.7) !important;
    border-radius: 0px !important;
    padding: 1.25rem !important;
    box-shadow: 0 2px 20px rgba(0,0,0,0.3) !important;
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
    border: 1px solid rgba(45,45,65,0.7) !important;
    border-radius: 0px !important;
    background-color: rgba(20,20,30,0.70) !important;
    backdrop-filter: blur(10px) !important;
    -webkit-backdrop-filter: blur(10px) !important;
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
    background-color: rgba(20,20,30,0.74);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(16,185,129,0.14);
    box-shadow: 0 2px 20px rgba(0,0,0,0.35);
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
    background-color: rgba(20,20,30,0.74);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(45,45,65,0.7);
    box-shadow: 0 2px 20px rgba(0,0,0,0.35);
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
    # Crypto
    ("crypto_search_results", []),
    ("crypto_prefill_ticker", ""),
    ("crypto_prefill_name", ""),
    ("crypto_prefill_id", ""),
    ("crypto_price_hint", None),
    ("crypto_last_analysis", None),
    ("editing_tx_id", None),   # ID of the transaction currently being edited
]:
    if key not in st.session_state:
        st.session_state[key] = default

# ── Helpers ─────────────────────────────────────────────────────────────────────

def load_portfolio():
    positions = get_positions(asset_class="stock")
    if not positions:
        return None, {}
    tickers = [p["ticker"] for p in positions]
    prices = get_current_prices(tickers)
    df = build_portfolio_df(positions, prices)
    return df, prices


def load_crypto_portfolio():
    positions = get_positions(asset_class="crypto")
    if not positions:
        return None, {}
    tickers = [p["ticker"] for p in positions]
    id_overrides = {p["ticker"]: p["coingecko_id"] for p in positions if p.get("coingecko_id")}
    prices = get_crypto_prices(tickers, id_overrides=id_overrides or None)
    df = build_portfolio_df(positions, prices)
    return df, prices


@st.cache_data(ttl=3600, show_spinner=False)
def cached_history(tickers_tuple: tuple, period: str) -> pd.DataFrame:
    return get_normalized_history(list(tickers_tuple), period)


@st.cache_data(ttl=3600, show_spinner=False)
def cached_crypto_history(tickers_tuple: tuple, days: int, id_overrides_tuple: tuple = ()) -> pd.DataFrame:
    id_overrides = dict(id_overrides_tuple) if id_overrides_tuple else None
    return get_crypto_normalized_history(list(tickers_tuple), days, id_overrides=id_overrides)


@st.cache_data(ttl=3600, show_spinner=False)
def cached_raw_history(ticker: str, period: str) -> pd.Series:
    return get_raw_history(ticker, period)


@st.cache_data(ttl=3600, show_spinner=False)
def cached_crypto_raw_history(ticker: str, days: int, id_overrides_tuple: tuple = ()) -> pd.Series:
    id_overrides = dict(id_overrides_tuple) if id_overrides_tuple else None
    return get_crypto_raw_history(ticker, days, id_overrides=id_overrides)


@st.cache_data(ttl=86400, show_spinner=False)
def cached_ticker_info(ticker: str) -> dict:
    return get_ticker_info(ticker)


@st.cache_data(ttl=3600, show_spinner=False)
def cached_dividend_info(ticker: str) -> dict:
    return get_dividend_info(ticker)


@st.cache_data(ttl=3600, show_spinner=False)
def cached_multi_raw_history(tickers_tuple: tuple, period: str) -> pd.DataFrame:
    return get_multi_raw_history_df(list(tickers_tuple), period)


@st.cache_data(ttl=3600, show_spinner=False)
def cached_crypto_multi_raw_history(tickers_tuple: tuple, days: int, id_overrides_tuple: tuple = ()) -> pd.DataFrame:
    id_overrides = dict(id_overrides_tuple) if id_overrides_tuple else None
    return get_crypto_multi_raw_history_df(list(tickers_tuple), days, id_overrides)


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


# ── HHI helper (used by both stocks and crypto sections) ────────────────────────
def _render_hhi_panel(hhi: float, low_thresh: float, mid_thresh: float, accent: str = _C_GAIN):
    hi_color = _C_LOSS if hhi > mid_thresh else _C_WARN if hhi > low_thresh else accent
    hi_status = "Concentré" if hhi > mid_thresh else "Modéré" if hhi > low_thresh else "Bien diversifié"
    hi_pct = min(100, hhi / mid_thresh * 70)
    st.markdown(f"""
    <div class="hhi-panel">
        <div class="hhi-label">Concentration HHI</div>
        <div class="hhi-value" style="color:{hi_color};">{hhi:.3f}</div>
        <div class="hhi-status" style="color:{hi_color};">{hi_status}</div>
        <div class="hhi-bar-wrap">
            <div class="hhi-bar-fill" style="width:{hi_pct:.1f}%;background:{hi_color};"></div>
        </div>
        <div class="hhi-zones">
            <span style="color:{accent};">0.00</span>
            <span style="color:{_C_WARN};">{low_thresh}</span>
            <span style="color:{_C_LOSS};">{mid_thresh}+</span>
        </div>
        <div style="margin-top:1.25rem;border-top:1px solid #2d2d2d;padding-top:0.75rem;">
            <div style="font-size:11px;color:#94a3b8;line-height:1.8;">
                <div><span style="color:{accent};">■</span> &lt; {low_thresh} — Bien diversifié</div>
                <div><span style="color:{_C_WARN};">■</span> {low_thresh}–{mid_thresh} — Concentration modérée</div>
                <div><span style="color:{_C_LOSS};">■</span> &gt; {mid_thresh} — Très concentré</div>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)


# ── Exchange / broker links ──────────────────────────────────────────────────────

def _render_exchange_links(ticker: str, asset_class: str, compact: bool = False) -> None:
    """Popover with exchange/broker links. Highlights the platform stored for this position."""
    preferred = get_position_platform(ticker, asset_class)
    exchanges  = get_exchanges_for_asset(asset_class)
    note = (
        "Vérifie que la paire EUR ou USDT est disponible sur chaque plateforme."
        if asset_class == "crypto"
        else "Disponibilité selon la bourse de cotation de l'action."
    )

    label = "▶ ACHETER" if not compact else "▶"
    with st.popover(label):
        st.markdown(
            f"<div style='font-size:10px;color:{_MUTED};text-transform:uppercase;"
            f"letter-spacing:0.08em;margin-bottom:10px;padding-bottom:8px;"
            f"border-bottom:1px solid {_BORDER};'>Acheter — {ticker}</div>",
            unsafe_allow_html=True,
        )

        # Preferred platform first
        ordered = sorted(exchanges, key=lambda e: (0 if e["name"] == preferred else 1))

        for ex in ordered:
            url          = build_exchange_url(ex["name"], ticker)
            color        = ex["color"]
            is_preferred = ex["name"] == preferred
            badge = (
                f"<span style='font-size:9px;background:{color};color:#000;"
                f"padding:1px 5px;font-weight:900;letter-spacing:0.05em;"
                f"text-transform:uppercase;margin-left:7px;'>TON EXCHANGE</span>"
                if is_preferred else ""
            )
            border = f"2px solid {color}" if is_preferred else f"1px solid {color}50"
            bg     = f"{color}30"         if is_preferred else f"{color}18"
            st.markdown(
                f"<a href='{url}' target='_blank' rel='noopener noreferrer' style='"
                f"display:flex;align-items:center;justify-content:space-between;"
                f"background:{bg};border:{border};color:{color};"
                f"padding:9px 13px;margin:5px 0;text-decoration:none;"
                f"font-size:12px;font-weight:700;letter-spacing:0.04em;'>"
                f"<span>{ex['name']}{badge}&nbsp;&nbsp;→</span>"
                f"<span style='font-size:10px;color:{_MUTED};font-weight:400;"
                f"text-align:right;max-width:160px;'>{ex['desc']}</span>"
                f"</a>",
                unsafe_allow_html=True,
            )
        st.caption(note)


# ── Technical indicator helpers ─────────────────────────────────────────────────

def _compute_ma(series: pd.Series, window: int) -> pd.Series:
    return series.rolling(window).mean()


def _compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain  = delta.clip(lower=0).ewm(com=period - 1, adjust=False).mean()
    loss  = (-delta.clip(upper=0)).ewm(com=period - 1, adjust=False).mean()
    rs    = gain / loss.replace(0, float("nan"))
    return 100 - 100 / (1 + rs)


def _compute_macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    macd     = ema_fast - ema_slow
    sig      = macd.ewm(span=signal, adjust=False).mean()
    return macd, sig, macd - sig


# ── Asset fiche (rewritten) ─────────────────────────────────────────────────────

def _render_asset_fiche(ticker: str, asset_class: str, df: pd.DataFrame, prices: dict):
    from backend.analyzers.asset_prompt import build_asset_analysis_prompt

    row_df = df[df["Ticker"] == ticker]
    if row_df.empty:
        st.warning(f"Données introuvables pour {ticker}")
        return
    row = row_df.iloc[0]
    txs = get_transactions(ticker, asset_class=asset_class)

    invested = row["Investi (€)"]
    value    = row["Valeur (€)"]
    gain     = row["Gain/Perte (€)"]
    perf     = row["Perf (%)"]
    pru      = row["PRU"]
    current  = row["Cours actuel"]
    name     = row["Nom"]
    qty      = row["Qté"]

    has_price  = pd.notna(value)
    gain_color = _C_GAIN if (has_price and pd.notna(gain) and gain >= 0) else _C_LOSS
    is_crypto  = asset_class == "crypto"
    acc        = _C_CRYPTO if is_crypto else _C_GAIN
    acc_alpha  = "rgba(247,147,26,0.12)" if is_crypto else "rgba(16,185,129,0.12)"
    badge_bg   = "#f7931a22" if is_crypto else "#10b98122"
    badge_fg   = _C_CRYPTO if is_crypto else _C_GAIN
    badge_lbl  = "₿  CRYPTO" if is_crypto else "◈  STOCK / ETF"

    def _m(v, fmt=".2f", suffix=" €"):
        return f"{v:{fmt}}{suffix}" if pd.notna(v) else "N/A"

    # ── KPI header ────────────────────────────────────────────────────────────
    pnl_arrow = "▲" if (has_price and pd.notna(gain) and gain >= 0) else "▼"
    st.markdown(f"""
    <div style="background:{_SURFACE};border:1px solid {_BORDER};
                padding:1.25rem 1.5rem 1rem;margin-bottom:1rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.9rem;">
        <div>
          <span style="font-size:24px;font-weight:700;color:{_TEXT};letter-spacing:-0.02em;">{ticker}</span>
          <span style="font-size:13px;color:{_MUTED};margin-left:0.75rem;">{name}</span>
        </div>
        <span style="background:{badge_bg};color:{badge_fg};padding:4px 12px;
                     border:1px solid {badge_fg}33;font-size:10px;font-weight:700;
                     letter-spacing:0.08em;text-transform:uppercase;">{badge_lbl}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:0.75rem;">
        <div><div style="font-size:9px;color:{_MUTED};letter-spacing:0.07em;margin-bottom:3px;">INVESTI</div>
             <div style="font-size:16px;font-weight:600;">{_m(invested,',.2f')}</div></div>
        <div><div style="font-size:9px;color:{_MUTED};letter-spacing:0.07em;margin-bottom:3px;">VALEUR ACTUELLE</div>
             <div style="font-size:16px;font-weight:600;">{_m(value,',.2f')}</div></div>
        <div><div style="font-size:9px;color:{_MUTED};letter-spacing:0.07em;margin-bottom:3px;">GAIN / PERTE</div>
             <div style="font-size:16px;font-weight:600;color:{gain_color};">{pnl_arrow} {_m(gain,'+,.2f')}</div></div>
        <div><div style="font-size:9px;color:{_MUTED};letter-spacing:0.07em;margin-bottom:3px;">PERFORMANCE</div>
             <div style="font-size:16px;font-weight:600;color:{gain_color};">{_m(perf,'+.2f','%')}</div></div>
        <div><div style="font-size:9px;color:{_MUTED};letter-spacing:0.07em;margin-bottom:3px;">PRU</div>
             <div style="font-size:16px;font-weight:600;">{_m(pru,',.4f')}</div></div>
        <div><div style="font-size:9px;color:{_MUTED};letter-spacing:0.07em;margin-bottom:3px;">COURS ACTUEL</div>
             <div style="font-size:16px;font-weight:600;">{_m(current,',.4f')}</div></div>
      </div>
    </div>
    """, unsafe_allow_html=True)

    # ── Buy button ───────────────────────────────────────────────────────────
    _fiche_b1, _fiche_b2 = st.columns([1, 5])
    with _fiche_b1:
        _render_exchange_links(ticker, asset_class)

    # ── Asset description ─────────────────────────────────────────────────────
    if is_crypto:
        from backend.analytics import classify_crypto_category
        cat = classify_crypto_category(ticker)
        st.markdown(
            f'<div style="margin-bottom:0.75rem;">'
            f'<span style="background:#1e293b;border:1px solid {acc}44;color:{acc};padding:2px 10px;'
            f'font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">{cat}</span>'
            f'</div>',
            unsafe_allow_html=True,
        )
    else:
        with st.spinner("Infos…"):
            info = cached_ticker_info(ticker)
        if info:
            tags = [t for t in [info.get("sector"), info.get("industry"), info.get("country")] if t]
            tags_html = "".join(
                f'<span style="background:#1e293b;border:1px solid {_BORDER};color:{_MUTED};'
                f'padding:2px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;'
                f'text-transform:uppercase;margin-right:6px;">{t}</span>'
                for t in tags
            )
            cap = ""
            if info.get("market_cap"):
                cap = (f'  <span style="color:{_MUTED};font-size:11px;">'
                       f'Market cap : {info["market_cap"]/1e9:.1f} Md {info.get("currency","")}</span>')
            st.markdown(f'<div style="margin-bottom:0.5rem;">{tags_html}{cap}</div>', unsafe_allow_html=True)
            if info.get("summary"):
                st.caption(info["summary"])

    # ── Period selector ───────────────────────────────────────────────────────
    period_opts = {"6 mois": ("6mo", 180), "1 an": ("1y", 365), "2 ans": ("2y", 730)}
    _pc1, _pc2 = st.columns([3, 5])
    with _pc1:
        p_sel = st.radio("Période", list(period_opts.keys()), index=1,
                         horizontal=True, key=f"fiche_period_{ticker}_{asset_class}")
    yf_period, cg_days = period_opts[p_sel]

    # ── Indicator toggles ────────────────────────────────────────────────────
    with _pc2:
        _ic1, _ic2, _ic3, _ic4, _ic5 = st.columns(5)
        show_ma20  = _ic1.checkbox("MA20",  value=False, key=f"ma20_{ticker}_{asset_class}")
        show_ma50  = _ic2.checkbox("MA50",  value=False, key=f"ma50_{ticker}_{asset_class}")
        show_ma200 = _ic3.checkbox("MA200", value=False, key=f"ma200_{ticker}_{asset_class}")
        show_rsi   = _ic4.checkbox("RSI",   value=False, key=f"rsi_{ticker}_{asset_class}")
        show_macd  = _ic5.checkbox("MACD",  value=False, key=f"macd_{ticker}_{asset_class}")

    # ── Fetch raw price history ───────────────────────────────────────────────
    with st.spinner("Chargement du cours…"):
        if is_crypto:
            positions_c = get_positions(asset_class="crypto")
            id_ov = {p["ticker"]: p["coingecko_id"]
                     for p in positions_c
                     if p["ticker"] == ticker and p.get("coingecko_id")}
            price_series = cached_crypto_raw_history(ticker, cg_days, tuple(id_ov.items()))
        else:
            price_series = cached_raw_history(ticker, yf_period)

    # ── Price chart with indicators ───────────────────────────────────────────
    if not price_series.empty:
        n_rows   = 1 + int(show_macd) + int(show_rsi)
        row_heights = [1.0]
        if show_macd: row_heights.append(0.35)
        if show_rsi:  row_heights.append(0.3)

        if n_rows > 1:
            fig_p = make_subplots(
                rows=n_rows, cols=1,
                shared_xaxes=True,
                vertical_spacing=0.04,
                row_heights=row_heights,
            )
        else:
            fig_p = go.Figure()

        def _add(trace, row=1, col=1):
            if n_rows > 1:
                fig_p.add_trace(trace, row=row, col=col)
            else:
                fig_p.add_trace(trace)

        # Price line
        _add(go.Scatter(
            x=price_series.index, y=price_series.values,
            mode="lines", name="Cours",
            line=dict(width=2, color=acc),
            fill="tozeroy" if n_rows == 1 else None,
            fillcolor=acc_alpha if n_rows == 1 else None,
            hovertemplate="%{x|%d %b %Y}<br><b>%{y:,.4f}</b><extra></extra>",
        ))

        # Moving averages
        _MA_COLORS = {20: "#facc15", 50: "#60a5fa", 200: "#f472b6"}
        for window, show in [(20, show_ma20), (50, show_ma50), (200, show_ma200)]:
            if show and len(price_series) >= window:
                ma = _compute_ma(price_series, window)
                _add(go.Scatter(
                    x=ma.index, y=ma.values, mode="lines",
                    name=f"MA{window}",
                    line=dict(width=1.5, color=_MA_COLORS[window], dash="dot"),
                    hovertemplate=f"MA{window}: %{{y:,.4f}}<extra></extra>",
                ))

        # Buy / sell markers
        buys_x, buys_y, buys_text = [], [], []
        sells_x, sells_y, sells_text = [], [], []
        for t in txs:
            tx_date = pd.Timestamp(t["tx_date"])
            if tx_date in price_series.index:
                marker_y = float(price_series[tx_date])
            else:
                closest = price_series.index.asof(tx_date)
                marker_y = float(price_series[closest]) if closest is not pd.NaT else t["price"]
            total = abs(t["quantity"] * t["price"])
            label = (f"{'Achat' if t['quantity']>=0 else 'Vente'}<br>"
                     f"Qté : {abs(t['quantity']):.4f}<br>"
                     f"Prix : {t['price']:,.4f} €<br>Total : {total:,.2f} €")
            if t["quantity"] >= 0:
                buys_x.append(tx_date); buys_y.append(marker_y); buys_text.append(label)
            else:
                sells_x.append(tx_date); sells_y.append(marker_y); sells_text.append(label)

        if buys_x:
            _add(go.Scatter(
                x=buys_x, y=buys_y, mode="markers", name="Achat",
                marker=dict(symbol="triangle-up", size=12, color=_C_GAIN,
                            line=dict(color="#ffffff", width=1)),
                text=buys_text, hovertemplate="%{text}<extra></extra>",
            ))
        if sells_x:
            _add(go.Scatter(
                x=sells_x, y=sells_y, mode="markers", name="Vente",
                marker=dict(symbol="triangle-down", size=12, color=_C_LOSS,
                            line=dict(color="#ffffff", width=1)),
                text=sells_text, hovertemplate="%{text}<extra></extra>",
            ))

        if pru and pd.notna(pru) and pru > 0:
            if n_rows > 1:
                fig_p.add_hline(y=pru, line_dash="dot", line_color=_MUTED, line_width=1,
                                annotation_text=f"PRU {pru:,.4f}",
                                annotation_position="bottom right",
                                annotation_font=dict(color=_MUTED, size=10),
                                row=1, col=1)
            else:
                fig_p.add_hline(y=pru, line_dash="dot", line_color=_MUTED, line_width=1,
                                annotation_text=f"PRU {pru:,.4f}",
                                annotation_position="bottom right",
                                annotation_font=dict(color=_MUTED, size=10))

        # MACD panel
        _macd_row = 2 if show_macd else None
        if show_macd and len(price_series) >= 26:
            macd_line, sig_line, hist = _compute_macd(price_series)
            hist_colors = [_C_GAIN if v >= 0 else _C_LOSS for v in hist.fillna(0)]
            fig_p.add_trace(go.Bar(
                x=hist.index, y=hist.values, name="MACD Histo",
                marker_color=hist_colors, opacity=0.6,
                hovertemplate="Histo: %{y:,.4f}<extra></extra>",
            ), row=_macd_row, col=1)
            fig_p.add_trace(go.Scatter(
                x=macd_line.index, y=macd_line.values, mode="lines",
                name="MACD", line=dict(width=1.5, color="#60a5fa"),
                hovertemplate="MACD: %{y:,.4f}<extra></extra>",
            ), row=_macd_row, col=1)
            fig_p.add_trace(go.Scatter(
                x=sig_line.index, y=sig_line.values, mode="lines",
                name="Signal", line=dict(width=1.5, color="#f59e0b", dash="dot"),
                hovertemplate="Signal: %{y:,.4f}<extra></extra>",
            ), row=_macd_row, col=1)
            fig_p.update_yaxes(title_text="MACD", title_font=dict(size=9, color=_MUTED),
                               gridcolor=_BORDER, row=_macd_row, col=1)

        # RSI panel
        _rsi_row = (2 if (show_rsi and not show_macd) else 3) if show_rsi else None
        if show_rsi and len(price_series) >= 14:
            rsi = _compute_rsi(price_series)
            fig_p.add_trace(go.Scatter(
                x=rsi.index, y=rsi.values, mode="lines",
                name="RSI(14)", line=dict(width=1.5, color="#a78bfa"),
                hovertemplate="RSI: %{y:.1f}<extra></extra>",
            ), row=_rsi_row, col=1)
            fig_p.add_hline(y=70, line_dash="dot", line_color=_C_LOSS,  line_width=1,
                            row=_rsi_row, col=1)
            fig_p.add_hline(y=30, line_dash="dot", line_color=_C_GAIN,  line_width=1,
                            row=_rsi_row, col=1)
            fig_p.update_yaxes(title_text="RSI", title_font=dict(size=9, color=_MUTED),
                               range=[0, 100], gridcolor=_BORDER, row=_rsi_row, col=1)

        total_height = 320 + int(show_macd) * 140 + int(show_rsi) * 120
        layout_kw = {**_CHART, "margin": dict(l=0, r=0, t=8, b=0)}
        layout_kw.update(
            height=total_height, hovermode="x unified",
            legend=dict(orientation="h", yanchor="bottom", y=1.01, x=0),
            showlegend=bool(buys_x or sells_x or show_ma20 or show_ma50 or show_ma200
                            or show_rsi or show_macd),
        )
        if n_rows > 1:
            layout_kw["xaxis"] = dict(gridcolor=_BORDER, showticklabels=False)
            layout_kw[f"xaxis{n_rows}"] = dict(gridcolor=_BORDER)
            layout_kw["yaxis"] = dict(gridcolor=_BORDER)
        else:
            layout_kw["xaxis"] = dict(gridcolor=_BORDER)
            layout_kw["yaxis"] = dict(gridcolor=_BORDER)
        fig_p.update_layout(**layout_kw)
        st.plotly_chart(fig_p, use_container_width=True)
    else:
        st.caption("Historique de prix indisponible pour ce ticker.")

    # ── Transaction history ───────────────────────────────────────────────────
    with st.expander("Historique des transactions", expanded=False):
        if txs:
            tx_rows = []
            for t in txs:
                is_buy = t["quantity"] >= 0
                tx_rows.append({
                    "Date": t["tx_date"], "Type": "Achat" if is_buy else "Vente",
                    "Quantité": f"{abs(t['quantity']):.6f}",
                    "Prix": f"{t['price']:,.6f} €",
                    "Total": f"{abs(t['quantity'] * t['price']):,.2f} €",
                    "Frais": f"{t['fees']:.2f} €" if t["fees"] else "—",
                })
            st.dataframe(pd.DataFrame(tx_rows), hide_index=True, use_container_width=True)
            total_bought = sum(abs(t["quantity"] * t["price"]) for t in txs if t["quantity"] >= 0)
            st.caption(f"{sum(1 for t in txs if t['quantity']>=0)} achat(s) · "
                       f"{total_bought:,.2f} € investis · Qté : {qty:.6f}")
        else:
            st.caption("Aucune transaction enregistrée.")

        if has_price and pd.notna(pru) and pru > 0:
            ratio     = current / pru
            bar_color = _C_GAIN if ratio >= 1 else _C_LOSS
            bar_pct   = min(100, ratio * 50)
            st.markdown(f"""
            <div style="margin-top:0.75rem;background:{_SURFACE};border:1px solid {_BORDER};
                        padding:0.75rem 1rem;">
              <div style="font-size:10px;color:{_MUTED};letter-spacing:0.06em;margin-bottom:6px;">COURS vs PRU</div>
              <div style="display:flex;justify-content:space-between;font-size:12px;color:{_TEXT};margin-bottom:6px;">
                <span>PRU : {pru:,.4f} €</span>
                <span style="color:{bar_color};font-weight:600;">{ratio:.2f}× {'▲' if ratio>=1 else '▼'}</span>
              </div>
              <div style="height:4px;background:#2d2d2d;">
                <div style="height:4px;width:{bar_pct:.0f}%;background:{bar_color};"></div>
              </div>
            </div>""", unsafe_allow_html=True)

    # ── AI analysis ───────────────────────────────────────────────────────────
    st.divider()
    ai_key  = f"fiche_ai_{ticker}_{asset_class}"
    btn_key = f"fiche_ai_btn_{ticker}_{asset_class}"

    ab1, ab2 = st.columns([2, 6])
    with ab1:
        run_ai = st.button("▶ RECOMMANDATION IA", key=btn_key, type="primary",
                           use_container_width=True)
    with ab2:
        if ai_key in st.session_state:
            st.caption("Analyse en cache — cliquez pour actualiser.")

    if run_ai:
        prompt = build_asset_analysis_prompt(ticker, name, asset_class, row, txs)
        with st.spinner("Analyse IA en cours…"):
            result = run_analysis(prompt)
        st.session_state[ai_key] = result

    if ai_key in st.session_state:
        results = st.session_state[ai_key]
        model_labels = {"gemini": "Model Alpha (Gemini)", "groq": "Model Beta (Groq)"}
        for mk, res in results.items():
            label = model_labels.get(mk, mk)
            if res.get("error"):
                st.warning(f"{label} : {res['error']}")
            elif res.get("text"):
                with st.expander(f"◎ {label}", expanded=True):
                    st.markdown(res["text"])


@st.dialog("Fiche de l'actif", width="large")
def _show_fiche_dialog(ticker: str, asset_class: str, df: "pd.DataFrame", prices: dict):
    _render_asset_fiche(ticker, asset_class, df, prices)


def _maybe_open_fiche(ticker: str, asset_class: str, df: "pd.DataFrame", prices: dict):
    key = (ticker, asset_class)
    if key != st.session_state.get("_fiche_last"):
        st.session_state["_fiche_last"] = key
        _show_fiche_dialog(ticker, asset_class, df, prices)


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
        st.rerun()

# Load data once per script run — no caching needed, st.rerun() guarantees fresh data
_df_stocks, _prices_stocks = load_portfolio()
_df_crypto, _prices_crypto = load_crypto_portfolio()

# ── Alert check (once per session load) ────────────────────────────────────────
if "alerts_checked" not in st.session_state:
    st.session_state["alerts_checked"] = True
    _active_alerts = get_alerts(active_only=True)
    if _active_alerts:
        _all_prices: dict[str, float] = {}
        _all_prices.update(_prices_stocks or {})
        _all_prices.update(_prices_crypto or {})
        _missing_stk = [a["ticker"] for a in _active_alerts
                        if a["asset_class"] == "stock" and a["ticker"] not in _all_prices]
        _missing_cry = [a["ticker"] for a in _active_alerts
                        if a["asset_class"] == "crypto" and a["ticker"] not in _all_prices]
        if _missing_stk:
            try: _all_prices.update(get_current_prices(_missing_stk))
            except Exception: pass
        if _missing_cry:
            try: _all_prices.update(get_crypto_prices(_missing_cry))
            except Exception: pass
        _triggered = check_alerts(_all_prices)
        if _triggered:
            st.session_state["alert_banners"] = _triggered
            if smtp_configured():
                _ok, _err = send_alert_email(_triggered)
                st.session_state["alert_mail_ok"]  = _ok
                st.session_state["alert_mail_err"] = _err
            if telegram_configured():
                send_telegram(_triggered)
            if discord_configured():
                send_discord(_triggered)

# ── Alert banners (shown above tabs) ────────────────────────────────────────────
if st.session_state.get("alert_banners"):
    _banners = st.session_state["alert_banners"]
    _mail_note = ""
    if st.session_state.get("alert_mail_ok") is True:
        _mail_note = "  ·  mail envoyé"
    elif st.session_state.get("alert_mail_err"):
        _mail_note = f"  ·  mail échoué : {st.session_state['alert_mail_err'][:60]}"
    _brows = ""
    for _b in _banners:
        _bm = ALERT_PURPOSE_META.get(_b["alert_type"], ALERT_PURPOSE_META["above"])
        _bc = _C_GAIN if _bm["condition"] == "above" else _C_LOSS
        _bd = _bm["icon"]
        _bl = _b.get("label") or _bm["label"]
        _brows += (
            f"<span style='margin-right:20px;'>"
            f"<span style='color:{_MUTED};'>{_b['ticker']}</span>"
            f"&nbsp;<span style='color:{_bc};font-weight:700;'>{_bd} {_bl}</span>"
            f"&nbsp;<span style='color:{_TEXT};'>{_b.get('current_price',0):,.4f}</span>"
            f"&nbsp;<span style='color:{_MUTED};font-size:10px;'>seuil {_b['threshold']:,.4f}</span>"
            f"</span>"
        )
    st.markdown(
        f"<div style='background:#1a0a0a;border:1px solid {_C_LOSS};"
        f"border-left:3px solid {_C_LOSS};padding:0.75rem 1.25rem;"
        f"margin-bottom:0.75rem;display:flex;align-items:center;gap:12px;flex-wrap:wrap;'>"
        f"<span style='font-size:10px;font-weight:700;text-transform:uppercase;"
        f"letter-spacing:0.08em;color:{_C_LOSS};white-space:nowrap;'>◉ ALERTE</span>"
        f"<span style='font-size:13px;flex:1;'>{_brows}</span>"
        f"<span style='font-size:10px;color:{_MUTED};white-space:nowrap;'>{_mail_note}</span>"
        f"</div>",
        unsafe_allow_html=True,
    )

tab_dashboard, tab_stocks, tab_crypto, tab_alerts, tab_watchlist, tab_fiscal = st.tabs([
    "▣  Dashboard",
    "◈  Actions / ETF",
    "₿  Crypto",
    "◉  Alertes",
    "◎  Watchlist",
    "📊  Fiscal",
])


# ══════════════════════════════════════════════════════════════════════════════
# TAB 1 — Vue d'ensemble
# ══════════════════════════════════════════════════════════════════════════════

with tab_dashboard:
    df, prices = _df_stocks, _prices_stocks
    df_c_ov = _df_crypto

    has_stocks = df is not None
    has_crypto_ov = df_c_ov is not None
    has_any = has_stocks or has_crypto_ov

    if not has_any:
        st.info("Aucune position. Rendez-vous dans **Gérer mes positions** ou **₿ Crypto** pour commencer.")
    else:
        s_stk = portfolio_summary(df) if has_stocks else {"total_invested": 0, "total_value": 0, "total_gain": 0, "total_gain_pct": 0}
        s_cry = portfolio_summary(df_c_ov) if has_crypto_ov else {"total_invested": 0, "total_value": 0, "total_gain": 0, "total_gain_pct": 0}

        glob_invested = s_stk["total_invested"] + s_cry["total_invested"]
        glob_value    = s_stk["total_value"]    + s_cry["total_value"]
        glob_gain     = s_stk["total_gain"]     + s_cry["total_gain"]
        glob_gain_pct = (glob_gain / (glob_value - glob_gain) * 100) if (glob_value - glob_gain) > 0 else 0
        total_pos     = (len(df) if has_stocks else 0) + (len(df_c_ov) if has_crypto_ov else 0)

        # ── KPIs globaux ──────────────────────────────────────────────────────
        k1, k2, k3, k4, k5 = st.columns(5)
        k1.metric("Capital total investi", f"{glob_invested:,.0f} €")
        k2.metric("Valeur totale du portefeuille", f"{glob_value:,.0f} €")
        k3.metric(
            "Gain / Perte global",
            f"{glob_gain:+,.0f} €",
            delta=f"{glob_gain_pct:+.2f}%",
        )
        k4.metric("Positions totales", total_pos)
        _pfu_latent = max(glob_gain, 0) * _PFU
        k5.metric(
            "Fiscalité latente (PFU 30%)",
            f"−{_pfu_latent:,.0f} €" if _pfu_latent > 0 else "—",
            help="Estimation PFU 30% (12.8% IR + 17.2% PS) sur la plus-value nette latente si tout est vendu aujourd'hui.",
        )

        # ── Évolution du portefeuille ─────────────────────────────────────────
        st.divider()
        st.subheader("Évolution du portefeuille")
        _tl_opts = {"6 mois": ("6mo", 180), "1 an": ("1y", 365), "2 ans": ("2y", 730)}
        _tl_label = st.radio("Période", list(_tl_opts.keys()), index=1,
                             horizontal=True, key="tl_period")
        _tl_yf_period, _tl_days = _tl_opts[_tl_label]
        all_stk_txs = get_transactions(asset_class="stock")
        all_cry_txs = get_transactions(asset_class="crypto")
        _stk_tks = list({t["ticker"] for t in all_stk_txs}) if all_stk_txs else []
        _cry_tks = list({t["ticker"] for t in all_cry_txs}) if all_cry_txs else []
        with st.spinner("Reconstruction de l'historique…"):
            _df_stk_raw = cached_multi_raw_history(tuple(_stk_tks), _tl_yf_period) if _stk_tks else pd.DataFrame()
            _cry_id_ov  = {p["ticker"]: p["coingecko_id"] for p in get_positions("crypto") if p.get("coingecko_id")}
            _df_cry_raw = cached_crypto_multi_raw_history(
                tuple(_cry_tks), _tl_days, tuple(_cry_id_ov.items())
            ) if _cry_tks else pd.DataFrame()
        if not _df_stk_raw.empty:
            _df_stk_raw = _df_stk_raw[~_df_stk_raw.index.duplicated(keep="last")]
        if not _df_cry_raw.empty:
            _df_cry_raw = _df_cry_raw[~_df_cry_raw.index.duplicated(keep="last")]
        _price_combined = pd.concat(
            [_d for _d in [_df_stk_raw, _df_cry_raw] if not _d.empty], axis=1
        ).ffill() if (_stk_tks or _cry_tks) else pd.DataFrame()
        _tl_df = build_portfolio_timeline(all_stk_txs + all_cry_txs, _price_combined)
        if not _tl_df.empty:
            _tl_is_gain    = _tl_df["PnL (€)"].iloc[-1] >= 0
            _tl_color      = _C_GAIN if _tl_is_gain else _C_LOSS
            _tl_fill_lo    = "rgba(16,185,129,0.08)" if _tl_is_gain else "rgba(248,113,113,0.08)"
            _tl_fill_hi    = "rgba(16,185,129,0.12)" if _tl_is_gain else "rgba(248,113,113,0.12)"
            fig_tl = go.Figure()
            fig_tl.add_trace(go.Scatter(
                x=_tl_df["Date"], y=_tl_df["Valeur (€)"], name="Valeur", mode="lines",
                line=dict(width=2.5, color=_tl_color), fill="tozeroy", fillcolor=_tl_fill_lo,
                hovertemplate="%{x|%d %b %Y}<br>Valeur : <b>%{y:,.0f} €</b><extra></extra>",
            ))
            fig_tl.add_trace(go.Scatter(
                x=_tl_df["Date"], y=_tl_df["Investi (€)"], name="Investi", mode="lines",
                line=dict(width=1.5, color=_MUTED, dash="dot"),
                hovertemplate="%{x|%d %b %Y}<br>Investi : <b>%{y:,.0f} €</b><extra></extra>",
            ))
            fig_tl.add_trace(go.Scatter(
                x=pd.concat([_tl_df["Date"], _tl_df["Date"][::-1]]),
                y=pd.concat([_tl_df["Valeur (€)"], _tl_df["Investi (€)"][::-1]]),
                fill="toself", fillcolor=_tl_fill_hi,
                line=dict(width=0), showlegend=False, hoverinfo="skip",
            ))
            fig_tl.update_layout(
                **{**_CHART, "margin": dict(l=0, r=0, t=8, b=0)},
                height=340, hovermode="x unified",
                xaxis=dict(gridcolor=_BORDER), yaxis=dict(gridcolor=_BORDER, title="€"),
                legend=dict(orientation="h", yanchor="bottom", y=1.01, x=0),
            )
            st.plotly_chart(fig_tl, use_container_width=True)
            _last = _tl_df.iloc[-1]
            _pnl_pct = (_last["PnL (€)"] / _last["Investi (€)"] * 100) if _last["Investi (€)"] > 0 else 0
            _sc1, _sc2, _sc3 = st.columns(3)
            _sc1.metric("Valeur actuelle", f"{_last['Valeur (€)']:,.0f} €")
            _sc2.metric("Capital investi", f"{_last['Investi (€)']:,.0f} €")
            _sc3.metric("P&L latent", f"{_last['PnL (€)']:+,.0f} €", delta=f"{_pnl_pct:+.2f}%")
        else:
            st.caption("Historique de prix insuffisant pour reconstruire la timeline.")

        # ── Benchmark comparison ──────────────────────────────────────────────
        if not _tl_df.empty:
            st.divider()
            st.subheader("Comparaison benchmark")
            _bm_col1, _bm_col2 = st.columns([5, 3])
            with _bm_col1:
                _bm_c1, _bm_c2, _bm_c3 = st.columns(3)
                _bm_sp500 = _bm_c1.checkbox("S&P 500", value=True, key="bm_sp500")
                _bm_cac   = _bm_c2.checkbox("CAC 40",  value=False, key="bm_cac")
                _bm_btc   = _bm_c3.checkbox("BTC",     value=False, key="bm_btc")

            if _bm_sp500 or _bm_cac or _bm_btc:
                _tl_start = pd.Timestamp(_tl_df["Date"].iloc[0])
                _tl_end   = pd.Timestamp(_tl_df["Date"].iloc[-1])

                # Normalize portfolio value to 100 from start
                _port_vals = _tl_df.set_index("Date")["Valeur (€)"]
                _port_vals.index = pd.to_datetime(_port_vals.index)
                _port_norm = _port_vals / _port_vals.iloc[0] * 100

                _bm_colors = {"Mon portefeuille": _tl_color,
                              "S&P 500": "#60a5fa", "CAC 40": "#f59e0b", "BTC": _C_CRYPTO}
                fig_bm = go.Figure()
                fig_bm.add_trace(go.Scatter(
                    x=_port_norm.index, y=_port_norm.values,
                    mode="lines", name="Mon portefeuille",
                    line=dict(width=2.5, color=_tl_color),
                    hovertemplate="%{x|%d %b %Y}<br>Portfolio: <b>%{y:.1f}</b><extra></extra>",
                ))

                _bm_fetch_days = max(365, int((_tl_end - _tl_start).days) + 30)
                _bm_fetch_period = ("5y" if _bm_fetch_days > 730
                                    else "2y" if _bm_fetch_days > 365
                                    else "1y")

                _bm_specs = []
                if _bm_sp500: _bm_specs.append(("^GSPC",  "S&P 500",  False))
                if _bm_cac:   _bm_specs.append(("^FCHI",  "CAC 40",   False))
                if _bm_btc:   _bm_specs.append(("BTC",    "BTC",      True))

                with st.spinner("Chargement des benchmarks…"):
                    for _bm_tk, _bm_name, _bm_is_crypto in _bm_specs:
                        try:
                            if _bm_is_crypto:
                                _bm_s = cached_crypto_raw_history(
                                    _bm_tk, _bm_fetch_days,
                                    (("BTC", "bitcoin"),),
                                )
                            else:
                                _bm_s = cached_raw_history(_bm_tk, _bm_fetch_period)
                            if _bm_s.empty:
                                continue
                            _bm_s.index = pd.to_datetime(_bm_s.index)
                            _bm_s = _bm_s[_bm_s.index >= _tl_start]
                            if len(_bm_s) < 2:
                                continue
                            _bm_norm = _bm_s / _bm_s.iloc[0] * 100
                            fig_bm.add_trace(go.Scatter(
                                x=_bm_norm.index, y=_bm_norm.values,
                                mode="lines", name=_bm_name,
                                line=dict(width=1.5, color=_bm_colors[_bm_name], dash="dot"),
                                hovertemplate=f"%{{x|%d %b %Y}}<br>{_bm_name}: <b>%{{y:.1f}}</b><extra></extra>",
                            ))
                        except Exception:
                            pass

                fig_bm.add_hline(y=100, line_dash="dot", line_color=_MUTED, line_width=1)
                fig_bm.update_layout(
                    **{**_CHART, "margin": dict(l=0, r=0, t=8, b=0)},
                    height=320, hovermode="x unified",
                    xaxis=dict(gridcolor=_BORDER),
                    yaxis=dict(gridcolor=_BORDER, title="Base 100"),
                    legend=dict(orientation="h", yanchor="bottom", y=1.01, x=0),
                )
                st.plotly_chart(fig_bm, use_container_width=True)
                st.caption("Base 100 = valeur à la date de la première transaction. "
                           "Courbes en pointillés = benchmarks. "
                           "Données S&P 500 et CAC 40 via Yahoo Finance.")

        # ── Répartition Bourse / Crypto ──────────────────────────────────────
        if has_stocks and has_crypto_ov and glob_value > 0:
            st.divider()
            st.subheader("Répartition globale des actifs")
            ba, bb = st.columns([3, 2])
            with ba:
                stk_pct = s_stk["total_value"] / glob_value * 100
                cry_pct = s_cry["total_value"] / glob_value * 100
                fig_split = go.Figure(go.Bar(
                    x=[s_stk["total_value"], s_cry["total_value"]],
                    y=["Bourse / ETF", "Crypto"],
                    orientation="h",
                    marker=dict(color=[_C_GAIN, _C_CRYPTO], line=dict(width=0)),
                    text=[f"{stk_pct:.1f}%  —  {s_stk['total_value']:,.0f} €",
                          f"{cry_pct:.1f}%  —  {s_cry['total_value']:,.0f} €"],
                    textposition="auto",
                    textfont=dict(size=12, color="#000000"),
                    hovertemplate="%{y}: %{x:,.0f} €<extra></extra>",
                ))
                fig_split.update_layout(
                    **{**_CHART, "margin": dict(l=0, r=20, t=8, b=0)},
                    height=130,
                    xaxis=dict(showgrid=False, showticklabels=False, range=[0, glob_value * 1.1]),
                    yaxis=dict(showgrid=False, tickfont=dict(size=13)),
                    bargap=0.4,
                )
                st.plotly_chart(fig_split, use_container_width=True)
            with bb:
                bk1, bk2 = st.columns(2)
                bk1.metric("Bourse / ETF", f"{s_stk['total_value']:,.0f} €",
                           delta=f"{s_stk['total_gain_pct']:+.1f}%")
                bk2.metric("Crypto", f"{s_cry['total_value']:,.0f} €",
                           delta=f"{s_cry['total_gain_pct']:+.1f}%")

        if has_stocks:
            st.divider()
            st.subheader("Actions / ETF — Répartition")
            alerts_d = compute_concentration_alerts(df)
            if alerts_d:
                for lvl, msg in alerts_d:
                    (st.error if lvl == "error" else st.warning)(msg)
            df_vd = df.dropna(subset=["Valeur (€)"])
            if not df_vd.empty:
                tot_vd = df_vd["Valeur (€)"].sum()
                df_bd = df_vd.assign(pct=df_vd["Valeur (€)"] / tot_vd * 100).sort_values("pct", ascending=True)
                fig_bd = go.Figure(go.Bar(
                    x=df_bd["pct"], y=df_bd["Ticker"], orientation="h",
                    marker=dict(
                        color=[_PALETTE[i % len(_PALETTE)] for i in range(len(df_bd))],
                        line=dict(width=0),
                    ),
                    text=[f"{p:.1f}%" for p in df_bd["pct"]], textposition="outside",
                    textfont=dict(size=11, color=_TEXT),
                    hovertemplate="%{y}: %{x:.1f}%<extra></extra>",
                ))
                fig_bd.update_layout(
                    **_CHART, height=max(140, len(df_bd) * 26),
                    xaxis=dict(showgrid=False, showticklabels=False, range=[0, df_bd["pct"].max() * 1.3]),
                    yaxis=dict(showgrid=False, tickfont=dict(size=11)), bargap=0.3,
                )
                st.plotly_chart(fig_bd, use_container_width=True)

        if has_crypto_ov:
            st.divider()
            st.subheader("Crypto — Répartition")
            alerts_cd = compute_crypto_concentration_alerts(df_c_ov)
            if alerts_cd:
                for lvl, msg in alerts_cd:
                    (st.error if lvl == "error" else st.warning)(msg)
            df_cvd = df_c_ov.dropna(subset=["Valeur (€)"])
            if not df_cvd.empty:
                tot_cvd = df_cvd["Valeur (€)"].sum()
                df_bcd = df_cvd.assign(pct=df_cvd["Valeur (€)"] / tot_cvd * 100).sort_values("pct", ascending=True)
                fig_bcd = go.Figure(go.Bar(
                    x=df_bcd["pct"], y=df_bcd["Ticker"], orientation="h",
                    marker=dict(
                        color=[_PALETTE[i % len(_PALETTE)] for i in range(len(df_bcd))],
                        line=dict(width=0),
                    ),
                    text=[f"{p:.1f}%" for p in df_bcd["pct"]], textposition="outside",
                    textfont=dict(size=11, color=_TEXT),
                    hovertemplate="%{y}: %{x:.1f}%<extra></extra>",
                ))
                fig_bcd.update_layout(
                    **_CHART, height=max(140, len(df_bcd) * 26),
                    xaxis=dict(showgrid=False, showticklabels=False, range=[0, df_bcd["pct"].max() * 1.3]),
                    yaxis=dict(showgrid=False, tickfont=dict(size=11)), bargap=0.3,
                )
                st.plotly_chart(fig_bcd, use_container_width=True)

        # ── Vue géographique ──────────────────────────────────────────────────
        if has_any:
            st.divider()
            st.subheader("Exposition géographique")

            crypto_val_for_geo = s_cry["total_value"] if has_crypto_ov else 0.0
            df_geo = compute_geographic_allocation(
                df if has_stocks else None,
                crypto_total_value=crypto_val_for_geo,
            )

            if not df_geo.empty:
                geo_total = df_geo["Valeur (€)"].sum()
                df_geo["Pct"] = df_geo["Valeur (€)"] / geo_total * 100

                gmap_col, gbar_col = st.columns([3, 2])

                with gmap_col:
                    df_map = df_geo[df_geo["ISO3"].notna()].copy()
                    if not df_map.empty:
                        fig_map = go.Figure(go.Choropleth(
                            locations=df_map["ISO3"],
                            z=df_map["Valeur (€)"],
                            text=df_map["Région"],
                            colorscale=[[0, "#1a2a1a"], [0.5, "#10b981"], [1.0, "#34d399"]],
                            autocolorscale=False,
                            marker_line_color="#2d2d2d",
                            marker_line_width=0.5,
                            colorbar=dict(
                                title=dict(text="Valeur (€)", font=dict(color=_TEXT, size=10)),
                                thickness=12,
                                len=0.6,
                                tickfont=dict(color=_TEXT, size=10),
                            ),
                            hovertemplate="<b>%{text}</b><br>%{z:,.0f} €<extra></extra>",
                        ))
                        fig_map.update_layout(
                            **{**_CHART, "margin": dict(l=0, r=0, t=8, b=0)},
                            height=320,
                            geo=dict(
                                showframe=False,
                                showcoastlines=True,
                                coastlinecolor="#2d2d2d",
                                showland=True,
                                landcolor="#1a1a1a",
                                showocean=True,
                                oceancolor="#121212",
                                showlakes=False,
                                bgcolor="rgba(0,0,0,0)",
                                projection_type="natural earth",
                            ),
                        )
                        st.plotly_chart(fig_map, use_container_width=True)
                    else:
                        st.caption("Aucun pays mappé — tickers non reconnus.")

                with gbar_col:
                    df_gbar = df_geo.sort_values("Valeur (€)", ascending=True)
                    colors = [
                        _C_CRYPTO if r == "Décentralisé (Crypto)"
                        else _C_WARN if r in ("Monde", "Europe", "Marchés émergents", "Asie-Pacifique")
                        else _PALETTE[i % len(_PALETTE)]
                        for i, r in enumerate(df_gbar["Région"])
                    ]
                    fig_gbar = go.Figure(go.Bar(
                        x=df_gbar["Pct"],
                        y=df_gbar["Région"],
                        orientation="h",
                        marker=dict(color=colors, line=dict(width=0)),
                        text=[f"{p:.1f}%  —  {v:,.0f} €"
                              for p, v in zip(df_gbar["Pct"], df_gbar["Valeur (€)"])],
                        textposition="outside",
                        textfont=dict(size=10, color=_TEXT),
                        hovertemplate="%{y}: %{x:.1f}%<extra></extra>",
                    ))
                    fig_gbar.update_layout(
                        **{**_CHART, "margin": dict(l=0, r=60, t=8, b=0)},
                        height=max(200, len(df_gbar) * 36),
                        xaxis=dict(showgrid=False, showticklabels=False,
                                   range=[0, df_gbar["Pct"].max() * 1.5]),
                        yaxis=dict(showgrid=False, tickfont=dict(size=11)),
                        bargap=0.3,
                    )
                    st.plotly_chart(fig_gbar, use_container_width=True)

                # Alerte diversification géographique
                us_pct = df_geo.loc[df_geo["Région"] == "États-Unis", "Pct"].sum()
                if us_pct > 70:
                    st.warning(
                        f"**Concentration géographique** : {us_pct:.0f}% de ton portefeuille "
                        f"est exposé aux États-Unis. Envisage d'ajouter de l'exposition "
                        f"Europe / Asie / Marchés émergents."
                    )

    # ── Rebalancing tool ──────────────────────────────────────────────────────
    if glob_value > 0:
        st.divider()
        st.subheader("⚖️ Rééquilibrage du portefeuille")
        st.caption("Définis tes cibles d'allocation et calcule les ordres buy/sell nécessaires.")

        # Build unified position list (stocks + crypto with valid prices)
        _rb_rows: list[dict] = []
        if has_stocks and not df.empty:
            for _, _rr in df.iterrows():
                if pd.notna(_rr.get("Valeur (€)")) and _rr["Valeur (€)"] > 0:
                    _rb_rows.append({
                        "ticker": _rr["Ticker"], "name": _rr["Nom"],
                        "asset_class": "stock", "value": _rr["Valeur (€)"],
                    })
        if has_crypto_ov and not df_c_ov.empty:
            for _, _rr in df_c_ov.iterrows():
                if pd.notna(_rr.get("Valeur (€)")) and _rr["Valeur (€)"] > 0:
                    _rb_rows.append({
                        "ticker": _rr["Ticker"], "name": _rr["Nom"],
                        "asset_class": "crypto", "value": _rr["Valeur (€)"],
                    })

        if not _rb_rows:
            st.caption("Aucune position valorisée disponible.")
        else:
            _rb_total_val = sum(r["value"] for r in _rb_rows)
            for _r in _rb_rows:
                _r["current_pct"] = _r["value"] / _rb_total_val * 100

            # Capital disponible input
            _rb_extra = st.number_input(
                "Capital additionnel à déployer (€)",
                min_value=0.0, value=0.0, step=100.0, format="%.0f",
                help="Montant supplémentaire que tu souhaites investir en plus du portefeuille existant.",
                key="rb_extra_capital",
            )
            _rb_future_total = _rb_total_val + _rb_extra

            # Initialize / load target percentages from session state
            _rb_sk = {r["ticker"] + "_" + r["asset_class"]: r for r in _rb_rows}
            for _rk, _rv in _rb_sk.items():
                skey = f"rb_target_{_rk}"
                if skey not in st.session_state:
                    st.session_state[skey] = round(_rv["current_pct"], 1)

            # ── Target allocation inputs (table layout) ───────────────────────
            _rbt_h = st.columns([1.2, 2, 0.9, 1, 1.1, 1.1, 1.4])
            for _hc, _hl in zip(_rbt_h,
                ["TICKER", "NOM", "CLASSE", "VALEUR ACT.", "ALLOC. ACT.", "CIBLE %", "ACTION"]):
                _hc.markdown(
                    f"<div style='font-size:9px;color:{_MUTED};letter-spacing:0.07em;"
                    f"font-weight:600;padding-bottom:4px;border-bottom:1px solid {_BORDER};'>"
                    f"{_hl}</div>",
                    unsafe_allow_html=True,
                )
            st.write("")

            _rb_targets: dict[str, float] = {}
            for _r in _rb_rows:
                _rk    = _r["ticker"] + "_" + _r["asset_class"]
                _skey  = f"rb_target_{_rk}"
                _ac_c  = _C_CRYPTO if _r["asset_class"] == "crypto" else _C_GAIN
                _ac_lb = "₿" if _r["asset_class"] == "crypto" else "◈"

                _rc1, _rc2, _rc3, _rc4, _rc5, _rc6, _rc7 = st.columns(
                    [1.2, 2, 0.9, 1, 1.1, 1.1, 1.4]
                )
                _rc1.markdown(
                    f"<span style='font-weight:700;font-size:13px;color:{_TEXT};'>{_r['ticker']}</span>",
                    unsafe_allow_html=True,
                )
                _rc2.markdown(
                    f"<span style='font-size:11px;color:{_MUTED};'>{_r['name'][:22]}</span>",
                    unsafe_allow_html=True,
                )
                _rc3.markdown(
                    f"<span style='font-size:11px;font-weight:700;color:{_ac_c};'>{_ac_lb}</span>",
                    unsafe_allow_html=True,
                )
                _rc4.markdown(
                    f"<span style='font-size:12px;color:{_TEXT};'>{_r['value']:,.0f} €</span>",
                    unsafe_allow_html=True,
                )
                _rc5.markdown(
                    f"<span style='font-size:12px;color:{_MUTED};'>{_r['current_pct']:.1f}%</span>",
                    unsafe_allow_html=True,
                )

                target_pct = _rc6.number_input(
                    "Cible", min_value=0.0, max_value=100.0,
                    value=float(st.session_state[_skey]),
                    step=0.5, format="%.1f",
                    key=f"rb_inp_{_rk}", label_visibility="collapsed",
                )
                st.session_state[_skey] = target_pct
                _rb_targets[_rk] = target_pct

                # Compute action
                _target_val  = _rb_future_total * target_pct / 100
                _delta       = _target_val - _r["value"]
                _delta_color = _C_GAIN if _delta >= 0 else _C_LOSS
                _delta_icon  = "▲ Acheter" if _delta >= 0 else "▼ Vendre"
                _delta_str   = f"{_delta_icon} {abs(_delta):,.0f} €"
                _rc7.markdown(
                    f"<span style='font-size:11px;font-weight:600;color:{_delta_color};'>"
                    f"{_delta_str}</span>",
                    unsafe_allow_html=True,
                )

            st.write("")
            _rb_total_target = sum(_rb_targets.values())
            _rb_diff = _rb_total_target - 100.0

            # Total target indicator
            _rbs1, _rbs2, _rbs3 = st.columns([2, 2, 4])
            _rb_sum_color = _C_GAIN if abs(_rb_diff) < 0.1 else _C_WARN if abs(_rb_diff) < 5 else _C_LOSS
            _rbs1.markdown(
                f"<div style='font-size:12px;'>Total cible : "
                f"<span style='font-weight:700;color:{_rb_sum_color};'>{_rb_total_target:.1f}%</span>"
                f"&nbsp;&nbsp;<span style='font-size:10px;color:{_rb_sum_color};'>"
                f"({'OK' if abs(_rb_diff)<0.1 else f'{_rb_diff:+.1f}% vs 100%'})"
                f"</span></div>",
                unsafe_allow_html=True,
            )

            # Reset button
            with _rbs2:
                if st.button("↺ Réinitialiser aux valeurs actuelles", key="rb_reset"):
                    for _r in _rb_rows:
                        _rk = _r["ticker"] + "_" + _r["asset_class"]
                        st.session_state[f"rb_target_{_rk}"] = round(_r["current_pct"], 1)
                    st.rerun()

            # Distribute remaining % button
            if abs(_rb_diff) > 0.1:
                with _rbs3:
                    st.caption(
                        f"{'Réduire' if _rb_diff>0 else 'Augmenter'} les cibles de "
                        f"{abs(_rb_diff):.1f}% au total pour atteindre 100%."
                    )

            # ── Summary cards ─────────────────────────────────────────────────
            _rb_buys  = sum(
                max(0, _rb_future_total * _rb_targets[_r["ticker"]+"_"+_r["asset_class"]] / 100 - _r["value"])
                for _r in _rb_rows
            )
            _rb_sells = sum(
                max(0, _r["value"] - _rb_future_total * _rb_targets[_r["ticker"]+"_"+_r["asset_class"]] / 100)
                for _r in _rb_rows
            )
            st.write("")
            _sm1, _sm2, _sm3, _sm4 = st.columns(4)
            _sm1.metric("Achats nécessaires",  f"{_rb_buys:,.0f} €")
            _sm2.metric("Ventes nécessaires",  f"{_rb_sells:,.0f} €")
            _sm3.metric("Net à déployer",      f"{_rb_buys - _rb_sells:+,.0f} €")
            _sm4.metric("Capital additionnel", f"{_rb_extra:,.0f} €",
                        delta="inclus dans le calcul" if _rb_extra > 0 else None)

            # ── Chart: current vs target ───────────────────────────────────────
            st.write("")
            _rb_tickers   = [r["ticker"] for r in _rb_rows]
            _rb_cur_pcts  = [r["current_pct"] for r in _rb_rows]
            _rb_tgt_pcts  = [
                _rb_targets[r["ticker"] + "_" + r["asset_class"]] for r in _rb_rows
            ]
            fig_rb = go.Figure()
            fig_rb.add_trace(go.Bar(
                name="Alloc. actuelle", x=_rb_tickers, y=_rb_cur_pcts,
                marker_color=_MUTED, opacity=0.7,
                text=[f"{v:.1f}%" for v in _rb_cur_pcts], textposition="auto",
                textfont=dict(size=10, color="#000"),
                hovertemplate="%{x}: %{y:.1f}%<extra>Actuelle</extra>",
            ))
            fig_rb.add_trace(go.Bar(
                name="Alloc. cible", x=_rb_tickers, y=_rb_tgt_pcts,
                marker_color=_C_GAIN, opacity=0.85,
                text=[f"{v:.1f}%" for v in _rb_tgt_pcts], textposition="auto",
                textfont=dict(size=10, color="#000"),
                hovertemplate="%{x}: %{y:.1f}%<extra>Cible</extra>",
            ))
            fig_rb.update_layout(
                **{**_CHART, "margin": dict(l=0, r=0, t=8, b=0)},
                height=280, barmode="group",
                xaxis=dict(gridcolor=_BORDER, tickfont=dict(size=11)),
                yaxis=dict(gridcolor=_BORDER, title="%"),
                legend=dict(orientation="h", yanchor="bottom", y=1.01, x=0),
            )
            st.plotly_chart(fig_rb, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════════
# TAB 2 — Actions / ETF
# ══════════════════════════════════════════════════════════════════════════════

_MODEL_CFG = {
    "gemini": {"label": "Model Alpha", "badge": "AUTO",    "badge_class": "active",    "color": _C_GAIN,   "bar": _C_GAIN},
    "groq":   {"label": "Model Beta",  "badge": "AUTO",    "badge_class": "active",    "color": "#60a5fa", "bar": "#60a5fa"},
    "claude": {"label": "Model Gamma", "badge": "MANUEL",  "badge_class": "evaluating","color": "#c084fc", "bar": "#c084fc"},
    "llama":  {"label": "Model Beta",  "badge": "AUTO",    "badge_class": "active",    "color": "#60a5fa", "bar": "#60a5fa"},
}


with tab_stocks:
    sub_stk_ov, sub_stk_manage, sub_stk_sim, sub_stk_ai, sub_stk_div = st.tabs([
        "▣  Vue d'ensemble",
        "◈  Mes positions",
        "⟳  Simulateur DCA",
        "◎  Analyse IA",
        "💰  Dividendes",
    ])

    # ══ STOCKS — Vue d'ensemble ═══════════════════════════════════════════════
    with sub_stk_ov:
        df, prices = _df_stocks, _prices_stocks
        if df is None:
            st.info("Aucune position. Rendez-vous dans **Mes positions** pour commencer.")
        else:
            summary = portfolio_summary(df)
            hhi = compute_hhi(df)
            alerts = compute_concentration_alerts(df)
            ks1, ks2, ks3, ks4 = st.columns(4)
            ks1.metric("Capital investi", f"{summary['total_invested']:,.0f} €")
            ks2.metric("Valeur actuelle", f"{summary['total_value']:,.0f} €")
            ks3.metric("Gain / Perte", f"{summary['total_gain']:+,.0f} €", delta=f"{summary['total_gain_pct']:+.2f}%")
            ks4.metric("Positions", len(df))

            if alerts:
                for level, msg in alerts:
                    (st.error if level == "error" else st.warning)(msg)

            st.divider()

            # ── Row 1 : allocation + secteurs + HHI ───────────────────────────
            c1, c2, c3 = st.columns([2.5, 2.5, 1.5])
            df_v = df.dropna(subset=["Valeur (€)"])

            with c1:
                st.subheader("Répartition par valeur")
                if not df_v.empty:
                    total_v = df_v["Valeur (€)"].sum()
                    df_bar = df_v.assign(pct=df_v["Valeur (€)"] / total_v * 100).sort_values("pct", ascending=True)
                    fig = go.Figure(go.Bar(
                        x=df_bar["pct"], y=df_bar["Ticker"], orientation="h",
                        marker=dict(color=[_PALETTE[i % len(_PALETTE)] for i in range(len(df_bar))], line=dict(width=0)),
                        text=[f"{p:.1f}%" for p in df_bar["pct"]], textposition="outside",
                        textfont=dict(size=11, color=_TEXT),
                        hovertemplate="%{y}: %{x:.1f}%<extra></extra>",
                    ))
                    fig.update_layout(
                        **_CHART, height=max(220, len(df_bar) * 34),
                        xaxis=dict(showgrid=False, showticklabels=False, range=[0, df_bar["pct"].max() * 1.25]),
                        yaxis=dict(showgrid=False, tickfont=dict(size=12)), bargap=0.3,
                    )
                    st.plotly_chart(fig, use_container_width=True)

            with c2:
                st.subheader("Répartition par secteur")
                df_sec = compute_sector_allocation(df_v) if not df_v.empty else pd.DataFrame()
                if not df_sec.empty:
                    total_s = df_sec["Valeur (€)"].sum()
                    df_sec = df_sec.assign(pct=df_sec["Valeur (€)"] / total_s * 100).sort_values("pct", ascending=True)
                    fig2 = go.Figure(go.Bar(
                        x=df_sec["pct"], y=df_sec["Secteur"], orientation="h",
                        marker=dict(color=[_PALETTE[i % len(_PALETTE)] for i in range(len(df_sec))], line=dict(width=0)),
                        text=[f"{p:.1f}%" for p in df_sec["pct"]], textposition="outside",
                        textfont=dict(size=11, color=_TEXT),
                        hovertemplate="%{y}: %{x:.1f}%<extra></extra>",
                    ))
                    fig2.update_layout(
                        **_CHART, height=max(220, len(df_sec) * 38),
                        xaxis=dict(showgrid=False, showticklabels=False, range=[0, df_sec["pct"].max() * 1.3]),
                        yaxis=dict(showgrid=False, tickfont=dict(size=11)), bargap=0.3,
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

            # ── Performance bar ────────────────────────────────────────────────
            st.subheader("Performance par position")
            df_perf = df.dropna(subset=["Perf (%)"]).sort_values("Perf (%)")
            if not df_perf.empty:
                _stk_perf_sel = st.multiselect(
                    "Filtrer les positions :", sorted(df_perf["Ticker"].tolist()),
                    default=sorted(df_perf["Ticker"].tolist()),
                    key="stk_perf_filter", placeholder="Toutes les positions…",
                )
                if _stk_perf_sel:
                    df_perf = df_perf[df_perf["Ticker"].isin(_stk_perf_sel)]
                fig_bar = go.Figure(go.Bar(
                    x=df_perf["Perf (%)"], y=df_perf["Ticker"], orientation="h",
                    marker_color=[_C_LOSS if v < 0 else _C_GAIN for v in df_perf["Perf (%)"]],
                    text=[f"{v:+.2f}%" for v in df_perf["Perf (%)"]],
                    textposition="outside", textfont=dict(size=11, color=_TEXT),
                ))
                fig_bar.update_layout(
                    **_CHART, height=max(200, len(df_perf) * 40),
                    xaxis_title="Performance (%)",
                    xaxis=dict(gridcolor=_BORDER, zerolinecolor=_BORDER),
                    yaxis=dict(gridcolor="rgba(0,0,0,0)"), bargap=0.35,
                )
                ev_stk_perf = st.plotly_chart(fig_bar, use_container_width=True,
                                              on_select="rerun", key="ev_stk_perf")
                pts = (ev_stk_perf or {}).get("selection", {}).get("points", [])
                if pts:
                    tk = pts[0].get("y")
                    if tk and tk in df["Ticker"].values:
                        _maybe_open_fiche(tk, "stock", df, prices)

            st.divider()

            # ── Historical chart + benchmark ───────────────────────────────────
            st.subheader("Évolution normalisée — base 100")
            p_options = {"6 mois": "6mo", "1 an": "1y", "2 ans": "2y", "5 ans": "5y"}
            hc1, hc2 = st.columns([3, 1])
            with hc1:
                p_label = st.selectbox("Période", list(p_options.keys()), index=1, key="hist_p")
            with hc2:
                show_bench = st.checkbox("S&P 500 (réf.)", value=True, key="hist_bench")
            _hist_sel = st.multiselect(
                "Filtrer les actifs :", sorted(df["Ticker"].tolist()),
                default=sorted(df["Ticker"].tolist()),
                key="hist_ticker_filter", placeholder="Tous les actifs…",
            )
            tickers_tuple = tuple(_hist_sel if _hist_sel else df["Ticker"].tolist())
            with st.spinner("Chargement…"):
                df_hist  = cached_history(tickers_tuple, p_options[p_label])
                df_bench = cached_history(("SPY",), p_options[p_label]) if show_bench else pd.DataFrame()
            if not df_hist.empty:
                fig_h = go.Figure()
                for i, col in enumerate(df_hist.columns):
                    fig_h.add_trace(go.Scatter(
                        x=df_hist.index, y=df_hist[col], name=col, mode="lines",
                        line=dict(width=2, color=_PALETTE[i % len(_PALETTE)]),
                    ))
                if not df_bench.empty:
                    fig_h.add_trace(go.Scatter(
                        x=df_bench.index, y=df_bench.iloc[:, 0],
                        name="S&P 500 (réf.)", mode="lines",
                        line=dict(width=1.5, color=_MUTED, dash="dash"), opacity=0.7,
                    ))
                fig_h.add_hline(y=100, line_dash="dot", line_color=_BORDER, line_width=1)
                fig_h.update_layout(
                    **_CHART, height=360, hovermode="x unified",
                    yaxis_title="Base 100",
                    xaxis=dict(gridcolor=_BORDER), yaxis=dict(gridcolor=_BORDER),
                    legend=dict(bgcolor="rgba(26,26,26,0.9)", bordercolor=_BORDER,
                                borderwidth=1, font=dict(size=11)),
                )
                st.plotly_chart(fig_h, use_container_width=True)

                val_weights = {r["Ticker"]: (r["Valeur (€)"] or 0)
                               for _, r in df.iterrows() if pd.notna(r.get("Valeur (€)"))}
                risk = compute_risk_metrics(df_hist, value_weights=val_weights)
                if risk:
                    st.markdown("**Métriques de risque du portefeuille (période sélectionnée)**")
                    rk1, rk2, rk3, rk4 = st.columns(4)
                    rk1.metric("Rendement total",  f"{risk['total_return']:+.1f}%")
                    rk2.metric("Volatilité ann.",   f"{risk['volatility']:.1f}%")
                    rk3.metric("Sharpe ratio",      f"{risk['sharpe']:.2f}",
                               help="Rendement ajusté du risque (taux sans risque 2.5%). > 1 = bon, > 2 = excellent.")
                    rk4.metric("Max Drawdown",      f"{risk['max_drawdown']:.1f}%",
                               help="Perte maximale depuis un pic sur la période.")

                if len(df_hist.columns) > 1:
                    with st.expander("Matrice de corrélation", expanded=False):
                        corr = df_hist.pct_change().dropna().corr().round(2)
                        fig_corr = go.Figure(go.Heatmap(
                            z=corr.values, x=corr.columns.tolist(), y=corr.index.tolist(),
                            colorscale=[[0, _C_LOSS], [0.5, "#1a1a1a"], [1, _C_GAIN]],
                            zmid=0, zmin=-1, zmax=1, text=corr.values,
                            texttemplate="%{text:.2f}", textfont=dict(size=11),
                            hovertemplate="%{y} / %{x} : %{z:.2f}<extra></extra>",
                        ))
                        fig_corr.update_layout(
                            **{**_CHART, "margin": dict(l=0, r=0, t=8, b=0)},
                            height=max(260, len(corr) * 46),
                            xaxis=dict(tickfont=dict(size=11)),
                            yaxis=dict(tickfont=dict(size=11)),
                        )
                        st.plotly_chart(fig_corr, use_container_width=True)
                        st.caption(
                            "1 = corrélation parfaite · 0 = indépendants · -1 = opposés. "
                            "Des corrélations élevées (> 0.7) réduisent les bénéfices de la diversification."
                        )
            else:
                st.caption("Historique indisponible — certains tickers sont des codes broker non-standard.")

            st.divider()
            st.subheader("Détail des positions")
            st.caption("Cliquez sur une ligne pour ouvrir la fiche de l'actif.")
            ev_stk_tbl = st.dataframe(
                _fmt_df(df), width="stretch", hide_index=True,
                on_select="rerun", selection_mode="single-row", key="ev_stk_tbl",
            )
            rows_sel = (ev_stk_tbl or {}).get("selection", {}).get("rows", [])
            if rows_sel:
                _maybe_open_fiche(df.iloc[rows_sel[0]]["Ticker"], "stock", df, prices)

            # Quick buy strip
            _qb_tickers = df["Ticker"].tolist()
            _qb_cols = st.columns(min(len(_qb_tickers), 8))
            for _qbi, (_qbc, _qbt) in enumerate(zip(_qb_cols, _qb_tickers)):
                with _qbc:
                    _render_exchange_links(_qbt, "stock", compact=True)


    # ══ STOCKS — Mes positions ═══════════════════════════════════════════════
    with sub_stk_manage:

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
                    _stk_plat_opts = ["— Non précisé"] + STOCK_PLATFORM_NAMES
                    _stk_platform  = st.selectbox(
                        "Plateforme d'achat", _stk_plat_opts, key="stk_platform_sel",
                        help="Mémorisé pour adapter le bouton Acheter et les mails d'alerte.",
                    )
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
                            _plat_val = None if _stk_platform == "— Non précisé" else _stk_platform
                            add_transaction(ticker_sel, name_sel, tx_date.isoformat(),
                                            qty, price, fees, platform=_plat_val)
                            st.success(f"{qty:.4f} × {ticker_sel} enregistré — PRU mis à jour.")
                            for k in ("prefill_ticker", "prefill_name", "price_hint"):
                                st.session_state[k] = "" if k != "price_hint" else None
                            st.rerun()
                        except Exception as e:
                            st.error(f"Erreur : {e}")
        else:
            st.caption("Recherche un titre ci-dessus pour l'ajouter.")

        st.divider()
        st.subheader("Enregistrer une vente")
        _sell_positions = get_positions(asset_class="stock")
        if not _sell_positions:
            st.caption("Aucune position à vendre.")
        else:
            with st.expander("Vendre / Alléger une position", expanded=False):
                _sell_opts = {f"{p['ticker']} — {p['name']}": p for p in _sell_positions}
                _sell_sel_label = st.selectbox(
                    "Position à vendre", list(_sell_opts.keys()), key="sell_pos_sel"
                )
                _sell_pos = _sell_opts[_sell_sel_label]
                _sell_ticker = _sell_pos["ticker"]
                _sell_max_qty = _sell_pos["quantity"]
                _sell_pru = _sell_pos["avg_buy_price"]

                st.caption(
                    f"Position actuelle : **{_sell_max_qty:.6f}** unités · PRU **{_sell_pru:.4f} €**"
                )

                with st.form("sell_form", clear_on_submit=True):
                    sv1, sv2, sv3, sv4 = st.columns([2, 2, 2, 2])
                    with sv1:
                        _sv_date = st.date_input("Date de vente", value=_date.today(), key="sv_date")
                    with sv2:
                        _sv_qty = st.number_input(
                            "Quantité vendue",
                            min_value=0.000001, max_value=float(_sell_max_qty),
                            step=1.0, format="%.6f", key="sv_qty",
                        )
                    with sv3:
                        _sv_price = st.number_input(
                            "Prix de vente / action",
                            min_value=0.0001, step=0.01, format="%.4f", key="sv_price",
                        )
                    with sv4:
                        _sv_fees = st.number_input(
                            "Frais (€)", min_value=0.0, step=0.01, format="%.2f",
                            value=0.0, key="sv_fees",
                        )

                    if _sv_qty > 0 and _sv_price > 0:
                        _sv_pnl = (_sv_price - _sell_pru) * _sv_qty - _sv_fees
                        _sv_pnl_pct = (_sv_price / _sell_pru - 1) * 100 if _sell_pru > 0 else 0.0
                        _sv_col = _C_GAIN if _sv_pnl >= 0 else _C_LOSS
                        _sv_pfu = max(_sv_pnl, 0) * _PFU
                        _sv_net = _sv_pnl - _sv_pfu
                        st.markdown(
                            f"<div style='background:{_SURFACE};border:1px solid {_BORDER};"
                            f"padding:10px 14px;margin:8px 0;font-size:12px;'>"
                            f"<div style='display:flex;gap:24px;flex-wrap:wrap;'>"
                            f"<span style='color:{_MUTED};'>P&amp;L brut : "
                            f"<span style='color:{_sv_col};font-weight:700;'>"
                            f"{_sv_pnl:+,.2f} € ({_sv_pnl_pct:+.2f}%)</span></span>"
                            + (
                                f"<span style='color:{_MUTED};'>PFU 30% : "
                                f"<span style='color:{_C_LOSS};font-weight:600;'>"
                                f"−{_sv_pfu:,.2f} €</span></span>"
                                f"<span style='color:{_MUTED};'>Net après impôt : "
                                f"<span style='color:{_sv_col};font-weight:700;'>"
                                f"{_sv_net:+,.2f} €</span></span>"
                                if _sv_pnl > 0 else ""
                            )
                            + f"</div></div>",
                            unsafe_allow_html=True,
                        )
                    _sv_submit = st.form_submit_button(
                        "Enregistrer cette vente", type="primary", use_container_width=True
                    )

                if _sv_submit:
                    if _sv_qty <= 0 or _sv_price <= 0:
                        st.error("Quantité et prix doivent être > 0.")
                    elif _sv_qty > _sell_max_qty:
                        st.error(f"Quantité supérieure à la position ({_sell_max_qty:.6f}).")
                    else:
                        try:
                            add_transaction(
                                _sell_ticker,
                                _sell_pos["name"],
                                _sv_date.isoformat(),
                                -_sv_qty,
                                _sv_price,
                                _sv_fees,
                            )
                            st.success(
                                f"Vente de {_sv_qty:.4f} × {_sell_ticker} enregistrée. "
                                f"PRU mis à jour."
                            )
                            st.rerun()
                        except Exception as _e:
                            st.error(f"Erreur : {_e}")

        st.divider()
        st.subheader("Mes positions")

        positions = get_positions(asset_class="stock")
        if not positions:
            st.info("Aucune position enregistrée.")
        else:
            prices_manage = _prices_stocks
            for p in positions:
                txs = get_transactions(p["ticker"], asset_class="stock")
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

                    _render_exchange_links(p["ticker"], "stock")
                    st.markdown("---")
                    st.caption("Historique des transactions")
                    _stk_hdr = st.columns([1.8, 1.5, 1.8, 1.2, 1.8, 1])
                    for _hc, _hl in zip(_stk_hdr, ["Date", "Quantité", "Prix/action", "Frais", "Plateforme", ""]):
                        _hc.markdown(
                            f"<span style='font-size:10px;color:{_MUTED};"
                            f"text-transform:uppercase;letter-spacing:0.05em;'>{_hl}</span>",
                            unsafe_allow_html=True,
                        )
                    for t in txs:
                        _tx_type_col = _C_GAIN if t["quantity"] >= 0 else _C_LOSS
                        _tc1, _tc2, _tc3, _tc4, _tc5, _tc6 = st.columns([1.8, 1.5, 1.8, 1.2, 1.8, 1])
                        _cur = t.get("currency", "EUR")
                        _tc1.write(t["tx_date"])
                        _tc2.markdown(
                            f"<span style='color:{_tx_type_col};font-weight:600;'>"
                            f"{t['quantity']:+.6f}</span>",
                            unsafe_allow_html=True,
                        )
                        _tc3.write(f"{t['price']:.4f} {_cur}")
                        _tc4.write(f"{t['fees']:.2f} €" if t["fees"] else "—")
                        _pf_disp = t.get("platform") or "—"
                        _tc5.markdown(
                            f"<span style='font-size:11px;color:{_MUTED};'>{_pf_disp}</span>",
                            unsafe_allow_html=True,
                        )
                        with _tc6:
                            _ea, _da = st.columns(2)
                            with _ea:
                                if st.button("✎", key=f"edit_stk_tx_{t['id']}", help="Modifier"):
                                    st.session_state["editing_tx_id"] = (
                                        None if st.session_state["editing_tx_id"] == t["id"] else t["id"]
                                    )
                                    st.rerun()
                            with _da:
                                if st.button("✕", key=f"del_tx_{t['id']}", help="Supprimer"):
                                    delete_transaction(t["id"])
                                    if st.session_state["editing_tx_id"] == t["id"]:
                                        st.session_state["editing_tx_id"] = None
                                    st.rerun()

                    # ── Inline edit form ──────────────────────────────────────
                    _editing_id = st.session_state.get("editing_tx_id")
                    _edit_tx = next((t for t in txs if t["id"] == _editing_id), None)
                    if _edit_tx:
                        _etx_id = _edit_tx["id"]
                        st.markdown(
                            f"<div style='background:{_SURFACE};border:1px solid {_C_WARN}44;"
                            f"border-left:3px solid {_C_WARN};padding:12px 16px;margin:10px 0;"
                            f"font-size:11px;color:{_C_WARN};text-transform:uppercase;"
                            f"letter-spacing:0.07em;font-weight:700;'>✎ Modifier — transaction #{_etx_id}</div>",
                            unsafe_allow_html=True,
                        )
                        with st.form(f"stk_edit_form_{_edit_tx['id']}", clear_on_submit=False):
                            _ef1, _ef2 = st.columns(2)
                            with _ef1:
                                _e_type = st.radio(
                                    "Type", ["Achat", "Vente"],
                                    index=0 if _edit_tx["quantity"] >= 0 else 1,
                                    horizontal=True, key=f"e_type_{_edit_tx['id']}",
                                )
                                _e_date = st.date_input(
                                    "Date",
                                    value=_date.fromisoformat(_edit_tx["tx_date"]),
                                    key=f"e_date_{_edit_tx['id']}",
                                )
                                _e_qty = st.number_input(
                                    "Quantité (absolue)",
                                    min_value=0.000001,
                                    value=abs(_edit_tx["quantity"]),
                                    format="%.6f", key=f"e_qty_{_edit_tx['id']}",
                                )
                                _e_price = st.number_input(
                                    "Prix / action",
                                    min_value=0.0,
                                    value=float(_edit_tx["price"]),
                                    format="%.6f", key=f"e_price_{_edit_tx['id']}",
                                )
                            with _ef2:
                                _e_fees = st.number_input(
                                    "Frais",
                                    min_value=0.0,
                                    value=float(_edit_tx["fees"]),
                                    format="%.4f", key=f"e_fees_{_edit_tx['id']}",
                                )
                                _e_currency = st.text_input(
                                    "Devise",
                                    value=_edit_tx.get("currency", "EUR"),
                                    key=f"e_cur_{_edit_tx['id']}",
                                ).strip().upper()
                                _e_name = st.text_input(
                                    "Nom de l'actif",
                                    value=_edit_tx.get("name", ""),
                                    key=f"e_name_{_edit_tx['id']}",
                                )
                                _stk_pf_all = ["— Non précisé"] + STOCK_PLATFORM_NAMES
                                _stk_pf_cur = _edit_tx.get("platform") or "— Non précisé"
                                _stk_pf_idx = _stk_pf_all.index(_stk_pf_cur) if _stk_pf_cur in _stk_pf_all else 0
                                _e_platform = st.selectbox(
                                    "Plateforme",
                                    _stk_pf_all,
                                    index=_stk_pf_idx,
                                    key=f"e_plat_{_edit_tx['id']}",
                                )
                            _ef_save, _ef_cancel = st.columns(2)
                            with _ef_save:
                                _e_saved = st.form_submit_button(
                                    "Enregistrer les modifications",
                                    type="primary", use_container_width=True,
                                )
                            with _ef_cancel:
                                _e_cancelled = st.form_submit_button(
                                    "Annuler", use_container_width=True
                                )

                        if _e_saved:
                            _signed_qty = _e_qty if _e_type == "Achat" else -_e_qty
                            _plat_save  = None if _e_platform == "— Non précisé" else _e_platform
                            update_transaction(
                                _edit_tx["id"],
                                tx_date=_e_date.isoformat(),
                                quantity=_signed_qty,
                                price=_e_price,
                                fees=_e_fees,
                                currency=_e_currency or "EUR",
                                name=_e_name or p["name"],
                                platform=_plat_save,
                            )
                            st.session_state["editing_tx_id"] = None
                            st.success("Transaction mise à jour.")
                            st.rerun()
                        if _e_cancelled:
                            st.session_state["editing_tx_id"] = None
                            st.rerun()

                    st.markdown("---")
                    if st.button(f"Supprimer la position {p['ticker']}",
                                 key=f"del_pos_{p['ticker']}"):
                        delete_position(p["ticker"])
                        st.rerun()


    # ══ STOCKS — Simulateur DCA ══════════════════════════════════════════════
    with sub_stk_sim:
        st.subheader("Simulateur DCA")
        st.caption(
            "Compare une stratégie d'investissement programmé (DCA) — un montant fixe chaque mois — "
            "contre un achat unique (Lump Sum) pour n'importe quel actif."
        )
        _dca_positions = get_positions(asset_class="stock") or []
        _dca_pos_labels = {f"{p['ticker']} — {p['name']}": p["ticker"] for p in _dca_positions}
        dca_c1, dca_c2 = st.columns([3, 2])
        with dca_c1:
            _dca_mode = st.radio("Actif", ["Depuis mes positions", "Saisir un ticker manuellement"],
                                 horizontal=True, key="dca_mode")
            if _dca_mode == "Depuis mes positions" and _dca_pos_labels:
                _dca_sel = st.selectbox("Position :", list(_dca_pos_labels.keys()), key="dca_pos_sel")
                _dca_ticker = _dca_pos_labels[_dca_sel]
            else:
                _dca_ticker = st.text_input("Ticker Yahoo Finance", placeholder="NVDA, AAPL, BTC-EUR…",
                                            key="dca_manual_ticker").strip().upper()
        with dca_c2:
            _dca_amount = st.number_input("Montant mensuel (€)", min_value=1.0,
                                          value=100.0, step=10.0, format="%.0f", key="dca_amount")
            _dca_start  = st.date_input("Date de début", value=_date(2023, 1, 1), key="dca_start")

        if st.button("Simuler", type="primary", key="dca_run") and _dca_ticker:
            with st.spinner(f"Récupération de l'historique de {_dca_ticker}…"):
                _dca_series = cached_raw_history(_dca_ticker, "5y")
            if _dca_series.empty:
                st.error(f"Historique introuvable pour {_dca_ticker}. Vérifie le symbole Yahoo Finance.")
            else:
                _dca_result = simulate_dca(_dca_series, float(_dca_amount), pd.Timestamp(_dca_start))
                if _dca_result.empty:
                    st.warning("Pas assez d'historique pour la période choisie.")
                else:
                    st.session_state["dca_result"] = _dca_result
                    st.session_state["dca_ticker"] = _dca_ticker
                    st.session_state["dca_amount"] = _dca_amount

        if "dca_result" in st.session_state and not st.session_state["dca_result"].empty:
            _dr   = st.session_state["dca_result"]
            _dtk  = st.session_state["dca_ticker"]
            _damt = st.session_state["dca_amount"]
            _lr   = _dr.iloc[-1]
            m1, m2, m3, m4 = st.columns(4)
            m1.metric("DCA — Valeur finale",     f"{_lr['DCA — Valeur']:,.0f} €")
            m2.metric("DCA — Total investi",     f"{_lr['DCA — Investi']:,.0f} €",
                      delta=f"{(_lr['DCA — Valeur']-_lr['DCA — Investi']):+,.0f} €")
            m3.metric("Lump Sum — Valeur finale",f"{_lr['Lump Sum — Valeur']:,.0f} €")
            m4.metric("Lump Sum — Budget",       f"{_lr['Lump Sum — Investi']:,.0f} €",
                      delta=f"{(_lr['Lump Sum — Valeur']-_lr['Lump Sum — Investi']):+,.0f} €")
            fig_dca = go.Figure()
            for col, color, dash in [
                ("DCA — Valeur",       _C_GAIN,   "solid"),
                ("DCA — Investi",      _C_GAIN,   "dot"),
                ("Lump Sum — Valeur",  _C_CRYPTO, "solid"),
                ("Lump Sum — Investi", _C_CRYPTO, "dot"),
            ]:
                fig_dca.add_trace(go.Scatter(
                    x=_dr["Date"], y=_dr[col], name=col, mode="lines",
                    line=dict(width=2.5 if dash=="solid" else 1.5, color=color, dash=dash),
                    opacity=1.0 if dash=="solid" else 0.6,
                ))
            fig_dca.update_layout(
                **{**_CHART, "margin": dict(l=0, r=0, t=8, b=0)},
                height=380, hovermode="x unified",
                xaxis=dict(gridcolor=_BORDER), yaxis=dict(gridcolor=_BORDER, title="€"),
                legend=dict(orientation="h", yanchor="bottom", y=1.01, x=0),
                title=dict(text=f"DCA {_damt:.0f} €/mois vs Lump Sum — {_dtk}",
                           font=dict(size=13, color=_TEXT), x=0),
            )
            st.plotly_chart(fig_dca, use_container_width=True)
            _winner = "DCA" if _lr["DCA — Valeur"] > _lr["Lump Sum — Valeur"] else "Lump Sum"
            _diff   = abs(_lr["DCA — Valeur"] - _lr["Lump Sum — Valeur"])
            st.info(
                f"Sur cette période, **{_winner}** surperforme de **{_diff:,.0f} €**. "
                f"Le DCA réduit le risque d'entrée mais peut sous-performer en tendance haussière forte."
            )

    # ══ STOCKS — Analyse IA ══════════════════════════════════════════════════
    with sub_stk_ai:
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
        df_ai = _df_stocks

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


    # ══ STOCKS — Dividendes ══════════════════════════════════════════════════
    with sub_stk_div:
        st.markdown("### 💰 Suivi des dividendes")
        st.caption("Enregistre tes dividendes reçus et consulte les données de rendement de tes positions.")

        _stk_positions = get_positions(asset_class="stock")

        # ── KPI overview ─────────────────────────────────────────────────────
        _all_divs = get_dividends()
        _current_year = str(_date.today().year)
        _div_total     = sum(d["total_received"] for d in _all_divs)
        _div_this_year = sum(d["total_received"] for d in _all_divs
                             if d["ex_date"].startswith(_current_year))
        _div_tickers   = len({d["ticker"] for d in _all_divs})

        _kd1, _kd2, _kd3 = st.columns(3)
        _kd1.metric("Total reçu (tous temps)", f"{_div_total:,.2f} €")
        _kd2.metric(f"Reçu en {_current_year}", f"{_div_this_year:,.2f} €")
        _kd3.metric("Actions versant un dividende", str(_div_tickers))

        st.divider()

        # ── Auto-scan : dividend info for each stock position ─────────────────
        if _stk_positions:
            st.subheader("Rendement des positions")
            st.caption("Données automatiques via Yahoo Finance — actualisées à chaque session.")

            _dv_rows = []
            with st.spinner("Récupération des données de dividende…"):
                for _sp in _stk_positions:
                    _dinfo = cached_dividend_info(_sp["ticker"])
                    _qty   = _sp["quantity"]
                    _rate  = _dinfo.get("dividend_rate")
                    _dv_rows.append({
                        "Ticker":         _sp["ticker"],
                        "Nom":            _sp["name"],
                        "Div/action/an":  f"{_rate:.4f} €"    if _rate   else "—",
                        "Rendement %":    f"{_dinfo['dividend_yield_pct']:.2f}%" if _dinfo.get("dividend_yield_pct") else "—",
                        "Revenu estimé/an": f"{_rate * _qty:,.2f} €" if _rate else "—",
                        "Prochain détachement": _dinfo.get("ex_dividend_date") or "—",
                        "Dernier dividende": _dinfo.get("last_dividend_date") or "—",
                        "Taux distribution": f"{_dinfo['payout_ratio']:.0f}%" if _dinfo.get("payout_ratio") else "—",
                        "_rate": _rate or 0,
                    })

            if _dv_rows:
                _dv_rows.sort(key=lambda r: (r["Prochain détachement"] == "—", r["Prochain détachement"]))
                _dv_display = [{k: v for k, v in r.items() if k != "_rate"} for r in _dv_rows]
                st.dataframe(pd.DataFrame(_dv_display), hide_index=True, use_container_width=True)

                _total_est = sum(r["_rate"] * next(
                    (p["quantity"] for p in _stk_positions if p["ticker"] == r["Ticker"]), 0
                ) for r in _dv_rows)
                if _total_est > 0:
                    st.success(f"Revenu dividende estimé total : **{_total_est:,.2f} €/an** "
                               f"({_total_est/12:,.2f} €/mois)")
        else:
            st.info("Aucune position en actions. Ajoute des transactions dans l'onglet **Mes positions**.")

        st.divider()

        # ── Record a dividend ─────────────────────────────────────────────────
        st.subheader("Enregistrer un dividende reçu")
        with st.form("div_add_form", clear_on_submit=True):
            _df1, _df2, _df3 = st.columns([2, 2, 2])

            if _stk_positions:
                _dv_opts = {f"{p['ticker']} — {p['name']}": p for p in _stk_positions}
                _dv_sel_key = _df1.selectbox("Position", list(_dv_opts.keys()))
                _dv_sel  = _dv_opts[_dv_sel_key]
                _dv_tk   = _dv_sel["ticker"]
                _dv_name = _dv_sel["name"]
                _dv_qty_default = float(_dv_sel["quantity"])
            else:
                _dv_tk   = _df1.text_input("Ticker").upper()
                _dv_name = _df1.text_input("Nom")
                _dv_qty_default = 0.0

            _dv_ex_date  = _df2.date_input("Date de détachement (ex-date)",
                                            value=_date.today(), key="div_ex_date")
            _dv_pay_date = _df3.date_input("Date de paiement (optionnel)",
                                            value=_date.today(), key="div_pay_date")

            _df4, _df5, _df6, _df7 = st.columns([2, 2, 1.5, 2])
            _dv_aps   = _df4.number_input("Montant / action (€)", min_value=0.0,
                                           step=0.0001, format="%.4f", key="div_aps")
            _dv_qty   = _df5.number_input("Quantité détenue", min_value=0.0,
                                           value=_dv_qty_default, step=0.001,
                                           format="%.6f", key="div_qty")
            _dv_cur   = _df6.selectbox("Devise", ["EUR", "USD", "GBP", "CHF"], key="div_cur")
            _dv_notes = _df7.text_input("Notes (optionnel)", key="div_notes")

            _dv_total_preview = _dv_aps * _dv_qty
            st.markdown(
                f"<div style='font-size:13px;color:{_C_GAIN};font-weight:600;padding:4px 0;'>"
                f"Total : {_dv_total_preview:,.4f} {_dv_cur}</div>",
                unsafe_allow_html=True,
            )
            _dv_submit = st.form_submit_button("Enregistrer le dividende", type="primary")
            if _dv_submit and _dv_tk and _dv_aps > 0 and _dv_qty > 0:
                add_dividend(
                    ticker=_dv_tk,
                    name=_dv_name,
                    ex_date=_dv_ex_date.isoformat(),
                    amount_per_share=_dv_aps,
                    quantity=_dv_qty,
                    pay_date=_dv_pay_date.isoformat(),
                    currency=_dv_cur,
                    notes=_dv_notes or None,
                )
                st.success(f"Dividende enregistré : {_dv_total_preview:,.4f} {_dv_cur} pour {_dv_tk}.")
                st.rerun()

        # ── Dividend history ──────────────────────────────────────────────────
        if _all_divs:
            st.divider()
            st.subheader("Historique des dividendes reçus")

            # Bar chart — monthly
            _dv_hist_df = pd.DataFrame(_all_divs)
            _dv_hist_df["month"] = pd.to_datetime(_dv_hist_df["ex_date"]).dt.to_period("M").astype(str)
            _dv_monthly = _dv_hist_df.groupby("month")["total_received"].sum().reset_index()
            if not _dv_monthly.empty:
                fig_dv = go.Figure(go.Bar(
                    x=_dv_monthly["month"], y=_dv_monthly["total_received"],
                    marker_color=_C_GAIN, opacity=0.85,
                    text=[f"{v:.2f} €" for v in _dv_monthly["total_received"]],
                    textposition="outside", textfont=dict(size=10, color=_TEXT),
                    hovertemplate="%{x}<br><b>%{y:,.2f} €</b><extra></extra>",
                ))
                fig_dv.update_layout(
                    **{**_CHART, "margin": dict(l=0, r=0, t=8, b=0)},
                    height=240,
                    xaxis=dict(gridcolor=_BORDER, tickfont=dict(size=10)),
                    yaxis=dict(gridcolor=_BORDER, title="€"),
                )
                st.plotly_chart(fig_dv, use_container_width=True)

            # Detail table with delete
            for _dv in _all_divs:
                _dvh1, _dvh2, _dvh3, _dvh4, _dvh5, _dvh6 = st.columns([1, 2, 1.2, 1.2, 2, 0.8])
                _dvh1.markdown(f"<span style='font-weight:700;font-size:13px;'>{_dv['ticker']}</span>", unsafe_allow_html=True)
                _dvh2.markdown(f"<span style='font-size:11px;color:{_MUTED};'>{_dv['name']}</span>", unsafe_allow_html=True)
                _dvh3.markdown(f"<span style='font-size:11px;'>Ex : {_dv['ex_date']}</span>", unsafe_allow_html=True)
                _dvh4.markdown(f"<span style='font-size:12px;font-weight:600;color:{_C_GAIN};'>{_dv['total_received']:,.4f} {_dv['currency']}</span>", unsafe_allow_html=True)
                _dvh5.markdown(f"<span style='font-size:10px;color:{_MUTED};'>{_dv.get('notes') or ''}</span>", unsafe_allow_html=True)
                if _dvh6.button("✕", key=f"del_div_{_dv['id']}", help="Supprimer"):
                    delete_dividend(_dv["id"])
                    st.rerun()
                st.markdown(f"<div style='height:1px;background:{_BORDER};margin:2px 0;'></div>", unsafe_allow_html=True)
        else:
            st.caption("Aucun dividende enregistré pour l'instant.")


    # ══════════════════════════════════════════════════════════════════════════════
# TAB 3 — ₿ Crypto
# ══════════════════════════════════════════════════════════════════════════════

with tab_crypto:
    sub_ov, sub_manage, sub_ai = st.tabs(
        ["▣  Vue d'ensemble", "◈  Mes positions", "◎  Analyse IA"]
    )

    # ══════════════════════════════════════════════════════════════════════════
    # CRYPTO — Vue d'ensemble
    # ══════════════════════════════════════════════════════════════════════════
    with sub_ov:
        df_c, prices_c = _df_crypto, _prices_crypto

        if df_c is None:
            st.info("Aucune position crypto. Rendez-vous dans **Mes positions** pour commencer.")
        else:
            sum_c = portfolio_summary(df_c)
            hhi_c = compute_hhi(df_c)
            alerts_c = compute_crypto_concentration_alerts(df_c)

            # ── KPIs ──────────────────────────────────────────────────────────
            ck1, ck2, ck3, ck4 = st.columns(4)
            ck1.metric("Capital crypto investi", f"{sum_c['total_invested']:,.0f} €")
            ck2.metric("Valeur actuelle", f"{sum_c['total_value']:,.0f} €")
            ck3.metric(
                "Gain / Perte",
                f"{sum_c['total_gain']:+,.0f} €",
                delta=f"{sum_c['total_gain_pct']:+.2f}%",
            )
            ck4.metric("Positions", len(df_c))

            if alerts_c:
                for lvl, msg in alerts_c:
                    (st.error if lvl == "error" else st.warning)(msg)

            st.divider()

            # ── Row 1 : allocation + catégories + HHI ─────────────────────────
            cc1, cc2, cc3 = st.columns([2.5, 2.5, 1.5])
            df_cv = df_c.dropna(subset=["Valeur (€)"])

            with cc1:
                st.subheader("Répartition par crypto")
                if not df_cv.empty:
                    tot_cv = df_cv["Valeur (€)"].sum()
                    df_cbar = df_cv.assign(pct=df_cv["Valeur (€)"] / tot_cv * 100).sort_values("pct", ascending=True)
                    fig_ca = go.Figure(go.Bar(
                        x=df_cbar["pct"], y=df_cbar["Ticker"], orientation="h",
                        marker=dict(
                            color=[_PALETTE[i % len(_PALETTE)] for i in range(len(df_cbar))],
                            line=dict(width=0),
                        ),
                        text=[f"{p:.1f}%" for p in df_cbar["pct"]], textposition="outside",
                        textfont=dict(size=11, color=_TEXT),
                        hovertemplate="%{y}: %{x:.1f}%<extra></extra>",
                    ))
                    fig_ca.update_layout(
                        **_CHART, height=max(220, len(df_cbar) * 34),
                        xaxis=dict(showgrid=False, showticklabels=False, range=[0, df_cbar["pct"].max() * 1.25]),
                        yaxis=dict(showgrid=False, tickfont=dict(size=12)), bargap=0.3,
                    )
                    st.plotly_chart(fig_ca, use_container_width=True)

            with cc2:
                st.subheader("Répartition par catégorie")
                df_ccat = compute_crypto_sector_allocation(df_cv) if not df_cv.empty else pd.DataFrame()
                if not df_ccat.empty:
                    tot_cat = df_ccat["Valeur (€)"].sum()
                    df_ccat = df_ccat.assign(pct=df_ccat["Valeur (€)"] / tot_cat * 100).sort_values("pct", ascending=True)
                    fig_cb = go.Figure(go.Bar(
                        x=df_ccat["pct"], y=df_ccat["Catégorie"], orientation="h",
                        marker=dict(
                            color=[_PALETTE[i % len(_PALETTE)] for i in range(len(df_ccat))],
                            line=dict(width=0),
                        ),
                        text=[f"{p:.1f}%" for p in df_ccat["pct"]], textposition="outside",
                        textfont=dict(size=11, color=_TEXT),
                        hovertemplate="%{y}: %{x:.1f}%<extra></extra>",
                    ))
                    fig_cb.update_layout(
                        **_CHART, height=max(220, len(df_ccat) * 38),
                        xaxis=dict(showgrid=False, showticklabels=False, range=[0, df_ccat["pct"].max() * 1.3]),
                        yaxis=dict(showgrid=False, tickfont=dict(size=11)), bargap=0.3,
                    )
                    st.plotly_chart(fig_cb, use_container_width=True)

            with cc3:
                _render_hhi_panel(hhi_c, low_thresh=0.30, mid_thresh=0.50, accent=_C_CRYPTO)

            st.divider()

            # ── Performance par crypto ─────────────────────────────────────────
            st.subheader("Performance par crypto")
            df_cperf = df_c.dropna(subset=["Perf (%)"]).copy()
            # Exclure les positions avec moins de 1€ investi (perf% non significative)
            df_cperf = df_cperf[df_cperf["Investi (€)"] >= 1.0].sort_values("Perf (%)")
            if not df_cperf.empty:
                fig_cp = go.Figure(go.Bar(
                    x=df_cperf["Perf (%)"], y=df_cperf["Ticker"], orientation="h",
                    marker_color=[_C_LOSS if v < 0 else _C_CRYPTO for v in df_cperf["Perf (%)"]],
                    text=[f"{v:+.2f}%" for v in df_cperf["Perf (%)"]],
                    textposition="outside", textfont=dict(size=11, color=_TEXT),
                ))
                fig_cp.update_layout(
                    **_CHART, height=max(200, len(df_cperf) * 40),
                    xaxis_title="Performance (%)",
                    xaxis=dict(gridcolor=_BORDER, zerolinecolor=_BORDER),
                    yaxis=dict(gridcolor="rgba(0,0,0,0)"), bargap=0.35,
                )
                st.plotly_chart(fig_cp, use_container_width=True)

            st.divider()

            # ── Évolution normalisée + benchmark BTC ──────────────────────────
            st.subheader("Évolution normalisée — base 100")
            cp_options = {"30 jours": 30, "90 jours": 90, "1 an": 365, "2 ans": 730}
            chc1, chc2 = st.columns([3, 1])
            with chc1:
                cp_label = st.selectbox("Période", list(cp_options.keys()), index=2, key="crypto_hist_p")
            with chc2:
                show_btc_bench = st.checkbox("BTC (réf.)", value=True, key="crypto_hist_bench")
            tickers_c_tuple = tuple(df_c["Ticker"].tolist())
            _btc_id_ov = tuple({"BTC": "bitcoin"}.items())
            with st.spinner("Récupération de l'historique (CoinGecko)…"):
                df_chist = cached_crypto_history(tickers_c_tuple, cp_options[cp_label])
                df_cbtc  = (
                    cached_crypto_history(("BTC",), cp_options[cp_label], _btc_id_ov)
                    if show_btc_bench and "BTC" not in tickers_c_tuple
                    else pd.DataFrame()
                )
            if not df_chist.empty:
                fig_ch = go.Figure()
                for i, col in enumerate(df_chist.columns):
                    fig_ch.add_trace(go.Scatter(
                        x=df_chist.index, y=df_chist[col], name=col, mode="lines",
                        line=dict(width=2, color=_PALETTE[i % len(_PALETTE)]),
                    ))
                if not df_cbtc.empty:
                    fig_ch.add_trace(go.Scatter(
                        x=df_cbtc.index, y=df_cbtc.iloc[:, 0],
                        name="BTC (réf.)", mode="lines",
                        line=dict(width=1.5, color=_MUTED, dash="dash"), opacity=0.7,
                    ))
                fig_ch.add_hline(y=100, line_dash="dot", line_color=_BORDER, line_width=1)
                fig_ch.update_layout(
                    **_CHART, height=360, hovermode="x unified",
                    yaxis_title="Base 100",
                    xaxis=dict(gridcolor=_BORDER),
                    yaxis=dict(gridcolor=_BORDER),
                    legend=dict(bgcolor="rgba(26,26,26,0.9)", bordercolor=_BORDER,
                                borderwidth=1, font=dict(size=11)),
                )
                st.plotly_chart(fig_ch, use_container_width=True)

                # ── Risk metrics crypto ───────────────────────────────────────
                cval_weights = {row["Ticker"]: (row["Valeur (€)"] or 0)
                                for _, row in df_c.iterrows() if pd.notna(row.get("Valeur (€)"))}
                crisk = compute_risk_metrics(df_chist, value_weights=cval_weights)
                if crisk:
                    st.markdown("**Métriques de risque — portefeuille crypto (période sélectionnée)**")
                    crk1, crk2, crk3, crk4 = st.columns(4)
                    crk1.metric("Rendement total",  f"{crisk['total_return']:+.1f}%")
                    crk2.metric("Volatilité ann.",  f"{crisk['volatility']:.1f}%")
                    crk3.metric("Sharpe ratio",     f"{crisk['sharpe']:.2f}",
                                help="Rendement ajusté du risque. > 1 = bon, > 2 = excellent.")
                    crk4.metric("Max Drawdown",     f"{crisk['max_drawdown']:.1f}%")

                # ── Correlation heatmap crypto ────────────────────────────────
                if len(df_chist.columns) > 1:
                    with st.expander("Matrice de corrélation", expanded=False):
                        ccorr = df_chist.pct_change().dropna().corr().round(2)
                        fig_ccorr = go.Figure(go.Heatmap(
                            z=ccorr.values,
                            x=ccorr.columns.tolist(),
                            y=ccorr.index.tolist(),
                            colorscale=[[0, _C_LOSS], [0.5, "#1a1a1a"], [1, _C_GAIN]],
                            zmid=0, zmin=-1, zmax=1,
                            text=ccorr.values,
                            texttemplate="%{text:.2f}",
                            textfont=dict(size=10),
                            hovertemplate="%{y} / %{x} : %{z:.2f}<extra></extra>",
                        ))
                        fig_ccorr.update_layout(
                            **_CHART,
                            height=max(260, len(ccorr) * 36),
                            margin=dict(l=0, r=0, t=8, b=0),
                            xaxis=dict(tickfont=dict(size=10)),
                            yaxis=dict(tickfont=dict(size=10)),
                        )
                        st.plotly_chart(fig_ccorr, use_container_width=True)
                        st.caption(
                            "Des corrélations élevées (> 0.7) signifient que les actifs bougent ensemble "
                            "— la diversification au sein de la crypto est limitée."
                        )
            else:
                st.caption("Historique indisponible — vérifier que les tickers sont reconnus par CoinGecko.")

            st.divider()
            st.subheader("Détail des positions")
            st.dataframe(_fmt_df(df_c), width="stretch", hide_index=True)

            # Quick buy strip
            _qbc_tickers = df_c["Ticker"].tolist()
            _qbc_cols = st.columns(min(len(_qbc_tickers), 8))
            for _qbc_col, _qbc_tk in zip(_qbc_cols, _qbc_tickers):
                with _qbc_col:
                    _render_exchange_links(_qbc_tk, "crypto", compact=True)

            st.divider()
            st.subheader("Fiche détail — analyse d'une crypto")
            ticker_opts_c = ["— Sélectionner une crypto —"] + sorted(df_c["Ticker"].tolist())
            sel_cry = st.selectbox("", ticker_opts_c, key="fiche_cry_sel",
                                   label_visibility="collapsed")
            if sel_cry != "— Sélectionner une crypto —":
                _render_asset_fiche(sel_cry, "crypto", df_c, prices_c)

    # ══════════════════════════════════════════════════════════════════════════
    # CRYPTO — Gérer mes positions
    # ══════════════════════════════════════════════════════════════════════════
    with sub_manage:
        st.subheader("Ajouter une crypto")
        st.caption("Recherche par nom ou symbole — ex : bitcoin, ethereum, solana, chainlink")

        cs_col, cb_col = st.columns([5, 1])
        with cs_col:
            crypto_query = st.text_input("Rechercher", placeholder="bitcoin, ethereum, sol, chainlink…",
                                         label_visibility="collapsed", key="crypto_search_input")
        with cb_col:
            do_crypto_search = st.button("Rechercher", use_container_width=True, key="crypto_search_btn")

        if do_crypto_search and crypto_query.strip():
            with st.spinner("Recherche CoinGecko…"):
                cresults = search_crypto(crypto_query.strip()[:100])
            if cresults:
                st.session_state.crypto_search_results = cresults
                st.session_state.crypto_prefill_ticker = ""
            else:
                st.error("Aucun résultat. Essaie un terme plus court (ex : bitcoin, ETH, solana).")
                st.session_state.crypto_search_results = []

        if st.session_state.crypto_search_results:
            coptions = {
                f"{r['symbol']} — {r['name']}": r
                for r in st.session_state.crypto_search_results
            }
            chosen_clabel = st.selectbox("Sélectionne la crypto :", list(coptions.keys()),
                                         key="crypto_select")
            chosen_c = coptions[chosen_clabel]
            if st.button("Utiliser cette crypto", type="primary", key="crypto_use_btn"):
                with st.spinner("Vérification du cours (CoinGecko)…"):
                    cinfo = verify_crypto(chosen_c["symbol"], chosen_c.get("coingecko_id"))
                st.session_state.crypto_prefill_ticker = chosen_c["symbol"]
                st.session_state.crypto_prefill_name = chosen_c["name"]
                st.session_state.crypto_prefill_id = chosen_c.get("coingecko_id", "")
                st.session_state.crypto_price_hint = cinfo["price"] if cinfo else None
                st.session_state.crypto_search_results = []
                st.rerun()

        st.divider()

        if st.session_state.crypto_prefill_ticker:
            ticker_c = st.session_state.crypto_prefill_ticker
            name_c = st.session_state.crypto_prefill_name

            if not re.match(r"^[A-Z0-9.\-]{1,20}$", ticker_c):
                st.error("Symbole invalide.")
                st.session_state.crypto_prefill_ticker = ""
            else:
                st.markdown(
                    f"<div style='font-size:13px;font-weight:700;color:#e1e2e8;margin-bottom:4px;'>"
                    f"<span style='color:{_C_CRYPTO};'>{ticker_c}</span> — {name_c}</div>",
                    unsafe_allow_html=True,
                )
                if st.session_state.crypto_price_hint:
                    st.markdown(
                        f"<div style='font-size:11px;color:#94a3b8;margin-bottom:1rem;'>"
                        f"Cours actuel : <span style='color:{_C_CRYPTO};font-weight:700;'>"
                        f"{st.session_state.crypto_price_hint:,.4f} EUR</span></div>",
                        unsafe_allow_html=True,
                    )

                with st.form("crypto_tx_form", clear_on_submit=True):
                    cc1, cc2, cc3, cc4 = st.columns([2, 2, 2, 2])
                    with cc1:
                        ctx_date = st.date_input("Date d'achat", value=_date.today(), key="c_date")
                    with cc2:
                        cqty = st.number_input("Quantité", min_value=0.000001,
                                               step=1.0, format="%.6f", key="c_qty")
                    with cc3:
                        cprice = st.number_input("Prix / unité (€)", min_value=0.000001,
                                                 step=0.01, format="%.6f", key="c_price")
                    with cc4:
                        cfees = st.number_input("Frais (€)", min_value=0.0,
                                                step=0.01, format="%.2f", value=0.0, key="c_fees")
                    _cry_plat_opts = ["— Non précisé"] + CRYPTO_PLATFORM_NAMES
                    _cry_platform  = st.selectbox(
                        "Exchange d'achat", _cry_plat_opts, key="cry_platform_sel",
                        help="Mémorisé pour adapter le bouton Acheter et les mails d'alerte.",
                    )
                    if cqty > 0 and cprice > 0:
                        cpru = (cqty * cprice + cfees) / cqty
                        st.caption(f"PRU calculé : {cpru:.6f} € (frais inclus)")
                    csave = st.form_submit_button("Enregistrer cet achat",
                                                  type="primary", use_container_width=True)

                if csave:
                    if cqty <= 0 or cprice <= 0:
                        st.error("Quantité et prix doivent être > 0.")
                    else:
                        try:
                            _cry_plat_val = None if _cry_platform == "— Non précisé" else _cry_platform
                            add_transaction(ticker_c, name_c, ctx_date.isoformat(),
                                            cqty, cprice, cfees, currency="EUR",
                                            asset_class="crypto",
                                            coingecko_id=st.session_state.crypto_prefill_id or None,
                                            platform=_cry_plat_val)
                            st.success(f"{cqty:.6f} × {ticker_c} enregistré — PRU mis à jour.")
                            for k in ("crypto_prefill_ticker", "crypto_prefill_name", "crypto_prefill_id"):
                                st.session_state[k] = ""
                            st.session_state.crypto_price_hint = None
                            st.rerun()
                        except Exception as exc:
                            st.error(f"Erreur : {exc}")
        else:
            st.caption("Recherche une crypto ci-dessus pour l'ajouter.")

        st.divider()
        st.subheader("Import en masse (CSV)")
        with st.expander("Importer depuis Binance / Coinbase / CSV générique"):
            st.caption(
                "Formats acceptés : **Binance** (colonnes Date, Pair, Side, Price, Executed, Fee) · "
                "**Coinbase** · **Générique** (colonnes Date, Ticker, Quantity, Price)."
            )
            _csv_tpl = (
                "Ticker,Date,Quantity,Price\n"
                "KAS,2025-02-07,787.411000,0.095254\n"
                "BTC,2025-01-01,0.001000,42000.000000\n"
            )
            st.download_button(
                "Télécharger un modèle CSV",
                data=_csv_tpl,
                file_name="template_crypto.csv",
                mime="text/csv",
                key="csv_tpl_dl",
            )
            uploaded_csv = st.file_uploader(
                "Fichier CSV",
                type=["csv"],
                key="crypto_csv_upload",
                label_visibility="collapsed",
            )
            if uploaded_csv:
                if st.button("Importer", type="primary", key="crypto_import_btn"):
                    with st.spinner("Import en cours…"):
                        n_ok, n_skip, errs = import_crypto_csv(uploaded_csv.read())
                    if n_ok:
                        st.success(f"{n_ok} transaction(s) importée(s) avec succès.")
                    if n_skip and n_ok == 0 and not errs:
                        st.info(
                            f"Toutes les {n_skip} lignes sont déjà enregistrées — "
                            "aucun doublon créé. Tes données sont à jour."
                        )
                    elif n_skip:
                        st.warning(
                            f"{n_skip} ligne(s) ignorée(s) "
                            "(déjà enregistrée(s) ou format invalide)."
                        )
                    for e in errs:
                        st.error(e)
                    if n_ok:
                        st.rerun()

        st.divider()
        st.subheader("Mes positions crypto")

        cpositions = get_positions(asset_class="crypto")
        if not cpositions:
            st.info("Aucune position crypto enregistrée.")
        else:
            prices_cm = _prices_crypto
            active_positions = [cp for cp in cpositions if cp["quantity"] > 0]
            if not active_positions:
                st.info("Aucune position crypto active.")
            for cp in active_positions:
                ctxs = get_transactions(cp["ticker"], asset_class="crypto")
                cqty_total = sum(t["quantity"] for t in ctxs)
                ccost_total = sum(t["quantity"] * t["price"] + t["fees"] for t in ctxs)
                cpru = cp["avg_buy_price"]
                ccur_price = prices_cm.get(cp["ticker"])
                cprice_flag = " ⚠" if ccur_price is None else ""

                with st.expander(
                    f"{cp['ticker']}{cprice_flag}  ·  {cp['name']}  ·  "
                    f"{cqty_total:,.4f} unités  ·  PRU {cpru:.6f} €  ·  base {ccost_total:,.2f} €"
                ):
                    if ccur_price is None:
                        st.caption("Cours non disponible sur CoinGecko — symbole non reconnu.")

                    _render_exchange_links(cp["ticker"], "crypto")
                    st.markdown("---")
                    st.caption("Historique des transactions")
                    _cry_hdr = st.columns([1.2, 1.5, 1.5, 2, 1.2, 1.8, 1])
                    for _chc, _chl in zip(_cry_hdr, ["Type", "Date", "Quantité", "Prix unitaire", "Frais", "Exchange", ""]):
                        _chc.markdown(
                            f"<span style='font-size:10px;color:{_MUTED};"
                            f"text-transform:uppercase;letter-spacing:0.05em;'>{_chl}</span>",
                            unsafe_allow_html=True,
                        )
                    for ct in ctxs:
                        _ct_buy = ct["quantity"] >= 0
                        _ct_col = _C_GAIN if _ct_buy else _C_LOSS
                        _ct_type = "Achat" if _ct_buy else "Retrait"
                        _ctc0, _ctc1, _ctc2, _ctc3, _ctc4, _ctc5, _ctc6 = st.columns([1.2, 1.5, 1.5, 2, 1.2, 1.8, 1])
                        _ctc0.markdown(
                            f"<span style='font-size:11px;color:{_ct_col};font-weight:600;'>"
                            f"{_ct_type}</span>", unsafe_allow_html=True
                        )
                        _ctc1.write(ct["tx_date"])
                        _ctc2.write(f"{ct['quantity']:+.4f}")
                        _ctc3.write(f"{ct['price']:.8f} €")
                        _ctc4.write(f"{ct['fees']:.2f} €" if ct["fees"] else "—")
                        _cpf = ct.get("platform") or "—"
                        _ctc5.markdown(
                            f"<span style='font-size:11px;color:{_MUTED};'>{_cpf}</span>",
                            unsafe_allow_html=True,
                        )
                        with _ctc6:
                            _cea, _cda = st.columns(2)
                            with _cea:
                                if st.button("✎", key=f"edit_cry_tx_{ct['id']}", help="Modifier"):
                                    st.session_state["editing_tx_id"] = (
                                        None if st.session_state["editing_tx_id"] == ct["id"] else ct["id"]
                                    )
                                    st.rerun()
                            with _cda:
                                if st.button("✕", key=f"del_ctx_{ct['id']}", help="Supprimer"):
                                    delete_transaction(ct["id"])
                                    if st.session_state["editing_tx_id"] == ct["id"]:
                                        st.session_state["editing_tx_id"] = None
                                    st.rerun()

                    # ── Inline edit form ──────────────────────────────────────
                    _cry_editing_id = st.session_state.get("editing_tx_id")
                    _cry_edit_tx = next((ct for ct in ctxs if ct["id"] == _cry_editing_id), None)
                    if _cry_edit_tx:
                        _cetx_id = _cry_edit_tx["id"]
                        st.markdown(
                            f"<div style='background:{_SURFACE};border:1px solid {_C_WARN}44;"
                            f"border-left:3px solid {_C_WARN};padding:12px 16px;margin:10px 0;"
                            f"font-size:11px;color:{_C_WARN};text-transform:uppercase;"
                            f"letter-spacing:0.07em;font-weight:700;'>✎ Modifier — transaction #{_cetx_id}</div>",
                            unsafe_allow_html=True,
                        )
                        with st.form(f"cry_edit_form_{_cry_edit_tx['id']}", clear_on_submit=False):
                            _cef1, _cef2 = st.columns(2)
                            with _cef1:
                                _ce_type = st.radio(
                                    "Type", ["Achat", "Retrait/Vente"],
                                    index=0 if _cry_edit_tx["quantity"] >= 0 else 1,
                                    horizontal=True, key=f"ce_type_{_cry_edit_tx['id']}",
                                )
                                _ce_date = st.date_input(
                                    "Date",
                                    value=_date.fromisoformat(_cry_edit_tx["tx_date"]),
                                    key=f"ce_date_{_cry_edit_tx['id']}",
                                )
                                _ce_qty = st.number_input(
                                    "Quantité (absolue)",
                                    min_value=0.000001,
                                    value=abs(_cry_edit_tx["quantity"]),
                                    format="%.8f", key=f"ce_qty_{_cry_edit_tx['id']}",
                                )
                                _ce_price = st.number_input(
                                    "Prix unitaire (€)",
                                    min_value=0.0,
                                    value=float(_cry_edit_tx["price"]),
                                    format="%.8f", key=f"ce_price_{_cry_edit_tx['id']}",
                                )
                            with _cef2:
                                _ce_fees = st.number_input(
                                    "Frais",
                                    min_value=0.0,
                                    value=float(_cry_edit_tx["fees"]),
                                    format="%.6f", key=f"ce_fees_{_cry_edit_tx['id']}",
                                )
                                _ce_name = st.text_input(
                                    "Nom de l'actif",
                                    value=_cry_edit_tx.get("name", ""),
                                    key=f"ce_name_{_cry_edit_tx['id']}",
                                )
                                _ce_cgid = st.text_input(
                                    "CoinGecko ID",
                                    value=_cry_edit_tx.get("coingecko_id") or "",
                                    placeholder="ex : bitcoin, solana, kaspa",
                                    key=f"ce_cgid_{_cry_edit_tx['id']}",
                                )
                                _cry_pf_all = ["— Non précisé"] + CRYPTO_PLATFORM_NAMES
                                _cry_pf_cur = _cry_edit_tx.get("platform") or "— Non précisé"
                                _cry_pf_idx = _cry_pf_all.index(_cry_pf_cur) if _cry_pf_cur in _cry_pf_all else 0
                                _ce_platform = st.selectbox(
                                    "Exchange",
                                    _cry_pf_all,
                                    index=_cry_pf_idx,
                                    key=f"ce_plat_{_cry_edit_tx['id']}",
                                )
                            _cef_save, _cef_cancel = st.columns(2)
                            with _cef_save:
                                _ce_saved = st.form_submit_button(
                                    "Enregistrer les modifications",
                                    type="primary", use_container_width=True,
                                )
                            with _cef_cancel:
                                _ce_cancelled = st.form_submit_button(
                                    "Annuler", use_container_width=True
                                )

                        if _ce_saved:
                            _csigned_qty = _ce_qty if _ce_type == "Achat" else -_ce_qty
                            _cplat_save  = None if _ce_platform == "— Non précisé" else _ce_platform
                            update_transaction(
                                _cry_edit_tx["id"],
                                tx_date=_ce_date.isoformat(),
                                quantity=_csigned_qty,
                                price=_ce_price,
                                fees=_ce_fees,
                                currency="EUR",
                                name=_ce_name or cp["name"],
                                platform=_cplat_save,
                                coingecko_id=_ce_cgid.strip() or None,
                            )
                            st.session_state["editing_tx_id"] = None
                            st.success("Transaction mise à jour.")
                            st.rerun()
                        if _ce_cancelled:
                            st.session_state["editing_tx_id"] = None
                            st.rerun()

                    st.markdown("---")
                    if st.button(f"Supprimer {cp['ticker']}", key=f"del_cpos_{cp['ticker']}"):
                        delete_position(cp["ticker"], asset_class="crypto")
                        st.rerun()

    # ══════════════════════════════════════════════════════════════════════════
    # CRYPTO — Analyse IA
    # ══════════════════════════════════════════════════════════════════════════
    with sub_ai:
        gemini_key_c = (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY", "")).strip()
        groq_key_c = os.getenv("GROQ_API_KEY", "").strip()

        # ── Statut des moteurs ──────────────────────────────────────────────
        cs1, cs2, cs3 = st.columns(3)
        with cs1:
            dot = "ok" if gemini_key_c else "err"
            lbl = "Clé OK — vérifier quota" if gemini_key_c else "Clé manquante"
            st.markdown(f"""<div class="api-status">
                <span class="status-dot {dot}"></span>
                <span class="status-name">Gemini</span>
                <span class="status-label">{lbl}</span>
            </div>""", unsafe_allow_html=True)
        with cs2:
            dot = "ok" if groq_key_c else "err"
            lbl = "Configuré" if groq_key_c else "Clé manquante"
            st.markdown(f"""<div class="api-status">
                <span class="status-dot {dot}"></span>
                <span class="status-name">Llama 3.3 (Groq)</span>
                <span class="status-label">{lbl}</span>
            </div>""", unsafe_allow_html=True)
        with cs3:
            st.markdown("""<div class="api-status">
                <span class="status-dot manual"></span>
                <span class="status-name">Claude</span>
                <span class="status-label">Copy-paste → stocké en DB</span>
            </div>""", unsafe_allow_html=True)

        st.divider()
        df_cai = _df_crypto

        if df_cai is None:
            st.info("Ajoute des positions crypto dans **Mes positions** d'abord.")
        else:
            sum_cai = portfolio_summary(df_cai)
            hhi_cai = compute_hhi(df_cai)
            alerts_cai = compute_crypto_concentration_alerts(df_cai)
            crypto_prompt = build_crypto_analysis_prompt(df_cai, sum_cai, hhi_cai, alerts_cai)
            all_csugg = get_suggestions(limit=200, asset_class="crypto")
            sb_cdf = compute_scoreboard(all_csugg)
            per_model_c = _get_latest_per_model(all_csugg)

            # ── Scoreboard ─────────────────────────────────────────────────
            st.subheader("IA Engine Competition — Crypto")

            if sb_cdf.empty:
                st.caption("Lance une première analyse crypto pour alimenter la compétition.")
            else:
                card_cols_c = st.columns(max(len(sb_cdf), 1))
                for i, (_, row) in enumerate(sb_cdf.iterrows()):
                    mk = row["Modèle"].lower().split()[0]
                    cfg = _MODEL_CFG.get(mk, {
                        "label": f"Model {chr(65+i)}", "badge": "ACTIF",
                        "badge_class": "active", "color": _PALETTE[i % len(_PALETTE)],
                        "bar": _PALETTE[i % len(_PALETTE)],
                    })
                    descs = {
                        "gemini": "Analyse fondamentale crypto approfondie.",
                        "groq":   "Paramètres de risque crypto stricts.",
                        "claude": "Analyse qualitative supérieure. Entrée manuelle.",
                        "llama":  "Paramètres de risque crypto stricts.",
                    }
                    with card_cols_c[i]:
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

                scored_c = [s for s in all_csugg if s.get("analysis_score") is not None]
                if len(scored_c) >= 2:
                    score_rows_c = []
                    for s in scored_c:
                        a = s.get("analysis_score") or 0
                        d = s.get("discipline_score") or 0
                        score_rows_c.append({"date": s["created_at"][:10],
                                             "Modèle": s["model_name"],
                                             "Score": round(a + d, 1)})
                    df_cscores = pd.DataFrame(score_rows_c).sort_values("date")
                    fig_cline = go.Figure()
                    for i, model in enumerate(df_cscores["Modèle"].unique()):
                        mk = model.lower().split()[0]
                        color = _MODEL_CFG.get(mk, {"bar": _PALETTE[i % len(_PALETTE)]})["bar"]
                        sub = df_cscores[df_cscores["Modèle"] == model]
                        fig_cline.add_trace(go.Scatter(
                            x=sub["date"], y=sub["Score"], name=model, mode="lines+markers",
                            line=dict(color=color, width=2),
                            marker=dict(size=7, color=color),
                        ))
                    fig_cline.update_layout(
                        **_CHART, height=260, hovermode="x unified",
                        yaxis=dict(title="Score /10", range=[0, 10], gridcolor=_BORDER),
                        xaxis=dict(gridcolor=_BORDER),
                        legend=dict(bgcolor="rgba(26,26,26,0.9)", bordercolor=_BORDER,
                                    borderwidth=1, font=dict(size=11)),
                        title=dict(text="Évolution du score dans le temps",
                                   font=dict(size=12, color=_MUTED)),
                    )
                    st.plotly_chart(fig_cline, use_container_width=True)

            st.divider()

            # ── Recommandations consolidées ────────────────────────────────
            st.subheader("Recommandations consolidées")

            crypto_gaps = compute_crypto_investment_gaps(df_cai)
            if crypto_gaps:
                st.caption(f"{len(crypto_gaps)} écart(s) détecté(s) — cliquez pour les détails.")
                for g in crypto_gaps:
                    p_label, p_color = _PRIORITY_LABEL.get(g["priority"], ("—", _MUTED))
                    header_c = f"{g['icon']}  {g['title']}   — {p_label}"
                    with st.expander(header_c, expanded=False):
                        st.markdown(
                            f"<div style='color:{_TEXT};font-size:14px;line-height:1.6;"
                            f"padding:4px 0 12px;'>{g['action']}</div>",
                            unsafe_allow_html=True,
                        )
                        sugg_c = g.get("suggestions", [])
                        if sugg_c:
                            st.markdown(
                                f"<div style='font-size:11px;color:{_MUTED};text-transform:uppercase;"
                                f"letter-spacing:0.07em;margin-bottom:8px;'>Suggestions</div>",
                                unsafe_allow_html=True,
                            )
                            sc_cols = st.columns(min(len(sugg_c), 3))
                            for sc, s in zip(sc_cols, sugg_c):
                                with sc:
                                    st.markdown(
                                        f"<div style='background:{_SURFACE};border:1px solid {_BORDER};"
                                        f"padding:12px;height:100%;'>"
                                        f"<div style='color:{_C_CRYPTO};font-weight:700;font-size:15px;"
                                        f"letter-spacing:0.04em;'>{s['ticker']}</div>"
                                        f"<div style='color:{_TEXT};font-size:12px;margin:4px 0 6px;'>{s['name']}</div>"
                                        f"<div style='color:{_MUTED};font-size:11px;line-height:1.5;'>{s['why']}</div>"
                                        f"</div>",
                                        unsafe_allow_html=True,
                                    )
            else:
                st.success("Aucun écart majeur détecté — portefeuille crypto bien structuré.")

            # Actions des modèles
            if per_model_c:
                st.write("")
                st.markdown(
                    f"<div style='font-size:11px;color:{_MUTED};text-transform:uppercase;"
                    f"letter-spacing:0.07em;margin-bottom:0.5rem;'>Actions recommandées par modèle</div>",
                    unsafe_allow_html=True,
                )
                cmodel_names = {mk: s["model_name"] for mk, s in per_model_c.items()}
                csel_mk = st.radio(
                    "Modèle crypto",
                    options=list(cmodel_names.keys()),
                    format_func=lambda k: cmodel_names[k],
                    horizontal=True, label_visibility="collapsed",
                    key="c_model_radio",
                )
                cs_sel = per_model_c[csel_mk]
                ccolor = _MODEL_CFG.get(csel_mk, {"color": _MUTED})["color"]
                st.markdown(
                    f"<div style='font-size:11px;font-weight:700;color:{ccolor};"
                    f"text-transform:uppercase;letter-spacing:0.06em;margin:0.75rem 0 0.25rem;'>"
                    f"{cs_sel['model_name']}</div>",
                    unsafe_allow_html=True,
                )
                cactions = _extract_actions(cs_sel["response_text"])
                if cactions:
                    st.markdown(cactions)
                else:
                    st.caption("Pas de section actions trouvée dans cette analyse.")
                st.caption(f"Analyse du {cs_sel['created_at'][:10]}")

            # Consensus VP crypto
            cconsensus_df = _build_vp_consensus(per_model_c)
            if not cconsensus_df.empty:
                st.write("")
                st.markdown(
                    f"<div style='font-size:11px;color:{_MUTED};text-transform:uppercase;"
                    f"letter-spacing:0.07em;margin-bottom:0.75rem;'>Portefeuille virtuel crypto — consensus 10 000 €</div>",
                    unsafe_allow_html=True,
                )
                with st.expander("Voir le consensus IA crypto", expanded=False):
                    cl_left, cl_right = st.columns([2, 3])
                    with cl_left:
                        st.dataframe(
                            cconsensus_df.style.format({"Poids moyen (%)": "{:.1f}%"}, na_rep="—"),
                            use_container_width=True, hide_index=True,
                        )
                    with cl_right:
                        fig_ccons = px.bar(
                            cconsensus_df.sort_values("Poids moyen (%)", ascending=True),
                            x="Poids moyen (%)", y="Ticker", orientation="h",
                            color_discrete_sequence=[_C_CRYPTO],
                        )
                        fig_ccons.update_traces(
                            texttemplate="%{x:.1f}%", textposition="outside",
                            marker_color=_C_CRYPTO,
                        )
                        fig_ccons.update_layout(
                            **{**_CHART, "margin": dict(l=0, r=40, t=10, b=0)},
                            height=max(180, len(cconsensus_df) * 32),
                            xaxis=dict(showgrid=False, showticklabels=False, title=""),
                            yaxis=dict(title="", tickfont=dict(size=12)),
                        )
                        st.plotly_chart(fig_ccons, use_container_width=True)

            # Top picks crypto
            ctop_picks = compute_ai_top_picks(all_csugg)
            if not ctop_picks.empty:
                st.write("")
                st.markdown(
                    f"<div style='font-size:11px;color:{_MUTED};text-transform:uppercase;"
                    f"letter-spacing:0.07em;margin-bottom:0.5rem;'>Top Picks IA Crypto</div>",
                    unsafe_allow_html=True,
                )
                ctick_list = ctop_picks["Ticker"].tolist()
                with st.spinner("Récupération des cours crypto…"):
                    cpick_prices = get_crypto_prices(ctick_list)
                ctop_picks["Cours actuel"] = ctop_picks["Ticker"].map(
                    lambda t: f"{cpick_prices[t.upper()]:.4f} €" if t.upper() in cpick_prices else "—"
                )
                ccols_order = ["Ticker", "Titre", "Cours actuel", "Poids moyen", "Conviction", "Description"]
                cdisplay_df = ctop_picks[[c for c in ccols_order if c in ctop_picks.columns]]
                cstyled = cdisplay_df.style.format({"Poids moyen": "{:.1f}%"}, na_rep="—")
                cstyled = cstyled.map(
                    lambda v: (f"color:{_C_GAIN};font-weight:700;" if "Consensus" in str(v)
                               else f"color:{_C_WARN};font-weight:700;" if "Fort" in str(v)
                               else f"color:{_MUTED};"),
                    subset=["Conviction"],
                )
                st.dataframe(cstyled, use_container_width=True, hide_index=True)

            st.divider()

            # ── Lancer une analyse automatique ────────────────────────────
            st.subheader("Lancer une analyse automatique")

            with st.expander("Voir le prompt envoyé aux IA", expanded=False):
                st.code(crypto_prompt, language=None)

            cla_col, _ = st.columns([3, 5])
            with cla_col:
                claunch = st.button(
                    "Analyser — Gemini + Llama en parallèle",
                    type="primary", use_container_width=True,
                    disabled=(not gemini_key_c and not groq_key_c),
                    key="crypto_launch_btn",
                )

            if claunch:
                with st.spinner("Gemini et Llama analysent le portefeuille crypto (~30-60 s)…"):
                    cresults_ai = run_analysis(crypto_prompt)
                csaved_any = False
                for ckey, cres in cresults_ai.items():
                    if cres.get("error"):
                        st.error(f"**{ckey.capitalize()}** — {cres['error'][:200]}")
                    elif cres.get("text"):
                        save_suggestion(
                            model_name=cres["model"],
                            prompt=crypto_prompt,
                            response_text=cres["text"],
                            portfolio_snapshot=df_cai.to_dict(),
                            virtual_portfolio=cres.get("virtual_portfolio"),
                            conviction_level=cres.get("conviction_level"),
                            asset_class="crypto",
                        )
                        csaved_any = True
                st.session_state.crypto_last_analysis = cresults_ai
                if csaved_any:
                    st.rerun()

            if st.session_state.crypto_last_analysis:
                cres_disp = st.session_state.crypto_last_analysis
                col_cg, col_cl = st.columns(2)
                for col, ckey, cmodel_color in [
                    (col_cg, "gemini", _C_GAIN),
                    (col_cl, "groq", "#60a5fa"),
                ]:
                    cres = cres_disp.get(ckey, {})
                    with col:
                        if not cres:
                            continue
                        if cres.get("error"):
                            st.error(f"**{ckey.capitalize()}** — Erreur. Vérifie quota/clé dans `.env`.")
                        else:
                            st.markdown(
                                f"<div style='font-size:12px;font-weight:700;color:{cmodel_color};"
                                f"text-transform:uppercase;letter-spacing:0.06em;margin:0.75rem 0;'>"
                                f"{cres.get('model', ckey)}</div>",
                                unsafe_allow_html=True,
                            )
                            if cres.get("virtual_portfolio"):
                                with st.expander("Portefeuille virtuel crypto 10 000 €", expanded=True):
                                    _render_virtual_portfolio(cres["virtual_portfolio"])
                            with st.expander("Analyse complète", expanded=False):
                                st.markdown(cres.get("text", ""))

            st.divider()

            # ── Soumettre une analyse Claude ───────────────────────────────
            st.markdown(f"""
            <div style="background:#1a1a1a;border:1px solid #c084fc;border-left:3px solid #c084fc;
                        padding:1rem 1.25rem;margin-bottom:0.5rem;">
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;
                            letter-spacing:0.1em;color:#c084fc;margin-bottom:4px;">Model Gamma</div>
                <div style="font-size:16px;font-weight:700;color:#e1e2e8;">Claude — Analyse crypto manuelle</div>
                <div style="font-size:12px;color:#94a3b8;margin-top:4px;">
                    Copie le prompt → colle dans claude.ai → reviens coller la réponse ici.
                </div>
            </div>
            """, unsafe_allow_html=True)

            with st.expander("Voir le prompt à copier pour Claude", expanded=False):
                st.code(crypto_prompt, language=None)

            with st.form("claude_crypto_form"):
                claude_crypto_resp = st.text_area(
                    "Réponse de Claude (colle ici)",
                    placeholder="Colle ici la réponse complète de Claude…",
                    height=280, key="claude_crypto_textarea",
                )
                cconv_level = st.selectbox(
                    "Niveau de conviction annoncé",
                    ["high", "medium", "low", "—"],
                    key="cconv_sel",
                )
                submit_claude_c = st.form_submit_button(
                    "Enregistrer dans la compétition crypto",
                    type="primary", use_container_width=True,
                )

            if submit_claude_c:
                if not claude_crypto_resp.strip():
                    st.error("La réponse est vide.")
                else:
                    cvp = _parse_vp_from_text(claude_crypto_resp)
                    ccl = cconv_level if cconv_level != "—" else None
                    if cvp and not ccl:
                        ccl = cvp.get("conviction_level")
                    save_suggestion(
                        model_name="Claude (Manual)",
                        prompt=crypto_prompt,
                        response_text=claude_crypto_resp,
                        portfolio_snapshot=df_cai.to_dict(),
                        virtual_portfolio=cvp,
                        conviction_level=ccl,
                        asset_class="crypto",
                    )
                    st.success("Analyse Claude crypto enregistrée — scoreboard mis à jour.")
                    st.rerun()

            st.divider()

            # ── Historique des analyses ────────────────────────────────────
            st.subheader("Historique des analyses crypto")
            csuggestions = get_suggestions(limit=50, asset_class="crypto")

            if not csuggestions:
                st.info("Aucune analyse crypto enregistrée.")
            else:
                for cs in csuggestions:
                    cdt = cs["created_at"][:16].replace("T", " ")
                    cconv = (cs.get("conviction_level") or "—").upper()
                    ca_sc = cs.get("analysis_score")
                    cd_sc = cs.get("discipline_score")
                    cscore_str = f"  ·  A:{ca_sc:.1f}  D:{cd_sc:.1f}" if ca_sc else ""
                    cvp_data = json.loads(cs["virtual_portfolio"]) if cs.get("virtual_portfolio") else None

                    with st.expander(f"{cs['model_name']}  ·  {cdt}  ·  {cconv}{cscore_str}"):
                        if cvp_data:
                            st.caption("Portefeuille virtuel crypto suggéré")
                            _render_virtual_portfolio(cvp_data)
                        with st.expander("Analyse complète", expanded=False):
                            st.markdown(cs["response_text"])

                        st.markdown("---")
                        st.caption("Scoring de cette analyse")
                        csc1, csc2, csc3 = st.columns(3)
                        with csc1:
                            new_ca = st.slider("Qualité analyse /5", 1.0, 5.0,
                                               value=float(ca_sc) if ca_sc else 3.0,
                                               step=0.5, key=f"ca_{cs['id']}")
                        with csc2:
                            new_cd = st.slider("Discipline B&H /5", 1.0, 5.0,
                                               value=float(cd_sc) if cd_sc else 3.0,
                                               step=0.5, key=f"cd_{cs['id']}")
                        with csc3:
                            new_cnotes = st.text_input("Notes", value=cs.get("notes") or "",
                                                       key=f"cn_{cs['id']}")
                        if st.button("Enregistrer le score", key=f"csave_{cs['id']}"):
                            update_suggestion_scores(cs["id"], new_ca, new_cd, new_cnotes)
                            st.success("Score enregistré.")
                            st.rerun()


# ══════════════════════════════════════════════════════════════════════════════
# TAB 4 — Alertes de cours
# ══════════════════════════════════════════════════════════════════════════════

with tab_alerts:

    # ── Canaux de notification ────────────────────────────────────────────────
    _smtp_ok  = smtp_configured()
    _tg_ok    = telegram_configured()
    _dc_ok    = discord_configured()

    def _notif_badge(ok: bool, label_on: str, label_off: str, hint: str = "") -> str:
        c = _C_GAIN if ok else _C_LOSS
        lbl = label_on if ok else label_off
        h = f"<span style='font-size:10px;color:{_MUTED};margin-left:8px;'>{hint}</span>" if (not ok and hint) else ""
        return (
            f"<div style='display:inline-flex;align-items:center;gap:8px;"
            f"background:{_SURFACE};border:1px solid {c}33;"
            f"padding:7px 14px;margin-right:8px;margin-bottom:10px;'>"
            f"<span style='width:7px;height:7px;background:{c};display:inline-block;border-radius:50%;'></span>"
            f"<span style='font-size:11px;color:{c};font-weight:700;"
            f"text-transform:uppercase;letter-spacing:0.07em;'>{lbl}</span>{h}</div>"
        )

    st.markdown(
        _notif_badge(_smtp_ok,  "✉ Email activé",     "✉ Email désactivé",
                     "→ SMTP_HOST / SMTP_USER / SMTP_PASS dans .env")
        + _notif_badge(_tg_ok,  "✈ Telegram activé",  "✈ Telegram désactivé",
                     "→ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID dans .env")
        + _notif_badge(_dc_ok,  "# Discord activé",   "# Discord désactivé",
                     "→ DISCORD_WEBHOOK_URL dans .env"),
        unsafe_allow_html=True,
    )

    # ── Config Telegram ───────────────────────────────────────────────────────
    with st.expander("⚙️ Configurer Telegram", expanded=not _tg_ok):
        st.markdown(
            "**1.** Ouvre Telegram et cherche **@BotFather** → `/newbot` → copie le token.\n\n"
            "**2.** Envoie un message à ton bot, puis récupère le `chat_id` via :\n"
            "`https://api.telegram.org/bot<TOKEN>/getUpdates`\n\n"
            "**3.** Ajoute ces deux lignes dans ton fichier `.env` :"
        )
        st.code("TELEGRAM_BOT_TOKEN=123456:ABCdef...\nTELEGRAM_CHAT_ID=123456789", language="bash")
        _tg_test_tok = st.text_input("Token (test)",    key="tg_test_token",
                                     value=os.getenv("TELEGRAM_BOT_TOKEN", ""),
                                     type="password", placeholder="123456:ABCdef…")
        _tg_test_cid = st.text_input("Chat ID (test)",  key="tg_test_chatid",
                                     value=os.getenv("TELEGRAM_CHAT_ID", ""),
                                     placeholder="123456789")
        if st.button("Envoyer un message test", key="tg_test_btn"):
            if _tg_test_tok and _tg_test_cid:
                _ok_t, _err_t = send_telegram_test(_tg_test_tok.strip(), _tg_test_cid.strip())
                if _ok_t:
                    st.success("Message Telegram envoyé avec succès !")
                else:
                    st.error(f"Échec : {_err_t}")
            else:
                st.warning("Remplis le token et le chat_id pour tester.")

    # ── Config Discord ────────────────────────────────────────────────────────
    with st.expander("⚙️ Configurer Discord", expanded=not _dc_ok):
        st.markdown(
            "**1.** Dans Discord, ouvre les paramètres du channel → **Intégrations** → **Webhooks** → **Nouveau webhook**.\n\n"
            "**2.** Copie l'URL du webhook.\n\n"
            "**3.** Ajoute-la dans ton `.env` :"
        )
        st.code("DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...", language="bash")
        _dc_test_url = st.text_input("Webhook URL (test)", key="dc_test_url",
                                     value=os.getenv("DISCORD_WEBHOOK_URL", ""),
                                     type="password",
                                     placeholder="https://discord.com/api/webhooks/…")
        if st.button("Envoyer un message test", key="dc_test_btn"):
            if _dc_test_url:
                _ok_d, _err_d = send_discord_test(_dc_test_url.strip())
                if _ok_d:
                    st.success("Message Discord envoyé avec succès !")
                else:
                    st.error(f"Échec : {_err_d}")
            else:
                st.warning("Remplis l'URL du webhook pour tester.")

    al_col, ar_col = st.columns([3, 2])

    # ── Création d'une alerte ─────────────────────────────────────────────────
    _PURPOSE_KEYS = list(ALERT_PURPOSE_META.keys())
    _PURPOSE_DISPLAY = {k: f"{v['icon']} {v['label']}" for k, v in ALERT_PURPOSE_META.items()}

    with al_col:
        st.subheader("Créer une alerte")
        with st.form("alert_create_form", clear_on_submit=True):
            af1, af2 = st.columns([2, 2])
            with af1:
                _al_ticker = st.text_input(
                    "Ticker", placeholder="BTC, NVDA, ETH…", key="al_ticker"
                ).strip().upper()
            with af2:
                _al_class = st.selectbox(
                    "Classe d'actif", ["stock", "crypto"], key="al_class",
                    format_func=lambda v: "Bourse / ETF" if v == "stock" else "Crypto",
                )
            _al_purpose = st.selectbox(
                "Type d'alerte",
                options=_PURPOSE_KEYS,
                format_func=lambda k: _PURPOSE_DISPLAY[k],
                key="al_purpose",
            )
            # Dynamic hint based on selected purpose
            _al_hint_meta = ALERT_PURPOSE_META[_al_purpose if _al_purpose else "buy_target"]
            st.caption(f"Condition : {_al_hint_meta['hint']}")

            _al_threshold = st.number_input(
                "Seuil (€)", min_value=0.0, step=0.01, format="%.6f", key="al_threshold"
            )
            _al_label = st.text_input(
                "Label (optionnel)",
                placeholder="ex : zone d'achat, résistance clé…",
                key="al_label",
            )
            _al_submit = st.form_submit_button(
                "Créer l'alerte", type="primary", use_container_width=True
            )

        if _al_submit:
            if not _al_ticker:
                st.error("Le ticker est obligatoire.")
            elif _al_threshold <= 0:
                st.error("Le seuil doit être > 0.")
            elif not re.match(r"^[A-Z0-9.\-]{1,20}$", _al_ticker):
                st.error("Ticker invalide (caractères autorisés : lettres, chiffres, . -).")
            else:
                try:
                    _auto_label = _al_label or ALERT_PURPOSE_META[_al_purpose]["label"]
                    add_alert(_al_ticker, _al_class, _al_purpose, _al_threshold, _auto_label)
                    _icon = ALERT_PURPOSE_META[_al_purpose]["icon"]
                    st.success(
                        f"Alerte créée : {_al_ticker} — "
                        f"{_icon} {ALERT_PURPOSE_META[_al_purpose]['label']} {_al_threshold:,.4f} €"
                    )
                    st.rerun()
                except Exception as _ae:
                    st.error(f"Erreur : {_ae}")

    # ── Vérification manuelle ─────────────────────────────────────────────────
    with ar_col:
        st.subheader("Vérification manuelle")
        st.caption(
            "Les alertes sont vérifiées automatiquement au chargement de l'app. "
            "Lance une vérification manuelle à tout moment."
        )
        if st.button("Vérifier maintenant", type="secondary", use_container_width=True, key="al_check_now"):
            _manual_actives = get_alerts(active_only=True)
            if not _manual_actives:
                st.info("Aucune alerte active.")
            else:
                _manual_tickers_stk = [
                    a["ticker"] for a in _manual_actives if a["asset_class"] == "stock"
                ]
                _manual_tickers_cry = [
                    a["ticker"] for a in _manual_actives if a["asset_class"] == "crypto"
                ]
                _manual_prices: dict[str, float] = {}
                if _manual_tickers_stk:
                    with st.spinner("Récupération cours bourse…"):
                        _manual_prices.update(get_current_prices(_manual_tickers_stk))
                if _manual_tickers_cry:
                    with st.spinner("Récupération cours crypto…"):
                        _manual_prices.update(get_crypto_prices(_manual_tickers_cry))

                _manual_triggered = check_alerts(_manual_prices)
                if _manual_triggered:
                    if _smtp_ok:
                        ok_mail, err_mail = send_alert_email(_manual_triggered)
                    if telegram_configured():
                        send_telegram(_manual_triggered)
                    if discord_configured():
                        send_discord(_manual_triggered)
                    for _mt in _manual_triggered:
                        _mtm = ALERT_PURPOSE_META.get(_mt["alert_type"], ALERT_PURPOSE_META["above"])
                        st.error(
                            f"**{_mt['ticker']}** — {_mtm['icon']} {_mtm['label']} "
                            f"{_mt['threshold']:,.4f} · Cours : {_mt.get('current_price', '—'):,.4f}"
                        )
                    if _smtp_ok and ok_mail:
                        st.success("Email envoyé.")
                    elif _smtp_ok and not ok_mail:
                        st.warning(f"Email non envoyé : {err_mail}")
                    if telegram_configured():
                        st.success("Notification Telegram envoyée.")
                    if discord_configured():
                        st.success("Notification Discord envoyée.")
                else:
                    st.success(
                        f"Aucun seuil franchi parmi {len(_manual_actives)} alerte(s) active(s)."
                    )
                st.session_state["alerts_checked"] = True

    st.divider()

    # ── Liste des alertes actives ─────────────────────────────────────────────
    st.subheader("Alertes actives")
    _all_alerts = get_alerts(active_only=False)
    _active_list = [a for a in _all_alerts if a["active"]]
    _triggered_list = [a for a in _all_alerts if not a["active"]]

    if not _active_list:
        st.info("Aucune alerte active. Crée-en une ci-dessus.")
    else:
        _ah_cols = st.columns([1.5, 1, 1.5, 2, 1.5, 1])
        for _hcol, _hlbl in zip(
            _ah_cols, ["Ticker", "Classe", "Condition", "Seuil", "Label", ""]
        ):
            _hcol.markdown(
                f"<span style='font-size:10px;color:{_MUTED};"
                f"text-transform:uppercase;letter-spacing:0.06em;'>{_hlbl}</span>",
                unsafe_allow_html=True,
            )

        for _al in _active_list:
            _ar1, _ar2, _ar3, _ar4, _ar5, _ar6 = st.columns([1.5, 1, 1.5, 2, 1.5, 1])
            _alm = ALERT_PURPOSE_META.get(_al["alert_type"], ALERT_PURPOSE_META["above"])
            _al_dir_col = _C_GAIN if _alm["condition"] == "above" else _C_LOSS
            _ar1.markdown(
                f"<span style='font-weight:700;color:{_TEXT};'>{_al['ticker']}</span>",
                unsafe_allow_html=True,
            )
            _ar2.markdown(
                f"<span style='font-size:11px;color:{_MUTED};'>"
                f"{'Bourse' if _al['asset_class']=='stock' else 'Crypto'}</span>",
                unsafe_allow_html=True,
            )
            _ar3.markdown(
                f"<span style='color:{_al_dir_col};font-weight:600;font-size:12px;'>"
                f"{_alm['icon']} {_alm['label']}</span>",
                unsafe_allow_html=True,
            )
            _ar4.markdown(
                f"<span style='font-weight:700;color:{_TEXT};'>{_al['threshold']:,.6f} €</span>",
                unsafe_allow_html=True,
            )
            _ar5.markdown(
                f"<span style='font-size:11px;color:{_MUTED};'>"
                f"{_al.get('label') or '—'}</span>",
                unsafe_allow_html=True,
            )
            with _ar6:
                if st.button("✕", key=f"del_al_{_al['id']}", help="Supprimer"):
                    delete_alert(_al["id"])
                    st.rerun()

    # ── Historique des alertes déclenchées ───────────────────────────────────
    if _triggered_list:
        st.divider()
        st.subheader("Alertes déclenchées")
        st.caption(
            f"{len(_triggered_list)} alerte(s) désactivée(s). "
            "Réactivez-en une pour la remettre en surveillance."
        )

        _th_cols = st.columns([1.5, 1, 1.5, 2, 1.5, 1.5, 1])
        for _thc, _thl in zip(
            _th_cols,
            ["Ticker", "Classe", "Condition", "Seuil", "Label", "Déclenché le", ""],
        ):
            _thc.markdown(
                f"<span style='font-size:10px;color:{_MUTED};"
                f"text-transform:uppercase;letter-spacing:0.06em;'>{_thl}</span>",
                unsafe_allow_html=True,
            )

        for _tl in _triggered_list:
            _tr1, _tr2, _tr3, _tr4, _tr5, _tr6, _tr7 = st.columns([1.5, 1, 1.5, 2, 1.5, 1.5, 1])
            _tlm = ALERT_PURPOSE_META.get(_tl["alert_type"], ALERT_PURPOSE_META["above"])
            _tl_dir_col = _C_GAIN if _tlm["condition"] == "above" else _C_LOSS
            _tr1.markdown(
                f"<span style='font-weight:700;color:{_MUTED};'>{_tl['ticker']}</span>",
                unsafe_allow_html=True,
            )
            _tr2.markdown(
                f"<span style='font-size:11px;color:{_MUTED};'>"
                f"{'Bourse' if _tl['asset_class']=='stock' else 'Crypto'}</span>",
                unsafe_allow_html=True,
            )
            _tr3.markdown(
                f"<span style='color:{_tl_dir_col};opacity:0.6;font-size:12px;'>"
                f"{_tlm['icon']} {_tlm['label']}</span>",
                unsafe_allow_html=True,
            )
            _tr4.markdown(
                f"<span style='color:{_MUTED};'>{_tl['threshold']:,.6f} €</span>",
                unsafe_allow_html=True,
            )
            _tr5.markdown(
                f"<span style='font-size:11px;color:{_MUTED};'>"
                f"{_tl.get('label') or '—'}</span>",
                unsafe_allow_html=True,
            )
            _triggered_at = (_tl.get("triggered_at") or "")[:16].replace("T", " ")
            _tr6.markdown(
                f"<span style='font-size:11px;color:{_MUTED};'>{_triggered_at}</span>",
                unsafe_allow_html=True,
            )
            with _tr7:
                if st.button("Réarmer", key=f"rearm_{_tl['id']}", help="Réactiver cette alerte"):
                    rearm_alert(_tl["id"])
                    st.rerun()


# ══════════════════════════════════════════════════════════════════════════════
# TAB 5 — Watchlist
# ══════════════════════════════════════════════════════════════════════════════

with tab_watchlist:
    st.markdown("### ◎ Watchlist")
    st.caption("Tickers surveillés sans position ouverte. Cours et variation en temps quasi-réel.")

    # ── Add form ──────────────────────────────────────────────────────────────
    with st.expander("➕ Ajouter un ticker", expanded=False):
        _wl_class = st.radio("Classe d'actif", ["Actions / ETF", "Crypto"],
                             horizontal=True, key="wl_add_class")
        _wl_is_crypto = _wl_class == "Crypto"

        if _wl_is_crypto:
            _wl_q = st.text_input("Rechercher une crypto", key="wl_search_crypto",
                                  placeholder="Bitcoin, Ethereum, SOL…")
            if _wl_q:
                _wl_results = search_crypto(_wl_q)
                if _wl_results:
                    _wl_opts = {f"{r['name']} ({r['symbol'].upper()})": r for r in _wl_results}
                    _wl_sel_key = st.selectbox("Résultats", list(_wl_opts.keys()), key="wl_sel_crypto")
                    _wl_sel = _wl_opts[_wl_sel_key]
                    _wl_note_c = st.text_input("Note (optionnelle)", key="wl_note_crypto")
                    if st.button("Ajouter à la watchlist", key="wl_add_crypto_btn", type="primary"):
                        add_watchlist_item(
                            ticker=_wl_sel["symbol"].upper(),
                            name=_wl_sel["name"],
                            asset_class="crypto",
                            coingecko_id=_wl_sel.get("id"),
                            note=_wl_note_c or None,
                        )
                        st.success(f"{_wl_sel['name']} ajouté à la watchlist.")
                        st.rerun()
                else:
                    st.caption("Aucun résultat.")
        else:
            _wl_q = st.text_input("Rechercher une action / ETF", key="wl_search_stock",
                                  placeholder="Apple, LVMH, MSCI World…")
            if _wl_q:
                _wl_results = search_tickers(_wl_q)
                if _wl_results:
                    _wl_opts = {f"{r['name']} ({r['ticker']})": r for r in _wl_results}
                    _wl_sel_key = st.selectbox("Résultats", list(_wl_opts.keys()), key="wl_sel_stock")
                    _wl_sel = _wl_opts[_wl_sel_key]
                    _wl_note_s = st.text_input("Note (optionnelle)", key="wl_note_stock")
                    if st.button("Ajouter à la watchlist", key="wl_add_stock_btn", type="primary"):
                        add_watchlist_item(
                            ticker=_wl_sel["ticker"],
                            name=_wl_sel["name"],
                            asset_class="stock",
                            note=_wl_note_s or None,
                        )
                        st.success(f"{_wl_sel['name']} ajouté à la watchlist.")
                        st.rerun()
                else:
                    st.caption("Aucun résultat.")

    # ── Load watchlist items ──────────────────────────────────────────────────
    _wl_items = get_watchlist()

    if not _wl_items:
        st.info("Watchlist vide. Ajoute des tickers via le formulaire ci-dessus.")
    else:
        # Fetch prices for all items
        _wl_stk_tks = [w["ticker"] for w in _wl_items if w["asset_class"] == "stock"]
        _wl_cry_items = [w for w in _wl_items if w["asset_class"] == "crypto"]
        _wl_prices: dict[str, float] = {}

        with st.spinner("Chargement des cours…"):
            if _wl_stk_tks:
                try:
                    _wl_prices.update(get_current_prices(_wl_stk_tks))
                except Exception:
                    pass
            if _wl_cry_items:
                try:
                    _wl_cry_id_ov = {w["ticker"]: w["coingecko_id"]
                                     for w in _wl_cry_items if w.get("coingecko_id")}
                    _wl_cry_prices = get_crypto_prices(
                        [w["ticker"] for w in _wl_cry_items],
                        id_overrides=_wl_cry_id_ov or None,
                    )
                    _wl_prices.update(_wl_cry_prices)
                except Exception:
                    pass

        # Fetch 5-day history for daily change
        _wl_day_chg: dict[str, float] = {}
        with st.spinner("Variation 24h…"):
            for _witem in _wl_items:
                _wtk = _witem["ticker"]
                try:
                    if _witem["asset_class"] == "crypto":
                        _wid_ov = ((_wtk, _witem["coingecko_id"]),) if _witem.get("coingecko_id") else ()
                        _ws = cached_crypto_raw_history(_wtk, 3, _wid_ov)
                    else:
                        _ws = cached_raw_history(_wtk, "5d")
                    if len(_ws) >= 2:
                        _wl_day_chg[_wtk] = (_ws.iloc[-1] - _ws.iloc[-2]) / _ws.iloc[-2] * 100
                except Exception:
                    pass

        # ── Header row ────────────────────────────────────────────────────────
        _wl_h1, _wl_h2, _wl_h3, _wl_h4, _wl_h5, _wl_h6, _wl_h7 = st.columns(
            [1.2, 2.5, 1, 1.2, 1, 2.5, 1.8]
        )
        for _hcol, _hlbl in zip(
            [_wl_h1, _wl_h2, _wl_h3, _wl_h4, _wl_h5, _wl_h6, _wl_h7],
            ["TICKER", "NOM", "CLASSE", "COURS", "VAR 24H", "NOTE", "ACTIONS"],
        ):
            _hcol.markdown(
                f"<div style='font-size:9px;color:{_MUTED};letter-spacing:0.07em;"
                f"font-weight:600;padding-bottom:4px;border-bottom:1px solid {_BORDER};'>"
                f"{_hlbl}</div>",
                unsafe_allow_html=True,
            )

        st.write("")

        for _wi in _wl_items:
            _wtk      = _wi["ticker"]
            _wac      = _wi["asset_class"]
            _wprice   = _wl_prices.get(_wtk.upper())
            _wchg     = _wl_day_chg.get(_wtk)
            _wac_col  = _C_CRYPTO if _wac == "crypto" else _C_GAIN
            _wac_lbl  = "₿ Crypto" if _wac == "crypto" else "◈ Stock"
            _wchg_col = (_C_GAIN if _wchg >= 0 else _C_LOSS) if _wchg is not None else _MUTED
            _wchg_str = (f"{_wchg:+.2f}%" if _wchg is not None else "—")
            _wprice_str = f"{_wprice:,.4f} €" if _wprice else "—"

            _wc1, _wc2, _wc3, _wc4, _wc5, _wc6, _wc7 = st.columns(
                [1.2, 2.5, 1, 1.2, 1, 2.5, 1.8]
            )

            _wc1.markdown(
                f"<span style='font-weight:700;color:{_TEXT};font-size:13px;'>{_wtk}</span>",
                unsafe_allow_html=True,
            )
            _wc2.markdown(
                f"<span style='font-size:12px;color:{_MUTED};'>{_wi['name']}</span>",
                unsafe_allow_html=True,
            )
            _wc3.markdown(
                f"<span style='font-size:10px;font-weight:700;color:{_wac_col};'>{_wac_lbl}</span>",
                unsafe_allow_html=True,
            )
            _wc4.markdown(
                f"<span style='font-size:12px;font-weight:600;color:{_TEXT};'>{_wprice_str}</span>",
                unsafe_allow_html=True,
            )
            _wc5.markdown(
                f"<span style='font-size:12px;font-weight:600;color:{_wchg_col};'>{_wchg_str}</span>",
                unsafe_allow_html=True,
            )

            # Note (inline editable)
            with _wc6:
                _wl_note_key = f"wl_note_edit_{_wi['id']}"
                _wl_note_val = st.text_input(
                    "Note", value=_wi.get("note") or "",
                    key=_wl_note_key, label_visibility="collapsed",
                    placeholder="Ajouter une note…",
                )
                if _wl_note_val != (_wi.get("note") or ""):
                    update_watchlist_note(_wi["id"], _wl_note_val)

            # Actions
            with _wc7:
                _wa1, _wa2, _wa3 = st.columns(3)
                # Fiche
                if _wa1.button("◈", key=f"wl_fiche_{_wi['id']}",
                               help="Ouvrir la fiche"):
                    _pos_df = _df_stocks if _wac == "stock" else _df_crypto
                    _pos_prices = _prices_stocks if _wac == "stock" else _prices_crypto
                    # Build minimal row for fiche if not in portfolio
                    if not _pos_df.empty and _wtk in _pos_df["Ticker"].values:
                        _maybe_open_fiche(_wtk, _wac, _pos_df, _pos_prices)
                    else:
                        st.toast(f"{_wtk} n'est pas dans le portefeuille — ajoute une transaction d'abord.")

                # Créer une alerte
                if _wa2.button("◉", key=f"wl_alert_{_wi['id']}",
                               help="Créer une alerte de cours"):
                    st.session_state[f"wl_alert_open_{_wi['id']}"] = True

                # Supprimer
                if _wa3.button("✕", key=f"wl_del_{_wi['id']}",
                               help="Retirer de la watchlist"):
                    delete_watchlist_item(_wi["id"])
                    st.rerun()

            # Quick alert form (inline, appears below the row when triggered)
            if st.session_state.get(f"wl_alert_open_{_wi['id']}"):
                with st.form(key=f"wl_alert_form_{_wi['id']}"):
                    _wal_c1, _wal_c2, _wal_c3, _wal_c4 = st.columns([2, 1.5, 1.5, 1])
                    _wal_type = _wal_c1.selectbox(
                        "Type", list(ALERT_PURPOSE_META.keys()),
                        format_func=lambda k: f"{ALERT_PURPOSE_META[k]['icon']} {ALERT_PURPOSE_META[k]['label']}",
                        key=f"wl_atype_{_wi['id']}",
                    )
                    _wal_thresh = _wal_c2.number_input(
                        "Seuil", value=float(_wprice or 0), min_value=0.0,
                        format="%.4f", key=f"wl_athresh_{_wi['id']}",
                    )
                    _wal_label = _wal_c3.text_input("Label", key=f"wl_alabel_{_wi['id']}")
                    _wal_c4.write("")
                    _wal_c4.write("")
                    _wal_submit = _wal_c4.form_submit_button("Créer", type="primary")
                    if _wal_submit:
                        add_alert(_wtk, _wac, _wal_type, _wal_thresh, _wal_label)
                        st.session_state.pop(f"wl_alert_open_{_wi['id']}", None)
                        st.success(f"Alerte créée pour {_wtk}.")
                        st.rerun()

            st.markdown(
                f"<div style='height:1px;background:{_BORDER};margin:4px 0;'></div>",
                unsafe_allow_html=True,
            )


# ══════════════════════════════════════════════════════════════════════════════
# TAB 6 — 📊 Fiscal
# ══════════════════════════════════════════════════════════════════════════════

with tab_fiscal:
    from backend.tax import compute_stock_pv, compute_crypto_pv_2086, available_years
    import io, csv

    st.markdown("### 📊 Export fiscal — Plus-values réalisées")
    st.caption(
        "Actions/ETF : méthode PRU (coût moyen pondéré). "
        "Crypto : formule 2086 officielle (BOFiP). "
        "Ces données sont indicatives — consultez un expert-comptable ou fiscaliste."
    )

    _fy_years = available_years()
    _fy_col1, _fy_col2 = st.columns([2, 6])
    with _fy_col1:
        if _fy_years:
            _fy_year = st.selectbox("Année fiscale", _fy_years, key="fiscal_year")
        else:
            _fy_year = None
            st.info("Aucune vente enregistrée.")

    # ── SECTION 1 — Actions / ETF ─────────────────────────────────────────────
    st.divider()
    st.subheader("◈ Actions / ETF — Plus-values réalisées")

    _stk_lines = compute_stock_pv(year=_fy_year)

    if not _stk_lines:
        st.caption(f"Aucune vente d'actions/ETF en {_fy_year or 'toutes années'}.")
    else:
        _stk_pv   = sum(l["pv_mv"] for l in _stk_lines if l["pv_mv"] > 0)
        _stk_mv   = sum(l["pv_mv"] for l in _stk_lines if l["pv_mv"] < 0)
        _stk_net  = _stk_pv + _stk_mv
        _stk_pfu  = max(0.0, _stk_net) * 0.30

        _fs1, _fs2, _fs3, _fs4 = st.columns(4)
        _fs1.metric("Plus-values brutes",  f"{_stk_pv:,.2f} €",  delta_color="normal")
        _fs2.metric("Moins-values",        f"{abs(_stk_mv):,.2f} €", delta_color="inverse")
        _fs3.metric("PV nette imposable",  f"{_stk_net:+,.2f} €")
        _fs4.metric("PFU estimé (30 %)",   f"{_stk_pfu:,.2f} €")

        _stk_df = pd.DataFrame([{
            "Date":            l["date"],
            "Ticker":          l["ticker"],
            "Nom":             l["name"],
            "Qté vendue":      f"{l['qty_sold']:.6f}",
            "Prix vente/u":    f"{l['prix_vente_unit']:,.4f} €",
            "PRU":             f"{l['pru']:,.4f} €",
            "Frais":           f"{l['frais']:.2f} €",
            "Prix de cession": f"{l['prix_cession_net']:,.2f} €",
            "Coût d'achat":    f"{l['cout_achat']:,.2f} €",
            "PV / MV":         f"{l['pv_mv']:+,.2f} €",
            "PFU estimé":      f"{l['pfu_estime']:,.2f} €",
        } for l in _stk_lines])

        st.dataframe(_stk_df, hide_index=True, use_container_width=True)

        # CSV export
        _stk_buf = io.StringIO()
        _stk_df.to_csv(_stk_buf, index=False, sep=";", decimal=",")
        st.download_button(
            label="⬇ Télécharger CSV (Actions/ETF)",
            data=_stk_buf.getvalue().encode("utf-8-sig"),
            file_name=f"plus_values_actions_{_fy_year or 'all'}.csv",
            mime="text/csv",
            key="dl_stk_csv",
        )

    # ── SECTION 2 — Crypto / Formulaire 2086 ─────────────────────────────────
    st.divider()
    st.subheader("₿ Crypto — Formulaire 2086")

    _cry_result = compute_crypto_pv_2086(year=_fy_year)
    _cry_lines  = _cry_result["lines"]

    if not _cry_lines:
        st.caption(f"Aucune cession crypto en {_fy_year or 'toutes années'}.")
    else:
        _cf1, _cf2, _cf3, _cf4 = st.columns(4)
        _cf1.metric("Plus-values brutes",  f"{_cry_result['total_pv']:,.2f} €")
        _cf2.metric("Moins-values",        f"{_cry_result['total_mv']:,.2f} €", delta_color="inverse")
        _cf3.metric("PV nette 2086",       f"{_cry_result['total_net']:+,.2f} €")
        _cf4.metric("PFU estimé (30 %)",   f"{_cry_result['pfu_estime']:,.2f} €")

        st.info(
            "**Note sur la valeur globale du portefeuille** : pour les cryptos détenues "
            "hors de la crypto cédée, le PRU est utilisé comme proxy du cours à la date "
            "de cession (faute d'historique exact). Le calcul est conforme à la logique "
            "2086 mais reste une estimation — conservez vos relevés d'exchange pour "
            "reconstituer les valeurs exactes si besoin."
        )

        _cry_df = pd.DataFrame([{
            "Date cession":            l["date"],
            "Crypto":                  l["ticker"],
            "Nom":                     l["name"],
            "Qté cédée":               f"{l['qty_sold']:.8f}",
            "Prix unit. (€)":          f"{l['prix_vente_unit']:,.6f}",
            "Frais (€)":               f"{l['frais']:.4f}",
            "Prix cession net (€)":    f"{l['prix_cession_net']:,.4f}",
            "Valeur globale portef.":  f"{l['valeur_globale_portef']:,.2f}",
            "Coût global portef.":     f"{l['total_cost_global']:,.2f}",
            "PV / MV 2086 (€)":        f"{l['pv_mv_2086']:+,.4f}",
            "PFU estimé (€)":          f"{l['pfu_estime']:,.4f}",
        } for l in _cry_lines])

        st.dataframe(_cry_df, hide_index=True, use_container_width=True)

        # Récap 2086 lignes (format compatible avec la déclaration)
        with st.expander("📋 Récapitulatif format déclaration 2086", expanded=False):
            for i, l in enumerate(_cry_lines, 1):
                st.markdown(
                    f"**Ligne {i}** — {l['ticker']} — {l['date']}"
                )
                _dl1, _dl2, _dl3, _dl4 = st.columns(4)
                _dl1.markdown(
                    f"<div style='font-size:10px;color:{_MUTED};'>Prix de cession</div>"
                    f"<div style='font-weight:600;'>{l['prix_cession_net']:,.4f} €</div>",
                    unsafe_allow_html=True,
                )
                _dl2.markdown(
                    f"<div style='font-size:10px;color:{_MUTED};'>Frais de cession</div>"
                    f"<div style='font-weight:600;'>{l['frais']:.4f} €</div>",
                    unsafe_allow_html=True,
                )
                _dl3.markdown(
                    f"<div style='font-size:10px;color:{_MUTED};'>Valeur globale du portefeuille</div>"
                    f"<div style='font-weight:600;'>{l['valeur_globale_portef']:,.4f} €</div>",
                    unsafe_allow_html=True,
                )
                _dl4.markdown(
                    f"<div style='font-size:10px;color:{_MUTED};'>Prix total d'acquisition</div>"
                    f"<div style='font-weight:600;'>{l['total_cost_global']:,.4f} €</div>",
                    unsafe_allow_html=True,
                )
                _pv_color = _C_GAIN if l['pv_mv_2086'] >= 0 else _C_LOSS
                st.markdown(
                    f"<div style='margin:6px 0 12px;font-size:13px;font-weight:700;"
                    f"color:{_pv_color};'>→ PV / MV : {l['pv_mv_2086']:+,.4f} €</div>",
                    unsafe_allow_html=True,
                )
                st.markdown(
                    f"<div style='height:1px;background:{_BORDER};margin-bottom:10px;'></div>",
                    unsafe_allow_html=True,
                )

        # CSV export
        _cry_buf = io.StringIO()
        _cry_df.to_csv(_cry_buf, index=False, sep=";", decimal=",")
        st.download_button(
            label="⬇ Télécharger CSV (Formulaire 2086)",
            data=_cry_buf.getvalue().encode("utf-8-sig"),
            file_name=f"formulaire_2086_{_fy_year or 'all'}.csv",
            mime="text/csv",
            key="dl_cry_csv",
        )

    # ── SECTION 3 — Résumé fiscal global ─────────────────────────────────────
    if _stk_lines or _cry_lines:
        st.divider()
        st.subheader("Récapitulatif fiscal global")
        _glob_pv  = (_stk_pv  if _stk_lines else 0) + _cry_result.get("total_pv", 0)
        _glob_mv  = (abs(_stk_mv) if _stk_lines else 0) + _cry_result.get("total_mv", 0)
        _glob_net = (_stk_net if _stk_lines else 0) + _cry_result.get("total_net", 0)
        _glob_pfu = max(0.0, _glob_net) * 0.30

        _gr1, _gr2, _gr3, _gr4 = st.columns(4)
        _gr1.metric("PV brutes totales",    f"{_glob_pv:,.2f} €")
        _gr2.metric("MV totales",           f"{_glob_mv:,.2f} €", delta_color="inverse")
        _gr3.metric("PV nette totale",      f"{_glob_net:+,.2f} €")
        _gr4.metric("PFU total estimé",     f"{_glob_pfu:,.2f} €")

        st.caption(
            "PFU = 30 % (12.8 % IR + 17.2 % prélèvements sociaux) appliqué sur la PV nette positive. "
            "Les moins-values d'une catégorie (actions ou crypto) ne compensent pas les plus-values "
            "de l'autre catégorie selon la réglementation française actuelle."
        )
