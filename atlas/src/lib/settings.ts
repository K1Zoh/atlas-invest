import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";

// Load the legacy app's .env (repo root) once, so existing keys keep working
// without any copy/paste. Values already set in the environment win.
let legacyEnvLoaded = false;
function loadLegacyEnv(): void {
  if (legacyEnvLoaded) return;
  legacyEnvLoaded = true;
  for (const file of [path.join(process.cwd(), ".env"), path.resolve(process.cwd(), "..", ".env")]) {
    try {
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const [, key, raw] = m;
        if (process.env[key]) continue;
        process.env[key] = raw.replace(/^["']|["']$/g, "");
      }
    } catch {
      // best effort only
    }
  }
}

/**
 * Flat key/value settings stored in SQLite, with environment fallbacks
 * so existing .env users keep working without re-typing their keys.
 */
const ENV_FALLBACKS: Record<string, string[]> = {
  "ai.gemini_key": ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
  "ai.groq_key": ["GROQ_API_KEY"],
  "ai.gemini_model": ["GEMINI_MODEL"],
  "notify.discord_webhook": ["DISCORD_WEBHOOK_URL"],
  "notify.telegram_token": ["TELEGRAM_BOT_TOKEN"],
  "notify.telegram_chat_id": ["TELEGRAM_CHAT_ID"],
  "smtp.host": ["SMTP_HOST"],
  "smtp.port": ["SMTP_PORT"],
  "smtp.user": ["SMTP_USER"],
  "smtp.pass": ["SMTP_PASS"],
  "smtp.to": ["ALERT_EMAIL_TO"],
};

const DEFAULTS: Record<string, string> = {
  "ai.gemini_model": "gemini-2.5-flash",
  "ai.groq_model": "llama-3.3-70b-versatile",
  "smtp.port": "587",
};

export function getSetting(key: string): string {
  loadLegacyEnv();
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (row?.value) return row.value.trim();
  for (const env of ENV_FALLBACKS[key] ?? []) {
    const v = process.env[env];
    if (v) return v.trim();
  }
  return DEFAULTS[key] ?? "";
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  if (value === "") {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  } else {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(key, value);
  }
}

export function getSettings(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = getSetting(k);
  return out;
}

/** Keys whose values must never be echoed back to the client in full. */
export const SECRET_KEYS = new Set([
  "ai.gemini_key",
  "ai.groq_key",
  "notify.telegram_token",
  "notify.discord_webhook",
  "smtp.pass",
]);

export function maskSecret(v: string): string {
  if (!v) return "";
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}
