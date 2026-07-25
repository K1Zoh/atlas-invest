"use client";

import { CalendarClock, Landmark, PiggyBank, Scale, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { PeaProjection } from "@/components/pea-projection";
import { usePortfolio } from "@/components/portfolio-context";
import { useRefresh, useToast } from "@/components/providers";
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, Field, Input, PctBadge, Skeleton } from "@/components/ui";
import { fmtDate, fmtEur, fmtQty, todayIso } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { PositionView, Transaction } from "@/lib/types";
import { postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const PEA_CEILING = 150_000;

interface SettingsPayload {
  settings: Record<string, { value: string }>;
}

export default function PeaPage() {
  const { t } = useI18n();
  const { data, loading } = usePortfolio();
  const { refresh } = useRefresh();
  const { toast } = useToast();

  const txApi = useApi<{ transactions: Transaction[] }>("/api/transactions?class=stock");
  const settingsApi = useApi<SettingsPayload>("/api/settings");

  const [managing, setManaging] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);

  const views = data?.views ?? [];
  const peaViews = views.filter((v) => v.account === "pea");
  const stockViews = views.filter((v) => v.assetClass === "stock");

  const totals = useMemo(() => {
    const invested = peaViews.reduce((s, v) => s + v.invested, 0);
    const value = peaViews.reduce((s, v) => s + (v.value ?? 0), 0);
    const pnl = value - invested;
    const wealth = data?.summary.totalValue ?? 0;
    return {
      invested,
      value,
      pnl,
      pnlPct: invested > 0 ? (pnl / invested) * 100 : null,
      weightPct: wealth > 0 ? (value / wealth) * 100 : null,
    };
  }, [peaViews, data]);

  // Deposits ~ sum of PEA purchases (fees included). Sales proceeds stay inside
  // the plan, so they don't reduce the legal deposit counter.
  const estimatedDeposits = useMemo(() => {
    const txs = txApi.data?.transactions ?? [];
    return txs
      .filter((tx) => tx.account === "pea" && tx.side === "buy")
      .reduce((s, tx) => s + tx.quantity * tx.price + tx.fees, 0);
  }, [txApi.data]);

  const openedAt = settingsApi.data?.settings["pea.opened_at"]?.value || "";
  const depositsOverride = parseFloat(settingsApi.data?.settings["pea.deposits"]?.value || "");
  const deposits = Number.isFinite(depositsOverride) && depositsOverride > 0 ? depositsOverride : estimatedDeposits;
  const ceilingPct = Math.min(100, (deposits / PEA_CEILING) * 100);

  const maturity = useMemo(() => {
    if (!openedAt) return null;
    const opened = new Date(openedAt);
    if (Number.isNaN(opened.getTime())) return null;
    const matureDate = new Date(opened);
    matureDate.setFullYear(matureDate.getFullYear() + 5);
    return { date: matureDate.toISOString().slice(0, 10), mature: matureDate <= new Date() };
  }, [openedAt]);

  const initialLoading = loading && !data;

  return (
    <div className="flex flex-col gap-5">
      <div className="fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("pea.title")}</h1>
          <p className="text-sm text-muted">{t("pea.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditingSettings(true)}>
            <Settings2 className="h-4 w-4" /> {t("pea.openedAt")}
          </Button>
          <Button onClick={() => setManaging(true)}>
            <PiggyBank className="h-4 w-4" /> {t("pea.manage")}
          </Button>
        </div>
      </div>

      {initialLoading ? (
        <Skeleton className="h-64" />
      ) : !peaViews.length ? (
        <EmptyState
          icon={<PiggyBank className="h-9 w-9" />}
          title={t("pea.noPositions")}
          body={t("pea.eligibility")}
        />
      ) : (
        <>
          {/* KPI band */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={t("pea.value")} value={fmtEur(totals.value)} />
            <Kpi label={t("pea.invested")} value={fmtEur(totals.invested)} />
            <Kpi label={t("pea.pnl")} value={fmtEur(totals.pnl)} badge={totals.pnlPct} negative={totals.pnl < 0} />
            <Kpi
              label={t("pea.weight")}
              value={totals.weightPct !== null ? `${totals.weightPct.toFixed(1)} %` : "—"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Deposit ceiling */}
            <Card className="fade-up">
              <CardHeader title={t("pea.ceiling")} subtitle={t("pea.ceilingHint")} />
              <div className="px-5 pb-5 pt-3">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted">{t("pea.deposits")}</span>
                  <span className="tnum font-semibold">
                    {fmtEur(deposits)}{" "}
                    <span className="text-xs font-normal text-muted">/ {fmtEur(PEA_CEILING)}</span>
                  </span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      ceilingPct > 90 ? "bg-warning" : "bg-accent",
                    )}
                    style={{ width: `${ceilingPct}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted">
                  <span>{t("pea.depositsEstimate")}</span>
                  <span className="tnum shrink-0 font-medium text-foreground">
                    {t("pea.remaining")} : {fmtEur(Math.max(0, PEA_CEILING - deposits))}
                  </span>
                </div>
              </div>
            </Card>

            {/* 5-year milestone */}
            <Card className="fade-up">
              <CardHeader title={t("pea.maturity")} />
              <div className="flex items-start gap-3 px-5 pb-5 pt-3 text-sm leading-relaxed">
                <CalendarClock
                  className={cn("mt-0.5 h-5 w-5 shrink-0", maturity?.mature ? "text-accent" : "text-warning")}
                />
                {!maturity ? (
                  <p className="text-muted">{t("pea.setOpenedAt")}</p>
                ) : maturity.mature ? (
                  <p>{t("pea.matureSince", { date: fmtDate(maturity.date) })}</p>
                ) : (
                  <p>{t("pea.matureOn", { date: fmtDate(maturity.date) })}</p>
                )}
              </div>
            </Card>
          </div>

          {/* Tax card */}
          <Card className="fade-up">
            <CardHeader title={t("pea.tax.title")} />
            <div className="grid gap-4 px-5 pt-3 lg:grid-cols-[1fr_260px]">
              <ul className="flex flex-col gap-2 text-sm leading-relaxed text-muted">
                {[t("pea.tax.line1"), t("pea.tax.line2"), t("pea.tax.line3")].map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Scale className="mt-1 h-3.5 w-3.5 shrink-0 text-accent-2" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              {totals.pnl > 0 ? (
                <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2/40 p-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">{t("pea.tax.socialOnly")}</span>
                    <span className="tnum font-semibold">{fmtEur(totals.pnl * 0.172)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">{t("pea.tax.savedVsCto")}</span>
                    <span className="tnum font-semibold text-accent">{fmtEur(totals.pnl * 0.128)}</span>
                  </div>
                </div>
              ) : null}
            </div>
            <p className="px-5 pb-5 pt-4 text-[11px] leading-relaxed text-muted/70">{t("pea.eligibility")}</p>
          </Card>

          {/* PEA positions */}
          <Card className="fade-up overflow-x-auto">
            <CardHeader title={t("pea.positions")} />
            <table className="mt-3 w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-5 py-3 font-medium">{t("pf.asset")}</th>
                  <th className="px-3 py-3 text-right font-medium">{t("common.quantity")}</th>
                  <th className="px-3 py-3 text-right font-medium">{t("pf.avgCost")}</th>
                  <th className="px-3 py-3 text-right font-medium">{t("pf.currentPrice")}</th>
                  <th className="px-3 py-3 text-right font-medium">{t("common.value")}</th>
                  <th className="px-3 py-3 pr-5 text-right font-medium">{t("pf.perf")}</th>
                </tr>
              </thead>
              <tbody>
                {peaViews.map((v) => (
                  <tr key={v.ticker} className="border-b border-border/50 last:border-0">
                    <td className="px-5 py-3">
                      <p className="font-mono text-xs font-bold">{v.ticker}</p>
                      <p className="max-w-52 truncate text-xs text-muted">{v.name}</p>
                    </td>
                    <td className="tnum px-3 py-3 text-right text-xs">{fmtQty(v.quantity)}</td>
                    <td className="tnum px-3 py-3 text-right text-xs text-muted">{fmtEur(v.avgCost)}</td>
                    <td className="tnum px-3 py-3 text-right">{v.price !== null ? fmtEur(v.price) : "—"}</td>
                    <td className="tnum px-3 py-3 text-right font-semibold">{fmtEur(v.value)}</td>
                    <td className="px-3 py-3 pr-5 text-right">
                      <PctBadge value={v.pnlPct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <PeaProjection />

      <ManagePeaDialog
        open={managing}
        onClose={() => setManaging(false)}
        stockViews={stockViews}
        onChanged={() => {
          refresh();
          txApi.reload();
        }}
      />

      <PeaSettingsDialog
        open={editingSettings}
        onClose={() => setEditingSettings(false)}
        openedAt={openedAt}
        depositsValue={settingsApi.data?.settings["pea.deposits"]?.value ?? ""}
        onSaved={() => {
          settingsApi.reload();
          toast(t("pea.saved"));
        }}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  badge,
  negative,
}: {
  label: string;
  value: string;
  badge?: number | null;
  negative?: boolean;
}) {
  return (
    <Card className="fade-up p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn("tnum text-lg font-bold", negative && "text-danger")}>{value}</span>
        {badge !== undefined ? <PctBadge value={badge ?? null} /> : null}
      </div>
    </Card>
  );
}

/** Tick which stock positions live inside the PEA (whole-position tagging). */
function ManagePeaDialog({
  open,
  onClose,
  stockViews,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  stockViews: PositionView[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (v: PositionView) => {
    setBusy(v.ticker);
    try {
      await postJson(
        "/api/positions",
        { ticker: v.ticker, account: v.account === "pea" ? null : "pea" },
        "PATCH",
      );
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("pea.manage")}>
      <p className="text-xs leading-relaxed text-muted">{t("pea.manageHint")}</p>
      <div className="mt-3 flex max-h-80 flex-col gap-1 overflow-y-auto">
        {stockViews.length ? (
          stockViews.map((v) => (
            <label
              key={v.ticker}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2 transition-colors hover:border-accent/35"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={v.account === "pea"}
                  disabled={busy === v.ticker}
                  onChange={() => toggle(v)}
                  className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block font-mono text-xs font-bold">{v.ticker}</span>
                  <span className="block max-w-56 truncate text-xs text-muted">{v.name}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tnum text-xs text-muted">{fmtEur(v.value)}</span>
                {v.account === "pea" ? <Badge tone="accent">{t("common.pea")}</Badge> : null}
              </span>
            </label>
          ))
        ) : (
          <p className="py-6 text-center text-sm text-muted">{t("common.empty")}</p>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>{t("common.close")}</Button>
      </div>
    </Dialog>
  );
}

/** Opening date + optional real-deposit override, stored in settings. */
function PeaSettingsDialog({
  open,
  onClose,
  openedAt,
  depositsValue,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  openedAt: string;
  depositsValue: string;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [date, setDate] = useState(openedAt);
  const [deposits, setDeposits] = useState(depositsValue);
  const [saving, setSaving] = useState(false);

  // Keep local fields in sync when the dialog opens with fresh data.
  const [seen, setSeen] = useState(false);
  if (open && !seen) {
    setSeen(true);
    setDate(openedAt);
    setDeposits(depositsValue);
  } else if (!open && seen) {
    setSeen(false);
  }

  const save = async () => {
    setSaving(true);
    try {
      await postJson("/api/settings", {
        updates: {
          "pea.opened_at": date,
          "pea.deposits": deposits.replace(",", "."),
        },
      });
      onSaved();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("pea.openedAt")}>
      <div className="flex flex-col gap-3">
        <Field label={t("pea.openedAt")}>
          <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("pea.depositsOverride")}>
          <Input
            inputMode="decimal"
            value={deposits}
            onChange={(e) => setDeposits(e.target.value)}
            placeholder="12000"
          />
        </Field>
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
          <Landmark className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("pea.depositsEstimate")}
        </p>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} loading={saving}>
          {t("common.save")}
        </Button>
      </div>
    </Dialog>
  );
}
