// Salud de la oficina: lógica pura que evalúa el estado a partir de datos reales. No deduce que el cron funciona por existir un YAML:
// lo infiere de ciclos persistidos con marca de tiempo (office_ciclos / latido).
export type EstadoOficina = "operativo" | "degradado" | "detenido" | "requiere_configuracion";
export type Alerta = { nivel: "critica" | "aviso"; texto: string };
export type EntradaSalud = {
  ahora: number; detenida: boolean; motivoParada?: string | null; bdOk: boolean; tablaControl: boolean; iaConfigurada: boolean; cronSecret: boolean; serviceKey: boolean;
  ultimoInicio: number | null; ultimoFin: number | null; ultimoResultado: string | null; ultimoError: string | null; cicloEnMarchaDesde: number | null;
  umbralCicloMin: number; umbralAtascoMin: number; maxErrores: number; erroresSeguidos: number;
  tareas: { pendientes: number; enCurso: number; bloqueadas: number; fallidas: number; aprobacion: number }; enCursoMasViejaMin: number | null;
  presupuesto?: { usado: number; limite: number }; cuotasAgotadas: string[];
};
const min = (a: number, b: number) => Math.round((a - b) / 60000);
export function evaluarSalud(e: EntradaSalud): { estado: EstadoOficina; alertas: Alerta[]; minutosDesdeCiclo: number | null } {
  const a: Alerta[] = []; const desde = e.ultimoInicio ? min(e.ahora, e.ultimoInicio) : null;
  const config: string[] = [];
  if (!e.bdOk) config.push("La base de datos no responde."); if (!e.tablaControl) config.push("Falta ejecutar el SQL 98 (control de la oficina).");
  if (!e.iaConfigurada) config.push("No hay proveedor de IA configurado en el servidor."); if (!e.cronSecret) config.push("Falta CRON_SECRET en Vercel: el cron no puede autenticarse."); if (!e.serviceKey) config.push("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  for (const c of config) a.push({ nivel: "critica", texto: c });
  if (e.detenida) a.push({ nivel: "critica", texto: `Oficina DETENIDA${e.motivoParada ? `: ${e.motivoParada}` : ""}. No se inician tareas nuevas.` });
  if (e.ultimoInicio == null) a.push({ nivel: "aviso", texto: "Aún no consta ningún ciclo registrado. Comprueba el cron de GitHub Actions." });
  else if (desde! > e.umbralCicloMin) a.push({ nivel: "critica", texto: `El ciclo lleva ${desde} min sin ejecutarse (umbral ${e.umbralCicloMin} min). El cron no ha invocado el endpoint o este falla.` });
  if (e.cicloEnMarchaDesde && min(e.ahora, e.cicloEnMarchaDesde) > Math.max(4, Math.floor(e.umbralAtascoMin / 4))) a.push({ nivel: "aviso", texto: `Hay un ciclo en marcha desde hace ${min(e.ahora, e.cicloEnMarchaDesde)} min: puede haberse excedido el tiempo permitido.` });
  if (e.ultimoResultado === "error" && e.ultimoError) a.push({ nivel: "aviso", texto: `Último error del ciclo: ${e.ultimoError}` });
  if (e.erroresSeguidos >= e.maxErrores) a.push({ nivel: "critica", texto: `${e.erroresSeguidos} ciclos con error seguidos (máximo ${e.maxErrores}).` });
  if (e.tareas.bloqueadas + e.tareas.fallidas > 0) a.push({ nivel: "aviso", texto: `${e.tareas.bloqueadas} bloqueada(s) y ${e.tareas.fallidas} fallida(s) necesitan tu atención.` });
  if (e.enCursoMasViejaMin != null && e.enCursoMasViejaMin > e.umbralAtascoMin) a.push({ nivel: "aviso", texto: `Hay una tarea en curso desde hace ${e.enCursoMasViejaMin} min (umbral ${e.umbralAtascoMin} min): posible atasco.` });
  if (e.tareas.aprobacion > 0) a.push({ nivel: "aviso", texto: `${e.tareas.aprobacion} tarea(s) esperan tu aprobación.` });
  if (e.cuotasAgotadas.length) a.push({ nivel: "critica", texto: `Cuota agotada: ${e.cuotasAgotadas.join(", ")}.` });
  if (e.presupuesto && e.presupuesto.limite > 0 && e.presupuesto.usado >= e.presupuesto.limite) a.push({ nivel: "aviso", texto: `Presupuesto diario de IA agotado (${e.presupuesto.usado}/${e.presupuesto.limite}).` });
  const estado: EstadoOficina = e.detenida ? "detenido" : config.length ? "requiere_configuracion" : a.some((x) => x.nivel === "critica") ? "degradado" : a.length ? "degradado" : "operativo";
  // Solo avisos informativos (aprobaciones pendientes) no degradan: es trabajo normal.
  const soloAprob = a.length > 0 && a.every((x) => x.texto.includes("esperan tu aprobación"));
  return { estado: !e.detenida && !config.length && soloAprob ? "operativo" : estado, alertas: a, minutosDesdeCiclo: desde };
}
/** Errores consecutivos: cuenta desde el ciclo más reciente hasta el primero que no sea "error". */
export function erroresSeguidos(resultados: (string | null)[]): number { let n = 0; for (const r of resultados) { if (r === "error") n++; else if (r === "parada" || r === "omitido") continue; else break; } return n; }
export const ETIQUETA_ESTADO: Record<EstadoOficina, string> = { operativo: "Operativa", degradado: "Degradada", detenido: "Detenida", requiere_configuracion: "Requiere configuración" };
