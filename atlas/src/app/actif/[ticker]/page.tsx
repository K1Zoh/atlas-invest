"use client";

import {
  ArrowLeft,
  Bell,
  Bitcoin,
  CandlestickChart,
  Plus,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AlertDialog } from "@/components/alert-dialog";
import { PriceChart, type PricePoint } from "@/components/charts";
import { Markdown } from "@/components/markdown";
import { usePortfolio } from "@/components/portfolio-context";
import { useRefresh, useToast } from "@/components/providers";
import { openQuickAdd } from "@/components/quick-add";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  PctBadge,
  Segmented,
  Skeleton,
} from "@/components/ui";
import { fmtDate, fmtEur, fmtQty } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { AiAnalysis, AssetClass, HistoryPoint, Transaction } from "@/lib/types";
import { postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

type Period = "30" | "90" | "365" | "1825";

export default function AssetPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <AssetPageInner />
    </Suspense>
  );
}

function AssetPageInner() {
  const params = useParams<{ ticker: string }>();
  const search = useSearchParams();
  const ticker = decodeURIComponent(params.ticker).toUpperCase();
  const assetClass = (search.get("class") === "crypto" ? "crypto" : "stock") as AssetClass;

  const { t } = useI18n();
  const { data } = usePortfolio();
  const { toast } = useToast();
  const { refresh } = useRefresh();
  const [period, setPeriod] = useState<Period>("365");
  const [showMa, setShowMa] = useState(true);
  const [alertOpen, setAlertOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ model: string; content: string } | null>(null);

  const view = data?.views.find((v) => v.ticker === ticker && v.assetClass === assetClass);
  const coingeckoId = view?.coingeckoId;

  const histParams = new URLSearchParams({ ticker, class: assetClass, days: period });
  if (coingeckoId) histParams.set("cgId", coingeckoId);
  const histUrl = `/api/history?${histParams}`;

  const history = useApi<{ points: HistoryPoint[] }>(histUrl);
  const txs = useApi<{ transactions: Transaction[] }>(
    `/api/transactions?ticker=${encodeURIComponent(ticker)}&class=${assetClass}`,
  );
  const pastAnalyses = useApi<{ analyses: AiAnalysis[] }>(
    `/api/ai/history?scope=asset&ticker=${encodeURIComponent(ticker)}`,
  );

  const journalEntries = useMemo(
    () =>
      (txs.data?.transactions ?? []).filter(
        (tx) => tx.note && !tx.note.startsWith("Import") && !tx.note.startsWith("Importé"),
      ),
    [txs.data],
  );

  const { points, rsi, range } = useMemo(() => {
    const raw = history.data?.points ?? [];
    const out: PricePoint[] = raw.map((p, i) => ({
      ...p,
      ma20: avg(raw, i, 20),
      ma50: avg(raw, i, 50),
    }));
    let high: number | null = null;
    let low: number | null = null;
    for (const p of raw) {
      if (high === null || p.value > high) high = p.value;
      if (low === null || p.value < low) low = p.value;
    }
    const last = raw.at(-1)?.value ?? null;
    const fromHigh = high && last ? ((last - high) / high) * 100 : null;
    return { points: out, rsi: computeRsi(raw.map((p) => p.value)), range: { high, low, fromHigh } };
  }, [history.data]);

  const runAi = async () => {
    setAiLoading(true);
    try {
      const res = await postJson<{ model: string; content: string }>("/api/ai/asset", {
        ticker,
        assetClass,
        coingeckoId,
      });
      setAiResult(res);
      pastAnalyses.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setAiLoading(false);
    }
  };

  const rsiTone = rsi === null ? null : rsi > 70 ? t("asset.overbought") : rsi < 30 ? t("asset.oversold") : t("asset.neutral");

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/portefeuille"
        className="fade-up inline-flex w-fit items-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t("pf.title")}
      </Link>

      {/* Header */}
      <div className="fade-up flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-2xl",
              assetClass === "crypto" ? "bg-warning-soft text-warning" : "bg-accent-2/10 text-accent-2",
            )}
          >
            {assetClass === "crypto" ? <Bitcoin className="h-6 w-6" /> : <CandlestickChart className="h-6 w-6" />}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-xl font-bold">{ticker}</h1>
              <Badge tone={assetClass === "crypto" ? "warning" : "cyan"}>
                {assetClass === "crypto" ? t("common.crypto") : t("common.stocks")}
              </Badge>
            </div>
            <p className="text-sm text-muted">{view?.name ?? ticker}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="tnum text-2xl font-bold">{fmtEur(view?.price ?? points.at(-1)?.value ?? null)}</p>
            <PctBadge value={view?.dayChangePct ?? null} />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                openQuickAdd({
                  ticker,
                  name: view?.name ?? ticker,
                  assetClass,
                  exchange: null,
                  coingeckoId: view?.coingeckoId ?? null,
                })
              }
            >
              <Plus className="h-4 w-4" /> {t("common.add")}
            </Button>
            <Button variant="outline" onClick={() => setAlertOpen(true)}>
              <Bell className="h-4 w-4" /> {t("asset.addAlert")}
            </Button>
          </div>
        </div>
      </div>

      {/* Position summary */}
      {view ? (
        <Card className="fade-up grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-5">
          <Mini label={t("common.quantity")} value={fmtQty(view.quantity)} />
          <Mini label={t("pf.avgCost")} value={fmtEur(view.avgCost)} />
          <Mini label={t("common.invested")} value={fmtEur(view.invested)} />
          <Mini label={t("common.value")} value={fmtEur(view.value)} />
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("pf.perf")}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={cn("tnum font-semibold", (view.pnl ?? 0) >= 0 ? "text-accent" : "text-danger")}>
                {fmtEur(view.pnl)}
              </span>
              <PctBadge value={view.pnlPct} />
            </div>
          </div>
        </Card>
      ) : null}

      {/* Chart */}
      <Card className="fade-up pb-3" hover>
        <CardHeader
          title={t("asset.history")}
          subtitle={
            range.high !== null ? (
              <span className="tnum flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  {t("asset.high")} : <span className="font-medium text-foreground">{fmtEur(range.high)}</span>
                </span>
                <span>
                  {t("asset.low")} : <span className="font-medium text-foreground">{fmtEur(range.low)}</span>
                </span>
                {range.fromHigh !== null ? (
                  <span>
                    {t("asset.fromHigh")} :{" "}
                    <span className={cn("font-medium", range.fromHigh >= -1 ? "text-accent" : "text-danger")}>
                      {range.fromHigh.toFixed(1)} %
                    </span>
                  </span>
                ) : null}
              </span>
            ) : undefined
          }
          action={
            <div className="flex items-center gap-2">
              {rsi !== null ? (
                <Badge tone={rsi > 70 ? "danger" : rsi < 30 ? "accent" : "neutral"}>
                  {t("asset.rsi")} {rsi.toFixed(0)} · {rsiTone}
                </Badge>
              ) : null}
              <button
                onClick={() => setShowMa((s) => !s)}
                className={cn(
                  "cursor-pointer rounded-lg border px-2 py-1 text-[11px] transition-colors",
                  showMa ? "border-accent/40 text-accent" : "border-border text-muted",
                )}
              >
                {t("asset.ma20")}/{t("asset.ma50")}
              </button>
              <Segmented<Period>
                options={[
                  { value: "30", label: "1M" },
                  { value: "90", label: "3M" },
                  { value: "365", label: "1A" },
                  { value: "1825", label: "Max" },
                ]}
                value={period}
                onChange={setPeriod}
              />
            </div>
          }
        />
        <div className="px-2 pt-3">
          {history.loading ? (
            <Skeleton className="mx-3 h-[300px]" />
          ) : history.error ? (
            <p className="py-12 text-center text-sm text-danger">{history.error}</p>
          ) : (
            <PriceChart points={points} showMa={showMa} />
          )}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        {/* AI analysis */}
        <Card className="fade-up pb-4" hover>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" /> {t("asset.aiAnalysis")}
              </span>
            }
            action={
              <Button onClick={runAi} loading={aiLoading} className="px-3 py-1.5 text-xs">
                {aiLoading ? t("asset.aiRunning") : t("asset.runAi")}
              </Button>
            }
          />
          <div className="px-5 pt-3">
            {aiResult ? (
              <div className="fade-up">
                <Badge tone="cyan" className="mb-2">{aiResult.model}</Badge>
                <Markdown>{aiResult.content}</Markdown>
              </div>
            ) : pastAnalyses.data?.analyses.length ? (
              <div>
                <p className="mb-2 text-[11px] text-muted">
                  {fmtDate(pastAnalyses.data.analyses[0].createdAt)} · {pastAnalyses.data.analyses[0].model}
                </p>
                <Markdown>{pastAnalyses.data.analyses[0].content}</Markdown>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted">{t("ai.disclaimer")}</p>
            )}
          </div>
        </Card>

        {/* Journal + transactions for this asset */}
        <div className="flex h-fit flex-col gap-5">
        <Card className="fade-up pb-2">
          <CardHeader title={t("asset.journal")} />
          <div className="mt-2 px-5 pb-3">
            {journalEntries.length ? (
              <ul className="flex flex-col gap-2.5">
                {journalEntries.map((tx) => (
                  <li key={tx.id} className="rounded-xl bg-surface-2/60 px-3.5 py-2.5">
                    <p className="mb-1 flex items-center gap-2 text-[11px] text-muted">
                      <Badge tone={tx.side === "buy" ? "accent" : "danger"}>
                        {tx.side === "buy" ? t("common.buy") : t("common.sell")}
                      </Badge>
                      {fmtDate(tx.txDate)} · {fmtQty(tx.quantity)} × {fmtEur(tx.price)}
                    </p>
                    <p className="text-sm leading-relaxed">{tx.note}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm leading-relaxed text-muted">{t("asset.journal.empty")}</p>
            )}
          </div>
        </Card>

        <Card className="fade-up pb-2">
          <CardHeader title={t("asset.txs")} />
          <div className="mt-2 max-h-96 overflow-y-auto">
            {txs.data?.transactions.length ? (
              txs.data.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between border-b border-border/50 px-5 py-2.5 text-sm last:border-0"
                >
                  <div className="flex items-center gap-2.5">
                    <Badge tone={tx.side === "buy" ? "accent" : "danger"}>
                      {tx.side === "buy" ? t("common.buy") : t("common.sell")}
                    </Badge>
                    <span className="text-xs text-muted">{fmtDate(tx.txDate)}</span>
                  </div>
                  <div className="tnum text-right text-xs">
                    <span className="font-medium">{fmtQty(tx.quantity)}</span>
                    <span className="text-muted"> × {fmtEur(tx.price)}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="px-5 py-6 text-center text-sm text-muted">{t("common.empty")}</p>
            )}
          </div>
        </Card>
        </div>
      </div>

      <AlertDialog
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        ticker={ticker}
        assetClass={assetClass}
        coingeckoId={view?.coingeckoId ?? null}
        currentPrice={view?.price ?? points.at(-1)?.value ?? null}
        onSaved={() => {
          setAlertOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p className="tnum mt-1 font-semibold">{value}</p>
    </div>
  );
}

function avg(points: HistoryPoint[], idx: number, window: number): number | null {
  if (idx + 1 < window) return null;
  let sum = 0;
  for (let i = idx - window + 1; i <= idx; i++) sum += points[i].value;
  return sum / window;
}

function computeRsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}
