// Imagen publicitaria a partir de un texto (Estudio de marketing → «Crear imagen»). Lógica pura y probable.
import { MARCA_VISUAL, firmaImagen } from "../../oficina.config.ts";
export const FORMATOS_AD = { ig_cuadrado: { w: 1080, h: 1080, n: "Instagram cuadrado" }, ig_vertical: { w: 1080, h: 1350, n: "Instagram vertical" }, story: { w: 1080, h: 1920, n: "Historia / Reel" } } as const;
export type FormatoAd = keyof typeof FORMATOS_AD;
export const ORDEN_FORMATOS: FormatoAd[] = ["ig_cuadrado", "ig_vertical", "story"];
export const LIM = { titular: 48, subtitulo: 90, cta: 28 } as const;
export type Anuncio = { titular: string; subtitulo: string; cta: string; fondo: string; formato: FormatoAd };
export type CamposImagen = { titular?: unknown; subtitulo?: unknown; cta?: unknown; fondo?: unknown; formato?: unknown };
/** Texto por defecto del botón: la firma configurada (web o nombre). */
export const ctaPorDefecto = (): string => (firmaImagen() ? `Entra en ${firmaImagen()}` : "Más información");
const limpia = (t: string, max: number) => t.replace(/\*\*|__|`|<|>/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const quitarEmojis = (t: string) => t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{20E3}]/gu, "");
function cortar(t: string, max: number): string {
  const s = t.trim(); if (s.length <= max) return s;
  const c = s.slice(0, max + 1); const i = c.lastIndexOf(" "); return (i > max * 0.5 ? c.slice(0, i) : s.slice(0, max)).replace(/[\s,;:\-–—]+$/, "");
}
const esFondo = (u: string) => /^\/fondos\/[a-z0-9-]+\.jpg$/.test(u);
/** Propone titular, subtítulo y CTA a partir de un texto libre (post, anuncio, guion…). El usuario puede editarlos antes de generar. */
export function desdeTexto(texto: string): { titular: string; subtitulo: string; cta: string } {
  const limpio = quitarEmojis(String(texto || "")).replace(/https?:\/\/\S+/g, " ").replace(/#[\p{L}\p{N}_]+/gu, " ").replace(/\*\*|__|`/g, "");
  const frases = limpio.split(/\n+/).map((l) => l.trim().replace(/^[-•·>\s]+/, "").replace(/^(titular|descripci[oó]n|asunto|gancho|cuerpo|t[ií]tulo|cta)\s*\d*\s*:\s*/i, "").trim())
    .flatMap((l) => l.split(/(?<=[.!?])\s+/)).map((f) => f.trim()).filter((f) => f.length >= 6 && !/^\[?dato pendiente/i.test(f));
  if (!frases.length) return { titular: "", subtitulo: "", cta: ctaPorDefecto() };
  const iT = Math.max(0, frases.slice(0, 3).findIndex((f) => f.length <= LIM.titular)); const titular = cortar(frases[iT].replace(/[.]+$/, ""), LIM.titular);
  const resto = frases.filter((_, i) => i !== iT).join(" "); const subtitulo = cortar(resto, LIM.subtitulo);
  return { titular, subtitulo, cta: ctaPorDefecto() };
}
/** Valida y normaliza los campos que llegan del panel: nada de HTML, límites de longitud, solo fondos locales conocidos. */
export function validarImagen(b: CamposImagen): { ok: true; a: Anuncio } | { ok: false; error: string } {
  const s = (v: unknown, max: number) => (typeof v === "string" ? limpia(v, max) : "");
  const titular = s(b.titular, LIM.titular); if (titular.length < 3) return { ok: false, error: "Escribe un titular (mínimo 3 letras)." };
  const fondoIn = typeof b.fondo === "string" ? b.fondo : ""; if (fondoIn !== "" && !esFondo(fondoIn)) return { ok: false, error: "Fondo no válido." };
  const fm = typeof b.formato === "string" && b.formato in FORMATOS_AD ? (b.formato as FormatoAd) : "ig_cuadrado";
  return { ok: true, a: { titular, subtitulo: s(b.subtitulo, LIM.subtitulo), cta: s(b.cta, LIM.cta) || ctaPorDefecto(), fondo: fondoIn, formato: fm } };
}
export const colores = MARCA_VISUAL;
