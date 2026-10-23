/** Proyección PÚBLICA del estado de la oficina (solo lectura). Lista blanca: nunca sale texto de instrucciones, resultados, errores, ids ni dueños. */
import { AGENTES, AREAS, type Area } from "./agentes.ts";

export type FilaPublica = { agente: string; area: string; estado: string; updated_at: string };
export type TareaPublica = { id: string; agente: string; estado: "en_curso" | "pendiente" | "en_revision" | "requiere_aprobacion"; instruccion: ""; created_at: string };
export type EventoPublico = { at: string; texto: string };

const VISIBLES = ["en_curso", "pendiente", "en_revision", "requiere_aprobacion"] as const;
const TEXTO: Record<string, string> = {
  en_curso: "está trabajando en una tarea",
  pendiente: "tiene una tarea en cola",
  en_revision: "tiene un resultado listo para revisión",
  requiere_aprobacion: "espera una aprobación de Dirección",
};

export function proyectar(filas: FilaPublica[], ahora = Date.now()) {
  const conocidos = new Set(AGENTES.map((a) => a.id));
  const ok = filas.filter((f) => (VISIBLES as readonly string[]).includes(f.estado) && conocidos.has(f.agente));
  const tareas: TareaPublica[] = ok.map((f, i) => ({ id: "p" + i, agente: f.agente, estado: f.estado as TareaPublica["estado"], instruccion: "", created_at: f.updated_at }));
  const eventos: EventoPublico[] = ok
    .filter((f) => AREAS[f.area as Area])
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, 12)
    .map((f) => ({ at: f.updated_at, texto: `${AREAS[f.area as Area].nombre} ${TEXTO[f.estado]}.` }));
  const trabajando = new Set(ok.filter((f) => f.estado === "en_curso").map((f) => f.agente)).size;
  return { generado: new Date(ahora).toISOString(), agentesConfigurados: AGENTES.length, agentesTrabajando: trabajando, tareas, eventos };
}
