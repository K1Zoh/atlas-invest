"use client";

import { Loader2, TrendingDown, TrendingUp, X } from "lucide-react";
import { useEffect } from "react";
import { fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

// ── Card ────────────────────────────────────────────────────────────────────

export function Card({
  className,
  children,
  hover = false,
  id,
}: {
  className?: string;
  children: React.ReactNode;
  hover?: boolean;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "rounded-2xl border border-border bg-surface/80 backdrop-blur-sm",
        hover &&
          "transition-all duration-200 hover:border-accent/35 hover:shadow-[0_0_24px_-8px_var(--glow)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-0 pt-4">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

// ── Buttons ─────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "ghost" | "outline" | "danger";

export function Button({
  variant = "primary",
  className,
  loading,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "bg-accent text-white shadow-[0_0_18px_-6px_var(--glow)] hover:brightness-110 dark:text-[#06251b]",
        variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-foreground",
        variant === "outline" &&
          "border border-border bg-transparent text-foreground hover:border-accent/50 hover:text-accent",
        variant === "danger" && "bg-danger-soft text-danger hover:bg-danger hover:text-white",
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

// ── Inputs ──────────────────────────────────────────────────────────────────

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm text-foreground placeholder:text-muted/70",
        "transition-colors duration-200 focus:border-accent focus:outline-none",
        className,
      )}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full cursor-pointer rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm text-foreground",
        "transition-colors duration-200 focus:border-accent focus:outline-none",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

// ── Badges ──────────────────────────────────────────────────────────────────

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "danger" | "warning" | "cyan";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "bg-surface-2 text-muted",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "cyan" && "bg-accent-2/10 text-accent-2",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Signed percentage pill with trend arrow — the finance staple. */
export function PctBadge({ value, className }: { value: number | null; className?: string }) {
  if (value === null || Number.isNaN(value)) {
    return <span className={cn("text-xs text-muted", className)}>—</span>;
  }
  const up = value >= 0;
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        up ? "bg-accent-soft text-accent" : "bg-danger-soft text-danger",
        className,
      )}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {fmtPct(value)}
    </span>
  );
}

// ── Skeleton & empty states ─────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function EmptyState({
  icon,
  title,
  body,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="fade-up flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      {icon ? <div className="text-muted/60">{icon}</div> : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {body ? <p className="max-w-md text-sm text-muted">{body}</p> : null}
      {children ? <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}

// ── Dialog ──────────────────────────────────────────────────────────────────

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "fade-up w-full rounded-2xl border border-border bg-surface shadow-2xl",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        {title ? (
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="cursor-pointer rounded-lg p-1 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Segmented control (tabs) ────────────────────────────────────────────────

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-xl border border-border bg-surface-2/50 p-0.5",
        className,
      )}
      role="tablist"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "cursor-pointer rounded-[10px] px-3 py-1.5 text-xs font-medium transition-all duration-200",
            value === o.value
              ? "bg-surface text-accent shadow-sm"
              : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-accent", className)} />;
}
