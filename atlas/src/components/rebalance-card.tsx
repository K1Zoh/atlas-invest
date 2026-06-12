"use client";

import { Scale } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePortfolio } from "@/components/portfolio-context";
import { useToast } from "@/components/providers";
import { Card, CardHeader, Skeleton } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { postJson } from "@/lib/use-api";
import { cn } from "@/lib/utils";

/**
 * Contribution-only rebalancing: given a class target (crypto vs stocks)
 * and the next contribution, tells where the money should go. No sell
 * suggestions: contributions are how retail investors actually rebalance.
 */
export function RebalanceCard() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { data, loading } = usePortfolio();

  const [targetCrypto, setTargetCrypto] = useState<number | null>(null);
  const [contribution, setContribution] = useState("200");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const current = useMemo(() => {
    const views = data?.views ?? [];
    const crypto = views.filter((v) => v.assetClass === "crypto").reduce((s, v) => s + (v.value ?? 0), 0);
    const stock = views.filter((v) => v.assetClass === "stock").reduce((s, v) => s + (v.value ?? 0), 0);
    const total = crypto + stock;
    return { crypto, stock, total, cryptoPct: total > 0 ? (crypto / total) * 100 : 0 };
  }, [data]);

  // Load saved target once; default to the current allocation rounded to 5.
  useEffect(() => {
    if (targetCrypto !== null || !data) return;
    fetch("/api/settings", { cache: "no-store" })
      .then(async (res) => (await res.json()) as { settings?: Record<string, { value: string }> })
      .then((body) => {
        const raw = body.settings?.["rebalance.target_crypto"]?.value ?? "";
        const saved = raw === "" ? NaN : Number(raw);
        const savedContrib = body.settings?.["rebalance.contribution"]?.value;
        if (savedContrib) setContribution(savedContrib);
        setTargetCrypto(
          Number.isFinite(saved) && saved >= 0 && saved <= 100
            ? saved
            : Math.round(current.cryptoPct / 5) * 5,
        );
      })
      .catch(() => setTargetCrypto(Math.round(current.cryptoPct / 5) * 5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const persist = (crypto: number, contrib: string) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      postJson("/api/settings", {
        updates: { "rebalance.target_crypto": String(crypto), "rebalance.contribution": contrib },
      })
        .then(() => toast(t("reb.saved"), "info"))
        .catch(() => undefined);
    }, 900);
  };

  const plan = useMemo(() => {
    const A = parseFloat(contribution.replace(",", ".")) || 0;
    const tc = targetCrypto ?? 0;
    if (current.total <= 0 || A <= 0) return null;
    const idealCrypto = (tc / 100) * (current.total + A);
    const toCrypto = Math.min(Math.max(idealCrypto - current.crypto, 0), A);
    const toStock = A - toCrypto;
    const targetClass: "crypto" | "stock" | null =
      toCrypto >= A * 0.99 ? "crypto" : toStock >= A * 0.99 ? "stock" : null;
    const ideas = targetClass
      ? (data?.views ?? [])
          .filter((v) => v.assetClass === targetClass)
          .slice(0, 3)
      : [];
    return { amount: A, toCrypto, toStock, ideas };
  }, [contribution, targetCrypto, current, data]);

  if (loading && !data) {
    return (
      <Card className="p-5">
        <Skeleton className="h-40" />
      </Card>
    );
  }
  if (!data?.views.length || targetCrypto === null) return null;

  const targetStock = 100 - targetCrypto;

  return (
    <Card className="fade-up pb-5" hover>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-accent" /> {t("reb.title")}
          </span>
        }
        subtitle={t("reb.subtitle")}
      />
      <div className="flex flex-col gap-4 px-5 pt-4">
        {/* Current vs target bars */}
        <div className="flex flex-col gap-2">
          <AllocationBar
            label={t("reb.current")}
            cryptoPct={current.cryptoPct}
          />
          <AllocationBar label={t("reb.target")} cryptoPct={targetCrypto} muted />
        </div>

        {/* Controls */}
        <div className="grid grid-cols-[1fr_auto] items-end gap-4">
          <label className="block">
            <span className="mb-1.5 flex justify-between text-xs font-medium text-muted">
              <span>{t("reb.targetCrypto")}</span>
              <span className="tnum text-foreground">{targetCrypto} %</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={targetCrypto}
              onChange={(e) => {
                const v = Number(e.target.value);
                setTargetCrypto(v);
                persist(v, contribution);
              }}
              className="w-full cursor-pointer accent-[var(--accent)]"
              aria-label={t("reb.targetCrypto")}
            />
          </label>
          <label className="block w-28">
            <span className="mb-1.5 block text-xs font-medium text-muted">{t("reb.contribution")}</span>
            <input
              inputMode="decimal"
              value={contribution}
              onChange={(e) => {
                setContribution(e.target.value);
                persist(targetCrypto, e.target.value);
              }}
              className="tnum w-full rounded-xl border border-border bg-surface-2/60 px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        {/* Advice */}
        {plan ? (
          <div className="rounded-xl bg-surface-2/60 px-3.5 py-3 text-xs leading-relaxed">
            {plan.toCrypto < 1 && plan.toStock < 1 ? (
              <p className="text-muted">{t("reb.balanced")}</p>
            ) : (
              <>
                <p className="font-medium">{t("reb.advice", { amount: fmtEur(plan.amount) })}</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {plan.toCrypto >= 1 ? (
                    <AdviceLine amount={plan.toCrypto} label={t("common.crypto")} />
                  ) : null}
                  {plan.toStock >= 1 ? (
                    <AdviceLine amount={plan.toStock} label={t("common.stocks")} />
                  ) : null}
                </ul>
                {plan.ideas.length ? (
                  <p className="mt-2 text-muted">
                    {t("reb.ideas")}{" "}
                    {plan.ideas.map((v, i) => (
                      <span key={v.ticker}>
                        {i > 0 ? ", " : ""}
                        <Link
                          href={`/actif/${encodeURIComponent(v.ticker)}?class=${v.assetClass}`}
                          className="cursor-pointer font-mono font-semibold text-foreground transition-colors hover:text-accent"
                        >
                          {v.ticker}
                        </Link>
                      </span>
                    ))}
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function AllocationBar({
  label,
  cryptoPct,
  muted,
}: {
  label: string;
  cryptoPct: number;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-[10px] uppercase tracking-wider text-muted">{label}</span>
      <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-l-full transition-all duration-500", muted ? "bg-warning/50" : "bg-warning")}
          style={{ width: `${cryptoPct}%` }}
          title={`Crypto ${cryptoPct.toFixed(0)} %`}
        />
        <div
          className={cn("h-full flex-1 rounded-r-full transition-all duration-500", muted ? "bg-accent-2/40" : "bg-accent-2/80")}
          title={`Actions ${(100 - cryptoPct).toFixed(0)} %`}
        />
      </div>
      <span className="tnum w-20 shrink-0 text-right text-[11px] text-muted">
        {cryptoPct.toFixed(0)} / {(100 - cryptoPct).toFixed(0)}
      </span>
    </div>
  );
}

function AdviceLine({ amount, label }: { amount: number; label: string }) {
  const { t } = useI18n();
  return (
    <li className="tnum flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      {t("reb.put", { amount: fmtEur(amount), label })}
    </li>
  );
}
