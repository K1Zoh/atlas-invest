"use client";

import { Bell, Bot, Database, FileUp, Palette } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useRefresh, useToast } from "@/components/providers";
import { Button, Card, CardHeader, Field, Input, Segmented, Select, Skeleton } from "@/components/ui";
import { useI18n, type Lang } from "@/lib/i18n";
import { postJson, useApi } from "@/lib/use-api";

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

function DataCard() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { refresh } = useRefresh();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importClass, setImportClass] = useState<"stock" | "crypto">("crypto");
  const [importing, setImporting] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const legacy = useApi<{ available: boolean }>("/api/import/legacy");

  const runImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      fileRef.current?.click();
      return;
    }
    setImporting(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("assetClass", importClass);
      const res = await fetch("/api/import/csv", { method: "POST", body: form });
      const body = (await res.json()) as {
        imported?: number;
        skipped?: number;
        errors?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      toast(
        t("set.import.result", { imported: body.imported ?? 0, skipped: body.skipped ?? 0 }),
        body.imported ? "success" : "info",
      );
      for (const err of (body.errors ?? []).slice(0, 3)) toast(err, "error");
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setImporting(false);
    }
  };

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
        <div>
          <p className="text-sm font-medium">{t("set.import.title")}</p>
          <p className="mt-0.5 text-xs text-muted">{t("set.import.hint")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              aria-label={t("set.import.title")}
              className="cursor-pointer text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-foreground"
            />
            <Select
              value={importClass}
              onChange={(e) => setImportClass(e.target.value as "stock" | "crypto")}
              className="w-40"
              aria-label={t("set.import.class")}
            >
              <option value="crypto">{t("common.crypto")}</option>
              <option value="stock">{t("common.stocks")}</option>
            </Select>
            <Button onClick={runImport} loading={importing}>
              <FileUp className="h-4 w-4" /> {t("set.import.run")}
            </Button>
          </div>
        </div>

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
      </div>
    </Card>
  );
}
