/** Lógica pura del ciclo 24/7 de la oficina (sin red ni base de datos: testeable). */
export const MAX_INTENTOS = 3;
export const ESPERA_MIN = [15, 30, 60];
export const MAX_LLM_POR_CICLO = 3;
export const BLOQUEO_MIN = 20;

export type TareaC = { id: string; estado: string; intentos: number; prox_intento: string | null; created_at: string; updated_at: string };

export function esperaMin(intentos: number): number {
  const i = Math.max(1, Math.min(ESPERA_MIN.length, Math.floor(intentos || 1)));
  return ESPERA_MIN[i - 1];
}

/** Tareas pendientes listas para ejecutar ahora (respeta backoff, intentos, presupuesto y límite por ciclo). */
export function elegirTareas<T extends TareaC>(ts: T[], now: number, usadasHoy: number, presupuestoDia: number, max = MAX_LLM_POR_CICLO): T[] {
  const queda = Math.max(0, presupuestoDia - usadasHoy);
  const n = Math.min(max, queda);
  return ts
    .filter((t) => t.estado === "pendiente" && t.intentos < MAX_INTENTOS && (!t.prox_intento || Date.parse(t.prox_intento) <= now))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .slice(0, n);
}

/** Tareas "en curso" atascadas (el ciclo murió a medias): pasan a bloqueada. */
export function atascadas(ts: TareaC[], now: number): TareaC[] {
  return ts.filter((t) => t.estado === "en_curso" && now - Date.parse(t.updated_at) > BLOQUEO_MIN * 60000);
}

/** Qué hacer tras un fallo: reintentar con espera o escalar (fallida) tras el máximo de intentos. */
export function trasFallo(intentosPrevios: number, now: number): { estado: "pendiente" | "fallida"; intentos: number; prox: string | null } {
  const intentos = intentosPrevios + 1;
  if (intentos >= MAX_INTENTOS) return { estado: "fallida", intentos, prox: null };
  return { estado: "pendiente", intentos, prox: new Date(now + esperaMin(intentos) * 60000).toISOString() };
}

/** ¿Toca el resumen diario? (hora UTC >= configurada y aún no hecho hoy) */
export function tocaResumen(now: Date, hora: number, ultimoResumenISO: string | null): boolean {
  if (now.getUTCHours() < hora) return false;
  if (!ultimoResumenISO) return true;
  return new Date(ultimoResumenISO).toISOString().slice(0, 10) !== now.toISOString().slice(0, 10);
}

/** Resumen diario determinista (no usa IA: solo cuenta tareas reales). */
export function resumenDiario(ts: { estado: string }[], fecha: string): string {
  const c: Record<string, number> = {};
  for (const t of ts) c[t.estado] = (c[t.estado] || 0) + 1;
  const g = (k: string) => c[k] || 0;
  return `Resumen ${fecha}: ${ts.length} tareas · pendientes ${g("pendiente")} · en revisión ${g("en_revision")} · requieren tu aprobación ${g("requiere_aprobacion")} · completadas ${g("completada")} · fallidas ${g("fallida")} · bloqueadas ${g("bloqueada")}.`;
}
