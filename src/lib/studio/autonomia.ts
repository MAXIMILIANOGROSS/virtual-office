/** Estudio de vídeo · modos de autonomía y STOP ALL. Lógica pura: decide si se puede publicar. */
export type Modo = "TEST" | "SUPERVISADO" | "AUTONOMO";
export const MODOS: { id: Modo; nombre: string; d: string }[] = [
  { id: "TEST", nombre: "Test", d: "Genera contenido de prueba. No publica fuera." },
  { id: "SUPERVISADO", nombre: "Supervisado", d: "Genera y espera tu aprobación antes de publicar." },
  { id: "AUTONOMO", nombre: "Autónomo", d: "Genera, valida, programa y publica dentro de los límites." },
];
export type Veredicto = "PASS" | "WARNING" | "FAIL";
export type Categoria = "tecnico" | "editorial" | "legal" | "privacidad" | "derechos" | "seguridad" | "afirmaciones";
export type Revision = { id: string; categoria: Categoria; veredicto: Veredicto };
const CRITICAS: Categoria[] = ["legal", "privacidad", "derechos", "seguridad", "afirmaciones"];

export type Entrada = { modo: Modo; stopAll: boolean; revisiones: Revision[]; aprobadoPorHumano: boolean; presupuestoOk: boolean; canalAutorizado: boolean; yaPublicado: boolean };
export type Decision = { accion: "publicar" | "esperar_aprobacion" | "bloquear" | "no_publicar_test"; motivo: string };

export function decidirPublicacion(e: Entrada): Decision {
  if (e.stopAll) return { accion: "bloquear", motivo: "STOP ALL activo" };
  if (e.yaPublicado) return { accion: "bloquear", motivo: "Ya publicado: se evita el duplicado" };
  if (e.revisiones.some((r) => r.veredicto === "FAIL")) return { accion: "bloquear", motivo: "Control de calidad con FAIL" };
  if (e.revisiones.some((r) => r.veredicto === "WARNING" && CRITICAS.includes(r.categoria))) return { accion: "bloquear", motivo: "WARNING crítico (legal, privacidad, derechos, seguridad o afirmaciones) sin resolver" };
  if (e.modo === "TEST") return { accion: "no_publicar_test", motivo: "Modo test: no se publica fuera" };
  if (!e.canalAutorizado) return { accion: "bloquear", motivo: "El canal no está autorizado" };
  if (!e.presupuestoOk) return { accion: "bloquear", motivo: "Presupuesto agotado" };
  if (e.modo === "SUPERVISADO" && !e.aprobadoPorHumano) return { accion: "esperar_aprobacion", motivo: "Falta tu aprobación" };
  return { accion: "publicar", motivo: e.modo === "AUTONOMO" ? "Autónomo: controles superados" : "Aprobado por ti" };
}
/** STOP ALL: qué debe hacerse con cada trabajo según su estado (no borra nada publicado). */
export function efectoStopAll(estado: string): "cancelar" | "esperar" | "conservar" {
  if (["CREATED", "PLANNED", "SCRIPTED", "ASSETS_PENDING", "APPROVED", "SCHEDULED"].includes(estado)) return "cancelar";
  if (["PRODUCING", "QUALITY_CHECK", "PUBLISHING"].includes(estado)) return "esperar"; // se deja terminar el paso en curso sin avanzar
  return "conservar";
}
