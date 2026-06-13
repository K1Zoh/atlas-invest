"use client";

import { ArrowLeft, Bitcoin, CandlestickChart, Eye, Repeat, Search, Star, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePortfolio } from "@/components/portfolio-context";
import { useRefresh, useToast } from "@/components/providers";
import { Badge, Button, Dialog, Field, Input, Segmented, Spinner } from "@/components/ui";
import { fmtEur, todayIso } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { AssetClass, HistoryPoint, Quote, SearchResult, WatchlistItem } from "@/lib/types";
import { postJson } from "@/lib/use-api";
import { cn } from "@/lib/utils";

interface DcaPlan {
  id: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  coingeckoId: string | null;
  amount: number;
}

const PLATFORMS = [
  "",
  "Trade Republic",
  "Boursorama",
  "Degiro",
  "Revolut",
  "Binance",
  "Coinbase",
  "Kraken",
  "Ledger",
  "Autre",
];

const LAST_PLATFORM_KEY = "atlas.lastPlatform";

const num = (v: string) => parseFloat(v.replace(",", "."));
const trimQty = (v: number) => String(Math.round(v * 1e8) / 1e8);
const trimEur = (v: number) => String(Math.round(v * 100) / 100);

/** Dispatch this event from anywhere to open the palette. */
export function openQuickAdd(preset?: SearchResult) {
  window.dispatchEvent(new CustomEvent("atlas:quick-add", { detail: preset ?? null }));
}

export function QuickAdd() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { refresh } = useRefresh();
  const { data: portfolio } = usePortfolio();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [dcaPlans, setDcaPlans] = useState<DcaPlan[]>([]);
  const [savingDca, setSavingDca] = useState(false);

  // Form state
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [priceBadge, setPriceBadge] = useState<"live" | "historical" | null>(null);
  const [date, setDate] = useState(todayIso());
  const [fees, setFees] = useState("0");
  const [platform, setPlatform] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [watchSaving, setWatchSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const reset = useCallback(() => {
    setQuery("");
    setResults([]);
    setSelected(null);
    setSide("buy");
    setQuantity("");
    setAmount("");
    setPrice("");
    setPriceBadge(null);
    setDate(todayIso());
    setFees("0");
    setNote("");
    setHighlight(0);
    setPlatform(window.localStorage.getItem(LAST_PLATFORM_KEY) ?? "");
  }, []);

  // Global shortcuts: ⌘K / Ctrl+K and the custom open event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = (e: Event) => {
      const preset = (e as CustomEvent<SearchResult | null>).detail;
      reset();
      setOpen(true);
      if (preset) setSelected(preset);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("atlas:quick-add", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("atlas:quick-add", onOpen);
    };
  }, [reset]);

  useEffect(() => {
    if (open && !selected) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open, selected]);

  // Load the watchlist + DCA plans once per opening, for instant suggestions.
  useEffect(() => {
    if (!open) return;
    fetch("/api/watchlist", { cache: "no-store" })
      .then(async (res) => (await res.json()) as { items?: WatchlistItem[] })
      .then((body) => setWatchlist(body.items ?? []))
      .catch(() => undefined);
    fetch("/api/dca", { cache: "no-store" })
      .then(async (res) => (await res.json()) as { plans?: DcaPlan[] })
      .then((body) => setDcaPlans(body.plans ?? []))
      .catch(() => undefined);
  }, [open]);

  const pickDca = (plan: DcaPlan) => {
    setAmount(String(plan.amount));
    setSide("buy");
    setSelected({
      ticker: plan.ticker,
      name: plan.name,
      assetClass: plan.assetClass,
      exchange: null,
      coingeckoId: plan.coingeckoId,
    });
  };

  const saveDca = async () => {
    if (!selected) return;
    const a = num(amount);
    if (!Number.isFinite(a) || a <= 0) {
      toast(t("common.error"), "error");
      return;
    }
    setSavingDca(true);
    try {
      const body = await postJson<{ plans: DcaPlan[] }>("/api/dca", {
        ticker: selected.ticker,
        name: selected.name,
        assetClass: selected.assetClass,
        coingeckoId: selected.coingeckoId,
        amount: a,
      });
      setDcaPlans(body.plans);
      toast(t("qa.dcaSaved"));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSavingDca(false);
    }
  };

  const removeDca = async (id: string) => {
    try {
      await fetch(`/api/dca?id=${id}`, { method: "DELETE" });
      setDcaPlans((p) => p.filter((x) => x.id !== id));
      toast(t("qa.dcaRemoved"), "info");
    } catch {
      // ignore
    }
  };

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const body = (await res.json()) as { results?: SearchResult[] };
        setResults(body.results ?? []);
        setHighlight(0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Price prefill: live quote for today, daily close for a past date.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setPriceBadge(null);

    const apply = (value: number, badge: "live" | "historical") => {
      if (cancelled) return;
      const p = Math.round(value * 1e6) / 1e6;
      setPrice(String(p));
      setPriceBadge(badge);
      // keep the linked fields coherent
      setQuantity((q) => {
        const qn = num(q);
        if (Number.isFinite(qn) && qn > 0) {
          setAmount(trimEur(qn * p));
          return q;
        }
        const an = num(amount);
        if (Number.isFinite(an) && an > 0 && p > 0) return trimQty(an / p);
        return q;
      });
    };

    const params = new URLSearchParams({ ticker: selected.ticker, class: selected.assetClass });
    if (selected.coingeckoId) params.set("cgId", selected.coingeckoId);

    if (date === todayIso()) {
      fetch(`/api/quote?${params}`)
        .then(async (res) => (await res.json()) as { quote: Quote | null })
        .then((body) => body.quote && apply(body.quote.priceEur, "live"))
        .catch(() => undefined);
    } else {
      const days = Math.min(
        1825,
        Math.max(8, Math.ceil((Date.now() - new Date(date).getTime()) / 86_400_000) + 8),
      );
      params.set("days", String(days));
      fetch(`/api/history?${params}`)
        .then(async (res) => (await res.json()) as { points?: HistoryPoint[] })
        .then((body) => {
          const points = body.points ?? [];
          let close: number | null = null;
          for (const pt of points) {
            if (pt.date > date) break;
            close = pt.value;
          }
          if (close !== null) apply(close, "historical");
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, date]);

  // Linked quantity <-> amount editing
  const onQuantityChange = (v: string) => {
    setQuantity(v);
    const q = num(v);
    const p = num(price);
    if (Number.isFinite(q) && q > 0 && Number.isFinite(p) && p > 0) setAmount(trimEur(q * p));
  };
  const onAmountChange = (v: string) => {
    setAmount(v);
    const a = num(v);
    const p = num(price);
    if (Number.isFinite(a) && a > 0 && Number.isFinite(p) && p > 0) setQuantity(trimQty(a / p));
  };
  const onPriceChange = (v: string) => {
    setPrice(v);
    setPriceBadge(null);
    const p = num(v);
    const q = num(quantity);
    const a = num(amount);
    if (Number.isFinite(p) && p > 0) {
      if (Number.isFinite(q) && q > 0) setAmount(trimEur(q * p));
      else if (Number.isFinite(a) && a > 0) setQuantity(trimQty(a / p));
    }
  };

  const grouped = useMemo(
    () => ({
      crypto: results.filter((r) => r.assetClass === "crypto"),
      stock: results.filter((r) => r.assetClass === "stock"),
    }),
    [results],
  );
  const flat = useMemo(() => [...grouped.crypto, ...grouped.stock], [grouped]);

  // Instant suggestions before any search: holdings (DCA) and watchlist.
  const suggestions = useMemo(() => {
    const holdings: SearchResult[] = (portfolio?.views ?? []).slice(0, 8).map((v) => ({
      ticker: v.ticker,
      name: v.name,
      assetClass: v.assetClass,
      exchange: null,
      coingeckoId: v.coingeckoId,
    }));
    const held = new Set(holdings.map((h) => `${h.assetClass}:${h.ticker}`));
    const watched: SearchResult[] = watchlist
      .filter((w) => !held.has(`${w.assetClass}:${w.ticker}`))
      .slice(0, 4)
      .map((w) => ({
        ticker: w.ticker,
        name: w.name,
        assetClass: w.assetClass,
        exchange: null,
        coingeckoId: w.coingeckoId,
      }));
    return { holdings, watched };
  }, [portfolio, watchlist]);

  const submitTx = async () => {
    if (!selected) return;
    const qty = num(quantity);
    const px = num(price);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(px) || px < 0) {
      toast(t("common.error"), "error");
      return;
    }
    setSaving(true);
    try {
      await postJson("/api/transactions", {
        ticker: selected.ticker,
        name: selected.name,
        assetClass: selected.assetClass,
        side,
        quantity: qty,
        price: px,
        fees: num(fees) || 0,
        txDate: date,
        platform: platform || null,
        coingeckoId: selected.coingeckoId,
        note: note.trim() || null,
      });
      if (platform) window.localStorage.setItem(LAST_PLATFORM_KEY, platform);
      toast(t("qa.txAdded"));
      setOpen(false);
      reset();
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const addToWatchlist = async () => {
    if (!selected) return;
    setWatchSaving(true);
    try {
      await postJson("/api/watchlist", {
        ticker: selected.ticker,
        name: selected.name,
        assetClass: selected.assetClass,
        coingeckoId: selected.coingeckoId,
      });
      toast(t("wl.added"));
      setOpen(false);
      reset();
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setWatchSaving(false);
    }
  };

  const resultRow = (r: SearchResult, idx: number) => (
    <button
      key={`${r.assetClass}:${r.ticker}:${r.coingeckoId ?? ""}`}
      onClick={() => setSelected(r)}
      onMouseEnter={() => idx >= 0 && setHighlight(idx)}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
        idx === highlight && idx >= 0 ? "bg-accent-soft" : "hover:bg-surface-2",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          r.assetClass === "crypto" ? "bg-warning-soft text-warning" : "bg-accent-2/10 text-accent-2",
        )}
      >
        {r.assetClass === "crypto" ? <Bitcoin className="h-4 w-4" /> : <CandlestickChart className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{r.name}</span>
        <span className="block text-xs text-muted">
          <span className="font-mono">{r.ticker}</span>
          {r.exchange ? ` · ${r.exchange}` : ""}
        </span>
      </span>
    </button>
  );

  return (
    <Dialog
      open={open}
      onClose={() => {
        setOpen(false);
        reset();
      }}
      title={selected ? `${selected.ticker} · ${selected.name}` : t("qa.title")}
    >
      {!selected ? (
        <div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, flat.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                } else if (e.key === "Enter" && flat[highlight]) {
                  setSelected(flat[highlight]);
                }
              }}
              placeholder={t("qa.placeholder")}
              className="pl-9"
              aria-label={t("common.search")}
            />
          </div>

          <div className="mt-3 max-h-80 overflow-y-auto">
            {searching ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
                <Spinner className="h-4 w-4" /> {t("qa.searching")}
              </div>
            ) : query.trim().length >= 2 ? (
              !flat.length ? (
                <p className="py-8 text-center text-sm text-muted">{t("qa.noResults")}</p>
              ) : (
                (["crypto", "stock"] as const).map((cls) =>
                  grouped[cls].length ? (
                    <div key={cls} className="mb-2">
                      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                        {cls === "crypto" ? t("qa.cryptoSection") : t("qa.stockSection")}
                      </p>
                      {grouped[cls].map((r) => resultRow(r, flat.indexOf(r)))}
                    </div>
                  ) : null,
                )
              )
            ) : (
              <>
                {dcaPlans.length ? (
                  <div className="mb-3">
                    <p className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      <Repeat className="h-3 w-3" /> {t("qa.dca")}
                    </p>
                    <div className="flex flex-wrap gap-1.5 px-2">
                      {dcaPlans.map((plan) => (
                        <span
                          key={plan.id}
                          className="group flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft py-1 pl-2.5 pr-1.5 text-xs text-accent"
                        >
                          <button
                            onClick={() => pickDca(plan)}
                            className="cursor-pointer font-medium"
                          >
                            <span className="font-mono font-semibold">{plan.ticker}</span>{" "}
                            {fmtEur(plan.amount)}
                          </button>
                          <button
                            onClick={() => removeDca(plan.id)}
                            aria-label={t("common.delete")}
                            className="cursor-pointer rounded-full p-0.5 text-accent/60 transition-colors hover:bg-accent/15 hover:text-accent"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {suggestions.holdings.length ? (
                  <div className="mb-2">
                    <p className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      <Wallet className="h-3 w-3" /> {t("qa.myPositions")}
                    </p>
                    {suggestions.holdings.map((r) => resultRow(r, -1))}
                  </div>
                ) : null}
                {suggestions.watched.length ? (
                  <div className="mb-2">
                    <p className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      <Star className="h-3 w-3" /> {t("qa.fromWatchlist")}
                    </p>
                    {suggestions.watched.map((r) => resultRow(r, -1))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="fade-up">
          <button
            onClick={() => {
              setSelected(null);
              setPriceBadge(null);
            }}
            className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t("common.search")}
          </button>

          <div className="mb-4 flex items-center justify-between">
            <Segmented
              options={[
                { value: "buy", label: t("common.buy") },
                { value: "sell", label: t("common.sell") },
              ]}
              value={side}
              onChange={setSide}
            />
            {priceBadge ? (
              <Badge tone={priceBadge === "live" ? "accent" : "cyan"}>
                {priceBadge === "live" ? t("qa.priceLoaded") : t("qa.priceHistorical")}
              </Badge>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("qa.amount")}>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                placeholder="100"
                autoFocus
              />
            </Field>
            <Field label={t("common.quantity")}>
              <Input
                inputMode="decimal"
                value={quantity}
                onChange={(e) => onQuantityChange(e.target.value)}
                placeholder="0.5"
              />
            </Field>
            <Field label={t("common.price")}>
              <Input
                inputMode="decimal"
                value={price}
                onChange={(e) => onPriceChange(e.target.value)}
                placeholder="—"
              />
            </Field>
            <Field label={t("common.date")}>
              <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t("common.fees")}>
              <Input inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} />
            </Field>
            <Field label={`${t("common.platform")} (${t("common.optional")})`}>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full cursor-pointer rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm focus:border-accent focus:outline-none"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p || "—"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`${t("qa.thesis")} (${t("common.optional")})`} className="col-span-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("qa.thesisPlaceholder")}
                rows={2}
                className="w-full resize-none rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm text-foreground placeholder:text-muted/70 transition-colors duration-200 focus:border-accent focus:outline-none"
              />
            </Field>
          </div>

          {quantity && price ? (
            <p className="tnum mt-3 text-right text-sm text-muted">
              {t("common.total")} :{" "}
              <span className="font-semibold text-foreground">
                {fmtEur(
                  (num(quantity) || 0) * (num(price) || 0) +
                    (side === "buy" ? num(fees) || 0 : -(num(fees) || 0)),
                )}
              </span>
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={addToWatchlist} loading={watchSaving}>
                <Eye className="h-4 w-4" /> {t("qa.toWatchlist")}
              </Button>
              {side === "buy" && num(amount) > 0 ? (
                <Button variant="ghost" onClick={saveDca} loading={savingDca} className="px-2.5">
                  <Repeat className="h-4 w-4" /> {t("qa.saveDca")}
                </Button>
              ) : null}
            </div>
            <Button onClick={submitTx} loading={saving}>
              {t("qa.addTx")}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
