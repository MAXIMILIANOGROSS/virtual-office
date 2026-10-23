/* Lista de decisiones de edición (EDL) a partir de una transcripción: silencios, muletillas y tomas repetidas.
   NO toca ningún vídeo: solo propone cortes para que los apliques en tu editor.
   Adaptado de deadair.py de «youtube-agent-skill» (c) 2026 Jake Schincariol, MIT. Añadido: muletillas en español. */
import type { Cue } from "./transcripto.ts";

const FILLER = /^[\s,.\-]*((um+|uh+|er+|ah+|eh+|mm+|so|okay|ok|right|yeah|like|anyway|basically|actually|you know|i mean|let me see|hold on|bueno|pues|vale|o sea|este|digamos|a ver|total)[\s,.\-]*)+$/i;
export type Corte = { kind: "DEAD" | "FILLER" | "REPEAT"; start: number; end: number; why: string };
export type Edl = { duration: number; cuts: Corte[]; removed: number; out: number; cues: number };

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L} ]/gu, "").split(/\s+/).filter(Boolean);
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function listaEdicion(cues: Cue[], floor = 0.45): Edl {
  if (!cues.length) throw new Error("No se encontraron marcas de tiempo: ¿es un SRT, VTT o JSON de Whisper?");
  const dur = cues[cues.length - 1].end; const cuts: Corte[] = [];
  cues.forEach((c, i) => {
    if (FILLER.test(c.text)) cuts.push({ kind: "FILLER", start: c.start, end: c.end, why: c.text.trim().slice(0, 48) });
    if (i) { const gap = c.start - cues[i - 1].end; if (gap > floor) { const keep = floor / 2; cuts.push({ kind: "DEAD", start: r3(cues[i - 1].end + keep), end: r3(c.start - keep), why: `${gap.toFixed(2)}s de silencio` }); } }
    // Un reinicio se compara con la última frase que fue habla real (no con una muletilla intermedia).
    if (c.text.trim() && !FILLER.test(c.text)) {
      let j = i - 1; while (j >= 0 && (FILLER.test(cues[j].text) || !cues[j].text.trim())) j--;
      if (j >= 0) { const a = norm(cues[j].text).slice(0, 5), b = norm(c.text).slice(0, 5); if (a.length >= 3 && a.length === b.length && a.every((w, k) => w === b[k])) cuts.push({ kind: "REPEAT", start: cues[j].start, end: cues[j].end, why: `reinicio de «${a.join(" ")}»` }); }
    }
  });
  const fin = cuts.filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);
  const removed = fin.reduce((s, c) => s + (c.end - c.start), 0);
  return { duration: dur, cuts: fin, removed: r3(removed), out: r3(dur - removed), cues: cues.length };
}
