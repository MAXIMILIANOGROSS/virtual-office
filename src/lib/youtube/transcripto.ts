/* Lectura de transcripciones con marcas de tiempo (SRT, VTT o JSON de Whisper). Lógica pura, sin red.
   Adaptado de «youtube-agent-skill» (c) 2026 Jake Schincariol, licencia MIT (ver THIRD_PARTY/youtube-agent-skill.LICENSE). */
export type Cue = { start: number; end: number; text: string };

export function parseTs(s: string): number {
  const p = s.trim().replace(",", ".").split(":");
  return p.length === 3 ? parseInt(p[0], 10) * 3600 + parseInt(p[1], 10) * 60 + parseFloat(p[2]) : parseInt(p[0], 10) * 60 + parseFloat(p[1]);
}

/** Devuelve los cues; lanza Error con mensaje claro si el JSON es inválido. Sin cues devuelve []. */
export function parseTranscript(raw: string): Cue[] {
  const t = raw.replace(/^﻿/, "").trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    let d: unknown;
    try { d = JSON.parse(t); } catch { throw new Error("El JSON de la transcripción no es válido."); }
    const segs = Array.isArray(d) ? d : (d as { segments?: unknown[] }).segments ?? [];
    const out: Cue[] = [];
    for (const s of segs as { start?: unknown; end?: unknown; text?: unknown }[]) {
      const a = Number(s?.start), b = Number(s?.end);
      if (Number.isFinite(a) && Number.isFinite(b)) out.push({ start: a, end: b, text: String(s.text ?? "").trim() });
    }
    return out;
  }
  const cues: { start: number; end: number; parts: string[] }[] = []; let cur: (typeof cues)[number] | null = null;
  for (const line of t.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d[\d:.,]*)\s*-->\s*(\d[\d:.,]*)/);
    if (m) { cur = { start: parseTs(m[1]), end: parseTs(m[2]), parts: [] }; cues.push(cur); }
    else if (cur && line.trim() && !/^\d+$/.test(line.trim())) cur.parts.push(line.trim());
  }
  return cues.filter((c) => c.parts.length && Number.isFinite(c.start) && Number.isFinite(c.end)).map((c) => ({ start: c.start, end: c.end, text: c.parts.join(" ") }));
}

export function mmss(t: number): string {
  const n = Math.floor(t), h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
export const palabras = (t: string): string[] => t.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
