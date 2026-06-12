"use client";

import {
  ArrowLeftRight,
  Eye,
  Landmark,
  LayoutDashboard,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Sun,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { usePortfolio } from "@/components/portfolio-context";
import { useCurrency, useRefresh } from "@/components/providers";
import { openQuickAdd, QuickAdd } from "@/components/quick-add";
import { PctBadge, Skeleton } from "@/components/ui";
import { DISPLAY_CURRENCIES, fmtEur, type DisplayCurrency } from "@/lib/format";
import { useI18n, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const NAV: { href: string; key: TKey; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: "/", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/portefeuille", key: "nav.portfolio", icon: Wallet },
  { href: "/transactions", key: "nav.transactions", icon: ArrowLeftRight },
  { href: "/watchlist", key: "nav.watchlist", icon: Eye },
  { href: "/ia", key: "nav.ai", icon: Sparkles },
  { href: "/fiscal", key: "nav.tax", icon: Landmark },
  { href: "/parametres", key: "nav.settings", icon: Settings },
];

function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-surface/60 backdrop-blur-xl lg:flex">
      <Link href="/" className="flex items-center gap-2.5 px-5 pb-2 pt-5">
        <Image
          src="/logo.png"
          alt="Logo Atlas"
          width={38}
          height={38}
          priority
          className="h-[38px] w-[38px] rounded-xl shadow-[0_0_18px_-4px_var(--glow)]"
        />
        <span>
          <span className="block text-sm font-bold tracking-[0.18em]">ATLAS</span>
          <span className="block text-[10px] text-muted">Invest. Suis. Décide.</span>
        </span>
      </Link>

      <nav className="mt-4 flex flex-1 flex-col gap-1 px-3" aria-label="Navigation">
        {NAV.map(({ href, key, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                active
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {active ? (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
              ) : null}
              <Icon className="h-4 w-4 shrink-0" />
              {t(key)}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 pb-4 text-[10px] leading-relaxed text-muted/70">
        <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>{" "}
        {t("qa.hint.kbd")}
      </div>
    </aside>
  );
}

function MobileNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-surface/90 px-2 py-1.5 backdrop-blur-xl lg:hidden"
      aria-label="Navigation mobile"
    >
      {NAV.map(({ href, key, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={t(key)}
            className={cn(
              "flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-[9px] transition-colors",
              active ? "text-accent" : "text-muted",
            )}
          >
            <Icon className="h-5 w-5" />
            {t(key).split(" ")[0]}
          </Link>
        );
      })}
    </nav>
  );
}

function CurrencySelect() {
  const { t } = useI18n();
  const { currency, setCurrency } = useCurrency();
  return (
    <select
      value={currency}
      onChange={(e) => setCurrency(e.target.value as DisplayCurrency)}
      aria-label={t("topbar.currency")}
      title={t("topbar.fxHint")}
      className="tnum h-9 cursor-pointer rounded-xl border border-border bg-transparent px-2 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:text-foreground focus:border-accent focus:outline-none"
    >
      {DISPLAY_CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-9" />;
  const dark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Mode clair" : "Mode sombre"}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-border text-muted transition-colors hover:border-accent/40 hover:text-accent"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function Topbar() {
  const { t } = useI18n();
  const { data, loading } = usePortfolio();
  const { refresh } = useRefresh();
  const [spinning, setSpinning] = useState(false);

  const doRefresh = () => {
    setSpinning(true);
    refresh(true);
    setTimeout(() => setSpinning(false), 1200);
  };

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/75 px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="live-dot hidden h-2 w-2 shrink-0 rounded-full bg-accent sm:block" aria-hidden />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted">{t("topbar.wealth")}</p>
          {loading && !data ? (
            <Skeleton className="mt-1 h-6 w-32" />
          ) : (
            <div className="flex items-baseline gap-2.5">
              <AnimatedNumber
                value={data?.summary.totalValue ?? 0}
                format={fmtEur}
                className="text-lg font-bold leading-tight"
              />
              <PctBadge value={data?.summary.dayChangePct ?? null} />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => openQuickAdd()}
          className="hidden cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:border-accent/40 hover:text-foreground md:flex"
        >
          <Search className="h-4 w-4" />
          <span className="max-w-36 truncate">{t("topbar.searchHint")}</span>
          <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </button>
        <button
          onClick={doRefresh}
          aria-label={t("common.refresh")}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-border text-muted transition-colors hover:border-accent/40 hover:text-accent"
        >
          <RefreshCw className={cn("h-4 w-4", spinning && "animate-spin")} />
        </button>
        <CurrencySelect />
        <ThemeToggle />
        <button
          onClick={() => openQuickAdd()}
          className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-[0_0_18px_-6px_var(--glow)] transition-all hover:brightness-110 dark:text-[#06251b]"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t("common.add")}</span>
        </button>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="ambient" aria-hidden />
      <Sidebar />
      <MobileNav />
      <div className="lg:pl-56">
        <Topbar />
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:pb-10">{children}</main>
      </div>
      <QuickAdd />
    </>
  );
}
