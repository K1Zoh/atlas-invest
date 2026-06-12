import type { NextRequest } from "next/server";
import { loadPortfolio } from "@/lib/analytics";
import { bad, ok, oops } from "@/lib/api-helpers";
import { buildAssetAnalysisMessages } from "@/lib/ai/prompts";
import { callGemini, callGroq, geminiConfigured, groqConfigured } from "@/lib/ai/providers";
import { getAssetHistory } from "@/lib/market";
import { getPositions, listTransactions, saveAnalysis } from "@/lib/repo";
import type { AssetClass } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      ticker?: string;
      assetClass?: AssetClass;
      coingeckoId?: string | null;
    };
    if (!body.ticker || !body.assetClass) return bad("ticker et assetClass requis");
    if (!geminiConfigured() && !groqConfigured()) {
      return bad("Aucune clé IA configurée — ajoute ta clé Gemini ou Groq dans Paramètres.");
    }

    const ticker = body.ticker.toUpperCase();
    const positions = getPositions();
    const { views } = await loadPortfolio(positions);
    const view = views.find((v) => v.ticker === ticker && v.assetClass === body.assetClass);

    const ref = { ticker, assetClass: body.assetClass, coingeckoId: body.coingeckoId ?? view?.coingeckoId };
    let perf30d: number | null = null;
    let perf1y: number | null = null;
    let price: number | null = view?.price ?? null;
    try {
      const hist = await getAssetHistory(ref, 365);
      if (hist.length > 2) {
        const last = hist[hist.length - 1].value;
        price = price ?? last;
        const d30 = hist.find((p) => p.date >= new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
        if (d30) perf30d = ((last - d30.value) / d30.value) * 100;
        perf1y = ((last - hist[0].value) / hist[0].value) * 100;
      }
    } catch {
      // analysis can proceed without history
    }

    const theses = listTransactions({ ticker, assetClass: body.assetClass })
      .filter((tx) => tx.note && !tx.note.startsWith("Import") && !tx.note.startsWith("Importé"))
      .slice(0, 8)
      .map((tx) => ({ date: tx.txDate, side: tx.side, note: tx.note as string }));

    const { system, user } = buildAssetAnalysisMessages({
      ticker,
      name: view?.name ?? ticker,
      assetClass: body.assetClass,
      price,
      avgCost: view?.avgCost ?? null,
      pnlPct: view?.pnlPct ?? null,
      weightPct: view?.weightPct ?? null,
      perf30d,
      perf1y,
      inPortfolio: !!view,
      theses,
    });

    const messages = [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ];
    const result = geminiConfigured() ? await callGemini(messages) : await callGroq(messages);
    if (result.error || !result.text) {
      // fallback to the other model
      const fallback = geminiConfigured() && groqConfigured() ? await callGroq(messages) : null;
      if (!fallback || fallback.error) return bad(result.error ?? "Analyse impossible", 502);
      saveAnalysis({ scope: "asset", assetClass: body.assetClass, ticker, model: fallback.model, content: fallback.text });
      return ok({ model: fallback.model, content: fallback.text });
    }

    saveAnalysis({ scope: "asset", assetClass: body.assetClass, ticker, model: result.model, content: result.text });
    return ok({ model: result.model, content: result.text });
  } catch (e) {
    return oops(e);
  }
}
