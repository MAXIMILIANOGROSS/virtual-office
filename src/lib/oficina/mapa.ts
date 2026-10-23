/** Plano de la oficina virtual: posiciones fijas por departamento y estado REAL de cada agente según sus tareas. Sin imports: testeable. */
export type AgM = { id: string; area: string; jefe?: boolean };
export type TareaM = { agente: string; estado: string; instruccion: string; created_at: string };
export type EstadoAg = "trabajando" | "esperando_revision" | "en_cola" | "libre";

export const PLANO = { ancho: 1000, alto: 1030 };
export const SALAS: Record<string, { x: number; y: number; w: number; h: number }> = {
  direccion: { x: 380, y: 16, w: 240, h: 130 },
  estrategia: { x: 16, y: 170, w: 312, h: 534 },
  tecnologia: { x: 344, y: 170, w: 312, h: 534 },
  crecimiento: { x: 672, y: 170, w: 312, h: 534 },
  youtube: { x: 16, y: 720, w: 968, h: 290 },
};
const COLS_SALA: Record<string, number> = { youtube: 9 };
const COLS = 3, CELDA_W = 100, CELDA_H = 112, PAD_X = 6, PAD_Y = 44;

/** Mesa de cada agente (centro). Jefe de departamento siempre en la primera plaza. */
export function posiciones(ags: AgM[]): Map<string, { x: number; y: number }> {
  const m = new Map<string, { x: number; y: number }>();
  for (const area of Object.keys(SALAS)) {
    const sala = SALAS[area];
    const lista = ags.filter((a) => a.area === area).sort((a, b) => Number(!!b.jefe) - Number(!!a.jefe));
    lista.forEach((a, i) => {
      const nc = COLS_SALA[area] ?? COLS; const c = i % nc, f = Math.floor(i / nc);
      m.set(a.id, { x: sala.x + PAD_X + c * CELDA_W + CELDA_W / 2, y: sala.y + PAD_Y + f * CELDA_H + CELDA_H / 2 });
    });
  }
  return m;
}

const PRIO: [EstadoAg, string[]][] = [
  ["trabajando", ["en_curso"]],
  ["esperando_revision", ["requiere_aprobacion", "en_revision"]],
  ["en_cola", ["pendiente", "planificada"]],
];
export const ESTADO_AG_LABEL: Record<EstadoAg, string> = { trabajando: "Trabajando", esperando_revision: "Esperando tu revisión", en_cola: "Con tarea en cola", libre: "Libre" };

/** Color de la pantalla del ordenador de cada cabra: amarillo ejecutando, rojo en pausa, verde terminada. */
export type PantallaAg = "ejecutando" | "pausa" | "terminada" | "cola" | "libre";
export const PANTALLA_COL: Record<PantallaAg, string> = { ejecutando: "#FACC15", pausa: "#EF4444", terminada: "#22C55E", cola: "#60A5FA", libre: "#3B6FB0" };
export const PANTALLA_LABEL: Record<PantallaAg, string> = { ejecutando: "Ejecutando una tarea", pausa: "En pausa (parada, bloqueada, fallida o esperando tu decisión)", terminada: "Última tarea terminada", cola: "Con tarea en cola", libre: "Libre" };
const PAUSA = ["bloqueada", "fallida", "requiere_aprobacion", "en_revision"];
export const VENTANA_TERMINADA_MS = 6 * 3600 * 1000;
/** Sale solo de las tareas registradas: en curso → amarillo; la última tarea parada → rojo; la última terminada (últimas 6 h) → verde. */
export function pantallaAgente(id: string, ts: TareaM[], ahora = Date.now()): PantallaAg {
  const mias = ts.filter((t) => t.agente === id && t.estado !== "cancelada").sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  if (mias.some((t) => t.estado === "en_curso")) return "ejecutando";
  const u = mias[0]; if (!u) return "libre";
  if (PAUSA.includes(u.estado)) return "pausa";
  if (u.estado === "completada") return ahora - Date.parse(u.created_at) <= VENTANA_TERMINADA_MS ? "terminada" : "libre";
  return "cola";
}
/** Estado real: sale solo de las tareas registradas, nunca inventado. */
export function estadoAgente(id: string, ts: TareaM[]): { estado: EstadoAg; tarea: TareaM | null; pantalla: PantallaAg } {
  const mias = ts.filter((t) => t.agente === id).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const pantalla = pantallaAgente(id, ts);
  for (const [e, est] of PRIO) { const t = mias.find((x) => est.includes(x.estado)); if (t) return { estado: e, tarea: t, pantalla }; }
  return { estado: "libre", tarea: null, pantalla };
}
