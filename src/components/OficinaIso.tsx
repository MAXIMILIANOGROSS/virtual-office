"use client";
import { useState } from "react";
import { PROYECTO } from "@/oficina.config";
import { AGENTES } from "@/lib/oficina/agentes";
import { ESTADO_AG_LABEL, PANTALLA_COL, type EstadoAg, type PantallaAg } from "@/lib/oficina/mapa";

type P = { x: number; y: number };
/** Distribución propia de la vista isométrica (salas compactas de 4 columnas × 3 filas). Solo posiciones; el estado sigue siendo el real. */
export const SALAS_ISO: Record<string, { x: number; y: number; w: number; h: number }> = {
  direccion: { x: 0, y: 0, w: 428, h: 190 },
  estrategia: { x: 460, y: 0, w: 428, h: 328 },
  tecnologia: { x: 0, y: 360, w: 428, h: 328 },
  crecimiento: { x: 460, y: 360, w: 428, h: 328 },
  youtube: { x: 0, y: 790, w: 888, h: 250 },
};
const COLS_ISO: Record<string, number> = { youtube: 8 };
const CW = 100, CH = 88;
export function posicionesIso(ags: { id: string; area: string; jefe?: boolean }[]): Map<string, P> {
  const m = new Map<string, P>();
  for (const k of Object.keys(SALAS_ISO)) {
    const s = SALAS_ISO[k];
    ags.filter((a) => a.area === k).sort((a, b) => Number(!!b.jefe) - Number(!!a.jefe)).forEach((a, i) => {
      m.set(a.id, { x: s.x + 14 + (i % (COLS_ISO[k] ?? 4)) * CW + CW / 2, y: s.y + 52 + Math.floor(i / (COLS_ISO[k] ?? 4)) * CH + CH / 2 - 8 });
    });
  }
  return m;
}
export const CEO_ISO: P = { x: SALAS_ISO.direccion.x + 14 + CW + CW / 2, y: SALAS_ISO.direccion.y + 52 + CH / 2 - 8 };
type Haz = { id: string; to: string; area: string; n: string };
type Props = {
  pos: Map<string, P>; est: Map<string, { estado: EstadoAg; tarea: { instruccion: string } | null; pantalla?: PantallaAg }>;
  sel: string | null; onSel: (id: string) => void; haces: Haz[]; calma: boolean; ceo: P; porRevisar: number;
  estadoCol: Record<EstadoAg, string>; areaCol: Record<string, string>; nombreArea: Record<string, string>;
};
const A = 0.8, B = 0.4, OX = 600, OY = 90;
const pr = (x: number, y: number, z = 0): [number, number] => [OX + (x - y) * A, OY + (x + y) * B - z];
const poly = (pts: [number, number][]) => pts.map((p) => p.join(",")).join(" ");
const corto = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const PANTALLA_E: Record<EstadoAg, PantallaAg> = { trabajando: "ejecutando", esperando_revision: "pausa", en_cola: "cola", libre: "libre" };

/** Vista isométrica de la oficina (vectorial): mesa, monitor y cabra de espaldas por agente. El estado y la tarea son los REALES; las posiciones son fijas. */
export default function OficinaIso({ pos, est, sel, onSel, haces, calma, ceo, porRevisar, estadoCol, areaCol, nombreArea }: Props) {
  type It = { id: string; nombre: string; area: string; x: number; y: number; e: EstadoAg; p?: PantallaAg; t: string; humano?: boolean };
  const items: It[] = AGENTES.map((a) => { const p = pos.get(a.id); const v = est.get(a.id); return p && v ? { id: a.id, nombre: a.nombre, area: a.area, x: p.x, y: p.y, e: v.estado, p: v.pantalla, t: v.tarea ? v.tarea.instruccion : "libre" } : null; }).filter(Boolean) as It[];
  items.push({ id: "__ceo", nombre: PROYECTO.ceo.trim() || "CEO", area: "direccion", x: ceo.x, y: ceo.y, e: porRevisar ? "esperando_revision" : "libre", t: porRevisar ? `CEO · ${porRevisar} por revisar` : "CEO · al día", humano: true });
  const orden = [...items].sort((a, b) => a.x + a.y - (b.x + b.y));
  const [foco, setFoco] = useState<string>("todas");
  const vb = (() => { if (foco === "todas" || !SALAS_ISO[foco]) return "-210 0 1560 960"; const r = SALAS_ISO[foco]; const c = [pr(r.x, r.y), pr(r.x + r.w, r.y), pr(r.x + r.w, r.y + r.h), pr(r.x, r.y + r.h)]; const xs = c.map((q) => q[0]), ys = c.map((q) => q[1]); const x0 = Math.min(...xs) - 30, y0 = Math.min(...ys) - 110; return `${x0} ${y0} ${Math.max(...xs) + 30 - x0} ${Math.max(...ys) + 60 - y0}`; })();
  const salas = ["todas", ...Object.keys(SALAS_ISO)];
  const sala = (k: string) => { const s = SALAS_ISO[k]; return poly([pr(s.x, s.y), pr(s.x + s.w, s.y), pr(s.x + s.w, s.y + s.h), pr(s.x, s.y + s.h)]); };
  return (
    <div>
    <div role="tablist" aria-label="Sala" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
      {salas.map((k) => <button key={k} type="button" role="tab" aria-selected={foco === k} onClick={() => setFoco(k)} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${foco === k ? "#FFD600" : "#1E3A66"}`, background: foco === k ? "#13294D" : "transparent", color: "#EAF1FF", cursor: "pointer", fontSize: 12 }}>{k === "todas" ? "Toda la oficina" : nombreArea[k]}</button>)}
    </div>
    <svg viewBox={vb} role="group" aria-label="Oficina isométrica" style={{ width: "100%", height: "auto", maxHeight: "80vh", background: "#07182E", border: "1px solid #1E3A66", borderRadius: 12 }}>
      {Object.keys(SALAS_ISO).map((k) => <polygon key={k} points={sala(k)} fill="#0E2140" stroke={areaCol[k]} strokeOpacity={0.7} strokeWidth={2} />)}
      {orden.filter((i) => i.e === "trabajando").map((i) => { const [hx, hy] = pr(i.x, i.y + 8); return <ellipse key={"o" + i.id} cx={hx} cy={hy} rx={52} ry={20} fill={estadoCol.trabajando} opacity={0.3} className={calma ? undefined : "ichalo"} />; })}
      {haces.map((h) => { const c = pos.get("ciro"), q = pos.get(h.to); if (!c || !q) return null; const [x1, y1] = pr(c.x, c.y, 30), [x2, y2] = pr(q.x, q.y, 30); return <path key={"b" + h.id} d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) - 50} ${x2} ${y2}`} fill="none" stroke={areaCol[h.area]} strokeWidth={3} strokeDasharray="6 6" strokeLinecap="round" className={calma ? undefined : "icflujo"} />; })}
      {orden.map((i) => {
        const H = 14, x0 = i.x - 30, x1 = i.x + 30, y0 = i.y - 13, y1 = i.y + 13;
        const top = poly([pr(x0, y0, H), pr(x1, y0, H), pr(x1, y1, H), pr(x0, y1, H)]);
        const fr = poly([pr(x0, y1, 0), pr(x1, y1, 0), pr(x1, y1, H), pr(x0, y1, H)]);
        const dr = poly([pr(x1, y0, 0), pr(x1, y1, 0), pr(x1, y1, H), pr(x1, y0, H)]);
        const mx0 = i.x - 28, mx1 = i.x - 8, my = i.y - 5;
        const scr = poly([pr(mx0, my, H + 4), pr(mx1, my, H + 4), pr(mx1, my, H + 26), pr(mx0, my, H + 26)]);
        const [gx, gy] = pr(i.x + 22, i.y + 26, 0); const [sx, sy] = pr(i.x - 18, i.y + 24, 0);
        const img = `/oficina/cabra-espalda-${i.area}.png`; const on = sel === i.id;
        return (
          <g key={i.id} role="button" tabIndex={0} aria-label={`${i.nombre}: ${ESTADO_AG_LABEL[i.e]}`} onClick={() => !i.humano && onSel(i.id)} onKeyDown={(ev) => { if (!i.humano && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); onSel(i.id); } }} style={{ cursor: i.humano ? "default" : "pointer", outline: "none" }}>
            <polygon points={fr} fill="#3A2A22" /><polygon points={dr} fill="#2A1D18" /><polygon points={top} fill={on ? "#8A6A4A" : "#6B4F3A"} stroke={on ? "#FFD600" : "none"} strokeWidth={2} />
            <polygon points={scr} fill={i.p ? PANTALLA_COL[i.p] : PANTALLA_COL[PANTALLA_E[i.e]]} stroke="#0B1220" strokeWidth={2} opacity={i.e === "libre" ? 1 : 0.95} />
            <ellipse cx={sx + 22} cy={sy} rx={16} ry={6} fill="#0B1220" opacity={0.6} />
            <image href={img} x={gx - 24} y={gy - 56} width={48} height={58} />
          </g>);
      })}
      {orden.filter((i) => foco !== "todas" ? i.area === foco : (sel === i.id || i.e !== "libre" || !!i.humano)).map((i) => { const [px, py] = pr(i.x + 22, i.y + 26, 0); const w = Math.max(64, Math.min(112, i.nombre.length * 6.4 + 26)); return (
        <g key={"n" + i.id} pointerEvents="none">
          <rect x={px - w / 2} y={py - 84} width={w} height={17} rx={9} fill="#0B1220" opacity={0.85} stroke={areaCol[i.area]} />
          <circle cx={px - w / 2 + 10} cy={py - 75.5} r={4} fill={estadoCol[i.e]} />
          <text x={px + 4} y={py - 72} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#EAF1FF">{corto(i.nombre, 14)}</text>
          {i.t !== "libre" && (sel === i.id || i.e === "trabajando" || i.humano) && <text x={px} y={py - 88} textAnchor="middle" fontSize={9} fill={estadoCol[i.e]}>{corto(i.t, 24)}</text>}
        </g>); })}
      {Object.keys(SALAS_ISO).map((k) => { const r = SALAS_ISO[k]; const [tx, ty] = pr(r.x + r.w / 2, r.y - 12); return <text key={"t" + k} x={tx} y={ty} textAnchor="middle" fill={areaCol[k]} fontSize={18} fontWeight={800} pointerEvents="none">{nombreArea[k]}</text>; })}
    </svg>
    </div>
  );
}
