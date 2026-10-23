import { esFondoLocal } from "./fondos.ts";
// Carteles comerciales compuestos por código (sin IA de imágenes): el texto sale siempre exacto. Lógica pura para poder probarla.
export type Formato = "cuadrado" | "vertical" | "horizontal";
export const FORMATOS: Record<Formato, { w: number; h: number; nombre: string }> = {
  cuadrado: { w: 1080, h: 1080, nombre: "Publicación cuadrada 1080×1080" },
  vertical: { w: 1080, h: 1920, nombre: "Historia / reel 1080×1920" },
  horizontal: { w: 1200, h: 628, nombre: "Horizontal 1200×628" },
};
export type BriefCartel = { formato: Formato; negocio: string; titulo: string; oferta: string; precio: string; condiciones: string; direccion: string; contacto: string; cta: string; fotoUrl: string };
export const LIM: Record<keyof BriefCartel, number> = { formato: 12, negocio: 60, titulo: 90, oferta: 140, precio: 24, condiciones: 160, direccion: 90, contacto: 60, cta: 40, fotoUrl: 500 };

const limpia = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Valida el encargo. Solo acepta http(s) para la foto. Devuelve error legible si falta lo imprescindible. */
export function limpiarBrief(raw: unknown): { ok: true; brief: BriefCartel } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = limpia(r.formato, 12) as Formato;
  const b: BriefCartel = {
    formato: f in FORMATOS ? f : "cuadrado",
    negocio: limpia(r.negocio, LIM.negocio), titulo: limpia(r.titulo, LIM.titulo), oferta: limpia(r.oferta, LIM.oferta), precio: limpia(r.precio, LIM.precio),
    condiciones: limpia(r.condiciones, LIM.condiciones), direccion: limpia(r.direccion, LIM.direccion), contacto: limpia(r.contacto, LIM.contacto), cta: limpia(r.cta, LIM.cta),
    fotoUrl: limpia(r.fotoUrl, LIM.fotoUrl),
  };
  if (!b.negocio) return { ok: false, error: "Falta el nombre del negocio." };
  if (!b.titulo) return { ok: false, error: "Falta el titular del cartel." };
  if (b.fotoUrl && !esFondoLocal(b.fotoUrl) && !/^https:\/\/[^\s]+$/i.test(b.fotoUrl)) return { ok: false, error: "La foto debe ser una URL https." };
  return { ok: true, brief: b };
}
/** Tamaño de letra según longitud, para que el texto nunca se corte. */
export function tamanoTitular(texto: string, formato: Formato): number {
  const base = formato === "vertical" ? 110 : formato === "horizontal" ? 64 : 96;
  const n = texto.length; const k = n <= 18 ? 1 : n <= 32 ? 0.82 : n <= 55 ? 0.66 : 0.52;
  return Math.round(base * k);
}
