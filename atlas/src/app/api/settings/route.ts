import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { getSetting, maskSecret, SECRET_KEYS, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const EDITABLE_KEYS = [
  "ai.gemini_key",
  "ai.gemini_model",
  "ai.groq_key",
  "ai.groq_model",
  "notify.discord_webhook",
  "notify.telegram_token",
  "notify.telegram_chat_id",
  "smtp.host",
  "smtp.port",
  "smtp.user",
  "smtp.pass",
  "smtp.to",
  "rebalance.target_crypto",
  "rebalance.contribution",
];

export async function GET() {
  try {
    const out: Record<string, { value: string; set: boolean; secret: boolean }> = {};
    for (const key of EDITABLE_KEYS) {
      const raw = getSetting(key);
      const secret = SECRET_KEYS.has(key);
      out[key] = { value: secret ? maskSecret(raw) : raw, set: !!raw, secret };
    }
    return ok({ settings: out });
  } catch (e) {
    return oops(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { updates?: Record<string, string> };
    if (!body.updates) return bad("updates requis");
    let count = 0;
    for (const [key, value] of Object.entries(body.updates)) {
      if (!EDITABLE_KEYS.includes(key)) continue;
      if (typeof value !== "string") continue;
      // Ignore masked placeholders sent back unchanged.
      if (value.includes("••••")) continue;
      setSetting(key, value.trim());
      count++;
    }
    return ok({ saved: count });
  } catch (e) {
    return oops(e);
  }
}
