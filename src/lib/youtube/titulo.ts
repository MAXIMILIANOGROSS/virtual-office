/* Revisión conjunta de título y miniatura. El par es la unidad: si la miniatura repite el título se desperdicia la mitad del espacio de clic.
   Límites: ~60 caracteres en el buscador de escritorio, ~40 en el inicio móvil, 100 máximo de YouTube.
   Adaptado de title.py de «youtube-agent-skill» (c) 2026 Jake Schincariol, MIT. Añadido: vocabulario en español. */
import { palabras } from "./transcripto.ts";

export const LIM = { desktop: 60, movil: 40, max: 100 } as const;
const VAGUE = new Set("amazing incredible insane crazy huge massive ultimate best powerful secret revolutionary mindblowing epic perfect complete everything increíble increible brutal enorme masivo definitivo mejor poderoso secreto revolucionario épico epico perfecto completo todo".split(" "));
const STOP = new Set("the a an of for to in on and or is are with your you my i this that it how what why el la los las un una de del y o en con tu tus mi yo esto eso como cómo qué que por porque para es son".split(" "));
export type Aviso = { tipo: string; mensaje: string };
export type RevisionTitulo = { title: string; chars: number; score: number; issues: Aviso[]; good: string[] };

export function revisarTitulo(title: string, thumb?: string): RevisionTitulo {
  const t = title.trim(), n = [...t].length; const issues: Aviso[] = [], good: string[] = [];
  if (n > LIM.max) issues.push({ tipo: "longitud", mensaje: `${n} caracteres: el máximo de YouTube es ${LIM.max}` });
  else if (n > LIM.desktop) issues.push({ tipo: "longitud", mensaje: `${n} caracteres: en el buscador de escritorio se corta cerca de ${LIM.desktop}` });
  else good.push(`${n} caracteres, dentro del corte de escritorio (${LIM.desktop})`);
  if (n > LIM.movil) { const head = t.slice(0, LIM.movil).replace(/\s+\S*$/, ""); issues.push({ tipo: "móvil", mensaje: `el inicio móvil mostraría «${head}…»: comprueba que sobrevive el tema` }); }
  const caps = t.split(/\s+/).filter((w) => w.length > 2 && w === w.toUpperCase() && /\p{L}/u.test(w));
  if (caps.length > 2) issues.push({ tipo: "gritos", mensaje: `${caps.length} palabras en mayúsculas: más de dos parece spam` }); else if (caps.length) good.push(`${caps.length} palabra en mayúsculas para enfatizar`);
  const vagas = palabras(t).filter((w) => VAGUE.has(w)); if (vagas.length) issues.push({ tipo: "vago", mensaje: `${[...new Set(vagas)].sort().join(", ")}: cámbialo por un número, un nombre o una fecha` });
  const nums = t.match(/\d[\d,.]*%?/g); if (nums) good.push(`lleva una cifra concreta (${nums.slice(0, 3).join(", ")})`); else issues.push({ tipo: "sin-cifra", mensaje: "sin número, fecha ni nombre: es el arreglo más fiable" });
  if (t.endsWith("?")) good.push("pregunta abierta en el título");
  if (!palabras(t).slice(0, 3).filter((w) => !STOP.has(w)).length) issues.push({ tipo: "inicio", mensaje: "las tres primeras palabras son relleno: adelanta el tema" });
  if (thumb) {
    const tw = new Set(palabras(t).filter((w) => !STOP.has(w))), hw = new Set(palabras(thumb).filter((w) => !STOP.has(w)));
    const shared = [...tw].filter((w) => hw.has(w)).sort();
    if (shared.length) issues.push({ tipo: "duplicado", mensaje: `la miniatura repite el título en ${shared.join(", ")}: debe decir lo que el título no dice` }); else good.push("miniatura y título llevan palabras distintas");
    const nw = palabras(thumb).length; if (nw > 4) issues.push({ tipo: "miniatura-larga", mensaje: `${nw} palabras en la miniatura: tres es el tope a tamaño de feed` });
  }
  return { title: t, chars: n, score: Math.max(0, Math.min(100, 100 - 14 * issues.length + 4 * good.length)), issues, good };
}
export const ordenarTitulos = (titulos: string[], thumb?: string) => titulos.map((x) => x.trim()).filter(Boolean).map((x) => revisarTitulo(x, thumb)).sort((a, b) => b.score - a.score);
