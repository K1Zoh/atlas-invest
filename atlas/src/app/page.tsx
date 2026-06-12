"use client";

import { AlertTriangle, Database, Plus, ShieldCheck, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { Donut, MarketHeatmap, TimelineChart } from "@/components/charts";
import { usePortfolio } from "@/components/portfolio-context";
import { useRefresh, useToast } from "@/components/providers";
import { openQuickAdd } from "@/components/quick-add";
import { RebalanceCard } from "@/components/rebalance-card";
import { TickerTape } from "@/components/ticker-tape";
import { Button, Card, CardHeader, EmptyState, PctBadge, Segmented, Skeleton } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

type Period = "30" | "90" | "365" | "1825";
type AllocMode = "byClass" | "byCategory" | "byAsset";

interface TimelinePoint {
  date: string;
  value: number;
  invested: number;
  benchmark?: number;
}

export default function DashboardPage() {
  const { t } = useI18n();
  const { data, loading, error } = usePortfolio();
  const { refresh } = useRefresh();
  const { toast } = useToast();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("365");
  const [allocMode, setAllocMode] = useState<AllocMode>("byClass");
  const [benchmark, setBenchmark] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const timeline = useApi<{ points: TimelinePoint[] }>(
    data?.views.length ? `/api/timeline?days=${period}${benchmark ? "&benchmark=1" : ""}` : null,
  );
  const legacy = useApi<{ available: boolean }>(
    !loading && data && !data.views.length ? "/api/import/legacy" : null,
  );

  // P/L drift over 7 and 30 days, deposit-neutral: Δ(value - invested).
  const pnlDrift = useMemo(() => {
    const points = timeline.data?.points ?? [];
    if (points.length < 2) return { d7: null as number | null, d30: null as number | null };
    const last = points[points.length - 1];
    const pnlNow = last.value - last.invested;
    const today = last.date ? new Date(`${last.date}T00:00:00.000Z`).getTime() : 0;
    const at = (daysAgo: number): number | null => {
      const cutoff = new Date(today - daysAgo * 86_400_000).toISOString().slice(0, 10);
      const p = points.find((x) => x.date >= cutoff);
      if (!p || p === last) return null;
      return pnlNow - (p.value - p.invested);
    };
    return { d7: at(7), d30: at(30) };
  }, [timeline.data]);

  const heatTiles = useMemo(
    () =>
      (data?.views ?? [])
        .filter((v) => v.value !== null)
        .map((v) => ({
          name: v.ticker,
          size: v.value ?? 0,
          change: v.dayChangePct,
          assetClass: v.assetClass,
        })),
    [data],
  );

  const migrate = async () => {
    setMigrating(true);
    try {
      const report = await postJson<{ transactions: number }>("/api/import/legacy");
      toast(`${t("dash.migrated")} : ${report.transactions} transactions`);
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setMigrating(false);
    }
  };

  if (error) {
    return (
      <EmptyState title={t("common.error")} body={error}>
        <Button onClick={() => refresh()}>{t("common.retry")}</Button>
      </EmptyState>
    );
  }

  if (!loading && data && !data.views.length) {
    return (
      <EmptyState
        icon={<Wallet className="h-10 w-10" />}
        title={t("dash.empty.title")}
        body={t("dash.empty.body")}
      >
        <Button onClick={() => openQuickAdd()}>
          <Plus className="h-4 w-4" /> {t("dash.empty.add")}
        </Button>
        {legacy.data?.available ? (
          <Button variant="outline" onClick={migrate} loading={migrating}>
            <Database className="h-4 w-4" /> {t("dash.empty.migrate")}
          </Button>
        ) : null}
      </EmptyState>
    );
  }

  const s = data?.summary;
  const isLoading = loading && !data;

  return (
    <div className="flex flex-col gap-5">
      <div className="fade-up">
        <h1 className="text-xl font-bold tracking-tight">{t("dash.title")}</h1>
        <p className="text-sm text-muted">{t("dash.subtitle")}</p>
      </div>

      <TickerTape />

      {/* Wealth band: one structured panel instead of cloned KPI cards */}
      <Card className="fade-up px-6 py-5" hover>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-52" />
            <Skeleton className="h-5 w-80" />
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted">{t("dash.totalValue")}</p>
              <div className="mt-1 flex items-baseline gap-3">
                <AnimatedNumber
                  value={s?.totalValue ?? 0}
                  format={fmtEur}
                  className="text-3xl font-bold leading-none"
                />
                <PctBadge value={s?.dayChangePct ?? null} />
              </div>
              <p className="tnum mt-1.5 text-xs text-muted">
                {t("dash.day")} :{" "}
                <span className={cn("font-medium", (s?.dayChangeEur ?? 0) >= 0 ? "text-accent" : "text-danger")}>
                  {fmtEur(s?.dayChangeEur ?? 0)}
                </span>
              </p>
            </div>

            <div className="hidden h-12 w-px bg-border sm:block" aria-hidden />

            <InlineStat label={t("dash.invested")} value={fmtEur(s?.totalInvested ?? 0)} />
            <InlineStat
              label={t("dash.pnl")}
              value={fmtEur(s?.pnl ?? 0)}
              tone={(s?.pnl ?? 0) >= 0 ? "up" : "down"}
              extra={<PctBadge value={s?.pnlPct ?? null} />}
            />
            <InlineStat
              label={t("dash.realized")}
              value={fmtEur(s?.realizedPnl ?? 0)}
              tone={(s?.realizedPnl ?? 0) >= 0 ? "up" : "down"}
            />
            <InlineStat label={t("dash.positions")} value={String(s?.positionsCount ?? 0)} />
          </div>
        )}
      </Card>

      {/* Evolution + allocation */}
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card className="fade-up pb-3" hover>
          <CardHeader
            title={t("dash.evolution")}
            subtitle={
              <span className="flex flex-wrap items-center gap-2">
                <DriftChip label={t("dash.pnl7")} value={pnlDrift.d7} />
                <DriftChip label={t("dash.pnl30")} value={pnlDrift.d30} />
              </span>
            }
            action={
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBenchmark((b) => !b)}
                  title={t("dash.benchmark.hint")}
                  className={cn(
                    "cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors duration-200",
                    benchmark
                      ? "border-accent-2/50 bg-accent-2/10 text-accent-2"
                      : "border-border text-muted hover:text-foreground",
                  )}
                >
                  {t("dash.benchmark")}
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
            {timeline.loading ? (
              <Skeleton className="mx-3 h-[260px]" />
            ) : (
              <TimelineChart
                points={timeline.data?.points ?? []}
                valueLabel={t("dash.value.line")}
                investedLabel={t("dash.invested.line")}
                benchmarkLabel={t("dash.benchmark")}
              />
            )}
          </div>
        </Card>

        <Card className="fade-up pb-4" hover>
          <CardHeader
            title={t("dash.allocation")}
            action={
              <Segmented<AllocMode>
                options={[
                  { value: "byClass", label: t("dash.byClass") },
                  { value: "byCategory", label: t("dash.byCategory") },
                  { value: "byAsset", label: t("dash.byAsset") },
                ]}
                value={allocMode}
                onChange={setAllocMode}
              />
            }
          />
          <div className="px-5 pt-3">
            {isLoading ? (
              <Skeleton className="h-[220px]" />
            ) : (
              <Donut
                slices={data?.allocations[allocMode] ?? []}
                centerTitle={fmtEur(s?.totalValue ?? 0)}
                centerSubtitle={`${s?.positionsCount ?? 0} ${t("dash.positions")}`}
              />
            )}
          </div>
        </Card>
      </div>

      {/* Market map + vigilance */}
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card className="fade-up pb-3" hover>
          <CardHeader title={t("dash.heatmap")} subtitle={t("dash.heatmap.hint")} />
          <div className="px-3 pt-3">
            {isLoading ? (
              <Skeleton className="mx-2 h-[270px]" />
            ) : (
              <MarketHeatmap
                tiles={heatTiles}
                onOpen={(name) => {
                  const v = data?.views.find((x) => x.ticker === name);
                  if (v) router.push(`/actif/${encodeURIComponent(v.ticker)}?class=${v.assetClass}`);
                }}
              />
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <RebalanceCard />
          <Card className="fade-up pb-4">
            <CardHeader title={t("dash.concentration")} />
            <div className="flex flex-col gap-2 px-5 pt-3">
              {isLoading ? (
                <>
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </>
              ) : data?.concentration.length ? (
                data.concentration.map((a, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-relaxed",
                      a.level === "danger"
                        ? "border-danger/30 bg-danger-soft text-danger"
                        : "border-warning/30 bg-warning-soft text-warning",
                    )}
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {a.message}
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl border border-accent/25 bg-accent-soft px-3 py-2.5 text-xs text-accent">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  {t("dash.noAlerts")}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InlineStat({
  label,
  value,
  tone,
  extra,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
  extra?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={cn(
            "tnum text-lg font-semibold leading-none",
            tone === "up" && "text-accent",
            tone === "down" && "text-danger",
          )}
        >
          {value}
        </span>
        {extra}
      </div>
    </div>
  );
}

function DriftChip({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        up ? "bg-accent-soft text-accent" : "bg-danger-soft text-danger",
      )}
    >
      {label} {up ? "+" : ""}
      {fmtEur(value)}
    </span>
  );
}
