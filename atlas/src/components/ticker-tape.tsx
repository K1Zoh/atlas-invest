"use client";

import Link from "next/link";
import { usePortfolio } from "@/components/portfolio-context";
import { fmtEur } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Discreet scrolling strip of holding prices, finance-terminal style.
 * Pauses on hover, falls back to a static scrollable row with reduced motion.
 */
export function TickerTape() {
  const { data } = usePortfolio();
  const items = (data?.views ?? []).filter((v) => v.price !== null);
  if (items.length < 3) return null;

  const row = (
    <>
      {items.map((v) => (
        <Link
          key={`${v.assetClass}:${v.ticker}`}
          href={`/actif/${encodeURIComponent(v.ticker)}?class=${v.assetClass}`}
          className="flex shrink-0 items-baseline gap-1.5 text-[11px] transition-colors hover:text-foreground"
        >
          <span className="font-mono font-semibold text-foreground/80">{v.ticker}</span>
          <span className="tnum text-muted">{fmtEur(v.price)}</span>
          <span
            className={cn(
              "tnum font-medium",
              (v.dayChangePct ?? 0) >= 0 ? "text-accent" : "text-danger",
            )}
          >
            {v.dayChangePct !== null
              ? `${v.dayChangePct >= 0 ? "+" : ""}${v.dayChangePct.toFixed(2)} %`
              : ""}
          </span>
        </Link>
      ))}
    </>
  );

  return (
    <div
      className="ticker-tape fade-up overflow-hidden rounded-xl border border-border/70 bg-surface/50 py-2"
      aria-label="Cours de tes positions"
    >
      <div className="ticker-track flex items-center gap-7 px-4">
        {row}
        <span aria-hidden="true" className="flex items-center gap-7">
          {row}
        </span>
      </div>
    </div>
  );
}
