// Servidor: libro de costes. Los proveedores gratuitos no devuelven tokens, así que se ESTIMAN (≈4 caracteres/token) y se marcan como estimados.
// El coste en euros solo se calcula si existe una tarifa registrada (office_tarifas); sin tarifa queda "sin_tarifa". Nunca se inventan precios.
import type { SupabaseClient } from "@supabase/supabase-js";
export type Tarifa = { proveedor: string; modelo: string; eur_por_1k_entrada: number; eur_por_1k_salida: number; vigente_desde: string };
export const estimarTokens = (chars: number) => Math.max(0, Math.ceil(chars / 4));
export function calcularCoste(tarifas: Tarifa[], proveedor: string, modelo: string, tin: number, tout: number, hoy = new Date().toISOString().slice(0, 10)): { coste: number | null; origen: "sin_tarifa" | "estimado" } {
  const t = tarifas.filter((x) => x.proveedor === proveedor && x.modelo === modelo && x.vigente_desde <= hoy).sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0];
  if (!t) return { coste: null, origen: "sin_tarifa" };
  return { coste: Math.round(((tin / 1000) * t.eur_por_1k_entrada + (tout / 1000) * t.eur_por_1k_salida) * 1e6) / 1e6, origen: "estimado" };
}
export type Medidor = { llamadas: number; charsIn: number; charsOut: number; ms: number; fallos: number };
export const nuevoMedidor = (): Medidor => ({ llamadas: 0, charsIn: 0, charsOut: 0, ms: 0, fallos: 0 });
export function envuelve<A extends unknown[]>(f: (sys: string, msgs: { role: "user" | "assistant"; content: string }[], max: number) => Promise<string | null>, m: Medidor) {
  return async (sys: string, msgs: { role: "user" | "assistant"; content: string }[], max: number) => {
    const t0 = Date.now(); m.llamadas++; m.charsIn += sys.length + msgs.reduce((n, x) => n + x.content.length, 0);
    const r = await f(sys, msgs, max); m.ms += Date.now() - t0; if (r) m.charsOut += r.length; else m.fallos++; return r;
  };
}
export const nombreProveedor = (env: Record<string, string | undefined> = process.env) => env.LLM_BASE_URL ? (env.LLM_BASE_URL.replace(/^https?:\/\//, "").split("/")[0] || "openai-compatible") : env.ANTHROPIC_API_KEY ? "anthropic" : "cadena-gratuita";
export const nombreModelo = (env: Record<string, string | undefined> = process.env) => env.LLM_MODEL || env.COUNCIL_MODEL || env.CHAT_MODEL || "desconocido";
export async function registrarCoste(sb: SupabaseClient, e: { owner: string; taskId: string | null; agente: string; m: Medidor; estado: "ok" | "fallo" }): Promise<boolean> {
  if (!e.m.llamadas) return true;
  const prov = nombreProveedor(), mod = nombreModelo(); const tin = estimarTokens(e.m.charsIn), tout = estimarTokens(e.m.charsOut);
  const { data: ts } = await sb.from("office_tarifas").select("proveedor,modelo,eur_por_1k_entrada,eur_por_1k_salida,vigente_desde").eq("proveedor", prov).eq("modelo", mod);
  const c = calcularCoste((ts || []) as Tarifa[], prov, mod, tin, tout);
  const { error } = await sb.from("office_costes").insert({ owner: e.owner, task_id: e.taskId, agente: e.agente, proveedor: prov, modelo: mod, llamadas: e.m.llamadas, tokens_entrada: tin, tokens_salida: tout, tokens_origen: "estimado", coste_eur: c.coste, coste_origen: c.origen, duracion_ms: e.m.ms, estado: e.estado });
  return !error;
}
