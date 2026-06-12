import { fmtEur, fmtPct } from "../format";
import type {
  AiRecommendation,
  ConcentrationAlert,
  PortfolioSummary,
  PositionView,
} from "../types";

const DISCLAIMER =
  "Tu n'es pas un conseiller financier agréé : tes analyses sont des pistes de réflexion, " +
  "jamais des ordres d'exécution. Tu raisonnes de façon vérifiable : chaque recommandation " +
  "cite les faits du portefeuille qui la justifient.";

function portfolioTable(views: PositionView[]): string {
  const header = "| Ticker | Nom | Classe | Qté | PRU | Cours | Valeur | Perf | Poids |";
  const sep = "|---|---|---|---|---|---|---|---|---|";
  const rows = views.map(
    (v) =>
      `| ${v.ticker} | ${v.name} | ${v.assetClass === "crypto" ? "Crypto" : "Action/ETF"} | ${v.quantity} | ${fmtEur(v.avgCost)} | ${fmtEur(v.price)} | ${fmtEur(v.value)} | ${fmtPct(v.pnlPct)} | ${v.weightPct?.toFixed(1) ?? "—"} % |`,
  );
  return [header, sep, ...rows].join("\n");
}

function summaryBlock(s: PortfolioSummary, hhi: number, alerts: ConcentrationAlert[]): string {
  const hhiLabel = hhi > 0.25 ? "TRÈS CONCENTRÉ" : hhi > 0.15 ? "modérément concentré" : "bien diversifié";
  return [
    `- Capital investi : ${fmtEur(s.totalInvested)}`,
    `- Valeur actuelle : ${fmtEur(s.totalValue)}`,
    `- P/L latent : ${fmtEur(s.pnl)} (${fmtPct(s.pnlPct)})`,
    `- P/L réalisé : ${fmtEur(s.realizedPnl)}`,
    `- Variation 24h : ${fmtPct(s.dayChangePct)}`,
    `- Concentration (HHI) : ${hhi.toFixed(3)} — ${hhiLabel}`,
    `- Alertes : ${alerts.length ? alerts.map((a) => a.message).join(" / ") : "aucune"}`,
  ].join("\n");
}

export function buildPortfolioAnalysisMessages(
  views: PositionView[],
  summary: PortfolioSummary,
  hhi: number,
  alerts: ConcentrationAlert[],
): { system: string; user: string } {
  const date = new Date().toLocaleDateString("fr-FR", { dateStyle: "long" });
  const system = `Tu es un gestionnaire de portefeuille expérimenté, direct et sans complaisance — tu ne filtres pas les mauvaises nouvelles. ${DISCLAIMER} Tu réponds en français, en Markdown.`;
  const user = `Date d'analyse : ${date}

MON PORTEFEUILLE RÉEL
${portfolioTable(views)}

RÉSUMÉ
${summaryBlock(summary, hhi, alerts)}

MISSION — produis une analyse structurée :
1. **Vue d'ensemble** — santé globale du portefeuille en 3-4 phrases.
2. **Risques principaux** — concentration, corrélations, exposition macro (taux, géopolitique, cycle crypto). Sois précis sur MON portefeuille, pas générique.
3. **Contexte de marché** — ce qui, dans l'environnement économique actuel (à ta connaissance), impacte directement mes lignes.
4. **Recommandations** — 3 à 6 actions concrètes (acheter / renforcer / conserver / alléger / vendre), chacune justifiée par les chiffres ci-dessus, avec un niveau de conviction de 1 à 5.

Termine OBLIGATOIREMENT ta réponse par un bloc JSON de ce format exact :
\`\`\`json
{"recommendations":[{"ticker":"XXX","action":"renforcer","conviction":3,"reason":"justification courte"}]}
\`\`\`
Les actions autorisées : acheter, renforcer, conserver, alleger, vendre.`;
  return { system, user };
}

export function buildAssetAnalysisMessages(input: {
  ticker: string;
  name: string;
  assetClass: string;
  price: number | null;
  avgCost: number | null;
  pnlPct: number | null;
  weightPct: number | null;
  perf30d: number | null;
  perf1y: number | null;
  inPortfolio: boolean;
  theses?: { date: string; side: string; note: string }[];
}): { system: string; user: string } {
  const date = new Date().toLocaleDateString("fr-FR", { dateStyle: "long" });
  const system = `Tu es un analyste financier senior, direct et factuel. ${DISCLAIMER} Tu réponds en français, en Markdown compact (pas plus de 350 mots).`;
  const cls = input.assetClass === "crypto" ? "crypto-actif" : "action / ETF";
  const positionInfo = input.inPortfolio
    ? `Je détiens cette ligne : PRU ${fmtEur(input.avgCost)}, performance latente ${fmtPct(input.pnlPct)}, poids ${input.weightPct?.toFixed(1) ?? "?"} % de mon portefeuille.`
    : "Je ne détiens pas encore cet actif (watchlist).";
  const journalBlock = input.theses?.length
    ? `\nMON JOURNAL D'INVESTISSEMENT (mes raisons notées au moment des transactions) :\n${input.theses
        .map((th) => `- ${th.date} (${th.side === "buy" ? "achat" : "vente"}) : « ${th.note} »`)
        .join("\n")}\n`
    : "";
  const journalMission = input.theses?.length
    ? "\n4. **Ma thèse tient-elle ?** — confronte chacune de mes raisons notées dans le journal à la situation actuelle : toujours valable, affaiblie ou invalidée ? Sois direct."
    : "";
  const user = `Date : ${date}

Analyse ${input.ticker} (${input.name}), ${cls}.
- Cours actuel : ${fmtEur(input.price)}
- Performance 30 jours : ${fmtPct(input.perf30d)}
- Performance 1 an : ${fmtPct(input.perf1y)}
- ${positionInfo}
${journalBlock}
Structure attendue :
1. **Thèse** — pourquoi cet actif monte ou baisse en ce moment (drivers réels).
2. **Risques spécifiques** — 2-3 risques propres à cet actif.
3. **Mon positionnement** — au vu de ma position actuelle, que ferais-tu : renforcer, conserver, alléger ? Conviction 1-5 et conditions qui invalideraient ton avis.${journalMission}`;
  return { system, user };
}

export function buildChatSystemPrompt(
  views: PositionView[],
  summary: PortfolioSummary,
): string {
  return `Tu es l'assistant d'investissement intégré à Atlas, l'app de suivi de portefeuille de l'utilisateur. ${DISCLAIMER}

Tu connais son portefeuille RÉEL (mis à jour à l'instant) :
${portfolioTable(views)}

Résumé : valeur ${fmtEur(summary.totalValue)}, investi ${fmtEur(summary.totalInvested)}, P/L ${fmtEur(summary.pnl)} (${fmtPct(summary.pnlPct)}).

Règles :
- Réponds en français, de façon concise et concrète.
- Appuie chaque avis sur les chiffres du portefeuille ou des faits de marché que tu connais.
- Distingue toujours faits, hypothèses et opinions.
- Si on te demande d'exécuter un ordre, rappelle que tu ne peux pas et que la décision finale appartient à l'utilisateur.`;
}

/** Extract the trailing ```json {recommendations: []}``` block from a model response. */
export function extractRecommendations(text: string): AiRecommendation[] | null {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  for (const m of matches.reverse()) {
    try {
      const parsed = JSON.parse(m[1]) as { recommendations?: AiRecommendation[] };
      if (Array.isArray(parsed.recommendations)) {
        return parsed.recommendations
          .filter((r) => r && typeof r.ticker === "string")
          .map((r) => ({
            ticker: r.ticker.toUpperCase(),
            action: r.action,
            conviction: Math.min(5, Math.max(1, Number(r.conviction) || 3)) as 1 | 2 | 3 | 4 | 5,
            reason: String(r.reason ?? ""),
            priceAtSuggestion: r.priceAtSuggestion ?? null,
          }));
      }
    } catch {
      // try the previous block
    }
  }
  return null;
}

/** Strip the JSON block before displaying the analysis text. */
export function stripJsonBlock(text: string): string {
  return text.replace(/```json\s*[\s\S]*?```\s*$/m, "").trim();
}
