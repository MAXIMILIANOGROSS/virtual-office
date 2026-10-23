// Servidor: de una pregunta a consultas concretas. Solo se planifican fuentes realmente disponibles y permitidas al agente.
import type { Consulta, Plataforma } from "./tipos.ts";
import { plataformaDe } from "./tipos.ts";
import { repoDeUrl, urlPublica } from "./seguridad.ts";

export type Profundidad = "rapida" | "normal" | "profunda";
export const MAX_CONSULTAS: Record<Profundidad, number> = { rapida: 3, normal: 6, profunda: 10 };
export type Plan = { consultas: Consulta[]; omitidas: { plataforma: Plataforma | "otra"; motivo: string }[] };
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const limpia = (s: string) => s.replace(URL_RE, " ").replace(/\s+/g, " ").trim();

export function planificar(pregunta: string, o: { urls?: string[]; disponibles: Set<Plataforma>; permitidas: Plataforma[]; profundidad?: Profundidad; preferidas?: Plataforma[] }): Plan {
  const max = MAX_CONSULTAS[o.profundidad ?? "normal"]; const omitidas: Plan["omitidas"] = []; const consultas: Consulta[] = []; const vistos = new Set<string>();
  const ok = (p: Plataforma): boolean => {
    if (o.preferidas?.length && !o.preferidas.includes(p)) return false;
    if (!o.permitidas.includes(p)) { if (!omitidas.some((x) => x.plataforma === p)) omitidas.push({ plataforma: p, motivo: "El agente no tiene permiso para esta fuente." }); return false; }
    if (!o.disponibles.has(p)) { if (!omitidas.some((x) => x.plataforma === p)) omitidas.push({ plataforma: p, motivo: "El conector no está operativo ahora mismo (ver Diagnóstico)." }); return false; }
    return true;
  };
  const add = (c: Consulta) => { const k = JSON.stringify(c); if (vistos.has(k) || consultas.length >= max) return; if (ok(plataformaDe(c))) { vistos.add(k); consultas.push(c); } };
  const todas = [...(o.urls ?? []), ...(pregunta.match(URL_RE) ?? [])];
  for (const raw of todas) {
    const u = urlPublica(raw); if (!u) { omitidas.push({ plataforma: "otra", motivo: `URL no permitida: ${raw.slice(0, 80)}` }); continue; }
    const repo = repoDeUrl(u); const x = new URL(u);
    if (repo && x.pathname.split("/").filter(Boolean).length === 2) add({ tipo: "github_repo", ...repo });
    else if (/\.(atom|rss|xml)$/i.test(x.pathname) || /\/feed\/?$/i.test(x.pathname)) add({ tipo: "rss", url: u });
    else add({ tipo: "web", url: u });
  }
  const texto = limpia(pregunta);
  if (!todas.length && texto.length >= 3) {
    if (/github|repositorio|librer[ií]a|open\s*source|c[oó]digo abierto/i.test(texto)) add({ tipo: "github_buscar", q: texto.replace(/\b(investiga|busca|encuentra|repositorios?|github|gratuitos?|para|de|los|las|el|la|que)\b/gi, " ").replace(/\s+/g, " ").trim().slice(0, 120) || texto.slice(0, 120) });
    add({ tipo: "busqueda", q: texto.slice(0, 300) });
  }
  if (/youtube|v[ií]deo|subt[ií]tulos/i.test(texto) && !o.disponibles.has("youtube")) omitidas.push({ plataforma: "youtube", motivo: "YouTube no está disponible: requiere yt-dlp en un trabajador." });
  if (!consultas.length && !omitidas.length) omitidas.push({ plataforma: "otra", motivo: "No hay fuentes disponibles para esta pregunta." });
  return { consultas, omitidas };
}
