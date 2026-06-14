"use client";

import { AlertTriangle, ArrowUpDown, Bitcoin, CandlestickChart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Sparkline } from "@/components/charts";
import { usePortfolio } from "@/components/portfolio-context";
import { Card, EmptyState, PctBadge, Segmented, Skeleton } from "@/components/ui";
import { fmtEur, fmtQty } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { PositionView } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | "stock" | "crypto";
type SortKey = "value" | "pnlPct" | "dayChangePct" | "weightPct";

export default function PortfolioPage() {
  const { t } = useI18n();
  const { data, loading } = usePortfolio();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDesc, setSortDesc] = useState(true);

  const rows = useMemo(() => {
    let views = data?.views ?? [];
    if (filter !== "all") views = views.filter((v) => v.assetClass === filter);
    return [...views].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return sortDesc ? bv - av : av - bv;
    });
  }, [data, filter, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const totals = useMemo(() => {
    const invested = rows.reduce((s, v) => s + v.invested, 0);
    const value = rows.reduce((s, v) => s + (v.value ?? 0), 0);
    const pnl = value - invested;
    return { invested, value, pnl, pnlPct: invested > 0 ? (pnl / invested) * 100 : null };
  }, [rows]);

  return (
    <div className="flex flex-col gap-5">
      <div className="fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("pf.title")}</h1>
          <p className="text-sm text-muted">{t("pf.subtitle")}</p>
        </div>
        <Segmented<Filter>
          options={[
            { value: "all", label: t("common.all") },
            { value: "stock", label: t("common.stocks") },
            { value: "crypto", label: t("common.crypto") },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {loading && !data ? (
        <Card className="p-5">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </Card>
      ) : !rows.length ? (
        <EmptyState title={t("pf.empty")} />
      ) : (
        <>
        {/* Mobile: stacked cards (the wide table is unreadable on a phone). */}
        <div className="flex flex-col gap-2 lg:hidden">
          {rows.map((v, i) => (
            <PositionCard
              key={`${v.assetClass}:${v.ticker}`}
              v={v}
              index={i}
              onOpen={() => router.push(`/actif/${encodeURIComponent(v.ticker)}?class=${v.assetClass}`)}
            />
          ))}
          <div className="mt-1 flex items-center justify-between rounded-xl border border-border bg-surface-2/40 px-4 py-2.5 text-xs font-semibold">
            <span>{t("common.total")}</span>
            <span className="flex items-center gap-2">
              <span className="tnum">{fmtEur(totals.value)}</span>
              <PctBadge value={totals.pnlPct} />
            </span>
          </div>
        </div>

        {/* Desktop: full sortable table. */}
        <Card className="fade-up hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-5 py-3 font-medium">{t("pf.asset")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("common.quantity")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("pf.avgCost")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("pf.currentPrice")}</th>
                <th className="px-3 py-3 text-center font-medium">{t("pf.day7")}</th>
                <SortableTh label={t("common.value")} onClick={() => toggleSort("value")} active={sortKey === "value"} />
                <SortableTh label={t("pf.perf")} onClick={() => toggleSort("pnlPct")} active={sortKey === "pnlPct"} />
                <SortableTh label={t("dash.day")} onClick={() => toggleSort("dayChangePct")} active={sortKey === "dayChangePct"} />
                <SortableTh label={t("pf.weight")} onClick={() => toggleSort("weightPct")} active={sortKey === "weightPct"} />
              </tr>
            </thead>
            <tbody>
              {rows.map((v, i) => (
                <Row key={`${v.assetClass}:${v.ticker}`} v={v} index={i} onOpen={() =>
                  router.push(`/actif/${encodeURIComponent(v.ticker)}?class=${v.assetClass}`)
                } />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface-2/40 text-xs font-semibold">
                <td className="px-5 py-3">{t("common.total")}</td>
                <td colSpan={2} className="tnum px-3 py-3 text-right text-muted">
                  {t("common.invested")} : {fmtEur(totals.invested)}
                </td>
                <td colSpan={2} />
                <td className="tnum px-3 py-3 text-right">{fmtEur(totals.value)}</td>
                <td className="px-3 py-3 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <PctBadge value={totals.pnlPct} />
                    <span className={cn("tnum text-[11px]", totals.pnl >= 0 ? "text-accent" : "text-danger")}>
                      {fmtEur(totals.pnl)}
                    </span>
                  </div>
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </Card>
        </>
      )}
    </div>
  );
}

function PositionCard({ v, index, onOpen }: { v: PositionView; index: number; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="fade-up flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-surface/80 px-4 py-3 text-left transition-colors hover:border-accent/35"
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            v.assetClass === "crypto" ? "bg-warning-soft text-warning" : "bg-accent-2/10 text-accent-2",
          )}
        >
          {v.assetClass === "crypto" ? <Bitcoin className="h-4 w-4" /> : <CandlestickChart className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold">{v.ticker}</p>
          <p className="tnum text-xs text-muted">
            {fmtQty(v.quantity)} · {fmtEur(v.price)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="tnum text-sm font-semibold">{fmtEur(v.value)}</span>
        <PctBadge value={v.pnlPct} />
      </div>
    </button>
  );
}

function SortableTh({
  label,
  onClick,
  active,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <th className="px-3 py-3 text-right font-medium">
      <button
        onClick={onClick}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground",
          active && "text-accent",
        )}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );
}

function Row({ v, index, onOpen }: { v: PositionView; index: number; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <tr
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="fade-up cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-surface-2/60"
      style={{ animationDelay: `${Math.min(index * 35, 400)}ms` }}
    >
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              v.assetClass === "crypto" ? "bg-warning-soft text-warning" : "bg-accent-2/10 text-accent-2",
            )}
          >
            {v.assetClass === "crypto" ? <Bitcoin className="h-4 w-4" /> : <CandlestickChart className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="font-mono text-xs font-bold">{v.ticker}</p>
            <p className="max-w-44 truncate text-xs text-muted">{v.name}</p>
          </div>
        </div>
      </td>
      <td className="tnum px-3 py-3 text-right text-xs">{fmtQty(v.quantity)}</td>
      <td className="tnum px-3 py-3 text-right text-xs text-muted">{fmtEur(v.avgCost)}</td>
      <td className="tnum px-3 py-3 text-right font-medium">
        {v.price === null ? (
          <span
            className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning"
            title={t("dash.priceUnavailable")}
          >
            <AlertTriangle className="h-3 w-3" /> {t("dash.priceUnavailable")}
          </span>
        ) : (
          fmtEur(v.price)
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <Sparkline data={v.spark7d} className="inline-block" />
      </td>
      <td className="tnum px-3 py-3 text-right font-semibold">{fmtEur(v.value)}</td>
      <td className="px-3 py-3 text-right">
        <div className="flex flex-col items-end gap-0.5">
          <PctBadge value={v.pnlPct} />
          <span className={cn("tnum text-[11px]", (v.pnl ?? 0) >= 0 ? "text-accent" : "text-danger")}>
            {fmtEur(v.pnl)}
          </span>
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <PctBadge value={v.dayChangePct} />
      </td>
      <td className="tnum px-3 py-3 pr-5 text-right text-xs">
        {v.weightPct !== null ? (
          <div className="flex items-center justify-end gap-2">
            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent/70"
                style={{ width: `${Math.min(100, v.weightPct)}%` }}
              />
            </div>
            {v.weightPct.toFixed(1)} %
          </div>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}
