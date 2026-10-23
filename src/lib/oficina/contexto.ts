/** Conocimiento propio + ejemplos aprobados que se añaden al prompt de cada agente. Sin imports: testeable. */
export type Kb = { agente: string | null; titulo: string; contenido: string };
export type Ejemplo = { instruccion: string; resultado: string };
export const KB_MAX_CHARS = 4000, KB_MAX_ENTRADAS = 200, CTX_MAX = 6000;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const palabras = (s: string) => new Set(norm(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3));

/** Elige las notas de conocimiento más relevantes para la orden (las generales y las del agente). */
export function elegirKb(kb: Kb[], agente: string, instruccion: string, max = 3): Kb[] {
  const q = palabras(instruccion);
  return kb
    .filter((k) => k.agente === null || k.agente === agente)
    .map((k) => { let s = 0; for (const w of palabras(k.titulo + " " + k.contenido)) if (q.has(w)) s++; return { k, s: s + (k.agente === agente ? 0.5 : 0) }; })
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .filter((x) => x.s > 0 || kb.length <= max)
    .map((x) => x.k);
}

export function armarContexto(kb: Kb[], ejemplos: Ejemplo[], agente: string, instruccion: string, max = CTX_MAX): string {
  let out = "";
  const notas = elegirKb(kb, agente, instruccion);
  if (notas.length) out += "\n\nCONOCIMIENTO DE LA EMPRESA (aportado por el CEO; úsalo solo si es relevante y no inventes datos que no estén aquí):\n" + notas.map((k) => `- ${k.titulo}: ${k.contenido.slice(0, KB_MAX_CHARS)}`).join("\n");
  const ej = ejemplos.slice(0, 2);
  if (ej.length) out += "\n\nEJEMPLOS DE TRABAJO YA APROBADOS POR EL CEO (imita su nivel y estructura, no copies su contenido):\n" + ej.map((e, i) => `Ejemplo ${i + 1} · Orden: ${e.instruccion.slice(0, 200)}\nResultado: ${e.resultado.slice(0, 1200)}`).join("\n\n");
  return out.length > max ? out.slice(0, max) : out;
}
