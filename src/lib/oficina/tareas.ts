// Tareas de la oficina: estados, transiciones permitidas y niveles de autonomía. Lógica pura (sin red) para poder probarla.
export type Estado = "pendiente" | "planificada" | "en_curso" | "en_revision" | "requiere_aprobacion" | "completada" | "bloqueada" | "fallida" | "cancelada";
export const ESTADOS: Estado[] = ["pendiente", "planificada", "en_curso", "en_revision", "requiere_aprobacion", "completada", "bloqueada", "fallida", "cancelada"];
export const ESTADO_LABEL: Record<Estado, string> = { pendiente: "Pendiente", planificada: "Planificada", en_curso: "En curso", en_revision: "En revisión", requiere_aprobacion: "Requiere aprobación", completada: "Completada", bloqueada: "Bloqueada", fallida: "Fallida", cancelada: "Cancelada" };

const T: Record<Estado, Estado[]> = {
  pendiente: ["planificada", "en_curso", "cancelada", "bloqueada"],
  planificada: ["en_curso", "cancelada", "bloqueada"],
  en_curso: ["en_revision", "requiere_aprobacion", "fallida", "bloqueada", "cancelada"],
  en_revision: ["completada", "requiere_aprobacion", "en_curso", "fallida", "cancelada"],
  requiere_aprobacion: ["completada", "en_curso", "cancelada"],
  bloqueada: ["en_curso", "cancelada"],
  fallida: ["pendiente", "cancelada"],
  completada: [],
  cancelada: [],
};
export const puedeIr = (de: Estado, a: Estado): boolean => T[de]?.includes(a) ?? false;
export const esEstado = (x: unknown): x is Estado => typeof x === "string" && (ESTADOS as string[]).includes(x);

/** Autonomía: A automático (solo borrador), B con revisión, C requiere aprobación del CEO, D intervención humana. */
export type Nivel = "A" | "B" | "C" | "D";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function clasificarNivel(instruccion: string): Nivel {
  const t = norm(instruccion);
  if (/(demanda|abogado|reclamacion|denuncia|juicio|despido|inspeccion de trabajo)/.test(t)) return "D";
  if (/(gast|pag[oa]|compr|transfer|public(a|ar|aci)|envia|enviar|mensaje masivo|campana|desplieg|producci|borra|elimin|contrat|firma|factura)/.test(t)) return "C";
  if (/(codigo|sql|migraci|cambia|modifica|implementa|crea la)/.test(t)) return "B";
  return "A";
}
export const NIVEL_LABEL: Record<Nivel, string> = { A: "A · automático (solo borrador)", B: "B · con revisión", C: "C · requiere tu aprobación", D: "D · requiere intervención humana" };

/** Estado tras generar un resultado. NUNCA "completada": solo el CEO completa una tarea tras revisarla. */
export function estadoTrasEjecutar(nivel: Nivel, hayResultado: boolean): Estado {
  if (!hayResultado) return "fallida";
  return nivel === "C" || nivel === "D" ? "requiere_aprobacion" : "en_revision";
}
/** Una tarea solo puede completarse si tiene resultado y viene de revisión o aprobación. */
export function puedeCompletar(t: { estado: Estado; resultado?: string | null }): boolean {
  return (t.estado === "en_revision" || t.estado === "requiere_aprobacion") && !!(t.resultado && t.resultado.trim().length > 0);
}
export const INSTRUCCION_MAX = 2000;
export function limpiarInstruccion(raw: unknown): string { return typeof raw === "string" ? raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, INSTRUCCION_MAX) : ""; }

/** Canales de la bandeja unificada. Solo "interno" funciona hoy; el resto son adaptadores pendientes de credenciales y se muestran como NO conectados. */
export const CANALES = [
  { id: "interno", nombre: "Chat con CIRO", conectado: true, nota: "Funciona ahora." },
  { id: "whatsapp", nombre: "WhatsApp Business", conectado: false, nota: "Requiere cuenta de WhatsApp Business Platform, número verificado y webhook. No está conectado." },
  { id: "telefono", nombre: "Teléfono (voz)", conectado: false, nota: "Requiere proveedor de telefonía y voz (p. ej. Twilio) con coste por minuto. No está conectado." },
  { id: "email", nombre: "Correo", conectado: false, nota: "Pendiente de configurar un buzón y su acceso. No está conectado." },
] as const;
