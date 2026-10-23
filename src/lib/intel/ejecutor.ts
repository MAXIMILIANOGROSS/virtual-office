// Servidor: ejecuta una investigación de principio a fin con herramientas reales inyectables (para poder probarla sin red).
// Orden: permisos del agente → diagnóstico (disponibilidad real) → plan → consultas (con presupuesto de tiempo y cancelación) → normalizar y deduplicar
// → avisos de inyección → síntesis opcional → informe. Nunca declara completada una consulta que no devolvió contenido.
import type { Consulta, Elemento, Env, Plataforma, Salida } from "./tipos.ts";
import { plataformaDe } from "./tipos.ts";
import { detectarInyeccion, sinSecretos } from "./seguridad.ts";
import { fuentesPermitidas } from "./permisosRed.ts";
import { planificar, type Profundidad } from "./plan.ts";
import { buscarGithub, leerRepoGithub, leerRss, leerWeb } from "./conectores.ts";
import { disponibles as dispDe, type Diagnostico } from "./diagnostico.ts";
import { buscarWeb } from "../oficina/busqueda.ts";
import { citasValidas, construirInforme, promptSintesis, sinDuplicados, type Registro } from "./informe.ts";

export type Peticion = { pregunta: string; objetivo?: string; proyecto: string; agente: string; urls?: string[]; preferidas?: Plataforma[]; profundidad?: Profundidad };
export type Deps = {
  env: Env; f?: typeof fetch; ahora?: () => Date;
  diagnostico: () => Promise<Diagnostico[]>;
  llm?: (sistema: string, usuario: string) => Promise<string | null>;
  cancelado?: () => Promise<boolean>;
  presupuestoMs?: number;
};
export type Resultado = {
  estado: "completada" | "parcial" | "fallida" | "cancelada" | "bloqueada";
  informe: string; elementos: Elemento[]; registros: Registro[]; omitidas: { plataforma: string; motivo: string }[]; motivo?: string; ms: number;
};

async function correr(c: Consulta, d: Deps): Promise<Salida> {
  const f = d.f ?? fetch;
  switch (c.tipo) {
    case "web": return leerWeb(c.url, d.env, f);
    case "github_repo": return leerRepoGithub(c.owner, c.repo, d.env, f);
    case "github_buscar": return buscarGithub(c.q, d.env, f);
    case "rss": return leerRss(c.url, f);
    case "busqueda": {
      const t0 = Date.now(); const r = await buscarWeb(c.q, d.env as Record<string, string | undefined>, f);
      if (!r.ok) return { ok: false, error: r.error, estado: r.configurado ? "fallida" : "no_configurada", ms: Date.now() - t0 };
      const hoy = (d.ahora?.() ?? new Date()).toISOString().slice(0, 10);
      return { ok: true, ms: Date.now() - t0, elementos: r.fuentes.map((x) => ({ plataforma: "busqueda" as const, titulo: x.titulo, url: x.url, extracto: x.fragmento, hechos: [], publicado: null, consultado: hoy, autor: null, metodo: `Buscador web (${x.proveedor})`, seccion: "contenido" as const, verificacion: "sin_verificar" as const, limitaciones: ["Fragmento de buscador: abre la fuente para verificarlo."] })) };
    }
  }
}

export async function ejecutarInvestigacion(p: Peticion, d: Deps): Promise<Resultado> {
  const t0 = Date.now(); const fecha = (d.ahora?.() ?? new Date()).toISOString().slice(0, 10);
  const permitidas = fuentesPermitidas(p.agente);
  if (!permitidas.length) return { estado: "bloqueada", informe: "", elementos: [], registros: [], omitidas: [], motivo: `El agente «${p.agente}» no tiene permiso para usar la Intelligence Network.`, ms: 0 };
  let diag: Diagnostico[]; try { diag = await d.diagnostico(); } catch (e) { return { estado: "fallida", informe: "", elementos: [], registros: [], omitidas: [], motivo: "No se pudo diagnosticar los conectores: " + sinSecretos(String((e as Error)?.message || e)), ms: Date.now() - t0 }; }
  const plan = planificar(p.pregunta, { urls: p.urls, disponibles: dispDe(diag), permitidas, profundidad: p.profundidad, preferidas: p.preferidas });
  if (!plan.consultas.length) return { estado: "bloqueada", informe: "", elementos: [], registros: [], omitidas: plan.omitidas, motivo: "Ninguna fuente disponible y permitida sirve para esta pregunta: " + plan.omitidas.map((o) => `${o.plataforma} (${o.motivo})`).join("; "), ms: Date.now() - t0 };
  const registros: Registro[] = []; let todos: Elemento[] = []; const presupuesto = d.presupuestoMs ?? 45000;
  for (const c of plan.consultas) {
    if (await d.cancelado?.()) { return { estado: "cancelada", informe: "", elementos: todos, registros, omitidas: plan.omitidas, motivo: "Cancelada por el usuario.", ms: Date.now() - t0 }; }
    if (Date.now() - t0 > presupuesto) { registros.push({ consulta: c, ok: false, error: "Se agotó el tiempo máximo de la investigación antes de ejecutar esta consulta.", ms: 0, elementos: 0 }); continue; }
    const s = await correr(c, d);
    if (s.ok) { registros.push({ consulta: c, ok: true, ms: s.ms, elementos: s.elementos.length }); todos = todos.concat(s.elementos); }
    else registros.push({ consulta: c, ok: false, error: s.error, estado: s.estado, ms: s.ms, elementos: 0 });
  }
  const elementos = sinDuplicados(todos);
  const avisosInyeccion = elementos.map((e) => ({ url: e.url, motivos: detectarInyeccion(e.extracto) })).filter((a) => a.motivos.length);
  let sintesis: string | null = null; let sintesisDescartada: string | null = null;
  if (elementos.length && d.llm) {
    const ctx = elementos.filter((e) => e.extracto || e.hechos.length);
    if (ctx.length) {
      try {
        const r = await d.llm(promptSintesis(p.pregunta, ctx), p.pregunta);
        if (!r) sintesisDescartada = "la IA no respondió.";
        else if (!citasValidas(r, ctx.length)) sintesisDescartada = "la IA no citó fuentes válidas, así que se descarta para no mostrar afirmaciones sin respaldo.";
        else sintesis = r;
        // Las citas de la síntesis numeran `ctx`; si ctx difiere de `elementos` la numeración del informe no coincidiría: se exige que sean la misma lista.
        if (sintesis && ctx.length !== elementos.length) { sintesis = null; sintesisDescartada = "la numeración de fuentes no coincide con la del informe."; }
      } catch (e) { sintesisDescartada = "falló la IA: " + sinSecretos(String((e as Error)?.message || e)).slice(0, 100); }
    }
  }
  const informe = construirInforme({ pregunta: p.pregunta, objetivo: p.objetivo, proyecto: p.proyecto, agente: p.agente, fecha, elementos, registros, omitidas: plan.omitidas, avisosInyeccion, sintesis, sintesisDescartada });
  const ok = registros.filter((r) => r.ok).length;
  const estado: Resultado["estado"] = !elementos.length ? "fallida" : ok === registros.length ? "completada" : "parcial";
  return { estado, informe, elementos, registros, omitidas: plan.omitidas, motivo: estado === "fallida" ? "Ninguna consulta devolvió contenido." : undefined, ms: Date.now() - t0 };
}
export { plataformaDe };
