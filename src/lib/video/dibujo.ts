/* Dibujo de un fotograma del guion en un canvas 2D. Solo usa la API de contexto: se puede probar con un contexto falso. */
import { DIM, PALETAS, clamp, easeOutCubic, escenaEn, type Guion } from "./escenas.ts";
import { PROYECTO } from "../../oficina.config.ts";

type Ctx = CanvasRenderingContext2D;
const FUENTE = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export function partirLineas(ctx: Pick<Ctx, "measureText">, texto: string, ancho: number): string[] {
  const palabras = texto.split(" ");
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width > ancho && actual) { lineas.push(actual); actual = p; } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

export function dibujarFotograma(ctx: Ctx, g: Guion, t: number): void {
  const { w, h } = DIM[g.formato];
  const pal = PALETAS[g.paleta];
  const u = Math.min(w, h) / 1080; // unidad de escala
  const margen = 90 * u;
  const ancho = w - margen * 2;
  const { indice, local, dur } = escenaEn(g, t);
  const e = g.escenas[indice];

  ctx.save();
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = pal.acento; ctx.globalAlpha = 0.14; ctx.fillRect(0, h - 380 * u, w, 380 * u); ctx.globalAlpha = 1;

  const entra = easeOutCubic(local / 0.5);
  const sale = 1 - clamp((local - (dur - 0.3)) / 0.3);
  const alfa = Math.min(entra, sale);
  const desp = (1 - entra) * 40 * u;
  ctx.globalAlpha = alfa; ctx.textBaseline = "top"; ctx.textAlign = "left";

  let y = h * 0.2 + desp;
  const grande = e.tipo === "titulo" || e.tipo === "cierre";
  ctx.fillStyle = pal.fg; ctx.font = `800 ${(grande ? 104 : 78) * u}px ${FUENTE}`;
  for (const l of partirLineas(ctx, e.titulo, ancho)) { ctx.fillText(l, margen, y); y += (grande ? 120 : 92) * u; }
  y += 24 * u;

  if (e.tipo === "cifra" && e.cifra) {
    ctx.fillStyle = pal.acento; ctx.font = `900 ${200 * u}px ${FUENTE}`;
    ctx.fillText(e.cifra, margen, y); y += 230 * u;
  }
  if (e.texto) {
    ctx.fillStyle = pal.fg; ctx.font = `500 ${46 * u}px ${FUENTE}`;
    for (const l of partirLineas(ctx, e.texto, ancho)) { ctx.fillText(l, margen, y); y += 62 * u; }
    y += 20 * u;
  }
  if (e.tipo === "lista" && e.items) {
    ctx.font = `600 ${52 * u}px ${FUENTE}`;
    e.items.forEach((it, i) => {
      const a = easeOutCubic((local - 0.4 - i * 0.35) / 0.4) * alfa;
      ctx.globalAlpha = a;
      ctx.fillStyle = pal.acento; ctx.fillRect(margen, y + 12 * u, 18 * u, 18 * u);
      ctx.fillStyle = pal.fg;
      let yy = y;
      for (const l of partirLineas(ctx, it, ancho - 50 * u)) { ctx.fillText(l, margen + 50 * u, yy); yy += 64 * u; }
      y = yy + 18 * u;
    });
  }
  ctx.globalAlpha = 1;

  // barra de progreso y marca
  const total = g.escenas.reduce((s, x) => s + x.segundos, 0);
  ctx.fillStyle = pal.acento; ctx.fillRect(0, h - 14 * u, w * clamp(t / total), 14 * u);
  ctx.fillStyle = pal.fg; ctx.globalAlpha = 0.7; ctx.font = `700 ${34 * u}px ${FUENTE}`;
  ctx.textBaseline = "alphabetic"; ctx.fillText((PROYECTO.nombre.trim() || "").toUpperCase(), margen, h - 60 * u);
  ctx.restore();
}
