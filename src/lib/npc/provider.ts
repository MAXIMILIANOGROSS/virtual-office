/** Proveedor de LLM intercambiable. Configuración solo por variables de entorno (nunca en el cliente).
 *  LLM_PROVIDER = auto (por defecto: gratuitos con clave, luego anthropic) | free | groq | gemini | openrouter | anthropic | openai | ollama
 *  anthropic: ANTHROPIC_API_KEY, NPC_MODEL (def. claude-haiku-4-5), NPC_MODEL_DEEP (opcional, charlas profundas)
 *  openai/openrouter/ollama: LLM_API_KEY, LLM_BASE_URL, LLM_MODEL */
export type LlmMsg = { role: "user" | "assistant"; content: string };
export type LlmOpts = { deep?: boolean; maxTokens?: number; signal?: AbortSignal; json?: boolean };
export interface LLMProvider { name: string; complete(system: string, messages: LlmMsg[], opts?: LlmOpts): Promise<string>; }

const anthropic = (env: Record<string, string | undefined>): LLMProvider | null => {
  const key = env.ANTHROPIC_API_KEY; if (!key) return null;
  return { name: "anthropic", async complete(system, messages, o = {}) {
    const model = (o.deep && env.NPC_MODEL_DEEP) || env.NPC_MODEL || env.CHAT_MODEL || "claude-haiku-4-5";
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: o.signal, headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model, max_tokens: o.maxTokens ?? 350, temperature: 0.9, system, messages }) });
    if (!r.ok) { let t = ""; try { t = (await r.text()).replace(/\s+/g, " ").slice(0, 110); } catch { /* */ } throw new Error(`anthropic ${r.status} [${model}] ${t}`); } const d = await r.json(); return (d.content || []).map((c: { text?: string }) => c.text || "").join("").trim();
  } };
};
const openaiCompat = (env: Record<string, string | undefined>, name: string): LLMProvider | null => {
  const base = env.LLM_BASE_URL || (name === "openrouter" ? "https://openrouter.ai/api/v1" : name === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1"); const key = env.LLM_API_KEY; const model = env.LLM_MODEL; if (!model || (!key && name !== "ollama")) return null;
  return { name, async complete(system, messages, o = {}) {
    const r = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, { method: "POST", signal: o.signal, headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify({ model, max_tokens: o.maxTokens ?? 350, temperature: 0.9, ...(/gpt-oss/.test(model) ? { reasoning_effort: "low" } : {}), ...(o.json && name !== "openrouter" ? { response_format: { type: "json_object" } } : {}), messages: [{ role: "system", content: system }, ...messages] }) });
    if (!r.ok) { let t = ""; try { t = (await r.text()).replace(/\s+/g, " ").slice(0, 110); } catch { /* */ } throw new Error(`${name} ${r.status} [${model}] ${t}`); } const d = await r.json(); return String(d.choices?.[0]?.message?.content || "").trim();
  } };
};
const FREE: Record<string, { base: string; model: string; keyVar: string; modelVar: string }> = {
  groq: { base: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", keyVar: "GROQ_API_KEY", modelVar: "GROQ_MODEL" },
  gemini: { base: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-flash-latest", keyVar: "GEMINI_API_KEY", modelVar: "GEMINI_MODEL" },
  openrouter: { base: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free", keyVar: "OPENROUTER_API_KEY", modelVar: "OPENROUTER_MODEL" },
};
/** Proveedores GRATUITOS (sin tarjeta): se activan solo con su clave. Si hay varios, se prueban en cadena (Groq → Gemini → OpenRouter) y si uno falla o se queda sin cupo pasa al siguiente. */
/** Gemini: si el modelo elegido está retirado o falla, se prueba el siguiente (gemini-2.0-flash se retiró el 1-jun-2026). GEMINI_MODEL manda sobre la lista. */
/** Groq retiró llama-3.3-70b-versatile; estos son los de chat que existen hoy en la cuenta (oct-2026). */
const GROQ_FALLBACKS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];
const GEMINI_FALLBACKS = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const freeOne = (env: Record<string, string | undefined>, k: string): LLMProvider | null => {
  if (k === "groq" && env.GROQ_API_KEY) { const models = [...new Set([env.GROQ_MODEL, ...GROQ_FALLBACKS].filter(Boolean) as string[])]; const list = models.map((m) => freeOneModel({ ...env, GROQ_MODEL: m }, k)).filter(Boolean) as LLMProvider[]; const ch = chain(list); return ch ? { ...ch, name: "groq" } : null; }
  if (k === "gemini" && env.GEMINI_API_KEY) { const models = [...new Set([env.GEMINI_MODEL, ...GEMINI_FALLBACKS].filter(Boolean) as string[])]; const list = models.map((m) => freeOneModel({ ...env, GEMINI_MODEL: m }, k)).filter(Boolean) as LLMProvider[]; const ch = chain(list); return ch ? { ...ch, name: "gemini" } : null; }
  return freeOneModel(env, k);
};
const freeOneModel = (env: Record<string, string | undefined>, k: string): LLMProvider | null => {
  const c = FREE[k]; const key = env[c.keyVar]; if (!key) return null;
  return openaiCompat({ ...env, LLM_BASE_URL: c.base, LLM_API_KEY: key, LLM_MODEL: env[c.modelVar] || c.model }, k);
};
const chain = (list: LLMProvider[]): LLMProvider | null => list.length === 0 ? null : list.length === 1 ? list[0] : { name: list.map((x) => x.name).join(">"), async complete(system, messages, o) { const errs: string[] = []; for (const pr of list) { try { return await pr.complete(system, messages, o); } catch (e) { errs.push(String(e instanceof Error ? e.message : e).slice(0, 150)); } } throw new Error(errs.join(" | ")); } };
/** Devuelve el proveedor configurado o null (el juego usa entonces respuestas de respaldo, sin errores).
 *  Sin LLM_PROVIDER: usa los gratuitos que tengan clave (GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY) y, al final, Anthropic si hay clave. */
export function getProvider(env: Record<string, string | undefined> = process.env): LLMProvider | null {
  const kind = (env.LLM_PROVIDER || "auto").toLowerCase();
  if (kind === "auto" || kind === "free") { const l = [freeOne(env, "groq"), freeOne(env, "gemini"), freeOne(env, "openrouter"), kind === "auto" ? anthropic(env) : null].filter(Boolean) as LLMProvider[]; return chain(l); }
  if (FREE[kind]) return freeOne(env, kind); if (kind === "anthropic") return anthropic(env); if (["openai", "ollama"].includes(kind)) return openaiCompat(env, kind); return null;
}
