/* Vídeo Studio: guion de escenas validado. Los agentes escriben un JSON; el navegador lo valida, lo dibuja en un canvas y lo graba.
   No hay servidor de render ni audio. Todo lo que no cumple el esquema se rechaza con un motivo claro. */
export type Formato = "vertical" | "horizontal" | "cuadrado";
export type Paleta = "isla" | "noche" | "claro";
export type TipoEscena = "titulo" | "texto" | "lista" | "cifra" | "cierre";
export type Escena = { tipo: TipoEscena; titulo: string; texto?: string; items?: string[]; cifra?: string; segundos: number };
export type Guion = { titulo: string; formato: Formato; paleta: Paleta; escenas: Escena[] };

export const DIM: Record<Formato, { w: number; h: number }> = {
  vertical: { w: 1080, h: 1920 },
  horizontal: { w: 1920, h: 1080 },
  cuadrado: { w: 1080, h: 1080 },
};
export const PALETAS: Record<Paleta, { bg: string; fg: string; acento: string }> = {
  isla: { bg: "#0B2A3C", fg: "#FFFFFF", acento: "#FFD600" },
  noche: { bg: "#0F172A", fg: "#F8FAFC", acento: "#38BDF8" },
  claro: { bg: "#FFF8E7", fg: "#111827", acento: "#E11D48" },
};
export const LIMITES = { escenas: 20, segMin: 1.5, segMax: 12, total: 90, titulo: 80, texto: 220, items: 6, item: 80, cifra: 14 } as const;

const TIPOS: TipoEscena[] = ["titulo", "texto", "lista", "cifra", "cierre"];
const limpia = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

export type Resultado = { ok: true; guion: Guion } | { ok: false; errores: string[] };

export function validarGuion(x: unknown): Resultado {
  const errores: string[] = [];
  if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, errores: ["El guion debe ser un objeto JSON."] };
  const o = x as Record<string, unknown>;
  const formato = (o.formato ?? "vertical") as Formato;
  if (!(formato in DIM)) errores.push(`formato «${String(o.formato)}» no válido (vertical, horizontal o cuadrado).`);
  const paleta = (o.paleta ?? "isla") as Paleta;
  if (!(paleta in PALETAS)) errores.push(`paleta «${String(o.paleta)}» no válida (isla, noche o claro).`);
  const titulo = limpia(o.titulo, LIMITES.titulo);
  if (!titulo) errores.push("Falta el título del vídeo.");
  if (!Array.isArray(o.escenas) || o.escenas.length === 0) return { ok: false, errores: [...errores, "Faltan escenas (mínimo 1)."] };
  if (o.escenas.length > LIMITES.escenas) errores.push(`Demasiadas escenas (máximo ${LIMITES.escenas}).`);
  const escenas: Escena[] = [];
  o.escenas.slice(0, LIMITES.escenas).forEach((raw, i) => {
    const n = `Escena ${i + 1}`;
    if (!raw || typeof raw !== "object") { errores.push(`${n}: no es un objeto.`); return; }
    const e = raw as Record<string, unknown>;
    const tipo = e.tipo as TipoEscena;
    if (!TIPOS.includes(tipo)) { errores.push(`${n}: tipo «${String(e.tipo)}» no válido (${TIPOS.join(", ")}).`); return; }
    const seg = Number(e.segundos);
    if (!Number.isFinite(seg) || seg < LIMITES.segMin || seg > LIMITES.segMax) { errores.push(`${n}: segundos debe estar entre ${LIMITES.segMin} y ${LIMITES.segMax}.`); return; }
    const t = limpia(e.titulo, LIMITES.titulo);
    if (!t) { errores.push(`${n}: falta el titulo.`); return; }
    const esc: Escena = { tipo, titulo: t, segundos: Math.round(seg * 10) / 10 };
    const texto = limpia(e.texto, LIMITES.texto);
    if (texto) esc.texto = texto;
    if (tipo === "lista") {
      const items = Array.isArray(e.items) ? e.items.map((it) => limpia(it, LIMITES.item)).filter(Boolean).slice(0, LIMITES.items) : [];
      if (items.length === 0) { errores.push(`${n}: una lista necesita items.`); return; }
      esc.items = items;
    }
    if (tipo === "cifra") {
      const c = limpia(e.cifra, LIMITES.cifra);
      if (!c) { errores.push(`${n}: una cifra necesita el campo cifra.`); return; }
      esc.cifra = c;
    }
    escenas.push(esc);
  });
  const guion: Guion = { titulo, formato: formato in DIM ? formato : "vertical", paleta: paleta in PALETAS ? paleta : "isla", escenas };
  const total = duracionTotal(guion);
  if (total > LIMITES.total) errores.push(`Duración total ${total.toFixed(1)} s: máximo ${LIMITES.total} s.`);
  if (escenas.length === 0 && errores.length === 0) errores.push("Ninguna escena válida.");
  return errores.length ? { ok: false, errores } : { ok: true, guion };
}

/* Saca el JSON de la respuesta de un agente: bloque ```json … ``` o primer objeto {…}. Devuelve null si no hay. */
export function extraerGuion(texto: string): unknown | null {
  const bloque = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cand = bloque ? bloque[1] : (() => { const a = texto.indexOf("{"), b = texto.lastIndexOf("}"); return a >= 0 && b > a ? texto.slice(a, b + 1) : ""; })();
  if (!cand.trim()) return null;
  try { return JSON.parse(cand); } catch { return null; }
}

export const duracionTotal = (g: Guion): number => g.escenas.reduce((s, e) => s + e.segundos, 0);

export function escenaEn(g: Guion, t: number): { indice: number; local: number; dur: number } {
  let acc = 0;
  for (let i = 0; i < g.escenas.length; i++) {
    const d = g.escenas[i].segundos;
    if (t < acc + d || i === g.escenas.length - 1) return { indice: i, local: Math.min(Math.max(t - acc, 0), d), dur: d };
    acc += d;
  }
  return { indice: 0, local: 0, dur: g.escenas[0]?.segundos ?? 0 };
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t), 3);

/* Instrucciones que se añaden a los agentes que pueden proponer un vídeo animado. */
export const INSTRUCCIONES_VIDEO = [
  "VÍDEO ANIMADO (opcional): si el usuario pide un vídeo animado, además de tu entrega responde con UN bloque ```json con este esquema exacto y nada más dentro del bloque:",
  '{"titulo":"…","formato":"vertical|horizontal|cuadrado","paleta":"isla|noche|claro","escenas":[{"tipo":"titulo|texto|lista|cifra|cierre","titulo":"…","texto":"…","items":["…"],"cifra":"…","segundos":4}]}',
  `Límites: máximo ${LIMITES.escenas} escenas, ${LIMITES.segMin}-${LIMITES.segMax} s por escena, ${LIMITES.total} s en total; titulo ≤${LIMITES.titulo} caracteres, texto ≤${LIMITES.texto}, lista de 1-${LIMITES.items} items. «items» solo en tipo lista y «cifra» solo en tipo cifra.`,
  "Solo escribe cifras, resultados o testimonios que el usuario te haya dado: nunca inventes datos. El vídeo no lleva audio ni imágenes externas; el usuario lo previsualiza y lo graba en /video-studio. Nada se publica desde la oficina.",
].join("\n");
