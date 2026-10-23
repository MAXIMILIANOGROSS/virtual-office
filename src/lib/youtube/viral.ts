/* Ranking de vídeos por cuántas veces superan la MEDIANA DE SU PROPIO CANAL (no por visitas absolutas) y fórmula de gancho del título.
   Solo lee datos que tú aportas (lista de vídeos públicos); no hace scraping ni usa cuentas. Hacen falta al menos 4 vídeos por canal.
   Adaptado de swipe.py de «youtube-agent-skill» (c) 2026 Jake Schincariol, MIT. */
import { clasificar } from "./gancho.ts";

export type VideoEntrada = { channel?: string; title?: string; views?: number | string; url?: string; duration?: number };
export type Atipico = { channel: string; title: string; views: number; median: number; multiple: number; formula: string; url: string };
const mediana = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function atipicos(rows: VideoEntrada[], min = 1.5): { outliers: Atipico[]; skipped_thin_channels: [string, number][]; formulas: Record<string, number> } {
  const by = new Map<string, VideoEntrada[]>(); for (const r of rows) { const k = r.channel || "?"; by.set(k, [...(by.get(k) ?? []), r]); }
  const out: Atipico[] = [], thin: [string, number][] = [];
  for (const [ch, vids] of by) {
    const views = vids.map((v) => Number(v.views) || 0); const med = mediana(views);
    if (vids.length < 4) { thin.push([ch, vids.length]); continue; }
    vids.forEach((v, i) => out.push({ channel: ch, title: v.title ?? "", views: Math.trunc(views[i]), median: Math.trunc(med), multiple: Math.round((med ? views[i] / med : 0) * 100) / 100, formula: clasificar(v.title ?? "").formula, url: v.url ?? "" }));
  }
  const fin = out.filter((r) => r.multiple >= min).sort((a, b) => b.multiple - a.multiple);
  const formulas: Record<string, number> = {}; for (const r of fin) formulas[r.formula] = (formulas[r.formula] ?? 0) + 1;
  return { outliers: fin, skipped_thin_channels: thin, formulas };
}
