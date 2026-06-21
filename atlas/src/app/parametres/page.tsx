"use client";

import { Bell, Bot, Database, Download, FileSearch, Palette, Upload } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useRefresh, useToast } from "@/components/providers";
import { Badge, Button, Card, CardHeader, Field, Input, Segmented, Select, Skeleton } from "@/components/ui";
import { fmtDate, todayIso } from "@/lib/format";
import { useI18n, type Lang } from "@/lib/i18n";
import { postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

interface SettingsPayload {
  settings: Record<string, { value: string; set: boolean; secret: boolean }>;
}

export default function SettingsPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-5">
      <div className="fade-up">
        <h1 className="text-xl font-bold tracking-tight">{t("set.title")}</h1>
        <p className="text-sm text-muted">{t("set.subtitle")}</p>
      </div>
      <AppearanceCard />
      <AiCard />
      <NotificationsCard />
      <DataCard />
    </div>
  );
}

function AppearanceCard() {
  const { t, lang, setLang } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Card className="fade-up pb-5">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-accent" /> {t("set.appearance")}
          </span>
        }
      />
      <div className="flex flex-wrap gap-8 px-5 pt-4">
        <div>
          <p className="mb-2 text-xs font-medium text-muted">{t("set.language")}</p>
          <Segmented<Lang>
            options={[
              { value: "fr", label: "Français" },
              { value: "en", label: "English" },
            ]}
            value={lang}
            onChange={setLang}
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted">{t("set.theme")}</p>
          {mounted ? (
            <Segmented<string>
              options={[
                { value: "dark", label: t("set.theme.dark") },
                { value: "light", label: t("set.theme.light") },
              ]}
              value={resolvedTheme ?? "dark"}
              onChange={setTheme}
            />
          ) : (
            <Skeleton className="h-8 w-36" />
          )}
        </div>
      </div>
    </Card>
  );
}

function useSettingsForm() {
  const { data, loading, reload } = useApi<SettingsPayload>("/api/settings");
  const [values, setValues] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    if (!data) return;
    const v: Record<string, string> = {};
    for (const [k, s] of Object.entries(data.settings)) v[k] = s.value;
    setValues(v);
  }, [data]);

  const save = async (keys: string[]) => {
    const updates: Record<string, string> = {};
    for (const k of keys) {
      if (values[k] !== undefined) updates[k] = values[k];
    }
    try {
      await postJson("/api/settings", { updates });
      toast(t("common.saved"));
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  return { values, set, save, loading };
}

function AiCard() {
  const { t } = useI18n();
  const { values, set, save, loading } = useSettingsForm();
  const [saving, setSaving] = useState(false);

  const doSave = async () => {
    setSaving(true);
    await save(["ai.gemini_key", "ai.gemini_model", "ai.groq_key", "ai.groq_model"]);
    setSaving(false);
  };

  return (
    <Card className="fade-up pb-5">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-accent" /> {t("set.ai")}
          </span>
        }
        subtitle={t("set.ai.hint")}
      />
      {loading && !Object.keys(values).length ? (
        <div className="px-5 pt-4">
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="grid gap-3 px-5 pt-4 sm:grid-cols-2">
          <Field label={t("set.geminiKey")}>
            <Input type="text" autoComplete="off" value={values["ai.gemini_key"] ?? ""} onChange={set("ai.gemini_key")} placeholder="AIza…" />
          </Field>
          <Field label={t("set.geminiModel")}>
            <Input value={values["ai.gemini_model"] ?? ""} onChange={set("ai.gemini_model")} placeholder="gemini-2.5-flash" />
          </Field>
          <Field label={t("set.groqKey")}>
            <Input type="text" autoComplete="off" value={values["ai.groq_key"] ?? ""} onChange={set("ai.groq_key")} placeholder="gsk_…" />
          </Field>
          <Field label={t("set.groqModel")}>
            <Input value={values["ai.groq_model"] ?? ""} onChange={set("ai.groq_model")} placeholder="llama-3.3-70b-versatile" />
          </Field>
          <div className="sm:col-span-2">
            <Button onClick={doSave} loading={saving}>
              {t("set.saveKeys")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function NotificationsCard() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { values, set, save, loading } = useSettingsForm();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const NOTIF_KEYS = [
    "notify.discord_webhook",
    "notify.telegram_token",
    "notify.telegram_chat_id",
    "smtp.host",
    "smtp.port",
    "smtp.user",
    "smtp.pass",
    "smtp.to",
  ];

  const doSave = async () => {
    setSaving(true);
    await save(NOTIF_KEYS);
    setSaving(false);
  };

  const test = async (channel: "discord" | "telegram" | "smtp") => {
    setTesting(channel);
    try {
      await postJson("/api/settings/test", { channel });
      toast(t("set.testOk"));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setTesting(null);
    }
  };

  if (loading && !Object.keys(values).length) {
    return (
      <Card className="fade-up p-5">
        <Skeleton className="h-40" />
      </Card>
    );
  }

  return (
    <Card className="fade-up pb-5">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-accent" /> {t("set.notifications")}
          </span>
        }
        subtitle={t("set.notif.hint")}
      />
      <div className="flex flex-col gap-5 px-5 pt-4">
        <div className="flex items-end gap-2">
          <Field label={t("set.discord")} className="flex-1">
            <Input autoComplete="off" value={values["notify.discord_webhook"] ?? ""} onChange={set("notify.discord_webhook")} placeholder="https://discord.com/api/webhooks/…" />
          </Field>
          <Button variant="outline" onClick={() => test("discord")} loading={testing === "discord"}>
            {t("set.test")}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t("set.telegramToken")}>
            <Input autoComplete="off" value={values["notify.telegram_token"] ?? ""} onChange={set("notify.telegram_token")} placeholder="123456:ABC…" />
          </Field>
          <Field label={t("set.telegramChat")}>
            <Input value={values["notify.telegram_chat_id"] ?? ""} onChange={set("notify.telegram_chat_id")} placeholder="987654321" />
          </Field>
          <Button variant="outline" onClick={() => test("telegram")} loading={testing === "telegram"}>
            {t("set.test")}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("set.smtpHost")}>
            <Input value={values["smtp.host"] ?? ""} onChange={set("smtp.host")} placeholder="smtp.gmail.com" />
          </Field>
          <Field label={t("set.smtpPort")}>
            <Input value={values["smtp.port"] ?? ""} onChange={set("smtp.port")} placeholder="587" />
          </Field>
          <Field label={t("set.smtpUser")}>
            <Input value={values["smtp.user"] ?? ""} onChange={set("smtp.user")} placeholder="moi@gmail.com" />
          </Field>
          <Field label={t("set.smtpPass")}>
            <Input type="password" autoComplete="off" value={values["smtp.pass"] ?? ""} onChange={set("smtp.pass")} />
          </Field>
          <Field label={t("set.smtpTo")}>
            <Input value={values["smtp.to"] ?? ""} onChange={set("smtp.to")} />
          </Field>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => test("smtp")} loading={testing === "smtp"}>
              {t("set.test")}
            </Button>
          </div>
        </div>

        <div>
          <Button onClick={doSave} loading={saving}>
            {t("set.saveKeys")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

interface PreviewRow {
  status: "new" | "duplicate" | "ignored";
  reason?: string;
  ticker: string;
  name: string;
  assetClass: "stock" | "crypto";
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fees: number;
  txDate: string;
  platform: string | null;
  coingeckoId: string | null;
  extId: string | null;
  fingerprint: string;
}

interface PreviewResult {
  exchange: string;
  detected: string;
  rows: PreviewRow[];
  counts: { new: number; duplicate: number; ignored: number; total: number };
  errors: string[];
}

const EXCHANGE_OPTIONS = [
  { id: "auto", label: "Détection automatique" },
  { id: "kraken", label: "Kraken" },
  { id: "revolut", label: "Revolut (bourse)" },
  { id: "binance", label: "Binance" },
  { id: "coinbase", label: "Coinbase" },
  { id: "generic", label: "Modèle Atlas / autre" },
];

interface EditRow {
  row: PreviewRow;
  include: boolean;
  quantity: string;
  price: string;
}

function ImportSection() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { refresh } = useRefresh();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"positions" | "broker">("positions");
  const [exchange, setExchange] = useState("auto");
  const [importClass, setImportClass] = useState<"stock" | "crypto">("crypto");
  const [pasteText, setPasteText] = useState("");
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [analyzing, setAnalyzing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [editRows, setEditRows] = useState<EditRow[]>([]);
  const [showAll, setShowAll] = useState(false);

  const analyze = async () => {
    const form = new FormData();
    if (mode === "positions") {
      form.set("exchange", "positions");
      form.set("assetClass", importClass);
      form.set("asOfDate", asOfDate);
      const file = fileRef.current?.files?.[0];
      if (file) form.set("file", file);
      else if (pasteText.trim()) form.set("text", pasteText);
      else {
        // Nothing pasted and no file: open the picker as a convenience.
        fileRef.current?.click();
        return;
      }
    } else {
      const file = fileRef.current?.files?.[0];
      if (!file) {
        fileRef.current?.click();
        return;
      }
      form.set("file", file);
      form.set("exchange", exchange);
      form.set("assetClass", importClass);
    }

    setAnalyzing(true);
    setPreview(null);
    setShowAll(false);
    try {
      const res = await fetch("/api/import/preview", { method: "POST", body: form });
      const body = (await res.json()) as PreviewResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPreview(body);
      setEditRows(
        body.rows.map((r) => ({
          row: r,
          include: r.status === "new",
          quantity: r.quantity ? String(r.quantity) : "",
          price: r.price ? String(r.price) : "",
        })),
      );
      for (const err of (body.errors ?? []).slice(0, 2)) toast(err, "error");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const num = (s: string) => parseFloat(s.replace(",", "."));
  const includedCount = editRows.filter((e) => e.include && num(e.quantity) > 0 && num(e.price) >= 0).length;

  const patch = (i: number, fields: Partial<EditRow>) =>
    setEditRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...fields } : r)));

  const commit = async () => {
    const rows = editRows
      .filter((e) => e.include)
      .map((e) => ({ ...e.row, quantity: num(e.quantity), price: num(e.price) }))
      .filter((r) => r.quantity > 0 && r.price >= 0 && r.ticker && r.txDate);
    if (!rows.length) {
      toast(t("set.import.nothingNew"), "info");
      return;
    }
    setCommitting(true);
    try {
      const body = await postJson<{ imported: number; skipped: number }>("/api/import/commit", {
        rows,
      });
      toast(t("set.import.done", { imported: body.imported }));
      setPreview(null);
      setEditRows([]);
      setPasteText("");
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setCommitting(false);
    }
  };

  // New rows first, then everything else; collapse to 14 unless expanded.
  const order = editRows
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.row.status === "new" ? 0 : 1) - (b.e.row.status === "new" ? 0 : 1));
  const visible = showAll ? order : order.slice(0, 14);

  const switchMode = (m: "positions" | "broker") => {
    setMode(m);
    setPreview(null);
    setEditRows([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div>
      <p className="text-sm font-medium">{t("set.import.title")}</p>

      <div className="mt-2">
        <Segmented<"positions" | "broker">
          options={[
            { value: "positions", label: t("set.import.mode.positions") },
            { value: "broker", label: t("set.import.mode.broker") },
          ]}
          value={mode}
          onChange={switchMode}
        />
      </div>

      {mode === "positions" ? (
        <>
          <p className="mt-3 text-xs leading-relaxed text-muted">{t("set.import.positions.hint")}</p>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted">{t("set.import.class")}</span>
              <Select
                value={importClass}
                onChange={(e) => setImportClass(e.target.value as "stock" | "crypto")}
                className="w-36"
              >
                <option value="crypto">{t("common.crypto")}</option>
                <option value="stock">{t("common.stocks")}</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted">{t("set.import.positions.date")}</span>
              <Input
                type="date"
                value={asOfDate}
                max={todayIso()}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="w-44"
              />
            </label>
          </div>

          <textarea
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              setPreview(null);
            }}
            rows={4}
            placeholder={t("set.import.positions.paste")}
            className="mt-3 w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted/60 focus:border-accent focus:outline-none"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={analyze} loading={analyzing}>
              <FileSearch className="h-4 w-4" /> {t("set.import.positions.analyze")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={() => setPreview(null)}
              aria-label={t("set.import.positions.fileHint")}
              className="cursor-pointer text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-foreground"
            />
            <a
              href="/api/import/template?type=positions"
              download
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs text-muted transition-colors hover:text-accent"
            >
              <Download className="h-3.5 w-3.5" /> {t("set.import.positions.template")}
            </a>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-xs leading-relaxed text-muted">{t("set.import.broker.hint")}</p>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted">{t("set.import.exchange")}</span>
              <Select
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
                className="w-52"
                aria-label={t("set.import.exchange")}
              >
                {EXCHANGE_OPTIONS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </Select>
            </label>
            {exchange === "generic" ? (
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-muted">{t("set.import.class")}</span>
                <Select
                  value={importClass}
                  onChange={(e) => setImportClass(e.target.value as "stock" | "crypto")}
                  className="w-36"
                >
                  <option value="crypto">{t("common.crypto")}</option>
                  <option value="stock">{t("common.stocks")}</option>
                </Select>
              </label>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.zip,text/csv,application/zip"
              onChange={() => setPreview(null)}
              aria-label={t("set.import.title")}
              className="cursor-pointer text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-foreground"
            />
            <Button variant="outline" onClick={analyze} loading={analyzing}>
              <FileSearch className="h-4 w-4" /> {t("set.import.analyze")}
            </Button>
            <a
              href="/api/import/template"
              download
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs text-muted transition-colors hover:text-accent"
            >
              <Download className="h-3.5 w-3.5" /> {t("set.import.template")}
            </a>
          </div>
        </>
      )}

      {preview ? (
        <div className="fade-up mt-4 rounded-xl border border-border bg-surface-2/40 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">
                {t("set.import.preview", {
                  new: preview.counts.new,
                  duplicate: preview.counts.duplicate,
                  ignored: preview.counts.ignored,
                })}
              </p>
              <p className="text-[11px] text-muted">
                {preview.exchange !== "generic"
                  ? `${t("set.import.detected", { exchange: preview.exchange })} · `
                  : ""}
                {t("set.import.editHint")}
              </p>
            </div>
            <Button onClick={commit} loading={committing} disabled={includedCount === 0}>
              {t("set.import.confirm", { new: includedCount })}
            </Button>
          </div>

          {editRows.length ? (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-border/60">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
                    <th className="px-2 py-1.5" />
                    <th className="px-2 py-1.5">{t("common.date")}</th>
                    <th className="px-2 py-1.5">{t("pf.asset")}</th>
                    <th className="px-2 py-1.5">{t("tx.side")}</th>
                    <th className="px-2 py-1.5 text-right">{t("common.quantity")}</th>
                    <th className="px-2 py-1.5 text-right">{t("common.price")}</th>
                    <th className="px-2 py-1.5">{t("common.note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ e, i }) => (
                    <tr
                      key={`${e.row.extId ?? e.row.fingerprint}-${i}`}
                      className={cn("border-t border-border/40", !e.include && "opacity-60")}
                    >
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={e.include}
                          onChange={(ev) => patch(i, { include: ev.target.checked })}
                          aria-label={t("common.add")}
                          className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                        />
                      </td>
                      <td className="tnum px-2 py-1.5 text-muted">{fmtDate(e.row.txDate)}</td>
                      <td className="px-2 py-1.5 font-mono font-semibold">{e.row.ticker}</td>
                      <td className="px-2 py-1.5">
                        <Badge tone={e.row.side === "buy" ? "accent" : "danger"}>
                          {e.row.side === "buy" ? t("common.buy") : t("common.sell")}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          inputMode="decimal"
                          value={e.quantity}
                          onChange={(ev) => patch(i, { quantity: ev.target.value })}
                          className="tnum w-20 rounded-md border border-border bg-surface px-1.5 py-1 text-right focus:border-accent focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          inputMode="decimal"
                          value={e.price}
                          onChange={(ev) => patch(i, { price: ev.target.value })}
                          className="tnum w-24 rounded-md border border-border bg-surface px-1.5 py-1 text-right focus:border-accent focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <ImportStatusBadge status={e.row.status} reason={e.row.reason} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {!showAll && order.length > visible.length ? (
            <button
              onClick={() => setShowAll(true)}
              className="mt-2 cursor-pointer text-[11px] text-accent hover:underline"
            >
              {t("set.import.showMore", { n: order.length })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ImportStatusBadge({ status, reason }: { status: string; reason?: string }) {
  const { t } = useI18n();
  if (status === "new") return <Badge tone="accent">{t("set.import.status.new")}</Badge>;
  if (status === "duplicate")
    return <Badge tone="neutral">{t("set.import.status.duplicate")}</Badge>;
  return (
    <span className="text-[11px] text-warning" title={reason}>
      {t("set.import.status.ignored")}
    </span>
  );
}

function DataCard() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { refresh } = useRefresh();
  const [migrating, setMigrating] = useState(false);
  const legacy = useApi<{ available: boolean }>("/api/import/legacy");

  const runMigration = async () => {
    setMigrating(true);
    try {
      const report = await postJson<{
        transactions: number;
        watchlist: number;
        dividends: number;
        settings: number;
        errors: string[];
      }>("/api/import/legacy");
      toast(
        t("set.legacy.done", {
          transactions: report.transactions,
          watchlist: report.watchlist,
          dividends: report.dividends,
          settings: report.settings,
        }),
      );
      for (const err of report.errors.slice(0, 3)) toast(err, "error");
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setMigrating(false);
    }
  };

  return (
    <Card id="import" className="fade-up pb-5">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Database className="h-4 w-4 text-accent" /> {t("set.data")}
          </span>
        }
      />
      <div className="flex flex-col gap-6 px-5 pt-4">
        <ImportSection />

        <div className="border-t border-border/60 pt-5">
          <p className="text-sm font-medium">{t("set.legacy.title")}</p>
          <p className="mt-0.5 text-xs text-muted">{t("set.legacy.hint")}</p>
          <div className="mt-3">
            {legacy.data?.available === false ? (
              <p className="text-xs text-warning">{t("set.legacy.unavailable")}</p>
            ) : (
              <Button variant="outline" onClick={runMigration} loading={migrating}>
                <Database className="h-4 w-4" /> {t("set.legacy.run")}
              </Button>
            )}
          </div>
        </div>

        <BackupSection />
      </div>
    </Card>
  );
}

function BackupSection() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { refresh } = useRefresh();
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);

  const restore = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      fileRef.current?.click();
      return;
    }
    if (!window.confirm(t("set.backup.confirm"))) return;
    setRestoring(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/backup/restore", { method: "POST", body: form });
      const body = (await res.json()) as { restored?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      toast(t("set.backup.done"));
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="border-t border-border/60 pt-5">
      <p className="text-sm font-medium">{t("set.backup.title")}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{t("set.backup.hint")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a href="/api/backup" download>
          <Button variant="outline" type="button">
            <Download className="h-4 w-4" /> {t("set.backup.download")}
          </Button>
        </a>
        <input
          ref={fileRef}
          type="file"
          accept=".db,application/octet-stream,application/x-sqlite3"
          aria-label={t("set.backup.restore")}
          className="cursor-pointer text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-foreground"
        />
        <Button variant="ghost" onClick={restore} loading={restoring}>
          <Upload className="h-4 w-4" /> {t("set.backup.restore")}
        </Button>
      </div>
    </div>
  );
}
