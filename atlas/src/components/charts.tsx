"use client";

import { useId, useMemo } from "react";
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import { cvtMoney, fmtDate, fmtEur } from "@/lib/format";
import type { AllocationSlice, HistoryPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

// Shared palette — accent first, then complementary sober tones (no purple).
const PALETTE = [
  "#10b981",
  "#22d3ee",
  "#f59e0b",
  "#60a5fa",
  "#34d399",
  "#fb7185",
  "#a3e635",
  "#facc15",
  "#94a3b8",
];

// ── Sparkline (pure SVG, animated draw) ─────────────────────────────────────

export function Sparkline({
  data,
  width = 96,
  height = 28,
  className,
}: {
  data: number[] | null;
  width?: number;
  height?: number;
  className?: string;
}) {
  const id = useId();
  if (!data || data.length < 2) {
    return <div className={cn("text-xs text-muted", className)}>—</div>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => [i * stepX, height - 2 - ((v - min) / range) * (height - 4)]);
  const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  const color = up ? "var(--accent)" : "var(--danger)";
  const areaD = `${d} L${width},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`sg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#sg-${id})`} stroke="none" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        className="spark-path"
        style={{ "--spark-len": 300 } as React.CSSProperties}
      />
    </svg>
  );
}

// ── Donut allocation ────────────────────────────────────────────────────────

export function Donut({
  slices,
  height = 220,
  centerTitle,
  centerSubtitle,
}: {
  slices: AllocationSlice[];
  height?: number;
  centerTitle?: string;
  centerSubtitle?: string;
}) {
  const data = useMemo(
    () => slices.map((s) => ({ name: s.label, value: Math.round(s.value * 100) / 100, pct: s.pct })),
    [slices],
  );
  if (!data.length) return <div className="py-10 text-center text-sm text-muted">—</div>;
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <div className="relative w-full max-w-[240px]">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive
              animationDuration={700}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {centerTitle ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="tnum text-sm font-bold leading-tight">{centerTitle}</span>
            {centerSubtitle ? (
              <span className="text-[10px] text-muted">{centerSubtitle}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <ul className="grid w-full grid-cols-1 gap-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: PALETTE[i % PALETTE.length] }}
              />
              <span className="truncate text-muted">{d.name}</span>
            </span>
            <span className="tnum font-medium">{d.pct.toFixed(1)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { pct: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold">{p.name}</div>
      <div className="tnum text-muted">
        {fmtEur(p.value)} · {p.payload.pct.toFixed(1)} %
      </div>
    </div>
  );
}

// ── Timeline (portfolio value vs invested) ──────────────────────────────────

export interface TimelinePointView {
  date: string;
  value: number;
  invested: number;
  benchmark?: number;
}

export function TimelineChart({
  points,
  height = 280,
  valueLabel,
  investedLabel,
  benchmarkLabel,
}: {
  points: TimelinePointView[];
  height?: number;
  valueLabel: string;
  investedLabel: string;
  benchmarkLabel?: string;
}) {
  const id = useId();
  if (points.length < 2) {
    return <div className="py-12 text-center text-sm text-muted">—</div>;
  }
  const hasBenchmark = points.some((p) => p.benchmark !== undefined);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id={`tg-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.32} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickFormatter={(d: string) => fmtDate(d)}
          axisLine={false}
          tickLine={false}
          minTickGap={60}
        />
        <YAxis
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickFormatter={(v: number) => `${Math.round(cvtMoney(v) / 100) / 10}k`}
          axisLine={false}
          tickLine={false}
          width={42}
          domain={["auto", "auto"]}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const value = payload.find((p) => p.dataKey === "value")?.value as number | undefined;
            const invested = payload.find((p) => p.dataKey === "invested")?.value as
              | number
              | undefined;
            const benchmark = payload.find((p) => p.dataKey === "benchmark")?.value as
              | number
              | undefined;
            return (
              <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-xl">
                <div className="mb-1 font-medium text-muted">{fmtDate(String(label))}</div>
                <div className="tnum font-semibold text-accent">
                  {valueLabel} : {fmtEur(value ?? null)}
                </div>
                <div className="tnum text-muted">
                  {investedLabel} : {fmtEur(invested ?? null)}
                </div>
                {benchmark !== undefined && benchmarkLabel ? (
                  <div className="tnum text-accent-2">
                    {benchmarkLabel} : {fmtEur(benchmark)}
                  </div>
                ) : null}
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="invested"
          stroke="var(--muted)"
          strokeWidth={1.2}
          strokeDasharray="4 4"
          fill="none"
          isAnimationActive
          animationDuration={800}
        />
        {hasBenchmark ? (
          <Line
            type="monotone"
            dataKey="benchmark"
            stroke="var(--accent-2)"
            strokeWidth={1.6}
            dot={false}
            isAnimationActive
            animationDuration={800}
          />
        ) : null}
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--accent)"
          strokeWidth={2}
          fill={`url(#tg-${id})`}
          isAnimationActive
          animationDuration={800}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Market heatmap (treemap: size = weight, color = 24h move) ───────────────

export interface HeatTile {
  name: string;
  size: number;
  change: number | null;
  assetClass: string;
}

function heatColor(change: number | null): string {
  if (change === null) return "var(--surface-2)";
  const intensity = Math.min(Math.abs(change), 5) / 5; // saturate at ±5 %
  const pct = Math.round(14 + intensity * 40);
  const base = change >= 0 ? "var(--accent)" : "var(--danger)";
  return `color-mix(in oklab, ${base} ${pct}%, var(--surface-2))`;
}

interface HeatCellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  change?: number | null;
  onOpen?: (name: string) => void;
}

function HeatCell({ x = 0, y = 0, width = 0, height = 0, name, change, onOpen }: HeatCellProps) {
  if (!name || width < 2 || height < 2) return null;
  const showTicker = width > 48 && height > 26;
  const showPct = width > 48 && height > 44 && change !== null && change !== undefined;
  return (
    <g
      onClick={() => onOpen?.(name)}
      style={{ cursor: onOpen ? "pointer" : "default" }}
      role="button"
      aria-label={name}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        fill={heatColor(change ?? null)}
        stroke="var(--surface)"
        strokeWidth={2}
      />
      {showTicker ? (
        <text
          x={x + 8}
          y={y + 18}
          fill="var(--foreground)"
          fontSize={11}
          fontWeight={700}
          fontFamily="var(--font-mono)"
        >
          {name}
        </text>
      ) : null}
      {showPct ? (
        <text x={x + 8} y={y + 33} fill="var(--muted)" fontSize={10} className="tnum">
          {(change ?? 0) >= 0 ? "+" : ""}
          {(change ?? 0).toFixed(1)} %
        </text>
      ) : null}
    </g>
  );
}

export function MarketHeatmap({
  tiles,
  height = 280,
  onOpen,
}: {
  tiles: HeatTile[];
  height?: number;
  onOpen?: (name: string) => void;
}) {
  const data = useMemo(
    () => tiles.filter((t) => t.size > 0).map((t) => ({ ...t, size: Math.round(t.size * 100) / 100 })),
    [tiles],
  );
  if (!data.length) return <div className="py-12 text-center text-sm text-muted">—</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap
        data={data}
        dataKey="size"
        isAnimationActive
        animationDuration={600}
        content={<HeatCell onOpen={onOpen} />}
      >
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as HeatTile;
            return (
              <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-xl">
                <div className="font-mono font-bold">{p.name}</div>
                <div className="tnum text-muted">{fmtEur(p.size)}</div>
                <div
                  className={cn(
                    "tnum font-medium",
                    (p.change ?? 0) >= 0 ? "text-accent" : "text-danger",
                  )}
                >
                  {p.change !== null ? `${p.change >= 0 ? "+" : ""}${p.change.toFixed(2)} % (24 h)` : "—"}
                </div>
              </div>
            );
          }}
        />
      </Treemap>
    </ResponsiveContainer>
  );
}

// ── Asset price chart with moving averages ──────────────────────────────────

export interface PricePoint extends HistoryPoint {
  ma20?: number | null;
  ma50?: number | null;
}

export function PriceChart({
  points,
  height = 320,
  showMa,
}: {
  points: PricePoint[];
  height?: number;
  showMa: boolean;
}) {
  const id = useId();
  if (points.length < 2) {
    return <div className="py-12 text-center text-sm text-muted">—</div>;
  }
  const up = points[points.length - 1].value >= points[0].value;
  const color = up ? "var(--accent)" : "var(--danger)";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id={`pg-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickFormatter={(d: string) => fmtDate(d)}
          axisLine={false}
          tickLine={false}
          minTickGap={70}
        />
        <YAxis
          tick={{ fill: "var(--muted)", fontSize: 11 }}
          tickFormatter={(v: number) => { const c = cvtMoney(v); return c >= 1000 ? `${(c / 1000).toFixed(1)}k` : c.toFixed(c < 1 ? 3 : 0); }}
          axisLine={false}
          tickLine={false}
          width={52}
          domain={["auto", "auto"]}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const v = payload.find((p) => p.dataKey === "value")?.value as number | undefined;
            return (
              <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-xl">
                <div className="mb-0.5 text-muted">{fmtDate(String(label))}</div>
                <div className="tnum font-semibold">{fmtEur(v ?? null)}</div>
              </div>
            );
          }}
        />
        {showMa ? (
          <>
            <Line
              type="monotone"
              dataKey="ma20"
              stroke="var(--accent-2)"
              strokeWidth={1.2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ma50"
              stroke="var(--warning)"
              strokeWidth={1.2}
              dot={false}
              isAnimationActive={false}
            />
          </>
        ) : null}
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#pg-${id})`}
          isAnimationActive
          animationDuration={700}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
