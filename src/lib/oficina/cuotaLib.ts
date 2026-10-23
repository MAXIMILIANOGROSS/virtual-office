// Cuotas y consumo: lógica pura (formato, alertas, resumen). El control real vive en el servidor y en la función SQL usage_consume.
export const OPERACIONES: Record<string, string> = { texto: "Generaciones de texto", campana: "Campañas creadas", pieza: "Piezas regeneradas", imagen: "Imágenes con IA" };
export type Limite = { operacion: string; limite: number; periodo: "dia" | "mes"; coste_unidad: number };
export type Evento = { id: string; operacion: string; unidades: number; coste_estimado: number | null; estado: "ok" | "reembolsado"; created_at: string };
export type Nivel = "ok" | "aviso" | "limite";
export const porcentaje = (usado: number, limite: number) => (limite <= 0 ? (usado > 0 ? 100 : 0) : Math.min(100, Math.round((usado / limite) * 100)));
/** Aviso al llegar al 80 % y bloqueo al 100 %. */
export const nivelAlerta = (usado: number, limite: number): Nivel => (limite <= 0 || usado >= limite ? "limite" : usado >= limite * 0.8 ? "aviso" : "ok");
export const inicioPeriodo = (periodo: "dia" | "mes", ahora = new Date()) => (periodo === "dia" ? new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate())) : new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)));
/** Resumen por operación contando solo eventos "ok" dentro del periodo. Los reembolsados no consumen. */
export function resumenUso(limites: Limite[], eventos: Evento[], ahora = new Date()) {
  return limites.map((l) => {
    const desde = inicioPeriodo(l.periodo, ahora).getTime();
    const usado = eventos.filter((e) => e.operacion === l.operacion && e.estado === "ok" && new Date(e.created_at).getTime() >= desde).reduce((a, e) => a + e.unidades, 0);
    const coste = eventos.filter((e) => e.operacion === l.operacion && e.estado === "ok" && e.coste_estimado != null && new Date(e.created_at).getTime() >= desde).reduce((a, e) => a + Number(e.coste_estimado), 0);
    return { ...l, usado, restante: Math.max(0, l.limite - usado), pct: porcentaje(usado, l.limite), nivel: nivelAlerta(usado, l.limite), coste: l.coste_unidad > 0 ? coste : null };
  });
}
export const mensajeLimite = (op: string, usado?: number, limite?: number, periodo?: string) => `Has alcanzado el límite de «${OPERACIONES[op] || op}»${limite != null ? ` (${usado ?? limite}/${limite} ${periodo === "dia" ? "hoy" : "este mes"})` : ""}. No se ha consumido nada ni se ha hecho ningún cargo. Espera al siguiente periodo o amplía el plan.`;
