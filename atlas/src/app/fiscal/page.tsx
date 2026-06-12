"use client";

import { Landmark } from "lucide-react";
import { useState } from "react";
import { Card, CardHeader, EmptyState, Select, Skeleton } from "@/components/ui";
import { fmtDate, fmtEurFixed as fmtEur, fmtQty } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { CryptoTaxResult, RealizedLine } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

interface TaxData {
  years: number[];
  stock: { lines: RealizedLine[]; net: number; pfuEstimate: number };
  crypto: CryptoTaxResult;
}

export default function TaxPage() {
  const { t } = useI18n();
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const { data, loading } = useApi<TaxData>(`/api/tax${year ? `?year=${year}` : ""}`);

  const hasSales = !!data && (data.stock.lines.length > 0 || data.crypto.lines.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("tax.title")}</h1>
          <p className="text-sm text-muted">{t("tax.subtitle")}</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          {t("tax.year")}
          <Select value={year} onChange={(e) => setYear(e.target.value)} className="w-28">
            <option value="">{t("tax.allYears")}</option>
            {(data?.years.length ? data.years : [new Date().getFullYear()]).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {loading && !data ? (
        <Skeleton className="h-72" />
      ) : !hasSales ? (
        <EmptyState icon={<Landmark className="h-9 w-9" />} title={t("tax.noSales")} body={t("tax.disclaimer")} />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard
              label={`${t("tax.netGain")} — ${t("common.stocks")}`}
              value={data!.stock.net}
            />
            <SummaryCard label={`${t("tax.pfu")} — ${t("common.stocks")}`} value={data!.stock.pfuEstimate} neutral />
            <SummaryCard
              label={`${t("tax.netGain")} — ${t("common.crypto")}`}
              value={data!.crypto.netTaxable}
            />
            <SummaryCard label={`${t("tax.pfu")} — ${t("common.crypto")}`} value={data!.crypto.pfuEstimate} neutral />
          </div>

          {data!.stock.lines.length ? (
            <Card className="fade-up overflow-x-auto pb-1">
              <CardHeader title={t("tax.stocks")} />
              <RealizedTable lines={data!.stock.lines} />
            </Card>
          ) : null}

          {data!.crypto.lines.length ? (
            <Card className="fade-up overflow-x-auto pb-1">
              <CardHeader
                title={t("tax.crypto")}
                subtitle={`${t("tax.gains")} : ${fmtEur(data!.crypto.totalGains)} · ${t("tax.losses")} : ${fmtEur(data!.crypto.totalLosses)}`}
              />
              <RealizedTable lines={data!.crypto.lines} />
            </Card>
          ) : null}

          <p className="text-center text-[11px] leading-relaxed text-muted/70">{t("tax.disclaimer")}</p>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, neutral }: { label: string; value: number; neutral?: boolean }) {
  return (
    <Card className="fade-up px-5 py-4" hover>
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p
        className={cn(
          "tnum mt-1.5 text-xl font-bold",
          neutral ? "" : value >= 0 ? "text-accent" : "text-danger",
        )}
      >
        {fmtEur(value)}
      </p>
    </Card>
  );
}

function RealizedTable({ lines }: { lines: RealizedLine[] }) {
  const { t } = useI18n();
  return (
    <table className="mt-2 w-full min-w-[680px] text-sm">
      <thead>
        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
          <th className="px-5 py-2.5 font-medium">{t("common.date")}</th>
          <th className="px-3 py-2.5 font-medium">{t("common.ticker")}</th>
          <th className="px-3 py-2.5 text-right font-medium">{t("common.quantity")}</th>
          <th className="px-3 py-2.5 text-right font-medium">{t("tax.proceeds")}</th>
          <th className="px-3 py-2.5 text-right font-medium">{t("tax.costBasis")}</th>
          <th className="px-3 py-2.5 text-right font-medium">PV / MV</th>
          <th className="px-3 py-2.5 pr-5 text-right font-medium">{t("tax.pfu")}</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} className="border-b border-border/50 last:border-0">
            <td className="tnum px-5 py-2.5 text-xs text-muted">{fmtDate(l.date)}</td>
            <td className="px-3 py-2.5 font-mono text-xs font-bold">{l.ticker}</td>
            <td className="tnum px-3 py-2.5 text-right text-xs">{fmtQty(l.qtySold)}</td>
            <td className="tnum px-3 py-2.5 text-right text-xs">{fmtEur(l.netProceeds)}</td>
            <td className="tnum px-3 py-2.5 text-right text-xs text-muted">{fmtEur(l.costBasis)}</td>
            <td
              className={cn(
                "tnum px-3 py-2.5 text-right text-xs font-semibold",
                l.pnl >= 0 ? "text-accent" : "text-danger",
              )}
            >
              {fmtEur(l.pnl)}
            </td>
            <td className="tnum px-3 py-2.5 pr-5 text-right text-xs">{fmtEur(l.pfuEstimate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
