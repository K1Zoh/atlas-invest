"use client";

import { Flag, FlaskConical, LineChart, Plus, Target, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ProjectionChart } from "@/components/charts";
import { usePortfolio } from "@/components/portfolio-context";
import { Button, Card, CardHeader, Skeleton } from "@/components/ui";
import { fmtEur, fmtPct } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { defaultReturnForName, ETF_PRESETS } from "@/lib/pea-presets";
import { projectDca, type ProjectionResult, type SimConfig, type SimLine } from "@/lib/projection";
import { postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const SETTINGS_KEY = "pea.sim";
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

interface SettingsPayload {
  settings: Record<string, { value: string }>;
}

function defaultConfig(): SimConfig {
  return {
    startCapital: 0,
    lines: [
      { id: uid(), ticker: "WPEA", name: "MSCI World", monthly: 70, annualReturnPct: 7 },
      { id: uid(), ticker: "PAEEM", name: "Marchés Émergents", monthly: 30, annualReturnPct: 7 },
    ],
    candidate: null,
    targetMonthlyIncome: 1500,
    withdrawalRatePct: 4,
    currentAge: null,
  };
}

function money(s: string): number {
  const n = parseFloat(s.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function PeaProjection() {
  const { t } = useI18n();
  const { data: pf, loading: pfLoading } = usePortfolio();
  const settingsApi = useApi<SettingsPayload>("/api/settings");

  const [config, setConfig] = useState<SimConfig | null>(null);
  const seeded = useRef(false);
  const dirty = useRef(false);

  const peaViews = useMemo(() => (pf?.views ?? []).filter((v) => v.account === "pea"), [pf]);
  const peaValue = useMemo(() => peaViews.reduce((s, v) => s + (v.value ?? 0), 0), [peaViews]);

  // Seed once, after BOTH settings and portfolio have resolved (so the pre-filled
  // start capital reflects the real PEA value). A saved config always wins.
  useEffect(() => {
    if (seeded.current || settingsApi.loading || pfLoading) return;
    seeded.current = true;
    const raw = settingsApi.data?.settings[SETTINGS_KEY]?.value;
    if (raw) {
      try {
        setConfig(JSON.parse(raw) as SimConfig);
        return;
      } catch {
        /* fall through to defaults */
      }
    }
    const base = defaultConfig();
    base.startCapital = Math.round(peaValue);
    setConfig(base);
  }, [settingsApi.loading, settingsApi.data, pfLoading, peaValue]);

  // Debounced autosave, only after the first user edit.
  useEffect(() => {
    if (!config || !dirty.current) return;
    const h = setTimeout(() => {
      postJson("/api/settings", { updates: { [SETTINGS_KEY]: JSON.stringify(config) } }).catch(() => {});
    }, 700);
    return () => clearTimeout(h);
  }, [config]);

  const update = (patch: Partial<SimConfig>) => {
    dirty.current = true;
    setConfig((c) => (c ? { ...c, ...patch } : c));
  };
  const patchLine = (id: string, patch: Partial<SimLine>) =>
    update({ lines: (config?.lines ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const addLine = (preset?: { ticker: string; name: string; annualReturnPct: number }) =>
    update({
      lines: [
        ...(config?.lines ?? []),
        {
          id: uid(),
          ticker: preset?.ticker ?? "",
          name: preset?.name ?? "ETF",
          monthly: 0,
          annualReturnPct: preset?.annualReturnPct ?? 7,
        },
      ],
    });
  const removeLine = (id: string) => update({ lines: (config?.lines ?? []).filter((l) => l.id !== id) });

  const fromPea = () => {
    if (!peaViews.length) return;
    const total = peaValue || 1;
    update({
      startCapital: Math.round(peaValue),
      lines: peaViews.map((v) => ({
        id: uid(),
        ticker: v.ticker,
        name: v.name ?? v.ticker,
        monthly: Math.round((100 * (v.value ?? 0)) / total),
        annualReturnPct: defaultReturnForName(v.name ?? v.ticker),
      })),
    });
  };

  const result = useMemo(() => (config ? projectDca(config) : null), [config]);

  if (!config || !result) {
    return <Skeleton className="h-72" />;
  }

  const budget =
    config.lines.reduce((s, l) => s + Math.max(0, l.monthly), 0) +
    (config.candidate?.included ? Math.max(0, config.candidate.monthly) : 0);
  const h20 = result.horizons.find((h) => h.months === 240)!;

  return (
    <Card className="fade-up">
      <CardHeader title={t("pea.sim.title")} subtitle={t("pea.sim.subtitle")} />
      <div className="grid gap-5 px-5 pb-5 pt-3 lg:grid-cols-2">
        {/* ---- Inputs ---- */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-muted">{t("pea.sim.startCapital")}</label>
            <input
              inputMode="decimal"
              value={config.startCapital}
              onChange={(e) => update({ startCapital: money(e.target.value) })}
              className="tnum w-28 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-right text-sm"
            />
          </div>
          <p className="-mt-2 text-[11px] text-muted">{t("pea.sim.startCapitalHint")}</p>

          <div className="flex flex-col gap-2">
            {config.lines.map((l) => (
              <LineRow
                key={l.id}
                line={l}
                monthlyLabel={t("pea.sim.monthly")}
                annualLabel={t("pea.sim.annual")}
                onChange={(p) => patchLine(l.id, p)}
                onRemove={() => removeLine(l.id)}
              />
            ))}
            {!config.lines.length ? (
              <p className="py-4 text-center text-sm text-muted">{t("pea.sim.emptyHint")}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {peaViews.length ? (
              <Chip onClick={fromPea} strong>
                {t("pea.sim.fromPea")}
              </Chip>
            ) : null}
            {ETF_PRESETS.map((p) => (
              <Chip key={p.ticker} onClick={() => addLine(p)}>
                + {p.label}
              </Chip>
            ))}
            <Chip onClick={() => addLine()}>
              <Plus className="h-3 w-3" /> {t("pea.sim.addEtf")}
            </Chip>
          </div>

          <div className="flex justify-end text-sm">
            <span className="text-muted">
              {t("pea.sim.budget")} :{" "}
              <span className="tnum font-semibold text-foreground">{fmtEur(budget)}</span>
            </span>
          </div>

          <CandidateBlock
            candidate={config.candidate}
            labels={{
              title: t("pea.sim.testEtf"),
              hint: t("pea.sim.testEtfHint"),
              include: t("pea.sim.include"),
              monthly: t("pea.sim.monthly"),
              annual: t("pea.sim.annual"),
              add: t("pea.sim.addEtf"),
              remove: t("pea.sim.remove"),
            }}
            onChange={(candidate) => update({ candidate })}
          />

          <div className="rounded-xl border border-border/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4 text-accent-2" /> {t("pea.sim.objective")}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field3 label={t("pea.sim.targetIncome")}>
                <input
                  inputMode="decimal"
                  value={config.targetMonthlyIncome ?? ""}
                  onChange={(e) =>
                    update({ targetMonthlyIncome: e.target.value ? money(e.target.value) : null })
                  }
                  className="tnum w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-right text-sm"
                />
              </Field3>
              <Field3 label={t("pea.sim.withdrawalRate")}>
                <input
                  inputMode="decimal"
                  value={config.withdrawalRatePct}
                  onChange={(e) => update({ withdrawalRatePct: money(e.target.value) })}
                  className="tnum w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-right text-sm"
                />
              </Field3>
              <Field3 label={t("pea.sim.age")}>
                <input
                  inputMode="numeric"
                  value={config.currentAge ?? ""}
                  onChange={(e) =>
                    update({ currentAge: e.target.value ? Math.round(money(e.target.value)) : null })
                  }
                  className="tnum w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-right text-sm"
                />
              </Field3>
            </div>
            {result.freedom?.capitalTarget ? (
              <p className="mt-2 text-[11px] text-muted">
                {t("pea.sim.capitalTarget")} :{" "}
                <span className="tnum">{fmtEur(result.freedom.capitalTarget)}</span>
              </p>
            ) : null}
          </div>
        </div>

        {/* ---- Results ---- */}
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted">{t("pea.sim.headline").replace("{years}", "20")}</span>
              <span className="tnum text-2xl font-bold">≈ {fmtEur(h20.expected)}</span>
            </div>
            <p className="text-xs text-muted">
              {t("pea.sim.headlineGain").replace("{gain}", fmtEur(h20.expected - h20.invested))} ·{" "}
              {t("pea.sim.invested")} : {fmtEur(h20.invested)}
            </p>
          </div>

          <ProjectionChart
            points={result.yearly}
            target={result.freedom?.capitalTarget ?? null}
            freedomYear={
              result.freedom?.reached && result.freedom.months != null ? result.freedom.months / 12 : null
            }
            labels={{
              expected: t("pea.sim.expected"),
              invested: t("pea.sim.invested"),
              band: t("pea.sim.band"),
              target: t("pea.sim.capitalTarget"),
              freedom: t("pea.sim.freedomTitle"),
            }}
          />

          <FreedomCard result={result} targetIncome={config.targetMonthlyIncome} t={t} />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="py-2 pr-2 font-medium">{t("pea.sim.horizon")}</th>
                  <th className="py-2 px-2 text-right font-medium">{t("pea.sim.invested")}</th>
                  <th className="py-2 px-2 text-right font-medium">{t("pea.sim.value")}</th>
                  <th className="py-2 px-2 text-right font-medium">{t("pea.sim.gain")}</th>
                  <th className="py-2 pl-2 text-right font-medium">{t("pea.sim.rente")}</th>
                </tr>
              </thead>
              <tbody>
                {result.horizons.map((h) => {
                  const gain = h.expected - h.invested;
                  const pct = h.invested > 0 ? (gain / h.invested) * 100 : null;
                  return (
                    <tr key={h.months} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-2">
                        {h.months < 12 ? `${h.months} mois` : `${h.months / 12} an${h.months / 12 > 1 ? "s" : ""}`}
                      </td>
                      <td className="tnum py-2 px-2 text-right text-muted">{fmtEur(h.invested)}</td>
                      <td className="tnum py-2 px-2 text-right font-medium">
                        {fmtEur(h.expected)}
                        <span className="block text-[10px] font-normal text-muted">
                          {fmtEur(h.low)}–{fmtEur(h.high)}
                        </span>
                      </td>
                      <td className={cn("tnum py-2 px-2 text-right", gain >= 0 ? "text-accent" : "text-danger")}>
                        {fmtEur(gain)}
                        {pct !== null ? (
                          <span className="block text-[10px] text-muted">{fmtPct(pct)}</span>
                        ) : null}
                      </td>
                      <td className="tnum py-2 pl-2 text-right text-muted">{fmtEur(h.passiveIncome)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {result.candidateImpact && config.candidate ? (
            <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-2/40 p-3 text-xs leading-relaxed">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-accent-2" />
              <span className="text-muted">
                <span className="font-medium text-foreground">{t("pea.sim.impact")}</span>
                {!config.candidate.included ? ` ${t("pea.sim.impactExcluded")}` : ""} :{" "}
                <span className="text-foreground">≈ +{fmtEur(result.candidateImpact.valueDelta)} à 20 ans</span>{" "}
                (dont ≈ +{fmtEur(result.candidateImpact.gainDelta)} de plus-value), pour{" "}
                {fmtEur(result.candidateImpact.extraInvested)} versés de plus. {t("pea.sim.impactNote")}
              </span>
            </div>
          ) : null}

          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted/70">
            <LineChart className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("pea.sim.disclaimer")}
          </p>
        </div>
      </div>
    </Card>
  );
}

function LineRow({
  line,
  monthlyLabel,
  annualLabel,
  onChange,
  onRemove,
}: {
  line: SimLine;
  monthlyLabel: string;
  annualLabel: string;
  onChange: (p: Partial<SimLine>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-xs font-bold">{line.ticker || "—"}</span>
        <span className="block truncate text-[11px] text-muted">{line.name}</span>
      </span>
      <NumBox value={line.monthly} suffix={monthlyLabel} onChange={(n) => onChange({ monthly: n })} />
      <NumBox value={line.annualReturnPct} suffix={annualLabel} onChange={(n) => onChange({ annualReturnPct: n })} />
      <button aria-label="remove" onClick={onRemove} className="text-muted transition-colors hover:text-danger">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function NumBox({ value, suffix, onChange }: { value: number; suffix: string; onChange: (n: number) => void }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm">
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value.replace(",", "."));
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className="tnum w-12 bg-transparent text-right outline-none"
      />
      <span className="ml-0.5 text-[10px] text-muted">{suffix}</span>
    </span>
  );
}

function CandidateBlock({
  candidate,
  labels,
  onChange,
}: {
  candidate: SimConfig["candidate"];
  labels: {
    title: string;
    hint: string;
    include: string;
    monthly: string;
    annual: string;
    add: string;
    remove: string;
  };
  onChange: (c: SimConfig["candidate"]) => void;
}) {
  return (
    <div className="rounded-xl border border-accent/25 bg-accent/[0.05] p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-accent">
          <FlaskConical className="h-4 w-4" /> {labels.title}
        </span>
        {candidate ? (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={candidate.included}
              onChange={(e) => onChange({ ...candidate, included: e.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            {labels.include}
          </label>
        ) : null}
      </div>
      {candidate ? (
        <div className="flex items-center gap-2">
          <input
            value={candidate.name}
            onChange={(e) => onChange({ ...candidate, name: e.target.value })}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm"
          />
          <NumBox
            value={candidate.monthly}
            suffix={labels.monthly}
            onChange={(n) => onChange({ ...candidate, monthly: n })}
          />
          <NumBox
            value={candidate.annualReturnPct}
            suffix={labels.annual}
            onChange={(n) => onChange({ ...candidate, annualReturnPct: n })}
          />
          <button
            aria-label={labels.remove}
            onClick={() => onChange(null)}
            className="text-muted hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted">{labels.hint}</p>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() =>
              onChange({ id: uid(), ticker: "", name: "Nasdaq 100", monthly: 20, annualReturnPct: 10, included: false })
            }
          >
            <Plus className="h-3.5 w-3.5" /> {labels.add}
          </Button>
        </div>
      )}
    </div>
  );
}

function FreedomCard({
  result,
  targetIncome,
  t,
}: {
  result: ProjectionResult;
  targetIncome: number | null;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const f = result.freedom;
  if (!f || f.capitalTarget === null) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/60 p-3 text-sm text-muted">
        <Flag className="h-4 w-4 text-accent-2" /> {t("pea.sim.freedomSetTarget")}
      </div>
    );
  }
  const line = !f.reached
    ? t("pea.sim.freedomNotReached")
    : f.age != null
      ? t("pea.sim.freedomReachedAge").replace("{year}", String(f.year)).replace("{age}", String(f.age))
      : t("pea.sim.freedomReached").replace("{year}", String(f.year));
  return (
    <div className="rounded-xl border border-accent-2/30 bg-accent-2/[0.06] p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Flag className="h-4 w-4 text-accent-2" /> {t("pea.sim.freedomTitle")}
      </div>
      <p className={cn("mt-1 text-sm", f.reached ? "text-foreground" : "text-muted")}>{line}</p>
      {f.reached && targetIncome ? (
        <p className="mt-1 text-[11px] text-muted">
          {t("pea.sim.freedomPassive")} : <span className="tnum">{fmtEur(targetIncome)}/mois</span>
        </p>
      ) : null}
    </div>
  );
}

function Chip({ children, onClick, strong }: { children: ReactNode; onClick: () => void; strong?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition-colors",
        strong
          ? "border-accent/40 text-foreground hover:border-accent"
          : "border-border text-muted hover:border-accent/40",
      )}
    >
      {children}
    </button>
  );
}

function Field3({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] leading-tight text-muted">{label}</span>
      {children}
    </label>
  );
}
