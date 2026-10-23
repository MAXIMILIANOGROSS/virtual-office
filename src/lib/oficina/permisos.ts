// Servidor: permisos por agente y herramienta. Se comprueban en el servidor antes de ejecutar cada herramienta; un agente no puede cambiarlos.
// Niveles: 1 = preparar (investigar, redactar, proponer) · 2 = operaciones internas (crear archivos/borradores) · 3 = acciones externas (siempre con aprobación humana).
export type Herramienta = "buscar_web" | "leer_tareas" | "leer_marca" | "guardar_entregable" | "leer_leads" | "solicitar_aprobacion";
export type Politica = { nivel: 1 | 2 | 3; herramientas: Herramienta[]; presupuestoDia: number; activo: boolean };
const BASE: Herramienta[] = ["guardar_entregable", "solicitar_aprobacion"];
const POLITICAS: Record<string, Politica> = {
  "est-mercado": { nivel: 1, herramientas: ["buscar_web", ...BASE], presupuestoDia: 10, activo: true },
  "est-competencia": { nivel: 1, herramientas: ["buscar_web", ...BASE], presupuestoDia: 10, activo: true },
  "est-validacion": { nivel: 1, herramientas: ["buscar_web", ...BASE], presupuestoDia: 6, activo: true },
  "cre-analitica": { nivel: 1, herramientas: ["leer_leads", ...BASE], presupuestoDia: 10, activo: true },
  "cre-contenido": { nivel: 2, herramientas: ["leer_marca", ...BASE], presupuestoDia: 12, activo: true },
  "cre-marca": { nivel: 2, herramientas: ["leer_marca", ...BASE], presupuestoDia: 12, activo: true },
  "ciro": { nivel: 1, herramientas: ["leer_tareas", ...BASE], presupuestoDia: 10, activo: true },
  "yt-investigador": { nivel: 1, herramientas: ["buscar_web", ...BASE], presupuestoDia: 10, activo: true },
  "yt-viral": { nivel: 1, herramientas: ["buscar_web", ...BASE], presupuestoDia: 8, activo: true },
  "tec-licencias": { nivel: 1, herramientas: ["buscar_web", ...BASE], presupuestoDia: 6, activo: true },
};
const POR_DEFECTO: Politica = { nivel: 1, herramientas: [...BASE], presupuestoDia: 10, activo: true };
export const politicaDe = (agenteId: string): Politica => POLITICAS[agenteId] ?? POR_DEFECTO;
export function puede(agenteId: string, h: Herramienta): { ok: boolean; motivo?: string } {
  const p = politicaDe(agenteId);
  if (!p.activo) return { ok: false, motivo: "Agente desactivado." };
  return p.herramientas.includes(h) ? { ok: true } : { ok: false, motivo: `El agente no tiene permitida la herramienta ${h}.` };
}
/** Una acción externa (nivel 3) nunca se ejecuta sin aprobación humana, tenga o no el agente permiso técnico. */
export const requiereAprobacion = (nivelAccion: 1 | 2 | 3) => nivelAccion === 3;

export const TODAS_POLITICAS = (): [string, Politica][] => Object.entries(POLITICAS);
