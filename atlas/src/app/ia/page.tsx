"use client";

import { Bot, CheckCircle2, Clock, Send, Sparkles, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { useToast } from "@/components/providers";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Segmented,
  Skeleton,
} from "@/components/ui";
import { fmtDate, fmtEur, fmtPct } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { AiAnalysis, AiRecommendation } from "@/lib/types";
import { postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

type Tab = "analysis" | "chat" | "scoreboard" | "history";

interface AnalysisResult {
  model: string;
  content: string;
  recommendations: AiRecommendation[] | null;
  error: string | null;
}

export default function AiPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("analysis");

  return (
    <div className="flex flex-col gap-5">
      <div className="fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Sparkles className="h-5 w-5 text-accent" /> {t("ai.title")}
          </h1>
          <p className="text-sm text-muted">{t("ai.subtitle")}</p>
        </div>
        <Segmented<Tab>
          options={[
            { value: "analysis", label: t("ai.tab.analysis") },
            { value: "chat", label: t("ai.tab.chat") },
            { value: "scoreboard", label: t("ai.tab.scoreboard") },
            { value: "history", label: t("ai.tab.history") },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "analysis" ? <AnalysisTab /> : null}
      {tab === "chat" ? <ChatTab /> : null}
      {tab === "scoreboard" ? <ScoreboardTab /> : null}
      {tab === "history" ? <HistoryTab /> : null}

      <p className="text-center text-[11px] text-muted/70">{t("ai.disclaimer")}</p>
    </div>
  );
}

// ── Analysis (dual model) ───────────────────────────────────────────────────

const ACTION_TONES: Record<string, "accent" | "danger" | "warning" | "neutral" | "cyan"> = {
  acheter: "accent",
  renforcer: "accent",
  conserver: "neutral",
  alleger: "warning",
  vendre: "danger",
};

function ConvictionDots({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Conviction ${level}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn("h-1.5 w-1.5 rounded-full", i < level ? "bg-accent" : "bg-border")}
        />
      ))}
    </span>
  );
}

function RecommendationChips({ recs }: { recs: AiRecommendation[] }) {
  const { t } = useI18n();
  if (!recs.length) return null;
  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {t("ai.recommendations")}
      </p>
      <div className="flex flex-col gap-1.5">
        {recs.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-14 shrink-0 font-mono font-bold">{r.ticker}</span>
            <Badge tone={ACTION_TONES[r.action] ?? "neutral"}>{r.action}</Badge>
            <ConvictionDots level={r.conviction} />
            <span className="truncate text-muted" title={r.reason}>
              {r.reason}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalysisTab() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<AnalysisResult[] | null>(null);
  const latest = useApi<{ analyses: AiAnalysis[] }>("/api/ai/history?scope=portfolio");

  const run = async () => {
    setRunning(true);
    try {
      const res = await postJson<{ analyses: AnalysisResult[] }>("/api/ai/analyze");
      setResults(res.analyses);
      latest.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setRunning(false);
    }
  };

  // Without a fresh run, show the two most recent saved analyses (one per model).
  const display: AnalysisResult[] =
    results ??
    dedupeByModel(latest.data?.analyses ?? []).map((a) => ({
      model: a.model,
      content: a.content,
      recommendations: a.recommendations,
      error: null,
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="fade-up flex justify-center">
        <Button onClick={run} loading={running} className="px-6 py-2.5">
          <Sparkles className="h-4 w-4" />
          {running ? t("ai.analyzing") : t("ai.analyze")}
        </Button>
      </div>

      {running ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : display.length ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {display.map((r) => (
            <Card key={r.model} className="fade-up p-5" hover>
              <div className="mb-2 flex items-center gap-2">
                <Bot className="h-4 w-4 text-accent-2" />
                <span className="text-sm font-semibold">{r.model}</span>
              </div>
              {r.error ? (
                <p className="text-sm text-danger">{r.error}</p>
              ) : (
                <>
                  <Markdown>{r.content}</Markdown>
                  {r.recommendations ? <RecommendationChips recs={r.recommendations} /> : null}
                </>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title={t("ai.history.none")} body={t("ai.noKeys")} />
      )}
    </div>
  );
}

function dedupeByModel(analyses: AiAnalysis[]): AiAnalysis[] {
  const seen = new Set<string>();
  const out: AiAnalysis[] = [];
  for (const a of analyses) {
    if (seen.has(a.model)) continue;
    seen.add(a.model);
    out.push(a);
    if (out.length === 2) break;
  }
  return out;
}

// ── Chat ────────────────────────────────────────────────────────────────────

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

function ChatTab() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<"gemini" | "groq">("gemini");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || streaming) return;
    setInput("");
    const history: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history, provider }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const current = acc;
        setMessages([...history, { role: "assistant", content: current }]);
      }
      if (!acc) throw new Error("Réponse vide");
    } catch (e) {
      setMessages(history);
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setStreaming(false);
    }
  };

  return (
    <Card className="fade-up flex h-[560px] flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-xs text-muted">{t("ai.model")}</span>
        <Segmented<"gemini" | "groq">
          options={[
            { value: "gemini", label: "Gemini" },
            { value: "groq", label: "Groq" },
          ]}
          value={provider}
          onChange={setProvider}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!messages.length ? (
          <div className="mx-auto max-w-md pt-14 text-center">
            <p className="text-sm leading-relaxed text-muted">{t("ai.chat.empty")}</p>
            <div className="mt-4 flex flex-col items-center gap-2">
              {(["ai.suggest.1", "ai.suggest.2", "ai.suggest.3"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => void send(t(key))}
                  className="cursor-pointer rounded-xl border border-border px-3.5 py-2 text-xs text-foreground/90 transition-colors duration-200 hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                  m.role === "user"
                    ? "self-end bg-accent-soft text-foreground"
                    : "self-start border border-border bg-surface-2/60",
                )}
              >
                {m.role === "assistant" ? (
                  m.content ? (
                    <Markdown>{m.content}</Markdown>
                  ) : (
                    <span className="flex items-center gap-2 text-muted">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                      {t("ai.chat.thinking")}
                    </span>
                  )
                ) : (
                  m.content
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("ai.chat.placeholder")}
          aria-label={t("ai.chat.placeholder")}
          className="flex-1 rounded-xl border border-border bg-surface-2/60 px-3.5 py-2.5 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
        />
        <Button type="submit" loading={streaming} aria-label={t("ai.chat.send")}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}

// ── Scoreboard ──────────────────────────────────────────────────────────────

interface ScoreboardData {
  models: { model: string; evaluated: number; correct: number; hitRate: number | null; pending: number }[];
  calls: {
    model: string;
    ticker: string;
    action: string;
    conviction: number;
    date: string;
    priceAtSuggestion: number;
    priceNow: number | null;
    movePct: number | null;
    verdict: "correct" | "incorrect" | "pending" | null;
  }[];
}

function ScoreboardTab() {
  const { t } = useI18n();
  const { data, loading } = useApi<ScoreboardData>("/api/ai/scoreboard");

  if (loading && !data) return <Skeleton className="h-64" />;
  if (!data?.calls.length) {
    return <EmptyState title={t("ai.scoreboard.title")} body={t("ai.scoreboard.none")} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="fade-up text-sm text-muted">{t("ai.scoreboard.subtitle")}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {data.models.map((m) => (
          <Card key={m.model} className="fade-up p-5" hover>
            <p className="text-sm font-semibold">{m.model}</p>
            <div className="mt-2 flex items-end gap-3">
              <span
                className={cn(
                  "tnum text-3xl font-bold",
                  (m.hitRate ?? 0) >= 50 ? "text-accent" : "text-danger",
                )}
              >
                {m.hitRate !== null ? `${m.hitRate.toFixed(0)} %` : "—"}
              </span>
              <span className="pb-1 text-xs text-muted">
                {t("ai.scoreboard.hitRate")} · {m.evaluated} {t("ai.scoreboard.calls")}
                {m.pending ? ` · ${m.pending} ${t("ai.scoreboard.pending")}` : ""}
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-all duration-700"
                style={{ width: `${m.hitRate ?? 0}%` }}
              />
            </div>
          </Card>
        ))}
      </div>

      <Card className="fade-up overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-5 py-3 font-medium">{t("common.date")}</th>
              <th className="px-3 py-3 font-medium">{t("ai.model")}</th>
              <th className="px-3 py-3 font-medium">{t("common.ticker")}</th>
              <th className="px-3 py-3 font-medium">Action</th>
              <th className="px-3 py-3 text-right font-medium">{t("common.price")}</th>
              <th className="px-3 py-3 text-right font-medium">Δ</th>
              <th className="px-3 py-3 pr-5 text-right font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {data.calls.map((c, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0">
                <td className="tnum px-5 py-2.5 text-xs text-muted">{fmtDate(c.date)}</td>
                <td className="px-3 py-2.5 text-xs">{c.model.split(" ")[0]}</td>
                <td className="px-3 py-2.5 font-mono text-xs font-bold">{c.ticker}</td>
                <td className="px-3 py-2.5">
                  <Badge tone={ACTION_TONES[c.action] ?? "neutral"}>{c.action}</Badge>
                </td>
                <td className="tnum px-3 py-2.5 text-right text-xs">
                  {fmtEur(c.priceAtSuggestion)} → {fmtEur(c.priceNow)}
                </td>
                <td
                  className={cn(
                    "tnum px-3 py-2.5 text-right text-xs font-medium",
                    (c.movePct ?? 0) >= 0 ? "text-accent" : "text-danger",
                  )}
                >
                  {fmtPct(c.movePct)}
                </td>
                <td className="px-3 py-2.5 pr-5 text-right">
                  {c.verdict === "correct" ? (
                    <span className="inline-flex items-center gap-1 text-xs text-accent">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {t("ai.verdict.correct")}
                    </span>
                  ) : c.verdict === "incorrect" ? (
                    <span className="inline-flex items-center gap-1 text-xs text-danger">
                      <XCircle className="h-3.5 w-3.5" /> {t("ai.verdict.incorrect")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <Clock className="h-3.5 w-3.5" /> {t("ai.verdict.pending")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ── History ─────────────────────────────────────────────────────────────────

function HistoryTab() {
  const { t } = useI18n();
  const { data, loading } = useApi<{ analyses: AiAnalysis[] }>("/api/ai/history");
  const [openId, setOpenId] = useState<number | null>(null);

  if (loading && !data) return <Skeleton className="h-64" />;
  if (!data?.analyses.length) return <EmptyState title={t("ai.history.none")} />;

  return (
    <div className="flex flex-col gap-2">
      {data.analyses.map((a) => (
        <Card key={a.id} className="fade-up">
          <button
            onClick={() => setOpenId(openId === a.id ? null : a.id)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-3 text-left"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Badge tone="cyan">{a.model.split(" ")[0]}</Badge>
              <span className="text-xs text-muted">
                {a.scope === "asset" ? `${a.ticker} · ` : ""}
                {fmtDate(a.createdAt)}
              </span>
              <span className="truncate text-xs text-muted/70">
                {a.content.slice(0, 100).replaceAll("#", "").replaceAll("*", "")}…
              </span>
            </div>
            <span className="text-xs text-accent">{openId === a.id ? "−" : "+"}</span>
          </button>
          {openId === a.id ? (
            <div className="border-t border-border/60 px-5 py-4">
              <Markdown>{a.content}</Markdown>
              {a.recommendations ? <RecommendationChips recs={a.recommendations} /> : null}
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
