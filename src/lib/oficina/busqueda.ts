// Servidor: herramienta de búsqueda web REAL para el agente Investigador. Usa el proveedor que tenga clave en el entorno
// (EXA_API_KEY, SERPER_API_KEY o TAVILY_API_KEY). Sin clave NO simula resultados: devuelve configurado:false.
export type Fuente = { titulo: string; url: string; fragmento: string; consultada: string; proveedor: string };
export type ResBusqueda = { ok: true; proveedor: string; fuentes: Fuente[] } | { ok: false; configurado: boolean; error: string };
export type Env = Record<string, string | undefined>;
export const proveedorBusqueda = (env: Env = process.env): "exa" | "serper" | "tavily" | null => env.EXA_API_KEY ? "exa" : env.SERPER_API_KEY ? "serper" : env.TAVILY_API_KEY ? "tavily" : null;
const httpsOk = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/[^\s]+$/i.test(u);
const recorta = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");
/** Normaliza la respuesta del proveedor. Descarta resultados sin URL válida: nunca se inventan fuentes. */
export function normalizar(prov: string, json: unknown, ahora = new Date()): Fuente[] {
  const j = (json ?? {}) as Record<string, unknown>; const consultada = ahora.toISOString().slice(0, 10);
  const lista = (prov === "serper" ? j.organic : j.results) as unknown;
  if (!Array.isArray(lista)) return [];
  const out: Fuente[] = [];
  for (const r of lista as Record<string, unknown>[]) {
    const url = prov === "serper" ? r.link : r.url; if (!httpsOk(url)) continue;
    const frag = prov === "exa" ? (Array.isArray(r.highlights) ? (r.highlights as unknown[]).join(" ") : r.text) : prov === "serper" ? r.snippet : r.content;
    out.push({ titulo: recorta(r.title, 160) || url, url, fragmento: recorta(frag, 500), consultada, proveedor: prov });
  }
  return out.slice(0, 10);
}
export async function buscarWeb(consulta: string, env: Env = process.env, f: typeof fetch = fetch): Promise<ResBusqueda> {
  const q = (consulta || "").trim().slice(0, 300); if (q.length < 3) return { ok: false, configurado: true, error: "Consulta demasiado corta." };
  const prov = proveedorBusqueda(env); if (!prov) return { ok: false, configurado: false, error: "No hay buscador configurado (EXA_API_KEY, SERPER_API_KEY o TAVILY_API_KEY)." };
  try {
    const ctl = AbortSignal.timeout(15000); let r: Response;
    if (prov === "exa") r = await f("https://api.exa.ai/search", { method: "POST", signal: ctl, headers: { "x-api-key": env.EXA_API_KEY!, "content-type": "application/json" }, body: JSON.stringify({ query: q, numResults: 6, contents: { highlights: true } }) });
    else if (prov === "serper") r = await f("https://google.serper.dev/search", { method: "POST", signal: ctl, headers: { "X-API-KEY": env.SERPER_API_KEY!, "content-type": "application/json" }, body: JSON.stringify({ q, num: 6, hl: "es" }) });
    else r = await f("https://api.tavily.com/search", { method: "POST", signal: ctl, headers: { Authorization: `Bearer ${env.TAVILY_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ query: q, max_results: 6 }) });
    if (!r.ok) return { ok: false, configurado: true, error: `El buscador (${prov}) respondió ${r.status}.` };
    const fuentes = normalizar(prov, await r.json());
    return fuentes.length ? { ok: true, proveedor: prov, fuentes } : { ok: false, configurado: true, error: "El buscador no devolvió resultados con URL válida." };
  } catch (e) { return { ok: false, configurado: true, error: "Fallo al consultar el buscador: " + String((e as Error)?.message || e).slice(0, 100) }; }
}
