import { ok, oops } from "@/lib/api-helpers";
import { getQuotes, type AssetRef } from "@/lib/market";
import { getPositions, listAnalyses } from "@/lib/repo";
import type { AssetClass } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ScoredCall {
  model: string;
  ticker: string;
  action: string;
  conviction: number;
  date: string;
  priceAtSuggestion: number;
  priceNow: number | null;
  movePct: number | null;
  verdict: "correct" | "incorrect" | "pending" | null;
}

/**
 * "L'IA avait-elle raison ?" — compares past buy/sell calls with what prices
 * actually did since. Holds (conserver) are excluded; calls younger than 7
 * days are 'pending'.
 */
export async function GET() {
  try {
    const analyses = listAnalyses({ scope: "portfolio", limit: 100 });
    const positions = getPositions();
    const classByTicker = new Map<string, { assetClass: AssetClass; coingeckoId: string | null }>(
      positions.map((p) => [p.ticker, { assetClass: p.assetClass, coingeckoId: p.coingeckoId }]),
    );

    const refs = new Map<string, AssetRef>();
    for (const a of analyses) {
      for (const r of a.recommendations ?? []) {
        const known = classByTicker.get(r.ticker);
        if (known && !refs.has(r.ticker)) {
          refs.set(r.ticker, { ticker: r.ticker, ...known });
        }
      }
    }
    const { quotes } = await getQuotes([...refs.values()]);

    const calls: ScoredCall[] = [];
    for (const a of analyses) {
      for (const r of a.recommendations ?? []) {
        if (r.action === "conserver" || !r.priceAtSuggestion) continue;
        const known = classByTicker.get(r.ticker);
        const q = known ? quotes.get(`${known.assetClass}:${r.ticker}`) : undefined;
        const priceNow = q?.priceEur ?? null;
        const movePct = priceNow ? ((priceNow - r.priceAtSuggestion) / r.priceAtSuggestion) * 100 : null;
        const ageDays = (Date.now() - new Date(a.createdAt).getTime()) / 86_400_000;
        let verdict: ScoredCall["verdict"] = null;
        if (movePct !== null) {
          if (ageDays < 7) verdict = "pending";
          else {
            const expectsUp = r.action === "acheter" || r.action === "renforcer";
            verdict = (expectsUp ? movePct > 0 : movePct < 0) ? "correct" : "incorrect";
          }
        }
        calls.push({
          model: a.model,
          ticker: r.ticker,
          action: r.action,
          conviction: r.conviction,
          date: a.createdAt,
          priceAtSuggestion: r.priceAtSuggestion,
          priceNow,
          movePct,
          verdict,
        });
      }
    }

    const byModel = new Map<string, { total: number; correct: number; pending: number }>();
    for (const c of calls) {
      let s = byModel.get(c.model);
      if (!s) {
        s = { total: 0, correct: 0, pending: 0 };
        byModel.set(c.model, s);
      }
      if (c.verdict === "pending") s.pending++;
      else if (c.verdict) {
        s.total++;
        if (c.verdict === "correct") s.correct++;
      }
    }

    return ok({
      calls: calls.slice(0, 60),
      models: [...byModel.entries()].map(([model, s]) => ({
        model,
        evaluated: s.total,
        correct: s.correct,
        hitRate: s.total ? (s.correct / s.total) * 100 : null,
        pending: s.pending,
      })),
    });
  } catch (e) {
    return oops(e);
  }
}
