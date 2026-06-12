import type { NextRequest } from "next/server";
import { bad, ok, oops } from "@/lib/api-helpers";
import { sendDiscordTest, sendEmailTest, sendTelegramTest } from "@/lib/notify";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { channel?: "discord" | "telegram" | "smtp" };
    switch (body.channel) {
      case "discord": {
        const url = getSetting("notify.discord_webhook");
        if (!url) return bad("Webhook Discord non configuré");
        await sendDiscordTest(url);
        return ok({ sent: true });
      }
      case "telegram": {
        const token = getSetting("notify.telegram_token");
        const chatId = getSetting("notify.telegram_chat_id");
        if (!token || !chatId) return bad("Telegram non configuré");
        await sendTelegramTest(token, chatId);
        return ok({ sent: true });
      }
      case "smtp": {
        await sendEmailTest();
        return ok({ sent: true });
      }
      default:
        return bad("channel invalide");
    }
  } catch (e) {
    return oops(e);
  }
}
