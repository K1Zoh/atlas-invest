"""
Canaux de notification alternatifs au SMTP : Telegram et Discord.

Variables d'environnement :
    TELEGRAM_BOT_TOKEN  – token du bot Telegram (via @BotFather)
    TELEGRAM_CHAT_ID    – chat_id du destinataire (utilisateur ou groupe)
    DISCORD_WEBHOOK_URL – URL du webhook Discord du channel cible

Chaque send_* retourne (success: bool, error_message: str).
"""

from __future__ import annotations
import os
from datetime import datetime

import requests

from backend.alerts import ALERT_PURPOSE_META
import backend.settings as _cfg


def telegram_configured() -> bool:
    return bool(
        _cfg.get("telegram", "bot_token", "TELEGRAM_BOT_TOKEN")
        and _cfg.get("telegram", "chat_id", "TELEGRAM_CHAT_ID")
    )


def discord_configured() -> bool:
    return bool(_cfg.get("discord", "webhook_url", "DISCORD_WEBHOOK_URL"))


# ── Telegram ───────────────────────────────────────────────────────────────────

def send_telegram(triggered: list[dict]) -> tuple[bool, str]:
    token   = _cfg.get("telegram", "bot_token", "TELEGRAM_BOT_TOKEN")
    chat_id = _cfg.get("telegram", "chat_id",   "TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return False, "Telegram non configuré — configure le bot dans Paramètres > Notifications"
    if not triggered:
        return True, ""

    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    lines = [f"🔔 *STOCK\\_TERMINAL — {len(triggered)} alerte(s)* — {now}\n"]

    for a in triggered:
        meta      = ALERT_PURPOSE_META.get(a["alert_type"], ALERT_PURPOSE_META["above"])
        condition = meta["condition"]
        icon      = "📈" if condition == "above" else "📉"
        direction = meta["label"].upper()
        cur       = a.get("current_price", 0)
        lbl       = a.get("label") or ""
        cls       = "Crypto" if a["asset_class"] == "crypto" else "Stock"
        lbl_part  = f"  _{lbl}_" if lbl else ""

        lines.append(
            f"{icon} *{a['ticker']}* ({cls}){lbl_part}\n"
            f"   {direction} — seuil : `{a['threshold']:,.4f}` / cours : `{cur:,.4f}`"
        )

    text = "\n\n".join(lines)
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            timeout=10,
        )
        if resp.ok:
            return True, ""
        return False, f"Telegram API error {resp.status_code}: {resp.text[:200]}"
    except Exception as exc:
        return False, str(exc)


def send_telegram_test(token: str, chat_id: str) -> tuple[bool, str]:
    """Envoie un message de test avec les credentials fournis."""
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": "✅ *STOCK\\_TERMINAL* — Notification Telegram configurée avec succès !",
                "parse_mode": "Markdown",
            },
            timeout=10,
        )
        if resp.ok:
            return True, ""
        return False, f"Erreur {resp.status_code}: {resp.json().get('description', resp.text[:200])}"
    except Exception as exc:
        return False, str(exc)


# ── Discord ────────────────────────────────────────────────────────────────────

_DISCORD_COLORS = {
    "above":      0x10b981,   # vert
    "below":      0xf87171,   # rouge
    "buy_target": 0x10b981,
    "sell_target":0xf59e0b,
    "stop_loss":  0xf87171,
    "take_profit":0x10b981,
    "resistance": 0x60a5fa,
    "support":    0xa78bfa,
}


def send_discord(triggered: list[dict]) -> tuple[bool, str]:
    url = _cfg.get("discord", "webhook_url", "DISCORD_WEBHOOK_URL")
    if not url:
        return False, "Discord non configuré — configure le webhook dans Paramètres > Notifications"
    if not triggered:
        return True, ""

    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    embeds = []

    for a in triggered:
        meta      = ALERT_PURPOSE_META.get(a["alert_type"], ALERT_PURPOSE_META["above"])
        condition = meta["condition"]
        color     = _DISCORD_COLORS.get(a["alert_type"], 0x10b981)
        cur       = a.get("current_price", 0)
        lbl       = a.get("label") or "—"
        cls       = "Crypto ₿" if a["asset_class"] == "crypto" else "Stock / ETF ◈"

        embeds.append({
            "title":       f"{meta['icon']} {a['ticker']} — {meta['label'].upper()}",
            "description": f"**{lbl}**",
            "color":       color,
            "fields": [
                {"name": "Classe",       "value": cls,                             "inline": True},
                {"name": "Seuil",        "value": f"`{a['threshold']:,.4f} €`",    "inline": True},
                {"name": "Cours actuel", "value": f"`{cur:,.4f} €`",               "inline": True},
            ],
            "footer": {"text": f"STOCK_TERMINAL • {now}"},
        })

    # Discord limite à 10 embeds par message
    try:
        for i in range(0, len(embeds), 10):
            resp = requests.post(
                url,
                json={
                    "username": "STOCK_TERMINAL",
                    "embeds": embeds[i:i + 10],
                },
                timeout=10,
            )
            if not resp.ok:
                return False, f"Discord webhook error {resp.status_code}: {resp.text[:200]}"
        return True, ""
    except Exception as exc:
        return False, str(exc)


def send_discord_test(webhook_url: str) -> tuple[bool, str]:
    """Envoie un embed de test vers le webhook Discord fourni."""
    try:
        resp = requests.post(
            webhook_url,
            json={
                "username": "STOCK_TERMINAL",
                "embeds": [{
                    "title": "✅ Notification Discord configurée",
                    "description": "STOCK\\_TERMINAL est connecté à ce channel.",
                    "color": 0x10b981,
                    "footer": {"text": "STOCK_TERMINAL — test de connexion"},
                }],
            },
            timeout=10,
        )
        if resp.ok:
            return True, ""
        return False, f"Erreur {resp.status_code}: {resp.text[:200]}"
    except Exception as exc:
        return False, str(exc)
