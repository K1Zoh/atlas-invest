"use client";

import { Bot, Database, FileUp, Plus, Sparkles } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { openQuickAdd } from "@/components/quick-add";
import { Button, Card } from "@/components/ui";
import { useI18n, type TKey } from "@/lib/i18n";

/**
 * First-run experience: a guided 3-step start instead of a bare empty state.
 * Shown on the dashboard when the portfolio has no positions.
 */
export function Onboarding({
  legacyAvailable,
  migrating,
  onMigrate,
}: {
  legacyAvailable: boolean;
  migrating: boolean;
  onMigrate: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();

  const steps: { icon: React.ReactNode; title: TKey; body: TKey }[] = [
    { icon: <Plus className="h-4 w-4" />, title: "dash.empty.step1.title", body: "dash.empty.step1.body" },
    { icon: <FileUp className="h-4 w-4" />, title: "dash.empty.step2.title", body: "dash.empty.step2.body" },
    { icon: <Bot className="h-4 w-4" />, title: "dash.empty.step3.title", body: "dash.empty.step3.body" },
  ];

  return (
    <div className="fade-up mx-auto flex max-w-3xl flex-col items-center gap-6 py-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <Image
          src="/logo.png"
          alt="Atlas"
          width={56}
          height={56}
          priority
          className="rounded-2xl shadow-[0_0_28px_-6px_var(--glow)]"
        />
        <div>
          <h1 className="flex items-center justify-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="h-5 w-5 text-accent" /> {t("dash.empty.welcome")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("dash.empty.lead")}</p>
        </div>
      </div>

      <div className="grid w-full gap-3 sm:grid-cols-3">
        {steps.map((step, i) => (
          <Card key={i} className="flex flex-col gap-2 p-4 text-left" hover>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
                {step.icon}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {i + 1}
              </span>
            </div>
            <p className="text-sm font-semibold">{t(step.title)}</p>
            <p className="text-xs leading-relaxed text-muted">{t(step.body)}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => openQuickAdd()}>
          <Plus className="h-4 w-4" /> {t("dash.empty.add")}
        </Button>
        <Button variant="outline" onClick={() => router.push("/parametres#import")}>
          <FileUp className="h-4 w-4" /> {t("dash.empty.import")}
        </Button>
        {legacyAvailable ? (
          <Button variant="outline" onClick={onMigrate} loading={migrating}>
            <Database className="h-4 w-4" /> {t("dash.empty.migrate")}
          </Button>
        ) : null}
      </div>

      <p className="text-[11px] text-muted/70">{t("dash.empty.skipHint")}</p>
    </div>
  );
}
