import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

from backend.db import get_connection, get_position_platform
from backend.exchanges import build_exchange_url, get_exchange_info, get_exchanges_for_asset
import backend.settings as _cfg

# Maps semantic purpose → actual price condition
_PURPOSE_CONDITION: dict[str, str] = {
    "buy_target":  "below",  # alerte d'achat — déclenche quand le prix descend
    "sell_target": "above",  # objectif de vente — déclenche quand le prix monte
    "stop_loss":   "below",  # stop-loss — protège contre une baisse
    "take_profit": "above",  # take-profit — verrouille les gains
    "resistance":  "above",  # résistance franchie à la hausse
    "support":     "below",  # support cassé à la baisse
    # legacy raw conditions (backward-compat)
    "above":       "above",
    "below":       "below",
}

# Display metadata per purpose
ALERT_PURPOSE_META: dict[str, dict] = {
    "buy_target":  {"label": "Alerte d'achat",      "condition": "below", "icon": "◉", "hint": "déclenche si cours ≤ seuil"},
    "sell_target": {"label": "Objectif de vente",   "condition": "above", "icon": "◎", "hint": "déclenche si cours ≥ seuil"},
    "stop_loss":   {"label": "Stop-loss",            "condition": "below", "icon": "▼", "hint": "déclenche si cours ≤ seuil"},
    "take_profit": {"label": "Take-profit",          "condition": "above", "icon": "▲", "hint": "déclenche si cours ≥ seuil"},
    "resistance":  {"label": "Résistance franchie", "condition": "above", "icon": "▲", "hint": "déclenche si cours ≥ seuil"},
    "support":     {"label": "Support cassé",        "condition": "below", "icon": "▼", "hint": "déclenche si cours ≤ seuil"},
    "above":       {"label": "Au-dessus de",         "condition": "above", "icon": "▲", "hint": "déclenche si cours ≥ seuil"},
    "below":       {"label": "En-dessous de",        "condition": "below", "icon": "▼", "hint": "déclenche si cours ≤ seuil"},
}


def init_alerts_table():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker       TEXT    NOT NULL,
                asset_class  TEXT    NOT NULL DEFAULT 'stock',
                alert_type   TEXT    NOT NULL,
                threshold    REAL    NOT NULL,
                label        TEXT    NOT NULL DEFAULT '',
                active       INTEGER NOT NULL DEFAULT 1,
                triggered_at TIMESTAMP DEFAULT NULL,
                email_sent   INTEGER NOT NULL DEFAULT 0,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


def add_alert(
    ticker: str,
    asset_class: str,
    alert_type: str,
    threshold: float,
    label: str = "",
) -> int:
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO alerts (ticker, asset_class, alert_type, threshold, label) VALUES (?, ?, ?, ?, ?)",
            (ticker.upper(), asset_class, alert_type, threshold, label),
        )
        conn.commit()
        return cur.lastrowid


def get_alerts(active_only: bool = False) -> list[dict]:
    with get_connection() as conn:
        if active_only:
            rows = conn.execute(
                "SELECT * FROM alerts WHERE active=1 ORDER BY created_at DESC"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM alerts ORDER BY active DESC, created_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]


def delete_alert(alert_id: int):
    with get_connection() as conn:
        conn.execute("DELETE FROM alerts WHERE id=?", (alert_id,))
        conn.commit()


def rearm_alert(alert_id: int):
    """Réactive une alerte déjà déclenchée."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE alerts SET active=1, triggered_at=NULL, email_sent=0 WHERE id=?",
            (alert_id,),
        )
        conn.commit()


def check_alerts(prices: dict[str, float]) -> list[dict]:
    """
    Compare les alertes actives aux prix courants.
    Désactive les alertes franchies et retourne la liste de celles déclenchées.
    prices: {TICKER_UPPER: prix_float}
    """
    active = get_alerts(active_only=True)
    triggered = []
    with get_connection() as conn:
        for a in active:
            price = prices.get(a["ticker"].upper())
            if price is None:
                continue
            condition = _PURPOSE_CONDITION.get(a["alert_type"], "above")
            hit = (
                (condition == "above" and price >= a["threshold"]) or
                (condition == "below" and price <= a["threshold"])
            )
            if hit:
                a["current_price"] = price
                triggered.append(a)
                conn.execute(
                    "UPDATE alerts SET active=0, triggered_at=CURRENT_TIMESTAMP WHERE id=?",
                    (a["id"],),
                )
        conn.commit()
    return triggered


def _smtp_configured() -> bool:
    return all([
        _cfg.get("smtp", "host",  "SMTP_HOST"),
        _cfg.get("smtp", "user",  "SMTP_USER"),
        _cfg.get("smtp", "pass_", "SMTP_PASS"),
    ])


def send_alert_email(triggered: list[dict]) -> tuple[bool, str]:
    """
    Envoie un email récapitulatif pour les alertes déclenchées.
    Retourne (succès, message_erreur).
    """
    if not triggered:
        return True, ""

    host = _cfg.get("smtp", "host",  "SMTP_HOST")
    port = _cfg.get_int("smtp", "port", "SMTP_PORT", default=587)
    user = _cfg.get("smtp", "user",  "SMTP_USER")
    password = _cfg.get("smtp", "pass_", "SMTP_PASS")
    to = _cfg.get("smtp", "to", "ALERT_EMAIL_TO") or user

    if not all([host, user, password, to]):
        return False, "SMTP non configuré — configure l'email dans Paramètres > Notifications"

    rows_html = ""
    action_blocks_html = ""
    for a in triggered:
        meta = ALERT_PURPOSE_META.get(a["alert_type"], ALERT_PURPOSE_META["above"])
        condition = meta["condition"]
        direction = f"{meta['icon']} {meta['label'].upper()}"
        c = "#10b981" if condition == "above" else "#f87171"
        lbl = a.get("label") or "—"
        cur = a.get("current_price", 0)

        # Look up stored platform for this position
        platform_name = get_position_platform(a["ticker"], a["asset_class"])
        if platform_name:
            ex_url  = build_exchange_url(platform_name, a["ticker"])
            ex_info = get_exchange_info(platform_name)
            ex_color = ex_info["color"] if ex_info else "#10b981"
        else:
            # Fall back to first exchange in the list for this asset class
            fallbacks = get_exchanges_for_asset(a["asset_class"])
            fb = fallbacks[0]
            t  = a["ticker"].upper()
            tl = a["ticker"].lower()
            ex_url      = fb["url_template"].format(t=t, tl=tl)
            platform_name = fb["name"]
            ex_color    = fb["color"]

        rows_html += f"""
        <tr style="border-bottom:1px solid #2d2d2d;">
          <td style="padding:12px 16px;font-weight:700;color:#e1e2e8;font-size:14px;">{a['ticker']}</td>
          <td style="padding:12px 16px;color:#94a3b8;font-size:12px;">
            {'Bourse / ETF' if a['asset_class']=='stock' else 'Crypto'}
          </td>
          <td style="padding:12px 16px;">
            <span style="background:#1a1a1a;border:1px solid {c}33;color:{c};
                         padding:2px 8px;font-size:10px;font-weight:700;
                         letter-spacing:0.06em;text-transform:uppercase;">{lbl}</span>
          </td>
          <td style="padding:12px 16px;color:{c};font-weight:600;font-size:13px;">{direction} {a['threshold']:,.4f}</td>
          <td style="padding:12px 16px;color:#e1e2e8;font-weight:700;font-size:14px;">{cur:,.4f}</td>
          <td style="padding:12px 16px;">
            <a href="{ex_url}" target="_blank" rel="noopener noreferrer"
               style="display:inline-block;background:{ex_color}22;border:1px solid {ex_color}88;
                      color:{ex_color};padding:5px 12px;text-decoration:none;
                      font-size:11px;font-weight:700;letter-spacing:0.05em;
                      text-transform:uppercase;white-space:nowrap;">
              {platform_name} →
            </a>
          </td>
        </tr>"""

        # Dedicated action block per alert (full-width, clearer CTA)
        action_blocks_html += f"""
        <div style="background:#1a1a1a;border:1px solid {ex_color}44;
                    border-left:3px solid {ex_color};
                    padding:16px 20px;margin:10px 0;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
            <div>
              <div style="font-size:16px;font-weight:700;color:#e1e2e8;letter-spacing:0.02em;">
                {a['ticker']}
                <span style="font-size:11px;color:{c};font-weight:600;margin-left:8px;">
                  {direction} {a['threshold']:,.4f}
                </span>
              </div>
              <div style="font-size:11px;color:#94a3b8;margin-top:4px;">
                Cours actuel : <strong style="color:#e1e2e8;">{cur:,.4f}</strong>
                &nbsp;·&nbsp;Alerte : {lbl}
              </div>
            </div>
            <a href="{ex_url}" target="_blank" rel="noopener noreferrer"
               style="display:inline-block;background:{ex_color};color:#000;
                      padding:10px 20px;text-decoration:none;
                      font-size:12px;font-weight:900;letter-spacing:0.06em;
                      text-transform:uppercase;white-space:nowrap;">
              ACHETER SUR {platform_name.upper()} →
            </a>
          </div>
        </div>"""

    now_str = datetime.now().strftime("%d/%m/%Y à %H:%M")
    body_html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#121212;font-family:system-ui,sans-serif;">
  <div style="max-width:640px;margin:40px auto;background:#1a1a1a;border:1px solid #2d2d2d;">

    <div style="padding:24px 28px;border-bottom:1px solid #2d2d2d;
                display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:18px;font-weight:900;color:#10b981;text-transform:uppercase;
                    letter-spacing:-0.02em;">STOCK_TERMINAL</div>
        <div style="font-size:10px;color:#94a3b8;letter-spacing:0.1em;margin-top:3px;">
          ALERTE DE COURS
        </div>
      </div>
      <div style="font-size:11px;color:#94a3b8;">{now_str}</div>
    </div>

    <div style="padding:20px 28px 8px;">
      <div style="font-size:13px;color:#94a3b8;margin-bottom:16px;">
        <span style="color:#e1e2e8;font-weight:700;">{len(triggered)}</span>
        alerte(s) ont franchi leur seuil depuis la dernière vérification.
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid #2d2d2d;">
            <th style="padding:8px 16px;text-align:left;font-size:10px;color:#94a3b8;
                       text-transform:uppercase;letter-spacing:0.07em;font-weight:600;">Ticker</th>
            <th style="padding:8px 16px;text-align:left;font-size:10px;color:#94a3b8;
                       text-transform:uppercase;letter-spacing:0.07em;font-weight:600;">Classe</th>
            <th style="padding:8px 16px;text-align:left;font-size:10px;color:#94a3b8;
                       text-transform:uppercase;letter-spacing:0.07em;font-weight:600;">Label</th>
            <th style="padding:8px 16px;text-align:left;font-size:10px;color:#94a3b8;
                       text-transform:uppercase;letter-spacing:0.07em;font-weight:600;">Condition</th>
            <th style="padding:8px 16px;text-align:left;font-size:10px;color:#94a3b8;
                       text-transform:uppercase;letter-spacing:0.07em;font-weight:600;">Cours actuel</th>
            <th style="padding:8px 16px;text-align:left;font-size:10px;color:#94a3b8;
                       text-transform:uppercase;letter-spacing:0.07em;font-weight:600;">Action</th>
          </tr>
        </thead>
        <tbody>{rows_html}</tbody>
      </table>
    </div>

    <div style="padding:16px 28px 20px;border-top:1px solid #2d2d2d;margin-top:8px;">
      <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;
                  letter-spacing:0.08em;margin-bottom:12px;">Accès direct aux plateformes</div>
      {action_blocks_html}
    </div>

    <div style="padding:16px 28px;border-top:1px solid #2d2d2d;">
      <div style="font-size:11px;color:#94a3b8;line-height:1.6;">
        Ces alertes ont été <strong style="color:#e1e2e8;">automatiquement désactivées</strong>.
        Ouvre STOCK_TERMINAL pour les réactiver ou en créer de nouvelles.
        <br>La plateforme affichée est celle enregistrée lors de ton dernier achat.
      </div>
    </div>

  </div>
</body></html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[STOCK_TERMINAL] {len(triggered)} alerte(s) déclenchée(s) — {now_str}"
    msg["From"] = user
    msg["To"] = to
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        with smtplib.SMTP(host, port) as server:
            server.ehlo()
            server.starttls()
            server.login(user, password)
            server.sendmail(user, [to], msg.as_string())
        with get_connection() as conn:
            for a in triggered:
                conn.execute("UPDATE alerts SET email_sent=1 WHERE id=?", (a["id"],))
            conn.commit()
        return True, ""
    except Exception as exc:
        return False, str(exc)


def smtp_configured() -> bool:
    return _smtp_configured()
