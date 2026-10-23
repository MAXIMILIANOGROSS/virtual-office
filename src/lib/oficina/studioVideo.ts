/** Estudio de vídeo: oficina de vídeo publicitario. Lógica pura (sin red ni BD). Las cabras solo PROPONEN guiones: nada se produce ni se publica sin aprobación humana. */
import { horaZona } from "./iniciativa.ts";
import { PROYECTO, dominioWeb, nombreProyecto } from "../../oficina.config.ts";

export const PREFIJO_GUION = "🎬 Guion de vídeo: ";
export const MAX_GUIONES_DIA = 3;
export const MAX_GUIONES_SIN_REVISAR = 9;
const HORA_INICIO = 8, HORA_FIN = 22; // zona horaria: oficina.config.ts

/** Brief de marca que usan las cabras de vídeo. Se construye SOLO con lo que rellenes en oficina.config.ts (sin datos = brief genérico). */
export function marcaBrief(): string {
  const p = PROYECTO; const f = (k: string, v: string) => (v.trim() ? `${k}: ${v.trim()}` : "");
  return [
    `${p.nombre.trim() ? p.nombre.trim().toUpperCase() + " · " : ""}BRAND BRIEF (vídeo)`,
    [f("Marca", p.nombre), f("Web", p.web), f("Ciudad o mercado", p.ciudad)].filter(Boolean).join(" · "),
    f("Misión / qué hace", p.descripcion), f("Sector", p.sector), f("Audiencia", p.publicoObjetivo), f("Propuesta de valor", p.propuestaDeValor), f("Tono", p.tono), f("Notas", p.notas),
    `Reglas: ${p.idioma}; gancho claro en los primeros segundos; UNA sola llamada a la acción; no inventar cifras de usuarios, clientes, ventas, testimonios ni resultados; no prometer resultados garantizados; no usar imágenes, música, voces o marcas sin derechos; entregar título, guion, texto en pantalla, descripción, CTA y propuesta de miniatura; piezas originales y distintas entre sí${dominioWeb() ? `; el enlace y la CTA deben apuntar a ${p.web.trim()}` : ""}.`,
  ].filter(Boolean).join("\n");
}
export const MARCA_BRIEF = marcaBrief();

export type Campana = { id: string; nombre: string; objetivo: string; publico: string };
export const CAMPANAS: Campana[] = [
  { id: "A", nombre: "Público principal", objetivo: PROYECTO.publicoObjetivo.trim() ? "captar y activar a tu público objetivo" : "captación de clientes (define tu objetivo en oficina.config.ts)", publico: PROYECTO.publicoObjetivo.trim() || "tu público objetivo principal" },
  { id: "B", nombre: "Público secundario", objetivo: "alianzas, partners y contactos comerciales", publico: "empresas, partners o prescriptores relacionados con el proyecto" },
  { id: "C", nombre: "Marca", objetivo: "alcance, comunidad y recuerdo de marca", publico: "comunidad y audiencia general del proyecto" },
];
/** Guionistas del departamento YouTube Studio que rotan en cada guion. */
export const GUIONISTAS = ["yt-guionista", "yt-shorts", "yt-titulos"] as const;

export type Herramienta = { id: string; nombre: string; rol: string; repo: string; prioridad: "ahora" | "después" | "opcional"; nota: string };
export const HERRAMIENTAS: Herramienta[] = [
  { id: "n8n", nombre: "n8n", rol: "Director de operaciones: conecta flujos, calendario y aprobaciones", repo: "https://github.com/n8n-io/n8n", prioridad: "ahora", nota: "Licencia con condiciones de uso: revísala antes de uso comercial." },
  { id: "mpt", nombre: "MoneyPrinterTurbo", rol: "Fábrica de anuncios: guion → recursos, voz, subtítulos y música", repo: "https://github.com/harry0703/MoneyPrinterTurbo", prioridad: "ahora", nota: "Necesita Docker y servidor con memoria y CPU." },
  { id: "penpot", nombre: "Penpot", rol: "Departamento de diseño: creatividades y plantillas de marca", repo: "https://github.com/penpot/penpot", prioridad: "ahora", nota: "No genera vídeo." },
  { id: "openshorts", nombre: "OpenShorts", rol: "Fábrica de Shorts: clips verticales desde vídeo largo", repo: "https://github.com/mutonby/openshorts", prioridad: "después", nota: "Algunas funciones usan APIs externas con coste." },
  { id: "chatterbox", nombre: "Chatterbox", rol: "Estudio de voz IA para locuciones", repo: "https://github.com/resemble-ai/chatterbox", prioridad: "opcional", nota: "Requiere recursos de cálculo." },
  { id: "buzz", nombre: "Buzz", rol: "Transcripción de entrevistas y subtítulos", repo: "https://github.com/chidiwilliams/buzz", prioridad: "opcional", nota: "Auxiliar, no imprescindible." },
];

export const ETAPAS = [
  { n: "1", t: "Planificador", d: "Campañas, objetivos y calendario", estado: "activo" },
  { n: "2", t: "Guiones y conceptos", d: "Las cabras de YouTube Studio proponen guiones solas", estado: "activo" },
  { n: "3", t: "Control de calidad", d: "Gancho, CTA única, enlace, cifras inventadas, promesas", estado: "activo" },
  { n: "4", t: "Motor de vídeo", d: "MoneyPrinterTurbo / OpenShorts", estado: "pendiente" },
  { n: "5", t: "Publicación y medición", d: "YouTube Data API, con tu aprobación", estado: "pendiente" },
] as const;

export const horaOk = (d: Date) => { const h = horaZona(d); return h >= HORA_INICIO && h < HORA_FIN; };
export const MAX_GUIONES_DIA_MANUAL = 8;
export function tocaGuion(o: { ahora: Date; guionesHoy: number; sinRevisar: number; usadasHoy: number; presupuestoDia: number; maxDia?: number }): boolean {
  return horaOk(o.ahora) && o.guionesHoy < (o.maxDia ?? MAX_GUIONES_DIA) && o.sinRevisar < MAX_GUIONES_SIN_REVISAR && o.usadasHoy < o.presupuestoDia;
}
export const campanaDe = (n: number): Campana => CAMPANAS[((n % CAMPANAS.length) + CAMPANAS.length) % CAMPANAS.length];
export const guionistaDe = (n: number): string => GUIONISTAS[((n % GUIONISTAS.length) + GUIONISTAS.length) % GUIONISTAS.length];

const ROL: Record<string, string> = {
  "yt-guionista": "Especialidad: anuncios narrativos, historias de marca, demostraciones del producto y captación. Entrega además ESCENAS (numeradas), CONCEPTO CREATIVO, OBJETIVO COMERCIAL, AUDIENCIA, DURACIÓN ESTIMADA y RIESGOS (afirmaciones por verificar).",
  "yt-shorts": "Especialidad: vídeo vertical 9:16 de ritmo rápido. Entrega además ESCENAS breves (2-4 s cada una), RITMO Y TRANSICIONES, SUBTÍTULOS propuestos y una VARIANTE alternativa del gancho que no sea un duplicado superficial.",
  "yt-titulos": "Especialidad: títulos, miniaturas y descubrimiento. Entrega además 5 TÍTULOS (marca el recomendado y justifícalo), 3 CONCEPTOS DE MINIATURA, PALABRAS CLAVE pertinentes, INTENCIÓN DE BÚSQUEDA y una variante para experimento.",
};
export function promptGuion(nombre: string, rol: string, c: Campana, previas: string[], agenteId = ""): string {
  return `Eres ${nombre}, ${rol} del estudio de vídeo${PROYECTO.nombre.trim() ? " de " + PROYECTO.nombre.trim() : ""} (perfil de IA, no una persona). Nadie te ha pedido nada: tomas la iniciativa y propones UN guion de vídeo publicitario para YouTube/Shorts.
${ROL[agenteId] || ""}
Campaña ${c.id} · ${c.nombre}. Objetivo: ${c.objetivo}. Público: ${c.publico}.
${MARCA_BRIEF}
Formato exacto, en texto plano (puedes añadir tus campos extra al final con su nombre en mayúsculas y dos puntos):
TÍTULO: (máx. 90 caracteres)
GANCHO: (primeros 3 segundos)
GUION: (SOLO el texto que dirá la voz en off, en frases naturales y completas, como hablaría una persona cercana, en español de España y con tuteo; 30-45 segundos, MÁXIMO 110 palabras. PROHIBIDO en este campo: tiempos como "0-3 s", descripciones de imagen o plano, paréntesis, corchetes, etiquetas como "Voz:", emojis y hashtags)
PLANOS: (qué se ve en pantalla mientras habla la voz; esto NO se locuta)
TEXTO EN PANTALLA: (3-5 líneas)
CTA: (UNA sola llamada a la acción${dominioWeb() ? " con " + PROYECTO.web.trim() : ""})
DESCRIPCIÓN: (2-3 líneas para YouTube)
MINIATURA: (propuesta)
No inventes cifras, testimonios ni funcionalidades de ${nombreProyecto()} que no existan. No repitas estos guiones ya propuestos: ${previas.length ? previas.slice(0, 8).join(" | ") : "ninguno todavía"}.`;
}

export type Guion = { titulo: string; cuerpo: string };
export function parseGuion(txt: string | null): Guion | null {
  const t = String(txt || "").trim(); if (t.length < 120) return null;
  const titulo = t.match(/T[ÍI]TULO:\s*(.+)/i)?.[1]?.trim().slice(0, 90);
  if (!titulo || !/GUION:/i.test(t) || !/CTA:/i.test(t)) return null;
  return { titulo, cuerpo: t.slice(0, 4000) };
}

export type Check = { id: string; ok: boolean; critico: boolean; texto: string; explicacion: string };
export type Control = { ok: boolean; estado: "Calidad superada" | "Revisar" | "Rechazado"; checks: Check[] };
/** Control de calidad determinista (no sustituye la revisión humana). Un fallo crítico = Rechazado: no avanza. */
export function controlCalidad(g: string): Control {
  const cta = (g.match(/CTA:\s*([^\n]+(?:\n(?![A-ZÁÉÍÓÚ ]+:)[^\n]+)*)/i)?.[1] || "");
  const C = (id: string, ok: boolean, critico: boolean, texto: string, explicacion: string): Check => ({ id, ok, critico, texto, explicacion });
  const checks: Check[] = [
    C("gancho", /GANCHO:\s*\S{8,}/i.test(g), false, "Tiene gancho inicial", "El primer segundo decide si el vídeo se ve."),
    C("cta", cta.length > 5 && (cta.match(/https?:\/\//g) || []).length <= 1, false, "Una sola llamada a la acción", "Varias CTA diluyen el resultado."),
    C("enlace", dominioWeb() ? (g.toLowerCase().includes(dominioWeb()) && !new RegExp("https?:\\/\\/(?!(www\\.)?" + dominioWeb().replace(/\./g, "\\.") + ")", "i").test(g)) : !/https?:\/\//i.test(g.replace(/CTA:[^\n]*/i, "")), true, dominioWeb() ? "El enlace apunta a " + dominioWeb() : "Sin enlaces externos inventados", "Solo se autoriza el dominio oficial configurado (o ninguno si no hay web configurada)."),
    C("cifras", !/\b\d[\d.,]*\s*(\+|mil)?\s*(usuarios|clientes|ventas|pedidos|descargas|suscriptores|empresas|personas)\b/i.test(g), true, "Sin cifras de usuarios o vacantes inventadas", "No hay datos verificados que las respalden."),
    C("promesa", !/(garantiz|aseguramos|seguro que encuentras|100\s?% de|te prometemos)/i.test(g), true, "Sin promesas de empleo", "No se puede prometer que alguien encuentre trabajo."),
    C("testimonio", !/(testimonio|me cambi[oó] la vida|gracias a (nosotros|esta marca) (encontr|consegu)|dijo:\s*["“])/i.test(g), true, "Sin testimonios inventados", "Un testimonio ficticio presentado como real es engañoso."),
  ];
  const critico = checks.some((c) => !c.ok && c.critico); const ok = checks.every((c) => c.ok);
  return { ok, estado: critico ? "Rechazado" : ok ? "Calidad superada" : "Revisar", checks };
}
/** Rotación ponderada: gana la campaña más por debajo de su peso en los últimos guiones. Devuelve también el motivo (auditable). */
export function elegirCampana(recientes: string[], pesos: Record<string, number> = { A: 40, B: 35, C: 25 }): { campana: Campana; motivo: string } {
  const n = recientes.length; const cuenta: Record<string, number> = { A: 0, B: 0, C: 0 }; recientes.forEach((r) => { if (cuenta[r] !== undefined) cuenta[r]++; });
  const tot = Object.values(pesos).reduce((a, b) => a + b, 0) || 1;
  let mejor = CAMPANAS[0], hueco = -Infinity;
  for (const c of CAMPANAS) { const h = (pesos[c.id] / tot) * (n + 1) - (cuenta[c.id] || 0); if (h > hueco) { hueco = h; mejor = c; } }
  return { campana: mejor, motivo: `Peso ${pesos[mejor.id]}%, ${cuenta[mejor.id] || 0} de ${n} recientes` };
}
export const instruccionGuion = (nombre: string, c: Campana, titulo: string) => `${PREFIJO_GUION}${nombre} · Campaña ${c.id}: ${titulo}`.slice(0, 300);
