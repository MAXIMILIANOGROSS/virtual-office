import { PROYECTO } from "../../oficina.config.ts";
/** Estudio de vídeo · de una orden en lenguaje natural a una campaña estructurada. Determinista (sin IA): usa valores por defecto seguros y lista lo que falta. */
export type Instruccion = {
  stop: boolean; nombre: string; objetivo: string; publico: "principal" | "secundario" | "marca"; localizacion: string; idioma: "es" | "en";
  canales: string[]; duracionDias: 7 | 14 | 30; videosPorDia: number; presupuestoMaxEur: number | null; cta: string; formatos: string[];
  supuestos: string[]; faltan: string[];
};
const NUM: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, siete: 7, diez: 10, catorce: 14, treinta: 30 };
const n = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUM[s.toLowerCase()] || 0);

export function interpretar(texto: string): Instruccion {
  const t = String(texto || "").slice(0, 1500); const l = t.toLowerCase(); const supuestos: string[] = []; const faltan: string[] = [];
  const stop = /\b(det[eé]n|para(r)?|cancela)\b.*\b(todo|todas|publicaci|campa[ñn]a)/.test(l) || /\bstop all\b/.test(l);
  const empresas = /empresa|negocio|b2b|profesional(es)?\b|partner|socio|distribuidor|due[ñn]o/.test(l); const trab = /cliente|usuario|consumidor|particular|b2c|comprador|suscriptor/.test(l);
  const publico: Instruccion["publico"] = empresas && !trab ? "secundario" : trab && !empresas ? "principal" : empresas && trab ? "secundario" : "marca";
  if (!empresas && !trab) supuestos.push("Sin público claro: se asume campaña de marca.");
  const canales: string[] = []; if (/youtube|shorts?/.test(l)) canales.push("youtube"); if (/instagram|reels?/.test(l)) canales.push("instagram"); if (/tiktok/.test(l)) canales.push("tiktok");
  if (!canales.length) { canales.push("youtube"); supuestos.push("Sin canal indicado: YouTube."); }
  const d = l.match(/(\d+|catorce|treinta|siete)\s*d[ií]as/); const dias = d ? n(d[1]) : 0; const duracionDias: 7 | 14 | 30 = dias >= 30 ? 30 : dias >= 14 ? 14 : 7;
  if (!d) supuestos.push("Sin duración indicada: 7 días.");
  let vpd = 1; if (/(\d+|dos|tres)\s*v[ií]deos?\s*(al|por|cada)\s*d[ií]a/.test(l)) vpd = Math.min(3, n(l.match(/(\d+|dos|tres)\s*v[ií]deos?\s*(al|por|cada)\s*d[ií]a/)![1]) || 1); else if (!/diari|cada d[ií]a|un v[ií]deo al d[ií]a/.test(l)) supuestos.push("Sin frecuencia indicada: 1 vídeo al día.");
  const p = l.match(/(\d[\d.]*)\s*(€|euros)/); const presupuestoMaxEur = p ? Number(p[1].replace(/\./g, "")) : null;
  if (presupuestoMaxEur === null) faltan.push("Presupuesto máximo (se aplicará el límite mensual configurado).");
  const loc = PROYECTO.ciudad.trim();
  if (!loc) supuestos.push("Sin localización configurada (oficina.config.ts): campaña sin foco geográfico.");
  const formatos = ["9:16"]; if (/horizontal|16:9|youtube(?!.*shorts)/.test(l) && !/shorts/.test(l)) formatos.push("16:9");
  const objetivo = publico === "secundario" ? "contactos comerciales y alianzas" : publico === "principal" ? "registros y clientes nuevos" : "alcance y recuerdo de marca";
  const cta = PROYECTO.web.trim();
  const nombre = (t.split(/[.\n]/)[0] || "Campaña").replace(/^(crea|prepara|produce)\s+/i, "").trim().slice(0, 70) || "Campaña";
  return { stop, nombre, objetivo, publico, localizacion: loc, idioma: /\bingl[eé]s|english\b/.test(l) ? "en" : "es", canales, duracionDias, videosPorDia: vpd, presupuestoMaxEur, cta, formatos, supuestos, faltan };
}
