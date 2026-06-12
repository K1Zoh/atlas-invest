import type { NextRequest } from "next/server";
import { loadPortfolio } from "@/lib/analytics";
import { bad, oops } from "@/lib/api-helpers";
import { buildChatSystemPrompt } from "@/lib/ai/prompts";
import {
  geminiConfigured,
  groqConfigured,
  streamGemini,
  streamGroq,
  type ChatMessage,
} from "@/lib/ai/providers";
import { getPositions } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      messages?: { role: "user" | "assistant"; content: string }[];
      provider?: "gemini" | "groq";
    };
    if (!body.messages?.length) return bad("messages requis");

    const provider =
      body.provider === "groq" || (!geminiConfigured() && groqConfigured()) ? "groq" : "gemini";
    if (provider === "gemini" && !geminiConfigured()) {
      return bad("Aucune clé IA configurée — ajoute ta clé Gemini ou Groq dans Paramètres.");
    }

    const { views, summary } = await loadPortfolio(getPositions());
    const messages: ChatMessage[] = [
      { role: "system", content: buildChatSystemPrompt(views, summary) },
      ...body.messages.slice(-20),
    ];

    const stream = provider === "groq" ? await streamGroq(messages) : await streamGemini(messages);
    return new Response(stream, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  } catch (e) {
    return oops(e);
  }
}
