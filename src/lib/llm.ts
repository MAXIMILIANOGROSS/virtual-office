import { getProvider } from "./npc/provider.ts";
/** Proveedor de IA del SERVIDOR, intercambiable por variables de entorno (sin tocar código):
 *  1) Cualquier API compatible con OpenAI (Groq, OpenRouter, Google AI Studio, Cerebras…): LLM_BASE_URL + LLM_API_KEY + LLM_MODEL.
 *  2) Anthropic: ANTHROPIC_API_KEY (+ CHAT_MODEL opcional).
 *  Si no hay ninguno, devuelve null y la web usa el modo guiado o la IA del dispositivo. No se guarda ni se registra el contenido. */
export type Msg = { role: "user" | "assistant"; content: string };
export type Provider = "chain" | "openai" | "anthropic" | null;
export function llmProvider(): Provider {
  if (getProvider()) return "chain";
  if (process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}
export async function callLLM(system: string, messages: Msg[], maxTokens: number): Promise<string | null> {
  const p = llmProvider(); if (!p) return null;
  if (p === "chain") { try { const t = await getProvider()!.complete(system, messages, { maxTokens }); if (t) return t; } catch { /* pasa al proveedor clásico */ } if (!(process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL) && !process.env.ANTHROPIC_API_KEY) return null; }
  try {
    if (p === "chain" || p === "openai") {
      if (!(process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL)) throw new Error("sin openai");
      const base = String(process.env.LLM_BASE_URL).replace(/\/+$/, "");
      const res = await fetch(`${base}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.LLM_API_KEY}` },
        body: JSON.stringify({ model: process.env.LLM_MODEL, max_tokens: maxTokens, temperature: 0.7, messages: [{ role: "system", content: system }, ...messages] }) });
      if (!res.ok) return null; const d = await res.json(); const t = String(d?.choices?.[0]?.message?.content || "").trim(); return t || null;
    }
    if (!process.env.ANTHROPIC_API_KEY) return null;
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": String(process.env.ANTHROPIC_API_KEY), "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.COUNCIL_MODEL || process.env.CHAT_MODEL || "claude-haiku-4-5", max_tokens: maxTokens, system, messages }) });
    if (!res.ok) return null; const d = await res.json(); const t = (d.content || []).map((c: { text?: string }) => c.text || "").join("").trim(); return t || null;
  } catch { return null; }
}
