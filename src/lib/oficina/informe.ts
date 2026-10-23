// Informe diario del CEO: se construye SOLO con registros reales (tareas, entregables, costes, ciclos). Sin IA: no inventa nada y no puede generar bucles de tareas.
import { analizarCola, textoOperaciones, type TareaOp } from "./operaciones.ts";
export type DatosInforme = {
  fecha: string; tareas: (TareaOp & { resultado?: string | null })[]; entregables: { task_id: string; nombre: string; tipo: string; version: number; created_at: string }[];
  costes: { agente: string; llamadas: number; tokens_entrada: number | null; tokens_salida: number | null; coste_eur: number | null; estado: string; created_at: string }[];
  ciclos: { inicio: string; resultado: string | null; error: string | null }[]; alertas: string[]; nombreAgente?: (id: string) => string;
};
const dia = (iso: string) => iso.slice(0, 10);
export function construirInforme(d: DatosInforme, baseUrl = ""): { texto: string; resumen: Record<string, number> } {
  const n = d.nombreAgente ?? ((x: string) => x);
  const hoy = d.tareas.filter((t) => dia(t.updated_at) === d.fecha || dia(t.created_at) === d.fecha);
  const comp = d.tareas.filter((t) => t.estado === "completada" && dia(t.updated_at) === d.fecha);
  const ents = d.entregables.filter((e) => dia(e.created_at) === d.fecha);
  const cos = d.costes.filter((c) => dia(c.created_at) === d.fecha); const ciclos = d.ciclos.filter((c) => dia(c.inicio) === d.fecha);
  const h = analizarCola(d.tareas, Date.parse(d.fecha + "T23:59:59Z"));
  const sinActividad = !hoy.length && !ents.length && !cos.length && !ciclos.length;
  const L: string[] = [`# Informe diario · ${d.fecha}`];
  L.push("## Resumen ejecutivo");
  L.push(sinActividad ? "**No hubo actividad registrada hoy** (ni tareas, ni ciclos, ni entregables, ni costes)." :
    `Hoy: ${comp.length} tarea(s) completada(s), ${ents.length} entregable(s) guardado(s), ${ciclos.length} ciclo(s) registrado(s). Abiertas ahora: ${d.tareas.filter((t) => !["completada", "cancelada"].includes(t.estado)).length}; fallidas ${h.fallidas.length}, bloqueadas ${h.bloqueadas.length}, esperando tu aprobación ${h.esperandoAprobacion.length}.`);
  L.push("## Tareas completadas\n" + (comp.length ? comp.map((t) => `- ${t.instruccion.slice(0, 90)} (${n(t.agente)})`).join("\n") : "Ninguna."));
  L.push("## Entregables generados\n" + (ents.length ? ents.map((e) => `- ${e.nombre} (${e.tipo}, v${e.version}) — tarea ${String(e.task_id).slice(0, 8)} (Oficina → Tareas)`).join("\n") : "Ninguno."));
  const ab = d.tareas.filter((t) => ["pendiente", "planificada", "en_curso", "en_revision"].includes(t.estado));
  L.push("## Tareas pendientes\n" + (ab.length ? ab.slice(0, 15).map((t) => `- [${t.estado}] ${t.instruccion.slice(0, 90)} (${n(t.agente)})`).join("\n") : "Ninguna."));
  const fb = [...h.fallidas, ...h.bloqueadas];
  L.push("## Fallidas o bloqueadas\n" + (fb.length ? fb.slice(0, 15).map((t) => `- [${t.estado}] ${t.instruccion.slice(0, 80)} — ${(t.error || "sin motivo").slice(0, 100)}`).join("\n") : "Ninguna."));
  const porAg = new Map<string, number>(); for (const t of hoy) porAg.set(t.agente, (porAg.get(t.agente) || 0) + 1);
  L.push("## Actividad de los agentes\n" + (porAg.size ? Array.from(porAg.entries()).map(([a, c]) => `- ${n(a)}: ${c} tarea(s) con movimiento`).join("\n") : "Sin actividad."));
  const llam = cos.reduce((s, c) => s + c.llamadas, 0), tok = cos.reduce((s, c) => s + (c.tokens_entrada || 0) + (c.tokens_salida || 0), 0), eur = cos.reduce((s, c) => s + (c.coste_eur || 0), 0);
  L.push("## Costes registrados\n" + (cos.length ? `${llam} llamada(s) a IA, ~${tok} tokens (estimados). ${eur > 0 ? `Coste estimado: ${eur.toFixed(4)} €.` : "Sin tarifa registrada: coste en € no calculado."}` : "Sin consumo de IA registrado hoy."));
  const err = ciclos.filter((c) => c.resultado === "error");
  L.push("## Alertas del sistema\n" + ([...d.alertas, ...err.map((c) => `Ciclo con error: ${c.error || "sin detalle"}`)].map((x) => "- " + x).join("\n") || "Sin alertas."));
  L.push("## Aprobaciones que requieren una decisión\n" + (h.esperandoAprobacion.length ? h.esperandoAprobacion.map((t) => `- ${t.instruccion.slice(0, 90)} (${n(t.agente)})`).join("\n") : "Ninguna."));
  const ideas = d.tareas.filter((t) => t.estado === "en_revision" && t.instruccion.startsWith("💡"));
  L.push("## Oportunidades detectadas\n" + (ideas.length ? ideas.slice(0, 8).map((t) => `- ${t.instruccion.slice(0, 100)}`).join("\n") : "Ninguna idea pendiente de revisar. (No se inventan oportunidades ni ingresos.)"));
  L.push(textoOperaciones(h, n).replace("## Revisión de operaciones (análisis automático, solo lectura)", "## Prioridades recomendadas para mañana"));
  return { texto: L.join("\n\n"), resumen: { completadas: comp.length, entregables: ents.length, ciclos: ciclos.length, fallidas: h.fallidas.length, bloqueadas: h.bloqueadas.length, aprobacion: h.esperandoAprobacion.length, llamadas: llam } };
}
