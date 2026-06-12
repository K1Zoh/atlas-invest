"use client";

import { FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRefresh, useToast } from "@/components/providers";
import { openQuickAdd } from "@/components/quick-add";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Segmented,
  Select,
  Skeleton,
} from "@/components/ui";
import { fmtDate, fmtEur, fmtQty, todayIso } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Transaction } from "@/lib/types";
import { postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

type Filter = "all" | "stock" | "crypto";

export default function TransactionsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { refresh } = useRefresh();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  const { data, loading } = useApi<{ transactions: Transaction[] }>(
    filter === "all" ? "/api/transactions" : `/api/transactions?class=${filter}`,
  );

  const totalInOut = useMemo(() => {
    let invested = 0;
    let proceeds = 0;
    for (const tx of data?.transactions ?? []) {
      if (tx.side === "buy") invested += tx.quantity * tx.price + tx.fees;
      else proceeds += tx.quantity * tx.price - tx.fees;
    }
    return { invested, proceeds };
  }, [data]);

  const remove = async () => {
    if (!deleting) return;
    try {
      await postJson(`/api/transactions/${deleting.id}`, undefined, "DELETE");
      toast(t("tx.deleteOk"));
      setDeleting(null);
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("tx.title")}</h1>
          <p className="text-sm text-muted">
            {t("tx.subtitle")} ·{" "}
            <span className="tnum">
              {t("common.invested")} {fmtEur(totalInOut.invested)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented<Filter>
            options={[
              { value: "all", label: t("common.all") },
              { value: "stock", label: t("common.stocks") },
              { value: "crypto", label: t("common.crypto") },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <Link href="/parametres#import">
            <Button variant="outline">
              <FileUp className="h-4 w-4" /> {t("tx.import")}
            </Button>
          </Link>
          <Button onClick={() => openQuickAdd()}>
            <Plus className="h-4 w-4" /> {t("tx.new")}
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <Card className="flex flex-col gap-3 p-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </Card>
      ) : !data?.transactions.length ? (
        <EmptyState title={t("tx.none")}>
          <Button onClick={() => openQuickAdd()}>
            <Plus className="h-4 w-4" /> {t("tx.new")}
          </Button>
        </EmptyState>
      ) : (
        <Card className="fade-up overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-5 py-3 font-medium">{t("common.date")}</th>
                <th className="px-3 py-3 font-medium">{t("pf.asset")}</th>
                <th className="px-3 py-3 font-medium">{t("tx.side")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("common.quantity")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("common.price")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("common.fees")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("common.total")}</th>
                <th className="px-3 py-3 font-medium">{t("common.platform")}</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((tx, i) => (
                <tr
                  key={tx.id}
                  className="fade-up border-b border-border/50 transition-colors last:border-0 hover:bg-surface-2/40"
                  style={{ animationDelay: `${Math.min(i * 25, 350)}ms` }}
                >
                  <td className="tnum px-5 py-2.5 text-xs text-muted">{fmtDate(tx.txDate)}</td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/actif/${encodeURIComponent(tx.ticker)}?class=${tx.assetClass}`}
                      className="cursor-pointer font-mono text-xs font-bold transition-colors hover:text-accent"
                    >
                      {tx.ticker}
                    </Link>
                    <span className="ml-2 hidden max-w-32 truncate text-xs text-muted lg:inline">
                      {tx.name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={tx.side === "buy" ? "accent" : "danger"}>
                      {tx.side === "buy" ? t("common.buy") : t("common.sell")}
                    </Badge>
                  </td>
                  <td className="tnum px-3 py-2.5 text-right text-xs">{fmtQty(tx.quantity)}</td>
                  <td className="tnum px-3 py-2.5 text-right text-xs">{fmtEur(tx.price)}</td>
                  <td className="tnum px-3 py-2.5 text-right text-xs text-muted">{fmtEur(tx.fees)}</td>
                  <td
                    className={cn(
                      "tnum px-3 py-2.5 text-right text-xs font-semibold",
                      tx.side === "buy" ? "" : "text-accent",
                    )}
                  >
                    {fmtEur(tx.quantity * tx.price + (tx.side === "buy" ? tx.fees : -tx.fees))}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{tx.platform ?? "—"}</td>
                  <td className="px-3 py-2.5 pr-5 text-right">
                    <div className="flex justify-end gap-1">
                      <IconBtn label={t("common.edit")} onClick={() => setEditing(tx)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn label={t("common.delete")} danger onClick={() => setDeleting(tx)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing ? (
        <EditDialog tx={editing} onClose={() => setEditing(null)} onSaved={() => {
          setEditing(null);
          refresh();
        }} />
      ) : null}

      <Dialog open={!!deleting} onClose={() => setDeleting(null)} title={t("common.confirmDelete")}>
        <p className="text-sm text-muted">
          {deleting ? `${deleting.side === "buy" ? t("common.buy") : t("common.sell")} ${deleting.ticker} — ${fmtQty(deleting.quantity)} × ${fmtEur(deleting.price)} (${fmtDate(deleting.txDate)})` : ""}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={remove}>
            {t("common.delete")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "cursor-pointer rounded-lg p-1.5 text-muted transition-colors",
        danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EditDialog({
  tx,
  onClose,
  onSaved,
}: {
  tx: Transaction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [side, setSide] = useState(tx.side);
  const [quantity, setQuantity] = useState(String(tx.quantity));
  const [price, setPrice] = useState(String(tx.price));
  const [fees, setFees] = useState(String(tx.fees));
  const [date, setDate] = useState(tx.txDate);
  const [platform, setPlatform] = useState(tx.platform ?? "");
  const [note, setNote] = useState(tx.note ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await postJson(
        `/api/transactions/${tx.id}`,
        {
          side,
          quantity: parseFloat(quantity.replace(",", ".")),
          price: parseFloat(price.replace(",", ".")),
          fees: parseFloat(fees.replace(",", ".")) || 0,
          txDate: date,
          platform: platform || null,
          note: note.trim() || null,
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
    <Dialog open onClose={onClose} title={`${t("common.edit")} — ${tx.ticker}`}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("tx.side")}>
          <Select value={side} onChange={(e) => setSide(e.target.value as "buy" | "sell")}>
            <option value="buy">{t("common.buy")}</option>
            <option value="sell">{t("common.sell")}</option>
          </Select>
        </Field>
        <Field label={t("common.date")}>
          <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("common.quantity")}>
          <Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field label={t("common.price")}>
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label={t("common.fees")}>
          <Input inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} />
        </Field>
        <Field label={t("common.platform")}>
          <Input value={platform} onChange={(e) => setPlatform(e.target.value)} />
        </Field>
        <Field label={t("common.note")} className="col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
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
