"""
Persistent app settings stored in data/settings.json.
Falls back to environment variables for backward compatibility.

All credentials (SMTP, Telegram, Discord) can be configured via the UI
in the Settings tab — no .env edit required.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

_SETTINGS_FILE = Path(__file__).parent.parent / "data" / "settings.json"


def _load() -> dict:
    if _SETTINGS_FILE.exists():
        try:
            return json.loads(_SETTINGS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def get(section: str, key: str, env_fallback: str = "") -> str:
    """Return value from JSON store, falling back to env var."""
    val = _load().get(section, {}).get(key, "")
    if val:
        return str(val).strip()
    if env_fallback:
        return os.getenv(env_fallback, "").strip()
    return ""


def get_int(section: str, key: str, env_fallback: str = "", default: int = 0) -> int:
    val = get(section, key, env_fallback)
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def save_section(section: str, updates: dict) -> None:
    """Persist a whole settings section (overwrites existing keys)."""
    data = _load()
    data[section] = {k: v for k, v in updates.items() if v is not None}
    _SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    _SETTINGS_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def get_section(section: str, defaults: dict | None = None) -> dict:
    """Return a section dict, filled in with defaults where missing."""
    data = _load().get(section, {})
    if defaults:
        return {k: data.get(k, v) for k, v in defaults.items()}
    return data


def smtp_configured() -> bool:
    return all([
        get("smtp", "host",  "SMTP_HOST"),
        get("smtp", "user",  "SMTP_USER"),
        get("smtp", "pass_", "SMTP_PASS"),
    ])


def telegram_configured() -> bool:
    return bool(
        get("telegram", "bot_token", "TELEGRAM_BOT_TOKEN")
        and get("telegram", "chat_id", "TELEGRAM_CHAT_ID")
    )


def discord_configured() -> bool:
    return bool(get("discord", "webhook_url", "DISCORD_WEBHOOK_URL"))
