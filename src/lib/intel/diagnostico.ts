// Servidor: diagnóstico REAL de conectores. Un conector solo es "operativo" si una consulta de solo lectura devuelve contenido de la fuente esperada.
// Que exista una clave o una herramienta no basta. Lo que no se puede comprobar aquí se declara "no_configurada", nunca "operativa".
import type { EstadoConector, Env, Plataforma, Salida } from "./tipos.ts";
import { leerWeb, leerRepoGithub, leerRss, YOUTUBE_NO_DISPONIBLE } from "./conectores.ts";
import { buscarWeb, proveedorBusqueda } from "../oficina/busqueda.ts";

export const UPSTREAM = { repo: "https://github.com/Panniantong/Agent-Reach", version: "1.5.0", commit: "94f06c1969dfc1834001269d79d3ad0972d9dee6", licencia: "MIT", pythonMinimo: "3.10" } as const;
export type Diagnostico = {
  plataforma: Plataforma; herramienta: string; estado: EstadoConector; acceso: "publico" | "configuracion_adicional";
  requisitos: string[]; comprobado: string; ms: number | null; mensaje: string | null; prueba: string;
};
const base = { acceso: "publico" as const };
function de(s: Salida, ok: (s: Extract<Salida, { ok: true }>) => boolean, prueba: string, plataforma: Plataforma, herramienta: string, requisitos: string[], ahora: Date): Diagnostico {
  const comprobado = ahora.toISOString();
  if (s.ok && ok(s)) return { ...base, plataforma, herramienta, estado: "operativa", requisitos, comprobado, ms: s.ms, mensaje: null, prueba };
  if (s.ok) return { ...base, plataforma, herramienta, estado: "fallida", requisitos, comprobado, ms: s.ms, mensaje: "La consulta respondió, pero el contenido no era el esperado.", prueba };
  return { ...base, plataforma, herramienta, estado: s.estado, requisitos, comprobado, ms: s.ms, mensaje: s.error, prueba };
}

/** Ejecuta las pruebas en paralelo. `probarBusqueda` hace una consulta real al proveedor de pago/cuota: solo si se pide. */
export async function diagnosticar(opts: { env?: Env; f?: typeof fetch; ahora?: Date; probarBusqueda?: boolean } = {}): Promise<Diagnostico[]> {
  const env = opts.env ?? {}; const f = opts.f ?? fetch; const ahora = opts.ahora ?? new Date();
  const [web, gh, rss] = await Promise.all([
    leerWeb("https://example.com/", env, f),
    leerRepoGithub("Panniantong", "Agent-Reach", env, f),
    leerRss("https://github.com/Panniantong/Agent-Reach/commits/main.atom", f),
  ]);
  const out: Diagnostico[] = [
    de(web, (s) => /example domain/i.test((s.elementos[0]?.titulo || "") + " " + (s.elementos[0]?.extracto || "")), "Leer https://example.com y encontrar «Example Domain»", "web", "Jina Reader", env.JINA_API_KEY ? [] : ["Sin JINA_API_KEY funciona con límite bajo por IP"], ahora),
    de(gh, (s) => s.elementos.some((e) => e.seccion === "metadatos" && /Panniantong\/Agent-Reach/.test(e.titulo)), "Leer los metadatos de Panniantong/Agent-Reach", "github", "API REST de GitHub", env.GITHUB_TOKEN ? [] : ["Sin GITHUB_TOKEN la cuota es de 60 consultas/hora por IP"], ahora),
    de(rss, (s) => s.elementos.length > 0, "Leer el feed de commits de Panniantong/Agent-Reach", "rss", "Feed RSS/Atom", [], ahora),
  ];
  const prov = proveedorBusqueda(env as Record<string, string | undefined>);
  if (!prov) out.push({ ...base, acceso: "configuracion_adicional", plataforma: "busqueda", herramienta: "Buscador web (Exa/Serper/Tavily)", estado: "no_configurada", requisitos: ["EXA_API_KEY, SERPER_API_KEY o TAVILY_API_KEY en Vercel"], comprobado: ahora.toISOString(), ms: null, mensaje: "No hay buscador configurado.", prueba: "Sin clave no se hace ninguna consulta" });
  else if (!opts.probarBusqueda) out.push({ ...base, acceso: "configuracion_adicional", plataforma: "busqueda", herramienta: `Buscador web (${prov})`, estado: "limitada", requisitos: ["Cuota del proveedor"], comprobado: ahora.toISOString(), ms: null, mensaje: "Hay clave configurada pero no se ha probado (la prueba consume cuota). Pulsa «Probar buscador».", prueba: "No ejecutada" });
  else { const t0 = Date.now(); const r = await buscarWeb("Agent-Reach Panniantong github", env as Record<string, string | undefined>, f); out.push({ ...base, acceso: "configuracion_adicional", plataforma: "busqueda", herramienta: `Buscador web (${prov})`, estado: r.ok ? "operativa" : "fallida", requisitos: ["Cuota del proveedor"], comprobado: ahora.toISOString(), ms: Date.now() - t0, mensaje: r.ok ? null : r.error, prueba: "Buscar «Agent-Reach Panniantong github» y recibir resultados con URL" }); }
  out.push({ ...base, acceso: "configuracion_adicional", plataforma: "youtube", herramienta: "yt-dlp (Agent-Reach)", estado: "no_configurada", requisitos: ["Trabajador con Python ≥ 3.10 y yt-dlp", "Entorno con JS runtime para algunos vídeos"], comprobado: ahora.toISOString(), ms: null, mensaje: YOUTUBE_NO_DISPONIBLE, prueba: "No ejecutable en Vercel" });
  return out;
}
/** Plataformas utilizables ahora (operativas o limitadas, nunca fallidas ni sin configurar). */
export const disponibles = (d: Diagnostico[]): Set<Plataforma> => new Set(d.filter((x) => x.estado === "operativa" || x.estado === "limitada").map((x) => x.plataforma));
