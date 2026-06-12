import { getSetting } from "../settings";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiResult {
  model: string;
  text: string;
  error: string | null;
}

export function geminiConfigured(): boolean {
  return !!getSetting("ai.gemini_key");
}

export function groqConfigured(): boolean {
  return !!getSetting("ai.groq_key");
}

// ── Gemini (REST v1beta) ────────────────────────────────────────────────────

export async function callGemini(messages: ChatMessage[]): Promise<AiResult> {
  const key = getSetting("ai.gemini_key");
  const model = getSetting("ai.gemini_model") || "gemini-2.5-flash";
  const label = `Gemini (${model})`;
  if (!key) return { model: label, text: "", error: "Clé Gemini non configurée" };

  const system = messages.find((m) => m.role === "system")?.content;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents,
          generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(120_000),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      return { model: label, text: "", error: `Gemini ${res.status} : ${body.slice(0, 300)}` };
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) return { model: label, text: "", error: "Réponse vide de Gemini" };
    return { model: label, text, error: null };
  } catch (e) {
    return { model: label, text: "", error: e instanceof Error ? e.message : String(e) };
  }
}

export async function streamGemini(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>> {
  const key = getSetting("ai.gemini_key");
  const model = getSetting("ai.gemini_model") || "gemini-2.5-flash";
  if (!key) throw new Error("Clé Gemini non configurée");

  const system = messages.find((m) => m.role === "system")?.content;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
      }),
    },
  );
  if (!res.ok || !res.body) {
    throw new Error(`Gemini ${res.status} : ${(await res.text()).slice(0, 200)}`);
  }
  return sseToTextStream(res.body, (json) => {
    const data = json as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  });
}

// ── Groq (OpenAI-compatible) ────────────────────────────────────────────────

export async function callGroq(messages: ChatMessage[]): Promise<AiResult> {
  const key = getSetting("ai.groq_key");
  const model = getSetting("ai.groq_model") || "llama-3.3-70b-versatile";
  const label = `Groq (${model})`;
  if (!key) return { model: label, text: "", error: "Clé Groq non configurée" };

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 8000 }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const body = await res.text();
      return { model: label, text: "", error: `Groq ${res.status} : ${body.slice(0, 300)}` };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) return { model: label, text: "", error: "Réponse vide de Groq" };
    return { model: label, text, error: null };
  } catch (e) {
    return { model: label, text: "", error: e instanceof Error ? e.message : String(e) };
  }
}

export async function streamGroq(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>> {
  const key = getSetting("ai.groq_key");
  const model = getSetting("ai.groq_model") || "llama-3.3-70b-versatile";
  if (!key) throw new Error("Clé Groq non configurée");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature: 0.5, max_tokens: 4096, stream: true }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Groq ${res.status} : ${(await res.text()).slice(0, 200)}`);
  }
  return sseToTextStream(res.body, (json) => {
    const data = json as { choices?: { delta?: { content?: string } }[] };
    return data.choices?.[0]?.delta?.content ?? "";
  });
}

/** Run both models in parallel (like the legacy dual-model analysis). */
export async function runDualAnalysis(messages: ChatMessage[]): Promise<AiResult[]> {
  const [gemini, groq] = await Promise.all([callGemini(messages), callGroq(messages)]);
  return [gemini, groq];
}

// ── SSE helper ──────────────────────────────────────────────────────────────

function sseToTextStream(
  body: ReadableStream<Uint8Array>,
  extract: (json: unknown) => string,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const reader = body.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const text = extract(JSON.parse(payload));
          if (text) controller.enqueue(encoder.encode(text));
        } catch {
          // ignore malformed SSE chunks
        }
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });
}
