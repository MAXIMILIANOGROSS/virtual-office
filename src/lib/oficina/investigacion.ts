// Servidor: flujo del agente Investigador. Busca fuentes REALES, se las da al modelo y añade la sección "Fuentes" de forma determinista
// (título, URL y fecha de consulta vienen del buscador, no del modelo). Si no hay buscador o falla, la tarea queda bloqueada: no se simula nada.
import type { Fuente, ResBusqueda } from "./busqueda.ts";
export function promptInvestigador(base: string, fuentes: Fuente[]): string {
  const lista = fuentes.map((f, i) => `[${i + 1}] ${f.titulo} — ${f.url}\n${f.fragmento}`).join("\n\n");
  return `${base}\n\nEres el Investigador. Responde SOLO con la información de las fuentes numeradas de abajo. Cita cada afirmación con su número [n]. ` +
    `Estructura obligatoria: "## Hechos" (con cita), "## Hipótesis" (lo que infieres, marcado como hipótesis), "## Recomendaciones". ` +
    `Si las fuentes no bastan para responder, dilo y escribe [DATO PENDIENTE]. No inventes datos, cifras ni fuentes.\n\nFUENTES:\n${lista}`;
}
export function seccionFuentes(fuentes: Fuente[]): string {
  return "\n\n## Fuentes\n" + fuentes.map((f, i) => `${i + 1}. [${f.titulo}](${f.url}) — consultada el ${f.consultada} (${f.proveedor})`).join("\n");
}
export type Investigacion = { ok: true; texto: string; fuentes: Fuente[] } | { ok: false; bloqueo: boolean; motivo: string };
type Deps = { buscarWeb: (q: string) => Promise<ResBusqueda>; callLLM: (sys: string, msgs: { role: "user" | "assistant"; content: string }[], max: number) => Promise<string | null> };
async function depsReales(): Promise<Deps> { const [b, l] = await Promise.all([import("./busqueda.ts"), import("@/lib/llm")]); return { buscarWeb: (q) => b.buscarWeb(q), callLLM: l.callLLM as Deps["callLLM"] }; }
export async function investigar(consulta: string, promptBase: string, deps?: Deps): Promise<Investigacion> {
  deps = deps ?? await depsReales();
  const b = await deps.buscarWeb(consulta);
  if (!b.ok) return { ok: false, bloqueo: !b.configurado, motivo: b.error };
  const texto = await deps.callLLM(promptInvestigador(promptBase, b.fuentes), [{ role: "user", content: consulta }], 1600);
  if (!texto) return { ok: false, bloqueo: false, motivo: "El proveedor de IA no respondió." };
  return { ok: true, texto: texto.trim() + seccionFuentes(b.fuentes), fuentes: b.fuentes };
}
