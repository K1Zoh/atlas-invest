"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRefresh, useToast } from "@/components/providers";
import { useI18n } from "@/lib/i18n";
import type {
  AllocationSlice,
  ConcentrationAlert,
  PortfolioSummary,
  PositionView,
} from "@/lib/types";

export interface PortfolioPayload {
  views: PositionView[];
  summary: PortfolioSummary;
  hhi: number;
  concentration: ConcentrationAlert[];
  allocations: {
    byClass: AllocationSlice[];
    byCategory: AllocationSlice[];
    byAsset: AllocationSlice[];
  };
  triggeredAlerts: { ticker: string; kind: string; threshold: number; currentPrice: number }[];
  errors: string[];
  updatedAt: string;
}

interface PortfolioContextValue {
  data: PortfolioPayload | null;
  loading: boolean;
  error: string | null;
}

const PortfolioContext = createContext<PortfolioContextValue>({
  data: null,
  loading: true,
  error: null,
});

export function usePortfolio() {
  return useContext(PortfolioContext);
}

/**
 * Single fetcher for /api/portfolio shared by the topbar and every page —
 * avoids duplicate upstream market calls on first load.
 */
export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const { version, force } = useRefresh();
  const { toast } = useToast();
  const { t } = useI18n();
  const [data, setData] = useState<PortfolioPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    fetch(`/api/portfolio${force ? "?force=1" : ""}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        const body = (await res.json()) as PortfolioPayload & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setData(body);
        if (force) toast(t("topbar.updated"), "info");
        for (const a of body.triggeredAlerts ?? []) {
          toast(`🔔 ${a.ticker} — ${a.currentPrice.toLocaleString("fr-FR")} €`, "info");
        }
        for (const e of body.errors ?? []) {
          toast(e, "error");
        }
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const value = useMemo(() => ({ data, loading, error }), [data, loading, error]);
  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}
