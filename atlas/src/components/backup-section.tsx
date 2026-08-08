"use client";

import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useRefresh, useToast } from "@/components/providers";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { postJson, useApi } from "@/lib/use-api";

interface BackupEntry {
  file: string;
  bytes: number;
  modifiedAt: string;
  /** null quand la sauvegarde est illisible : affichée, mais pas proposée. */
  transactions: number | null;
}

interface BackupListPayload {
  backups: BackupEntry[];
  backupDir: string;
  dataDir: string;
}

/**
 * Sauvegarde et restauration. Deux usages : l'export/import manuel d'un
 * fichier, et la liste des sauvegardes automatiques produites par atlas.sh,
 * restaurables en un clic — c'est ce qui rend la récupération accessible sans
 * passer par le terminal.
 */
export function BackupSection() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { refresh } = useRefresh();
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);
  const { data, reload } = useApi<BackupListPayload>("/api/backup/list");

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
      reload();
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setRestoring(false);
    }
  };

  const restoreLocal = async (entry: BackupEntry) => {
    const date = new Date(entry.modifiedAt).toLocaleString();
    if (!window.confirm(t("set.backup.confirmLocal", { date }))) return;
    setRestoring(true);
    try {
      await postJson("/api/backup/restore", { file: entry.file });
      toast(t("set.backup.done"));
      reload();
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setRestoring(false);
    }
  };

  const backups = data?.backups ?? [];

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

      <div className="mt-5 border-t border-border/60 pt-5">
        <p className="text-sm font-medium">{t("set.backup.list.title")}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          {t("set.backup.list.hint")}
        </p>
        {data?.dataDir ? (
          <p className="mt-1 break-all text-xs text-muted">
            {t("set.backup.where", { dir: data.dataDir })}
          </p>
        ) : null}

        {backups.length === 0 ? (
          <p className="mt-3 text-xs text-muted">{t("set.backup.list.empty")}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {backups.map((entry) => (
              <li
                key={entry.file}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
              >
                <span className="text-xs">
                  {new Date(entry.modifiedAt).toLocaleString()}
                  <span className="ml-2 text-muted">
                    {entry.transactions === null
                      ? t("set.backup.list.unreadable")
                      : t("set.backup.list.txCount", { n: entry.transactions })}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  onClick={() => restoreLocal(entry)}
                  disabled={restoring || entry.transactions === null}
                >
                  {t("set.backup.list.restore")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
