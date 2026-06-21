"use client";

import { useState } from "react";
import { useToast } from "@/components/providers";
import { Button, Dialog, Field, Input, Select } from "@/components/ui";
import { todayIso } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Transaction } from "@/lib/types";
import { postJson } from "@/lib/use-api";
import { cn } from "@/lib/utils";

/** Small square icon button used in transaction rows (edit / delete). */
export function IconBtn({
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

/** Edit one transaction (side, quantity, price, fees, date, platform, note). */
export function TxEditDialog({
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
