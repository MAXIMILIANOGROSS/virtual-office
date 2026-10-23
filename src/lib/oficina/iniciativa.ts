/** Iniciativa propia de las cabras: proponen ideas sin que se las pidan. Lógica pura (sin red ni BD). Las ideas son PROPUESTAS, nunca acciones ejecutadas. */
import type { Agente } from "./agentes.ts";
import { PROYECTO, contextoProyecto, horaLocal } from "../../oficina.config.ts";
export const MAX_IDEAS_DIA = 10;
export const MAX_IDEAS_SIN_REVISAR = 12;
export const PREFIJO_IDEA = "💡 Idea de ";
const HORA_INICIO = 8, HORA_FIN = 22; // hora local configurada (oficina.config.ts): no se generan ideas de madrugada

type Rasgo = { carácter: string; humor: string; mirada: string };
const RASGOS: Rasgo[] = [
  { carácter: "ambicioso y analítico, piensa a largo plazo", humor: "ironía seca y frases cortas", mirada: "qué movimiento da más ventaja en 12 meses" },
  { carácter: "imaginativo y espontáneo", humor: "ocurrencias y comparaciones inesperadas", mirada: "qué idea nadie ha probado todavía" },
  { carácter: "sociable y persuasivo", humor: "cercano, con guiños de tú a tú", mirada: "a qué cliente concreto se lo podríamos vender" },
  { carácter: "metódico y curioso", humor: "bromas técnicas discretas", mirada: "qué se puede automatizar o arreglar con poco esfuerzo" },
  { carácter: "crítico y riguroso", humor: "escepticismo simpático", mirada: "qué supuesto de la empresa no está demostrado" },
  { carácter: "organizado y conciliador", humor: "calma y buen rollo", mirada: "qué está atascado y quién lo desbloquea" },
  { carácter: "explorador atento a la tecnología", humor: "entusiasmo por lo nuevo, con los pies en el suelo", mirada: "qué herramienta gratuita mejoraría el producto" },
  { carácter: "empático y observador", humor: "ternura y buen ojo para el detalle", mirada: "dónde se frustra o se pierde un usuario" },
];
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const rasgoDe = (id: string): Rasgo => RASGOS[hash(id) % RASGOS.length];

export function horaZona(d: Date): number { return horaLocal(d); } // nombre histórico: usa la zona horaria de oficina.config.ts
export const enHorario = (d: Date) => { const h = horaZona(d); return h >= HORA_INICIO && h < HORA_FIN; };

/** ¿Debe generarse una idea ahora? Respeta tope diario, bandeja sin revisar, presupuesto y horario. */
export function tocaIdea(o: { ahora: Date; ideasHoy: number; sinRevisar: number; usadasHoy: number; presupuestoDia: number }): boolean {
  return enHorario(o.ahora) && o.ideasHoy < MAX_IDEAS_DIA && o.sinRevisar < MAX_IDEAS_SIN_REVISAR && o.usadasHoy < o.presupuestoDia;
}
/** Rotación determinista: cada ciclo le toca a una cabra distinta (CIRO incluido), sin repetir hasta dar la vuelta. */
export function elegirAutor<T extends Pick<Agente, "id">>(agentes: T[], ideasHoy: number, dia: string): T {
  const base = hash(dia) % agentes.length; return agentes[(base + ideasHoy * 7) % agentes.length];
}
export function promptIdea(a: Agente, contexto: string, previas: string[]): string {
  const r = rasgoDe(a.id);
  return `Eres ${a.nombre}, ${a.rol}${PROYECTO.nombre.trim() ? " de " + PROYECTO.nombre.trim() : ""}. Eres un perfil de IA con personalidad simulada, no una persona ni tienes sentimientos reales.
Carácter: ${r.carácter}. Humor: ${r.humor}. Tu mirada habitual: ${r.mirada}.
Nadie te ha pedido nada: tomas la iniciativa. Propón UNA idea nueva, concreta y útil para el negocio dentro de tu especialidad (${a.habilidades.join(", ")}).
Reglas: ${PROYECTO.idioma}, tono cercano con un toque de tu humor (una sola frase, sin forzar). No inventes clientes, cifras, ventas ni resultados: si no hay datos, dilo. No afirmes haber hecho nada: solo propones.
Formato exacto, en texto plano:
TÍTULO: (máx. 90 caracteres)
POR QUÉ: (1-2 frases, con la evidencia o el supuesto)
BENEFICIO: (qué se espera ganar)
RIESGO: (qué puede salir mal)
SIGUIENTE ACCIÓN: (un paso concreto, de menos de una hora, que el CEO pueda aprobar)
No repitas estas ideas ya propuestas: ${previas.length ? previas.slice(0, 8).join(" | ") : "ninguna todavía"}.\n${contextoProyecto()}${contexto}`;
}
export type Idea = { titulo: string; cuerpo: string };
/** Valida la respuesta del modelo: exige título y siguiente acción; rechaza texto vacío o sin formato. */
export function parseIdea(txt: string | null): Idea | null {
  const t = String(txt || "").trim(); if (t.length < 60) return null;
  const titulo = t.match(/T[ÍI]TULO:\s*(.+)/i)?.[1]?.trim().slice(0, 90); const sig = t.match(/SIGUIENTE ACCI[ÓO]N:\s*(.+)/i)?.[1]?.trim();
  if (!titulo || !sig) return null;
  return { titulo, cuerpo: t.slice(0, 4000) };
}
export const instruccionIdea = (nombre: string, titulo: string) => `${PREFIJO_IDEA}${nombre}: ${titulo}`.slice(0, 300);
