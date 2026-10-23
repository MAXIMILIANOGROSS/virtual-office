/* Puntuación de ganchos (los primeros 15 s de un vídeo): 5 propiedades de 0 a 100 y un veredicto (60 % media + 40 % la más débil).
   ES UNA HEURÍSTICA, NO UN PREDICTOR: separa bien ganchos deliberadamente malos de reales, pero apenas separa los éxitos de los fracasos de un mismo creador.
   Una nota baja es motivo para revisar; una nota alta no promete nada.
   Adaptado de hookscore.py de «youtube-agent-skill» (c) 2026 Jake Schincariol, MIT. Añadido: vocabulario en español.
   Las fórmulas del catálogo están escritas para inglés: en español la clasificación suele salir «Sin clasificar». */
import { FORMULAS } from "./hooks-data.ts";
import { palabras } from "./transcripto.ts";

const L = "(?<![\\p{L}\\p{N}])", R = "(?![\\p{L}\\p{N}])";
const lista = (xs: string[], flags = "giu") => new RegExp(`${L}(?:${xs.join("|")})${R}`, flags);
const FILLER = new Set("basically actually literally just really very so kind sort like guys hey welcome today video subscribe channel bueno pues osea literalmente basicamente básicamente hola chicos bienvenidos hoy vídeo video suscríbete suscribete canal".split(" "));
const VAGUE = new Set("amazing incredible insane crazy huge massive game changer secret powerful ultimate best revolutionary mind blowing unbelievable increíble increible brutal enorme secreto poderoso definitivo mejor revolucionario impresionante".split(" "));
const CONCRETE_G = /\b(\d[\d,.]*\s?(%|k|m|x|s|h)?|\$\d|\d+\s?(second|minute|hour|day|week|month|year|segundo|minuto|hora|día|dia|semana|mes|año|ano)s?)(?![\p{L}\p{N}])/giu;
const concretos = (t: string) => (t.match(CONCRETE_G) ?? []).length;
const YOU = lista(["you", "your", "you're", "youre", "yourself", "tú", "tu", "tus", "ti", "contigo", "usted", "vosotros"]);
const STAKE = lista(["lose", "lost", "wasting", "waste", "quit", "fail", "broke", "cost", "risk", "before", "stop", "never", "die", "dying", "dead", "pierdes", "perder", "perdiendo", "pérdida", "pierde", "fracaso", "fracasar", "riesgo", "antes", "deja", "nunca", "cuesta", "tirando"]);
const CURIOSITY = lista(["why", "how", "what", "which", "until", "before", "but", "nobody", "almost", "except", "reason", "actually", "por qué", "porque", "cómo", "como", "qué", "cuál", "hasta", "pero", "nadie", "casi", "excepto", "razón", "realmente", "secreto"]);
const CLOSED = lista(["because", "so that", "which means", "porque", "para que", "lo que significa"]);
const nMatches = (re: RegExp, t: string) => (t.match(re) ?? []).length;
const clamp = (x: number) => Math.max(0, Math.min(100, x));

const specificity = (t: string) => { const w = palabras(t); if (!w.length) return 0; const vague = w.filter((x) => VAGUE.has(x)).length, filler = w.filter((x) => FILLER.has(x)).length; let s = 34 + concretos(t) * 22 - vague * 16 - filler * 5; s += Math.min(18, 6 * t.split(/\s+/).slice(1).filter((x) => /^\p{Lu}/u.test(x)).length); return clamp(s); };
const address = (t: string) => clamp(26 + nMatches(YOU, t) * 20 + (YOU.test(t.split(/\s+/).slice(0, 6).join(" ")) ? 30 : 0));
const stakes = (t: string) => clamp(22 + nMatches(STAKE, t) * 26 + (concretos(t) ? 14 : 0));
const curiosity = (t: string) => clamp(24 + nMatches(CURIOSITY, t) * 17 + (t.trim().endsWith("?") ? 18 : 0) + (CLOSED.test(t) ? -18 : 0));
const brevity = (t: string) => { const n = palabras(t).length; if (!n) return 0; if (n >= 9 && n <= 24) return 100; if (n < 9) return Math.max(30, 100 - (9 - n) * 11); return Math.max(10, 100 - (n - 24) * 7); };

// OJO: las expresiones con /g guardan estado en .test(); se reinician antes de cada uso.
const reset = () => { for (const r of [YOU, STAKE, CURIOSITY, CLOSED]) r.lastIndex = 0; };
export const PROPIEDADES = ["SPECIFICITY", "ADDRESS", "STAKES", "CURIOSITY", "BREVITY"] as const;
export type Propiedad = (typeof PROPIEDADES)[number];
export const ARREGLO: Record<Propiedad, string> = {
  SPECIFICITY: "cambia un adjetivo por un número, un nombre o una fecha",
  ADDRESS: "di «tú» en las seis primeras palabras",
  STAKES: "di qué le cuesta seguir haciéndolo como hasta ahora",
  CURIOSITY: "corta la mitad de la frase que se responde sola",
  BREVITY: "de 9 a 24 palabras. Léelo en voz alta y para donde te quedes sin aire",
};
const FN: Record<Propiedad, (t: string) => number> = { SPECIFICITY: specificity, ADDRESS: address, STAKES: stakes, CURIOSITY: curiosity, BREVITY: brevity };
export const banda = (v: number) => (v >= 72 ? "FUERTE" : v >= 55 ? "ACEPTABLE" : "DÉBIL");

export function clasificar(t: string): { formula: string; coincidencias: number } {
  let mejor: string | null = null, hits = 0;
  for (const f of FORMULAS) { let n = 0; for (const p of f.match) { try { if (new RegExp(p, "i").test(t)) n++; } catch { /* patrón no compatible: se ignora */ } } if (n > hits) { mejor = f.name; hits = n; } }
  return { formula: mejor ?? "Sin clasificar", coincidencias: hits };
}
export type NotaGancho = { hook: string; properties: Record<Propiedad, number>; verdict: number; band: string; formula: string; matched: number; weakest: Propiedad; fix: string };
export function puntuarGancho(hook: string): NotaGancho {
  reset(); const t = hook.trim();
  const props = {} as Record<Propiedad, number>; for (const p of PROPIEDADES) { reset(); props[p] = FN[p](t); }
  const v = Object.values(props); const verdict = Math.round(0.6 * (v.reduce((a, b) => a + b, 0) / v.length) + 0.4 * Math.min(...v));
  const { formula, coincidencias } = clasificar(t); const weakest = PROPIEDADES.reduce((a, b) => (props[b] < props[a] ? b : a));
  return { hook: t, properties: props, verdict, band: banda(verdict), formula, matched: coincidencias, weakest, fix: ARREGLO[weakest] };
}
export const ordenarGanchos = (hooks: string[]): NotaGancho[] => hooks.map((h) => h.trim()).filter(Boolean).map(puntuarGancho).sort((a, b) => b.verdict - a.verdict);
