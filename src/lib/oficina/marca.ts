// Kit de marca: colores, logo y datos corporativos de una empresa. Lógica pura: valida, calcula contraste legible y deriva la paleta del anuncio.
export type KitMarca = { nombre: string; color_primario: string; color_secundario: string; color_acento: string; estilo: string; logo_url: string; eslogan: string; sector: string; localidad: string; contacto: string; url: string };
export const LIMK: Record<keyof KitMarca, number> = { nombre: 60, color_primario: 7, color_secundario: 7, color_acento: 7, estilo: 14, logo_url: 500, eslogan: 80, sector: 40, localidad: 60, contacto: 70, url: 200 };
const limpia = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const HEX = /^#[0-9a-fA-F]{6}$/;
export const KIT_DEFECTO: KitMarca = { nombre: "", color_primario: "#0B2A5B", color_secundario: "#07182E", color_acento: "#FFD600", estilo: "corporativo", logo_url: "", eslogan: "", sector: "", localidad: "", contacto: "", url: "" };

export function limpiarKit(raw: unknown): { ok: true; kit: KitMarca } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kit = {} as KitMarca;
  for (const k of Object.keys(LIMK) as (keyof KitMarca)[]) (kit as Record<string, string>)[k] = limpia(r[k], LIMK[k]);
  if (!kit.nombre) return { ok: false, error: "Falta el nombre de la marca." };
  for (const k of ["color_primario", "color_secundario", "color_acento"] as const) {
    if (!kit[k]) kit[k] = KIT_DEFECTO[k];
    if (!HEX.test(kit[k])) return { ok: false, error: "Los colores deben tener formato #RRGGBB." };
    kit[k] = kit[k].toUpperCase();
  }
  if (kit.logo_url && !/^https:\/\/[^\s]+$/i.test(kit.logo_url)) return { ok: false, error: "El logotipo debe ser una URL https." };
  if (kit.url && !/^https:\/\/[^\s]+$/i.test(kit.url)) return { ok: false, error: "El enlace debe empezar por https://" };
  if (!kit.estilo) kit.estilo = "corporativo";
  return { ok: true, kit };
}

const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hex = (c: number[]) => "#" + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("").toUpperCase();
/** Luminancia relativa WCAG (0 negro – 1 blanco). */
export function luminancia(h: string): number { const f = (x: number) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; const [r, g, b] = rgb(h); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
/** Ratio de contraste WCAG entre dos colores (1–21). */
export function contraste(a: string, b: string): number { const x = luminancia(a), y = luminancia(b); const [hi, lo] = x > y ? [x, y] : [y, x]; return (hi + 0.05) / (lo + 0.05); }
/** Mejor color de texto (blanco o casi negro) sobre un fondo. */
export function textoSobre(fondo: string): string { return contraste("#FFFFFF", fondo) >= contraste("#111827", fondo) ? "#FFFFFF" : "#111827"; }
export function mezclar(a: string, b: string, t: number): string { const x = rgb(a), y = rgb(b); return hex([0, 1, 2].map((i) => x[i] * (1 - t) + y[i] * t)); }

export type PaletaAnuncio = { bg: string; fondo: string; acento: string; texto: string; suave: string; chip: string; chipTxt: string; peso: number };
/** Deriva la paleta del anuncio desde el kit garantizando texto legible. Devuelve avisos si los colores elegidos tienen poco contraste. */
export function paletaDesdeKit(k: KitMarca): { paleta: PaletaAnuncio; avisos: string[] } {
  const avisos: string[] = [];
  const bg = k.color_primario; const fin = k.color_secundario || mezclar(bg, "#000000", 0.45);
  const texto = textoSobre(bg);
  let acento = k.color_acento;
  if (contraste(acento, bg) < 3) { avisos.push("El color de acento tiene poco contraste con el color principal; se ha ajustado para que se lea."); acento = texto; }
  const suave = mezclar(texto, bg, 0.35);
  return { paleta: { bg, fondo: `linear-gradient(160deg,${bg} 0%,${fin} 85%)`, acento, texto, suave, chip: acento, chipTxt: textoSobre(acento), peso: 800 }, avisos };
}
