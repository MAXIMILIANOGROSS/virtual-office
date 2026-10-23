/* Capítulos de YouTube a partir de una transcripción, validados con las reglas de YouTube:
   empieza en 0:00, mínimo tres capítulos y al menos 10 s cada uno. Los títulos son BORRADOR (palabras clave): hay que reescribirlos.
   Adaptado de chapters.py de «youtube-agent-skill» (c) 2026 Jake Schincariol, MIT. Añadido: palabras vacías en español. */
import { mmss, type Cue } from "./transcripto.ts";

const STOP = new Set(("the a an of for to in on and or is are was were be been with this that it as at by from you your i my we our they them he she but so if then than there here what which who how when where why not no yes do does did just really very like about into over out up down can could will would should have has had get got make made go going went one two " +
  "el la los las un una unos unas de del al y o u en con por para que como pero porque pues si no sí es son era eran ser fue ha han hay muy mas más ya aquí allí esto eso esta este estos estas ese esa cuando donde dónde cual cuál quien quién mi tu su nos les lo se me te le").split(" "));
const keywords = (t: string): Set<string> => new Set((t.toLowerCase().match(/[\p{L}']{4,}/gu) ?? []).filter((w) => !STOP.has(w)));
export type Capitulo = { start: number; label: string; draft_title: string; seconds: number };
export type Capitulos = { valid: boolean; chapters: Capitulo[]; motivo?: string };
const MIN = 10;

export function capitulos(cues: Cue[], target = 7): Capitulos {
  if (cues.length < 6) throw new Error("Hay muy pocas líneas para crear capítulos (mínimo 6).");
  const dur = cues[cues.length - 1].end; const cand: { score: number; t: number }[] = [];
  for (let i = 1; i < cues.length; i++) {
    const gap = cues[i].start - cues[i - 1].end;
    const kb = keywords(cues.slice(Math.max(0, i - 12), i).map((c) => c.text).join(" ")), ka = keywords(cues.slice(i, i + 12).map((c) => c.text).join(" "));
    const union = new Set([...kb, ...ka]); let inter = 0; kb.forEach((w) => { if (ka.has(w)) inter++; });
    const shift = union.size ? 1 - inter / union.size : 0;
    cand.push({ score: gap * 1.6 + shift * 3.2, t: cues[i].start });
  }
  cand.sort((a, b) => b.score - a.score || b.t - a.t);
  const picked = [0];
  for (const c of cand) { if (picked.length >= target) break; if (picked.every((p) => Math.abs(c.t - p) >= MIN) && dur - c.t >= MIN) picked.push(c.t); }
  picked.sort((a, b) => a - b);
  const chapters: Capitulo[] = picked.map((t, n) => {
    const end = n + 1 < picked.length ? picked[n + 1] : dur;
    const text = cues.filter((c) => c.start >= t && c.end <= end).map((c) => c.text).join(" ");
    const kw = [...keywords(text)].sort((a, b) => (text.toLowerCase().split(b).length - text.toLowerCase().split(a).length));
    const title = kw.slice(0, 3).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || "Sección";
    return { start: Math.round(t * 100) / 100, label: mmss(t), draft_title: title, seconds: Math.round((end - t) * 100) / 100 };
  });
  const valid = chapters.length >= 3 && chapters[0].start === 0 && chapters.every((c) => c.seconds >= MIN);
  return { valid, chapters, motivo: valid ? undefined : "No válido: YouTube exige 3 o más capítulos, el primero en 0:00 y mínimo 10 s cada uno." };
}
export const bloqueCapitulos = (c: Capitulos): string => c.chapters.map((x) => `${x.label} ${x.draft_title}`).join("\n");
