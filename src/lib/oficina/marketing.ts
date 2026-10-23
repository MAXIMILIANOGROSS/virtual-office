// Estudio de marketing (Omnimarketing, primer corte). Lógica pura y probable: validación del encargo, prompt, lectura de la salida de la IA y comprobaciones locales de afirmaciones.
// Los "especialistas" son perspectivas dentro de UNA llamada al modelo (no hay 300 agentes). Nunca se inventan hechos: lo que falta se marca como [DATO PENDIENTE].
import type { KitMarca } from "./marca.ts";

export const MODOS = {
  mejorar: "Mejorar un texto que ya tengo",
  crear: "Crear publicidad desde una idea",
  redes: "Publicación para redes sociales",
  mensaje: "Email o WhatsApp comercial",
  empleo: "Anuncio de empleo",
  web: "Texto para web o landing",
  promocion: "Promoción o lanzamiento",
  revision: "Revisión crítica de un anuncio",
  traduccion: "Traducción comercial",
  ideas: "Ideas creativas y eslóganes",
} as const;
export type Modo = keyof typeof MODOS;
export const CANALES = { general: "Sin canal concreto", instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok / Reels (guion)", whatsapp: "WhatsApp", email: "Email", web: "Página web", ads: "Anuncio de pago (titular + descripción)" } as const;
export type Canal = keyof typeof CANALES;
/** Límites duros SOLO donde son conocidos y estables; el resto son recomendaciones. */
export const LIMITE_CANAL: Partial<Record<Canal, { max: number; nota: string }>> = { instagram: { max: 2200, nota: "pie de foto de Instagram: 2.200 caracteres" }, linkedin: { max: 3000, nota: "publicación de LinkedIn: 3.000 caracteres" } };
export const GUIA_CANAL: Record<Canal, string> = {
  general: "Adapta la longitud al objetivo.", instagram: "Primera línea que enganche; cuerpo breve; una llamada a la acción; máximo 5 hashtags relevantes.", facebook: "Mensaje cercano con beneficios concretos y una acción clara.",
  linkedin: "Apertura profesional, contexto empresarial, propuesta de valor y una invitación a conversar.", tiktok: "Gancho en la primera frase, guion hablado corto, texto en pantalla y cierre con llamada a la acción.", whatsapp: "Breve, natural, sin parecer spam; una sola invitación.",
  email: "Asunto (idealmente menos de 60 caracteres), preencabezado, cuerpo y una única llamada a la acción.", web: "Titular, subtítulo, problema, solución, beneficios, pruebas SOLO si existen y llamada a la acción.", ads: "3 titulares de máximo 30 caracteres y 2 descripciones de máximo 90 (formato de anuncio de búsqueda); comprueba las políticas de la plataforma.",
};
export const TONOS = {
  profesional: "Profesional y corporativo: frases claras, vocabulario sobrio, sin coloquialismos.", cercano: "Cercano y humano: tuteo, frases cortas, calidez sin cursilería.", premium: "Elegante y premium: pocas palabras, ritmo pausado, sin signos de exclamación.",
  directo: "Directo y comercial: beneficio primero, verbos de acción, sin rodeos.", creativo: "Creativo y original: una metáfora o giro memorable sin sacrificar claridad.", divertido: "Divertido y desenfadado: humor ligero que no dificulte entender la oferta.",
  inspirador: "Inspirador: visión y posibilidad, sin promesas exageradas.", tecnico: "Técnico y especializado: precisión, datos aportados por el usuario, sin jerga innecesaria.", turistico: "Turístico y experiencial: sensorial, sentido del lugar, invitación a vivir la experiencia.",
  local: "Local y comunitario: orgullo de lo cercano, voz de vecino.", urgente: "Urgente: SOLO si el usuario confirma una fecha límite o plazas reales; si no, usa tono directo.",
} as const;
export type Tono = keyof typeof TONOS;
export const OBJETIVOS = { vender: "Vender / reservar", captar: "Captar clientes o contactos", informar: "Informar de una novedad", candidaturas: "Recibir candidaturas", fidelizar: "Fidelizar o recuperar clientes", marca: "Construir marca" } as const;
export type Objetivo = keyof typeof OBJETIVOS;
export const AJUSTES = { "": "", mas_corto: "Hazlo bastante más corto sin perder el mensaje central.", mas_largo: "Desarróllalo más, con más detalle útil, sin relleno ni datos inventados.", mas_humano: "Hazlo más humano y natural.", mas_convincente: "Hazlo más convincente apoyándote solo en beneficios y pruebas ya presentes en el texto.", menos_comercial: "Hazlo menos comercial, más informativo y honesto." } as const;
export type Ajuste = keyof typeof AJUSTES;

export type Encargo = { modo: Modo; canal: Canal; tono: Tono; objetivo: Objetivo; texto: string; contexto: string; versiones: 1 | 3; ajuste: Ajuste; idioma: string };
const limpia = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max) : "");
export function limpiarEncargo(raw: unknown): { ok: true; e: Encargo } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(x: unknown, dic: Record<string, unknown>, d: T): T => (typeof x === "string" && x in dic ? (x as T) : d);
  const e: Encargo = { modo: pick<Modo>(r.modo, MODOS, "crear"), canal: pick<Canal>(r.canal, CANALES, "general"), tono: pick<Tono>(r.tono, TONOS, "cercano"), objetivo: pick<Objetivo>(r.objetivo, OBJETIVOS, "vender"), texto: limpia(r.texto, 3000), contexto: limpia(r.contexto, 1200), versiones: r.versiones === 1 || r.versiones === "1" ? 1 : 3, ajuste: pick<Ajuste>(r.ajuste, AJUSTES, ""), idioma: limpia(r.idioma, 20) || "español de España" };
  if (e.texto.length < 8) return { ok: false, error: e.modo === "mejorar" || e.modo === "revision" || e.modo === "traduccion" ? "Pega el texto que quieres trabajar (mínimo 8 caracteres)." : "Cuéntame la idea con al menos una frase (mínimo 8 caracteres)." };
  if (e.ajuste) e.versiones = 1;
  return { ok: true, e };
}

const TAREA: Record<Modo, string> = {
  mejorar: "Mejora el texto del usuario conservando su intención y sus datos. Corrige gramática y estilo. No añadas hechos nuevos.", crear: "Crea la pieza publicitaria a partir de la idea del usuario usando solo los datos facilitados.",
  redes: "Escribe una publicación adaptada al canal indicado.", mensaje: "Escribe un mensaje comercial breve y natural para el canal indicado.", empleo: "Escribe un anuncio de empleo claro, inclusivo y fiel a las condiciones facilitadas. No inventes salario, beneficios ni requisitos.",
  web: "Escribe el texto de una página web: titular, subtítulo, problema, solución, beneficios, preguntas frecuentes (solo si hay datos) y llamada a la acción.", promocion: "Escribe el mensaje de una promoción o lanzamiento. No inventes descuentos, fechas ni escasez.",
  revision: "Haz una revisión crítica del anuncio: explica sus debilidades en 'diagnostico' y entrega una versión mejorada.", traduccion: "Traduce y adapta comercialmente el texto al idioma indicado manteniendo intención y contexto cultural.", ideas: "Propón conceptos de campaña, titulares y eslóganes realmente distintos entre sí.",
};
export function promptMarketing(e: Encargo, kit?: Partial<KitMarca> | null): string {
  const marca = kit && kit.nombre ? ["Perfil de marca aprobado (úsalo como única fuente de datos de la empresa):", `- Marca: ${kit.nombre}`, kit.eslogan && `- Eslogan: ${kit.eslogan}`, kit.sector && `- Sector: ${kit.sector}`, kit.localidad && `- Localidad: ${kit.localidad}`, kit.contacto && `- Contacto: ${kit.contacto}`, kit.url && `- Enlace: ${kit.url}`].filter(Boolean).join("\n") : "No hay perfil de marca seleccionado: usa solo lo que escriba el usuario.";
  return [
    "Eres el director de estrategia de un estudio de marketing con especialistas en copywriting, branding, psicología del consumidor, redes sociales, SEO, email, ventas, marketing local y ética publicitaria. Consolida sus perspectivas en UNA respuesta coherente; usa solo las que sean relevantes.",
    `Tarea: ${TAREA[e.modo]}`, `Objetivo comercial: ${OBJETIVOS[e.objetivo]}.`, `Canal: ${CANALES[e.canal]}. ${GUIA_CANAL[e.canal]}`, `Tono: ${TONOS[e.tono]}`, `Idioma de salida: ${e.idioma}.`, e.ajuste ? `Ajuste pedido: ${AJUSTES[e.ajuste]}` : "",
    marca, e.contexto ? `Contexto aportado por el usuario: ${e.contexto}` : "",
    "REGLAS INNEGOCIABLES: (1) No inventes hechos: ni precios, cifras, porcentajes, premios, clientes, testimonios, reseñas, certificaciones, descuentos, plazos, escasez ni resultados. (2) Si falta un dato necesario, escribe [DATO PENDIENTE: qué falta] en lugar de inventarlo. (3) Nada de urgencia o exclusividad ficticias. (4) Psicología del consumidor para ser más claro y relevante, nunca para explotar vulnerabilidades. (5) No prometas resultados garantizados. (6) No discrimines. (7) Usa tuteo salvo que el tono pida otra cosa.",
    e.versiones === 3 ? "Entrega TRES versiones con enfoques realmente distintos: A clara y directa, B persuasiva y comercial, C creativa y memorable." : "Entrega UNA sola versión.",
    "Responde SOLO con JSON válido, sin texto fuera del JSON ni bloques de código, con esta forma exacta: {\"diagnostico\":\"1-3 frases sobre lo que entendiste, el público y la estructura elegida (AIDA, PAS, FAB, BAB, storytelling o propuesta directa)\",\"supuestos\":[\"supuestos explícitos que hiciste\"],\"versiones\":[{\"etiqueta\":\"A · Clara y directa\",\"texto\":\"...\"}],\"afirmaciones_a_verificar\":[\"cualquier afirmación del texto que el usuario deba confirmar antes de publicar\"],\"pregunta\":\"una única pregunta breve si falta un dato esencial, o cadena vacía\"}",
  ].filter(Boolean).join("\n");
}

export type Version = { etiqueta: string; texto: string };
export type Salida = { diagnostico: string; supuestos: string[]; versiones: Version[]; verificar: string[]; pregunta: string; formato: "json" | "texto" };
const arrS = (x: unknown, n: number, m: number) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string").map((s) => s.trim().slice(0, m)).filter(Boolean).slice(0, n) : []);
/** Lee la respuesta del modelo. Si no es JSON válido, la entrega como texto único (nunca se pierde ni se inventa estructura). */
export function parseSalida(raw: string): Salida | null {
  const t = (raw || "").trim(); if (!t) return null;
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i >= 0 && j > i) {
    try {
      const o = JSON.parse(t.slice(i, j + 1)) as Record<string, unknown>;
      const vs = Array.isArray(o.versiones) ? o.versiones.map((v) => { const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>; return { etiqueta: String(r.etiqueta || "Versión").slice(0, 60), texto: typeof r.texto === "string" ? r.texto.trim().slice(0, 6000) : "" }; }).filter((v) => v.texto).slice(0, 3) : [];
      if (vs.length) return { diagnostico: typeof o.diagnostico === "string" ? o.diagnostico.slice(0, 600) : "", supuestos: arrS(o.supuestos, 8, 200), versiones: vs, verificar: arrS(o.afirmaciones_a_verificar, 10, 220), pregunta: typeof o.pregunta === "string" ? o.pregunta.slice(0, 200) : "", formato: "json" };
    } catch { /* cae a texto */ }
  }
  return { diagnostico: "", supuestos: [], versiones: [{ etiqueta: "Versión", texto: t.slice(0, 6000) }], verificar: [], pregunta: "", formato: "texto" };
}

export type Alerta = { tipo: string; fragmento: string; motivo: string };
const REGLAS: [string, RegExp, string][] = [
  ["Cifra o porcentaje", /\d+(?:[.,]\d+)?\s?%/g, "Confirma que la cifra es real y puedes demostrarla."],
  ["Superlativo", /\b(?:el|la|los|las)?\s*(?:mejor(?:es)?|n[uú]mero ?1|n[ºo] ?1|l[ií]der|[uú]nic[oa]s?|m[aá]s (?:barat[oa]|r[aá]pid[oa]|econ[oó]mic[oa])|sin competencia)\b/gi, "Los superlativos necesitan prueba; si no la tienes, suavízalo."],
  ["Garantía o promesa", /\b(?:garantizad[oa]s?|garantizamos|sin riesgo|100 ?%|resultados asegurados|te aseguramos)\b/gi, "No prometas resultados garantizados sin fundamento."],
  ["Urgencia o escasez", /(?:[uú]ltim[oa]s? (?:plazas?|unidades?|d[ií]as?)|solo hoy|oferta limitada|termina (?:hoy|ma[ñn]ana)|quedan (?:pocas|\d+)|ahora o nunca|[uú]nica oportunidad)/gi, "Solo usa urgencia si es real y tienes la fecha o el número exacto."],
  ["Gratuidad", /\b(?:gratis|gratuit[oa]s?|sin coste|sin compromiso)\b/gi, "Confirma las condiciones reales y cualquier coste asociado."],
  ["Testimonio o reseña", /(?:nuestros clientes (?:dicen|opinan|adoran)|testimonios?|rese[ñn]as?|opiniones de|[★⭐])/gi, "No uses testimonios ni reseñas que no sean reales y autorizados."],
  ["Descuento", /\b\d{1,2} ?% de (?:descuento|dto)|\b(?:descuento|rebajas?|oferta) (?:de|del) \d/gi, "Confirma el descuento, sus condiciones y su vigencia."],
  ["Dato pendiente", /\[DATO PENDIENTE[^\]]*\]/g, "Falta un dato: complétalo antes de publicar."],
];
/** Comprobación determinista (sin IA) de afirmaciones que requieren evidencia. No sustituye la revisión humana ni jurídica. */
export function revisarAfirmaciones(texto: string): Alerta[] {
  const out: Alerta[] = []; const vistos = new Set<string>();
  for (const [tipo, re, motivo] of REGLAS) { for (const m of texto.matchAll(re)) { const f = m[0].trim(); const k = tipo + "|" + f.toLowerCase(); if (!f || vistos.has(k)) continue; vistos.add(k); out.push({ tipo, fragmento: f.slice(0, 80), motivo }); if (out.filter((a) => a.tipo === tipo).length >= 3) break; } }
  return out;
}
/** Estado de longitud frente al límite del canal (solo límites conocidos). */
export function estadoLongitud(texto: string, canal: Canal): { n: number; max: number | null; excede: boolean; nota: string } {
  const l = LIMITE_CANAL[canal]; const n = texto.length; return { n, max: l ? l.max : null, excede: !!l && n > l.max, nota: l ? l.nota : "" };
}
