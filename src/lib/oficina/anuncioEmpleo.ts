import { esFondoLocal } from "./fondos.ts";
// Hiring Studio (primer corte): anuncios de vacantes compuestos por código. Lógica pura y probable.
// Regla de oro: NO se inventa ningún dato (salario, beneficios, requisitos). Solo se muestra lo que la empresa escribe.
export type FormatoEmpleo = "ig_cuadrado" | "ig_vertical" | "story" | "a4" | "banner";
export const FORMATOS_EMPLEO: Record<FormatoEmpleo, { w: number; h: number; nombre: string }> = {
  ig_cuadrado: { w: 1080, h: 1080, nombre: "Instagram / Facebook cuadrado 1080×1080" },
  ig_vertical: { w: 1080, h: 1350, nombre: "Instagram vertical 1080×1350" },
  story: { w: 1080, h: 1920, nombre: "Stories / Reels / TikTok 1080×1920" },
  a4: { w: 1240, h: 1754, nombre: "Cartel A4 imprimible (150 ppp)" },
  banner: { w: 1200, h: 628, nombre: "Banner web / LinkedIn 1200×628" },
};
export type EstiloEmpleo = "corporativo" | "urgente" | "mediterraneo" | "minimalista" | "premium";
export const ESTILOS_EMPLEO: Record<EstiloEmpleo, { nombre: string; bg: string; fondo: string; acento: string; texto: string; suave: string; chip: string; chipTxt: string; peso: number }> = {
  corporativo: { nombre: "Corporativo elegante", bg: "#07182E", fondo: "linear-gradient(160deg,#0B2A5B 0%,#07182E 70%)", acento: "#FFD600", texto: "#FFFFFF", suave: "#A9C1E8", chip: "#1D5FD0", chipTxt: "#FFFFFF", peso: 900 },
  urgente: { nombre: "Urgente · incorporación inmediata", bg: "#B91C1C", fondo: "linear-gradient(160deg,#DC2626 0%,#7F1D1D 80%)", acento: "#FDE047", texto: "#FFFFFF", suave: "#FECACA", chip: "#FDE047", chipTxt: "#7F1D1D", peso: 900 },
  mediterraneo: { nombre: "Turístico y mediterráneo", bg: "#0E7490", fondo: "linear-gradient(160deg,#06B6D4 0%,#0E7490 55%,#164E63 100%)", acento: "#FDE68A", texto: "#FFFFFF", suave: "#CFFAFE", chip: "#FDE68A", chipTxt: "#164E63", peso: 800 },
  minimalista: { nombre: "Minimalista", bg: "#FAFAF9", fondo: "linear-gradient(180deg,#FFFFFF 0%,#F5F5F4 100%)", acento: "#111827", texto: "#111827", suave: "#6B7280", chip: "#111827", chipTxt: "#FFFFFF", peso: 800 },
  premium: { nombre: "Premium", bg: "#0A0A0A", fondo: "linear-gradient(160deg,#1C1917 0%,#0A0A0A 75%)", acento: "#D4AF37", texto: "#F5F5F4", suave: "#A8A29E", chip: "#D4AF37", chipTxt: "#0A0A0A", peso: 700 },
};
export const CONTRATOS = ["", "Indefinido", "Temporal", "Fijo discontinuo", "Prácticas", "Autónomo", "A convenir"] as const;
export const MODALIDADES = ["", "Presencial", "Híbrido", "Remoto"] as const;

export type Vacante = {
  formato: FormatoEmpleo; estilo: EstiloEmpleo; empresa: string; puesto: string; sector: string; localidad: string; modalidad: string; contrato: string; jornada: string; horario: string;
  salario: string; funciones: string; requisitos: string; beneficios: string; incorporacion: string; plazo: string; contacto: string; url: string; fotoUrl: string;
};
export const LIMV: Record<keyof Vacante, number> = { formato: 12, estilo: 14, empresa: 60, puesto: 70, sector: 40, localidad: 60, modalidad: 12, contrato: 20, jornada: 40, horario: 60, salario: 60, funciones: 160, requisitos: 160, beneficios: 140, incorporacion: 40, plazo: 40, contacto: 70, url: 200, fotoUrl: 500 };
const limpia = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

export function limpiarVacante(raw: unknown): { ok: true; v: Vacante } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = limpia(r.formato, 12) as FormatoEmpleo; const e = limpia(r.estilo, 14) as EstiloEmpleo;
  const v = { formato: f in FORMATOS_EMPLEO ? f : "ig_cuadrado", estilo: e in ESTILOS_EMPLEO ? e : "corporativo" } as Vacante;
  for (const k of Object.keys(LIMV) as (keyof Vacante)[]) if (k !== "formato" && k !== "estilo") (v as Record<string, string>)[k] = limpia(r[k], LIMV[k]);
  if (!v.empresa) return { ok: false, error: "Falta el nombre de la empresa." };
  if (!v.puesto) return { ok: false, error: "Falta el nombre del puesto." };
  if (!v.contacto && !v.url) return { ok: false, error: "Indica cómo solicitar el puesto: un contacto o un enlace." };
  if (v.url && !/^https:\/\/[^\s]+$/i.test(v.url)) return { ok: false, error: "El enlace debe empezar por https://" };
  if (v.fotoUrl && !esFondoLocal(v.fotoUrl) && !/^https:\/\/[^\s]+$/i.test(v.fotoUrl)) return { ok: false, error: "La foto debe ser una URL https." };
  return { ok: true, v };
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Avisos de revisión (no bloquean): lenguaje potencialmente discriminatorio. No es asesoría legal: la empresa es responsable del contenido. */
const SENSIBLES: [RegExp, string][] = [
  [/(solo|solamente|exclusivamente) (mujeres|hombres|chicas|chicos)/, "Indica sexo como requisito: puede ser discriminatorio."],
  [/(buena presencia|aspecto fisico|atractiv[oa])/, "Pide aspecto físico: suele considerarse discriminatorio."],
  [/(menor de|maximo de?) \d+ anos|\b(entre|hasta) \d{2} (y \d{2} )?anos|edad (maxima|minima|entre)/, "Fija una edad: puede ser discriminatorio por edad."],
  [/(sin hijos|soltero|soltera|no embarazada)/, "Menciona situación familiar o embarazo: no debe ser un requisito."],
  [/(nacionalidad espanola|solo espanoles|raza|etnia)/, "Menciona origen o nacionalidad: revisa la normativa antes de publicar."],
  [/\bjoven(es)?\b|\bveterano\b/, "Edad implícita (\"joven\"): usa criterios de capacidad, no de edad."],
];
export function avisosVacante(v: Vacante): string[] {
  const a: string[] = []; const t = norm([v.puesto, v.funciones, v.requisitos, v.beneficios, v.jornada, v.horario].join(" | "));
  for (const [re, m] of SENSIBLES) if (re.test(t)) a.push(m);
  if (!v.localidad) a.push("Falta la localidad: los candidatos suelen descartar ofertas sin ubicación.");
  if (!v.contrato) a.push("Falta el tipo de contrato.");
  if (!v.salario) a.push("No indicas salario: se publicará sin él (no se inventa). Las ofertas con salario reciben más candidaturas.");
  return a;
}

export type Textos = { whatsapp: string; linkedin: string; instagram: string };
/** Textos de publicación compuestos SOLO con los datos aportados (sin IA). */
export function textosVacante(v: Vacante): Textos {
  const dato = (et: string, x: string) => (x ? `${et}: ${x}` : "");
  const lineas = [dato("📍 Lugar", [v.localidad, v.modalidad].filter(Boolean).join(" · ")), dato("📄 Contrato", [v.contrato, v.jornada].filter(Boolean).join(" · ")), dato("🕒 Horario", v.horario), dato("💶 Salario", v.salario), dato("🛠 Funciones", v.funciones), dato("✅ Requisitos", v.requisitos), dato("🎁 Ofrecemos", v.beneficios), dato("📅 Incorporación", v.incorporacion), dato("⏳ Plazo", v.plazo)].filter(Boolean);
  const solic = v.url ? `Solicita aquí: ${v.url}` : "";
  const cont = v.contacto ? `Contacto: ${v.contacto}` : "";
  const cuerpo = [...lineas, cont, solic].filter(Boolean).join("\n");
  const tag = (s: string) => "#" + norm(s).replace(/[^a-z0-9]/g, "");
  const tags = [v.sector && tag(v.sector), v.localidad && tag(v.localidad), "#empleo", "#trabajo", "#ofertadeempleo"].filter(Boolean).join(" ");
  return {
    whatsapp: `*${v.empresa} busca ${v.puesto}*\n\n${cuerpo}`,
    linkedin: `${v.empresa} incorpora: ${v.puesto}\n\n${cuerpo}\n\n#empleo #contratando${v.sector ? " " + tag(v.sector) : ""}`,
    instagram: `📢 Buscamos ${v.puesto} · ${v.empresa}\n\n${cuerpo}\n\n${tags}`,
  };
}
/** Tamaño del titular según longitud y formato: el texto nunca se corta. */
export function tamanoPuesto(texto: string, formato: FormatoEmpleo): number {
  const base = formato === "story" ? 120 : formato === "a4" ? 110 : formato === "banner" ? 62 : formato === "ig_vertical" ? 100 : 94;
  const n = texto.length; const k = n <= 16 ? 1 : n <= 28 ? 0.8 : n <= 45 ? 0.64 : 0.5;
  return Math.round(base * k);
}
/** Filas de datos a mostrar en el anuncio (solo las rellenas). */
export function filasAnuncio(v: Vacante, max: number): { et: string; valor: string }[] {
  const f: { et: string; valor: string }[] = [];
  const add = (et: string, valor: string) => { if (valor) f.push({ et, valor }); };
  add("Lugar", [v.localidad, v.modalidad].filter(Boolean).join(" · ")); add("Contrato", [v.contrato, v.jornada].filter(Boolean).join(" · ")); add("Horario", v.horario);
  add("Salario", v.salario); add("Ofrecemos", v.beneficios); add("Requisitos", v.requisitos); add("Incorporación", v.incorporacion); add("Plazo", v.plazo);
  return f.slice(0, max);
}
