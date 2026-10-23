/* Análisis de la exportación de retención de audiencia de YouTube Studio: fuga del gancho, acantilados y pendiente.
   Distingue correlación de causa: muestra DÓNDE se pierde audiencia, no demuestra POR QUÉ.
   Adaptado de retention.py de «youtube-agent-skill» (c) 2026 Jake Schincariol, MIT. Añadido: CSV con «;» y decimales con coma. */
import type { Cue } from "./transcripto.ts";

export type Acantilado = { from: number; to: number; lost: number; at_seconds: number | null };
export type Retencion = { points: number; start: number; end: number; hook_leak: number; veredicto: "sana" | "con fuga" | "grave"; cliffs: Acantilado[]; slide_per_unit: number; said: Record<string, string> };

export function leerCsv(texto: string): [number, number][] {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/); const rows: [number, number][] = [];
  for (const l of lineas) {
    const delim = l.includes(";") ? ";" : l.includes("\t") ? "\t" : ",";
    const nums = l.split(delim).map((c) => { let x = c.trim().replace("%", ""); x = delim === ";" || delim === "\t" ? x.replace(",", ".") : x.replace(/,/g, ""); const n = x === "" ? NaN : Number(x); return Number.isFinite(n) ? n : null; }).filter((n): n is number => n !== null);
    if (nums.length >= 2) rows.push([nums[0], nums[1]]);
  }
  return rows;
}

export function analizarRetencion(csv: string, opts: { duration?: number; cues?: Cue[] } = {}): Retencion {
  const rows = leerCsv(csv);
  if (rows.length < 8) throw new Error("No se pudieron leer al menos 8 puntos de ese CSV. Exporta «Retención de la audiencia» desde YouTube Studio.");
  const xs = rows.map((r) => r[0]), ys = rows.map((r) => r[1]); const pctAxis = Math.max(...xs) <= 100.5; const dur = opts.duration;
  const at = (x: number) => (pctAxis && dur ? (x / 100) * dur : x);
  const start = ys[0] || 100; const cutoff = !pctAxis ? 30 : dur ? (30 / dur) * 100 : 10;
  const enGancho = rows.filter(([x]) => x <= cutoff).map(([, y]) => y); const hookEnd = enGancho.length ? Math.min(...enGancho) : start;
  const hookLeak = start - hookEnd;
  const drops: { rate: number; a: number; b: number; d: number }[] = [];
  for (let i = 1; i < rows.length; i++) { const d = ys[i - 1] - ys[i]; const span = xs[i] - xs[i - 1] || 1; drops.push({ rate: d / span, a: xs[i - 1], b: xs[i], d }); }
  const orden = [...drops].sort((p, q) => q.rate - p.rate || q.a - p.a || q.b - p.b || q.d - p.d); // mismo desempate que el original
  const cliffs = orden.slice(0, 5).filter((x) => x.d > 0.8).map((x) => ({ from: Math.round(x.a * 100) / 100, to: Math.round(x.b * 100) / 100, lost: Math.round(x.d * 100) / 100, at_seconds: !pctAxis || dur ? Math.round(at(x.a) * 10) / 10 : null }));
  const mid = drops.filter((d) => d.a > cutoff).map((d) => d.rate); const slide = mid.length ? mid.reduce((s, v) => s + v, 0) / mid.length : 0;
  const said: Record<string, string> = {};
  if (opts.cues) for (const c of cliffs) { if (c.at_seconds === null) continue; const t = c.at_seconds; said[String(c.from)] = opts.cues.filter((q) => q.start <= t + 4 && q.end >= t - 4).map((q) => q.text).join(" ").slice(0, 140); }
  return { points: rows.length, start: ys[0], end: ys[ys.length - 1], hook_leak: Math.round(hookLeak * 100) / 100, veredicto: hookLeak < 25 ? "sana" : hookLeak < 40 ? "con fuga" : "grave", cliffs, slide_per_unit: Math.round(slide * 1000) / 1000, said };
}
