import { computeHhi, concentrationAlerts, loadPortfolio } from "@/lib/analytics";
import { bad, ok, oops } from "@/lib/api-helpers";
import { buildPortfolioAnalysisMessages, extractRecommendations, stripJsonBlock } from "@/lib/ai/prompts";
import { geminiConfigured, groqConfigured, runDualAnalysis } from "@/lib/ai/providers";
import { getPositions, saveAnalysis } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    if (!geminiConfigured() && !groqConfigured()) {
      return bad("Aucune clé IA configurée — ajoute ta clé Gemini ou Groq dans Paramètres.");
    }
    const positions = getPositions();
    if (!positions.length) return bad("Portefeuille vide — ajoute d'abord des positions.");

    const { views, summary } = await loadPortfolio(positions);
    const hhi = computeHhi(views);
    const alerts = concentrationAlerts(views);
    const { system, user } = buildPortfolioAnalysisMessages(views, summary, hhi, alerts);

    const results = await runDualAnalysis([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    const priceByTicker = new Map(views.map((v) => [v.ticker, v.price]));
    const analyses = results.map((r) => {
      if (r.error || !r.text) {
        return { model: r.model, content: "", recommendations: null, error: r.error ?? "Réponse vide" };
      }
      const recommendations = (extractRecommendations(r.text) ?? []).map((rec) => ({
        ...rec,
        priceAtSuggestion: priceByTicker.get(rec.ticker) ?? rec.priceAtSuggestion ?? null,
      }));
      const content = stripJsonBlock(r.text);
      saveAnalysis({
        scope: "portfolio",
        assetClass: "all",
        model: r.model,
        content,
        recommendations,
        snapshot: JSON.stringify({ totalValue: summary.totalValue, pnlPct: summary.pnlPct, hhi }),
      });
      return { model: r.model, content, recommendations, error: null };
    });

    return ok({ analyses });
  } catch (e) {
    return oops(e);
  }
}
