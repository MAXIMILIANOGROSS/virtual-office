// Director de operaciones: análisis DETERMINISTA y de solo lectura de la cola. Detecta bloqueos, atascos, duplicados y prioridades.
// No cambia permisos, no crea ni reasigna tareas por su cuenta: propone y eleva al CEO lo que excede su ámbito.
export type TareaOp = { id: string; instruccion: string; agente: string; nivel: string; estado: string; error: string | null; intentos?: number | null; created_at: string; updated_at: string };
export const normTexto = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s: string) => new Set(normTexto(s).split(" ").filter((w) => w.length > 3));
export function similitud(a: string, b: string): number { const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0; let i = 0; for (const w of A) if (B.has(w)) i++; return i / (A.size + B.size - i); }
export type Hallazgos = { bloqueadas: TareaOp[]; atascadas: TareaOp[]; fallidas: TareaOp[]; esperandoAprobacion: TareaOp[]; duplicados: [TareaOp, TareaOp][]; prioridades: { id: string; motivo: string }[]; elevarAlCEO: string[] };
export function analizarCola(ts: TareaOp[], ahora = Date.now(), umbralAtascoMin = 20): Hallazgos {
  const abiertas = ts.filter((t) => !["completada", "cancelada"].includes(t.estado));
  const atascadas = ts.filter((t) => t.estado === "en_curso" && (ahora - Date.parse(t.updated_at)) / 60000 > umbralAtascoMin);
  const dup: [TareaOp, TareaOp][] = [];
  for (let i = 0; i < abiertas.length && dup.length < 20; i++) for (let j = i + 1; j < abiertas.length; j++) if (abiertas[i].agente === abiertas[j].agente && similitud(abiertas[i].instruccion, abiertas[j].instruccion) >= 0.7) { dup.push([abiertas[i], abiertas[j]]); break; }
  const pri: { id: string; motivo: string; p: number }[] = [];
  for (const t of abiertas) {
    const edadH = (ahora - Date.parse(t.created_at)) / 3600000;
    if (t.estado === "requiere_aprobacion") pri.push({ id: t.id, motivo: "espera tu aprobación", p: 100 + edadH });
    else if (t.estado === "fallida") pri.push({ id: t.id, motivo: "falló y necesita decisión", p: 80 + edadH });
    else if (t.estado === "bloqueada") pri.push({ id: t.id, motivo: "bloqueada: " + (t.error || "sin motivo").slice(0, 80), p: 60 + edadH });
    else if (t.estado === "en_revision") pri.push({ id: t.id, motivo: "resultado listo para revisar", p: 40 + edadH });
  }
  const bloq = ts.filter((t) => t.estado === "bloqueada");
  const elevar: string[] = [];
  if (ts.some((t) => t.estado === "requiere_aprobacion")) elevar.push("Hay tareas sensibles que solo tú puedes aprobar.");
  if (bloq.some((t) => /buscador|BUSCADOR|configur/i.test(t.error || ""))) elevar.push("Hay tareas bloqueadas por falta de configuración (clave de buscador u otra): requiere tu intervención.");
  if (bloq.some((t) => /\[PARADA\]/.test(t.error || ""))) elevar.push("Hay tareas interrumpidas por la parada de emergencia: decide si reanudas la oficina.");
  if (dup.length) elevar.push(`Hay ${dup.length} posible(s) tarea(s) duplicada(s): cancela la que sobre.`);
  return { bloqueadas: bloq, atascadas, fallidas: ts.filter((t) => t.estado === "fallida"), esperandoAprobacion: ts.filter((t) => t.estado === "requiere_aprobacion"), duplicados: dup, prioridades: pri.sort((a, b) => b.p - a.p).slice(0, 8).map(({ id, motivo }) => ({ id, motivo })), elevarAlCEO: elevar };
}
export function textoOperaciones(h: Hallazgos, nombre: (id: string) => string = (x) => x): string {
  const L = (t: TareaOp) => `«${t.instruccion.slice(0, 70)}» (${nombre(t.agente)})`;
  const out = ["## Revisión de operaciones (análisis automático, solo lectura)"];
  out.push(h.prioridades.length ? "### Prioridades\n" + h.prioridades.map((p, i) => `${i + 1}. Tarea ${p.id.slice(0, 8)}: ${p.motivo}`).join("\n") : "### Prioridades\nNo hay tareas abiertas que requieran atención.");
  if (h.atascadas.length) out.push("### Posibles atascos\n" + h.atascadas.map((t) => "- " + L(t)).join("\n"));
  if (h.duplicados.length) out.push("### Posibles duplicados\n" + h.duplicados.map(([a, b]) => `- ${L(a)} ≈ ${L(b)}`).join("\n"));
  out.push(h.elevarAlCEO.length ? "### Decisiones que te elevo\n" + h.elevarAlCEO.map((x) => "- " + x).join("\n") : "### Decisiones que te elevo\nNinguna ahora mismo.");
  out.push("_Este análisis no reasigna ni crea tareas: solo propone. Los permisos de los agentes no los puede cambiar nadie desde la oficina._");
  return out.join("\n\n");
}
