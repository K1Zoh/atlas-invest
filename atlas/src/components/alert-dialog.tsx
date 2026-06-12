"use client";

import { useState } from "react";
import { useToast } from "@/components/providers";
import { Button, Dialog, Field, Input, Select } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { AlertKind, AssetClass } from "@/lib/types";
import { postJson } from "@/lib/use-api";

export function AlertDialog({
  open,
  onClose,
  ticker,
  assetClass,
  coingeckoId,
  currentPrice,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  ticker: string;
  assetClass: AssetClass;
  coingeckoId: string | null;
  currentPrice: number | null;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [kind, setKind] = useState<AlertKind>("above");
  const [threshold, setThreshold] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const th = parseFloat(threshold.replace(",", "."));
    if (!Number.isFinite(th) || th <= 0) {
      toast(t("common.error"), "error");
      return;
    }
    setSaving(true);
    try {
      await postJson("/api/alerts", { ticker, assetClass, coingeckoId, kind, threshold: th, label });
      toast(t("common.saved"));
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`${t("al.new")} — ${ticker}`}>
      <div className="flex flex-col gap-3">
        {currentPrice !== null ? (
          <p className="tnum text-xs text-muted">
            {t("pf.currentPrice")} : <span className="font-semibold text-foreground">{fmtEur(currentPrice)}</span>
          </p>
        ) : null}
        <Field label={t("al.kind")}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as AlertKind)}>
            {(["above", "below", "buy_target", "sell_target", "stop_loss", "take_profit"] as const).map(
              (k) => (
                <option key={k} value={k}>
                  {t(`al.kind.${k}` as never)}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field label={t("al.threshold")}>
          <Input inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} autoFocus />
        </Field>
        <Field label={`${t("al.label")} (${t("common.optional")})`}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <p className="text-[11px] text-muted">{t("al.notifyHint")}</p>
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

