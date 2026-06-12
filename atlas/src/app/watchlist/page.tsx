"use client";

import { Bell, BellOff, Pencil, Plus, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRefresh, useToast } from "@/components/providers";
import { openQuickAdd } from "@/components/quick-add";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  Field,
  Input,
  PctBadge,
  Skeleton,
} from "@/components/ui";
import { fmtDate, fmtEur, fmtPct } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { PriceAlert, WatchlistItem } from "@/lib/types";
import { postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

export default function WatchlistPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { refresh } = useRefresh();
  const [editing, setEditing] = useState<WatchlistItem | null>(null);

  const wl = useApi<{ items: WatchlistItem[] }>("/api/watchlist");
  const alerts = useApi<{ alerts: PriceAlert[] }>("/api/alerts");

  const removeItem = async (id: number) => {
    try {
      await postJson(`/api/watchlist/${id}`, undefined, "DELETE");
      toast(t("common.deleted"));
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const removeAlert = async (id: number) => {
    try {
      await postJson(`/api/alerts/${id}`, undefined, "DELETE");
      toast(t("common.deleted"));
      alerts.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const toggleAlert = async (a: PriceAlert) => {
    try {
      await postJson(`/api/alerts/${a.id}`, { active: !a.active }, "PATCH");
      alerts.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("wl.title")}</h1>
          <p className="text-sm text-muted">{t("wl.subtitle")}</p>
        </div>
        <Button onClick={() => openQuickAdd()}>
          <Plus className="h-4 w-4" /> {t("common.add")}
        </Button>
      </div>

      {wl.loading && !wl.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : !wl.data?.items.length ? (
        <EmptyState title={t("wl.empty")}>
          <Button onClick={() => openQuickAdd()}>
            <Plus className="h-4 w-4" /> {t("common.add")}
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {wl.data.items.map((item, i) => (
            <Card
              key={item.id}
              hover
              className="fade-up flex flex-col gap-3 p-4"
            >
              <div style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex items-start justify-between">
                  <Link
                    href={`/actif/${encodeURIComponent(item.ticker)}?class=${item.assetClass}`}
                    className="cursor-pointer"
                  >
                    <p className="font-mono text-sm font-bold transition-colors hover:text-accent">
                      {item.ticker}
                    </p>
                    <p className="max-w-44 truncate text-xs text-muted">{item.name}</p>
                  </Link>
                  <Badge tone={item.assetClass === "crypto" ? "warning" : "cyan"}>
                    {item.assetClass === "crypto" ? t("common.crypto") : t("common.stocks")}
                  </Badge>
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="tnum text-lg font-bold">{fmtEur(item.price ?? null)}</p>
                    <PctBadge value={item.change24hPct ?? null} />
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-muted">{t("wl.target")}</p>
                    <p className="tnum font-semibold">{fmtEur(item.targetPrice)}</p>
                    {item.distanceToTargetPct !== null && item.distanceToTargetPct !== undefined ? (
                      <p
                        className={cn(
                          "tnum text-[11px]",
                          item.distanceToTargetPct <= 0 ? "text-accent" : "text-muted",
                        )}
                      >
                        {fmtPct(item.distanceToTargetPct)}
                      </p>
                    ) : null}
                  </div>
                </div>

                {item.note ? (
                  <p className="mt-2 rounded-lg bg-surface-2/70 px-2.5 py-1.5 text-xs text-muted">
                    {item.note}
                  </p>
                ) : null}

                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
                  <button
                    onClick={() =>
                      openQuickAdd({
                        ticker: item.ticker,
                        name: item.name,
                        assetClass: item.assetClass,
                        exchange: null,
                        coingeckoId: item.coingeckoId,
                      })
                    }
                    className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-80"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" /> {t("wl.buyNow")}
                  </button>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditing(item)}
                      aria-label={t("common.edit")}
                      className="cursor-pointer rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => removeItem(item.id)}
                      aria-label={t("common.delete")}
                      className="cursor-pointer rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Price alerts */}
      <Card className="fade-up pb-2">
        <CardHeader title={t("al.title")} subtitle={t("al.notifyHint")} />
        <div className="mt-2">
          {alerts.data?.alerts.length ? (
            alerts.data.alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-2.5 text-sm last:border-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-mono text-xs font-bold">{a.ticker}</span>
                  <span className="truncate text-xs text-muted">
                    {t(`al.kind.${a.kind}` as never)}{" "}
                    <span className="tnum font-medium text-foreground">{fmtEur(a.threshold)}</span>
                    {a.label ? ` · ${a.label}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {a.triggeredAt ? (
                    <Badge tone="warning">
                      {t("al.triggered")} {fmtDate(a.triggeredAt)}
                    </Badge>
                  ) : a.active ? (
                    <Badge tone="accent">{t("al.active")}</Badge>
                  ) : null}
                  <button
                    onClick={() => toggleAlert(a)}
                    aria-label={a.active ? "Désactiver" : "Réactiver"}
                    className="cursor-pointer rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    {a.active ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => removeAlert(a.id)}
                    aria-label={t("common.delete")}
                    className="cursor-pointer rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="px-5 py-5 text-sm text-muted">{t("al.none")}</p>
          )}
        </div>
      </Card>

      {editing ? (
        <EditWatchDialog
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            wl.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function EditWatchDialog({
  item,
  onClose,
  onSaved,
}: {
  item: WatchlistItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [target, setTarget] = useState(item.targetPrice ? String(item.targetPrice) : "");
  const [note, setNote] = useState(item.note ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const parsed = parseFloat(target.replace(",", "."));
      await postJson(
        `/api/watchlist/${item.id}`,
        {
          targetPrice: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
          note: note || null,
        },
        "PATCH",
      );
      toast(t("common.saved"));
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`${t("common.edit")} — ${item.ticker}`}>
      <div className="flex flex-col gap-3">
        <Field label={`${t("wl.target")} (€)`}>
          <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} autoFocus />
        </Field>
        <Field label={t("common.note")}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={saving}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
