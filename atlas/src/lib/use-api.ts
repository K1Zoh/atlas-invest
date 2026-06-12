"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRefresh } from "@/components/providers";

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Fetch a JSON API route. Refetches automatically when the global refresh
 * bus fires (topbar refresh button, mutations).
 */
export function useApi<T>(url: string | null): ApiState<T> {
  const { version } = useRefresh();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const [localVersion, setLocalVersion] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(() => setLocalVersion((v) => v + 1), []);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as T & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setData(body);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, version, localVersion]);

  return { data, loading, error, reload };
}

export async function postJson<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}
