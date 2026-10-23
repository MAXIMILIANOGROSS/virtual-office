/** Estudio de vídeo · control de costes. Importes en euros. Lógica pura. */
export type Nivel = "ok" | "70" | "85" | "100";
export function estadoPresupuesto(gastado: number, limite: number): { pct: number; nivel: Nivel; bloqueaPago: boolean; restante: number } {
  const pct = limite > 0 ? (gastado / limite) * 100 : 100;
  const nivel: Nivel = pct >= 100 ? "100" : pct >= 85 ? "85" : pct >= 70 ? "70" : "ok";
  return { pct: Math.round(pct * 10) / 10, nivel, bloqueaPago: pct >= 100, restante: Math.max(0, Math.round((limite - gastado) * 100) / 100) };
}
/** Antes de una tarea de pago: ¿cabe la estimación en el presupuesto? */
export const puedeGastar = (gastado: number, limite: number, estimacion: number) => limite > 0 && gastado + estimacion <= limite;
