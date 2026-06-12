"use client";

import { ThemeProvider } from "next-themes";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { setDisplayCurrency, type DisplayCurrency } from "@/lib/format";
import { I18nProvider } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ── Refresh bus: bump a version to make every data hook refetch ────────────

interface RefreshContextValue {
  version: number;
  /** When true, the next /api/portfolio call bypasses the price cache. */
  force: boolean;
  refresh: (force?: boolean) => void;
}

const RefreshContext = createContext<RefreshContextValue>({
  version: 0,
  force: false,
  refresh: () => undefined,
});

export function useRefresh() {
  return useContext(RefreshContext);
}

// ── Display currency ────────────────────────────────────────────────────────

interface CurrencyContextValue {
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "EUR",
  setCurrency: () => undefined,
});

export function useCurrency() {
  return useContext(CurrencyContext);
}

const CURRENCY_KEY = "atlas.currency";

// ── Toasts ──────────────────────────────────────────────────────────────────

export interface Toast {
  id: number;
  message: string;
  kind: "success" | "error" | "info";
}

const ToastContext = createContext<{ toast: (message: string, kind?: Toast["kind"]) => void }>({
  toast: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}

function ToastViewport({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "fade-up pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur",
            t.kind === "success" && "border-accent/40 bg-accent-soft text-accent",
            t.kind === "error" && "border-danger/40 bg-danger-soft text-danger",
            t.kind === "info" && "border-border bg-surface text-foreground",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  const [force, setForce] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  // Display currency: amounts stay EUR internally, formatting converts.
  // Changing the key below remounts the app subtree so every formatted
  // amount re-renders with the new rate.
  const [currency, setCurrencyState] = useState<DisplayCurrency>("EUR");
  const [currencyEpoch, setCurrencyEpoch] = useState(0);

  const applyCurrency = useCallback(async (c: DisplayCurrency) => {
    try {
      let rate = 1;
      if (c !== "EUR") {
        const res = await fetch(`/api/fx?to=${c}`, { cache: "no-store" });
        const body = (await res.json()) as { rate?: number; error?: string };
        if (!res.ok || !body.rate) throw new Error(body.error ?? "FX indisponible");
        rate = body.rate;
      }
      setDisplayCurrency(c, rate);
      setCurrencyState(c);
      setCurrencyEpoch((e) => e + 1);
      window.localStorage.setItem(CURRENCY_KEY, c);
    } catch {
      // keep the previous currency on failure
    }
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(CURRENCY_KEY) as DisplayCurrency | null;
    if (stored && stored !== "EUR" && ["USD", "GBP", "CHF"].includes(stored)) {
      void applyCurrency(stored);
    }
  }, [applyCurrency]);

  const refresh = useCallback((forceArg = false) => {
    setForce(forceArg);
    setVersion((v) => v + 1);
  }, []);

  const toast = useCallback((message: string, kind: Toast["kind"] = "success") => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, message, kind }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);

  const refreshValue = useMemo(() => ({ version, force, refresh }), [version, force, refresh]);
  const toastValue = useMemo(() => ({ toast }), [toast]);
  const currencyValue = useMemo(
    () => ({ currency, setCurrency: (c: DisplayCurrency) => void applyCurrency(c) }),
    [currency, applyCurrency],
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <I18nProvider>
        <CurrencyContext.Provider value={currencyValue}>
          <RefreshContext.Provider value={refreshValue}>
            <ToastContext.Provider value={toastValue}>
              <div key={currencyEpoch} className="contents">
                {children}
              </div>
              <ToastViewport toasts={toasts} />
            </ToastContext.Provider>
          </RefreshContext.Provider>
        </CurrencyContext.Provider>
      </I18nProvider>
    </ThemeProvider>
  );
}
