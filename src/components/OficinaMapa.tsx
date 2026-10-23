"use client";
import { useEffect, useMemo, useState } from "react";
import { PROYECTO } from "@/oficina.config";
import { AGENTES, AREAS, type Area } from "@/lib/oficina/agentes";
import { ESTADO_LABEL, type Estado } from "@/lib/oficina/tareas";
import dynamic from "next/dynamic";
import OficinaIso, { CEO_ISO, posicionesIso } from "@/components/OficinaIso";
import BuscadorAgentes from "@/components/BuscadorAgentes";
import AgenteChat from "@/components/AgenteChat";
import { NOMBRE_PROPIO } from "@/lib/oficina/nombresPropios";
import { ESTADO_AG_LABEL, PANTALLA_COL, PLANO, SALAS, estadoAgente, posiciones, type EstadoAg } from "@/lib/oficina/mapa";

type T = { id: string; instruccion: string; agente: string; estado: Estado; created_at: string };
const col = { bg: "#07182E", card: "#0B2A5B", line: "#2A5CAA", gold: "#FFD600", txt: "#F4F8FF", mut: "#A9C1E8" };
const ESTADO_COL: Record<EstadoAg, string> = { trabajando: "#22D3EE", esperando_revision: "#FBBF24", en_cola: "#60A5FA", libre: "#64748B" };
const AREA_COL: Record<string, string> = { direccion: "#FFD600", estrategia: "#FFFFFF", tecnologia: "#4A8CFF", crecimiento: "#FFB020", youtube: "#FF4D4D" };
const corto = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Plano de la oficina: cada agente en su mesa, con su estado y tarea REALES (salen de las tareas registradas). */
const Oficina3D = dynamic(() => import("@/components/Oficina3D"), { ssr: false, loading: () => <p style={{ color: "#9FB3D6", fontSize: 12 }}>Cargando la oficina 3D…</p> });

export default function OficinaMapa({ tareas, enfocar }: { tareas: T[]; enfocar?: { id: string; n: number } | null }) {
  const [sel, setSel] = useState<string | null>("ciro");
  const [chat, setChat] = useState<string | null>(null);
  const abrir = (id: string) => { setSel(id); setChat(id); };
  const [foc, setFoc] = useState<{ id: string; n: number } | null>(enfocar || null);
  const [nombres, setNombres] = useState(false); const [giro, setGiro] = useState(false); const [grande, setGrande] = useState(false);
  useEffect(() => { if (!grande) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setGrande(false); }; const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; window.addEventListener("keydown", k); return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; }; }, [grande]);
  const rolDe = useMemo(() => Object.fromEntries(AGENTES.map((x) => [x.id, x.rol])), []);
  const pos = useMemo(() => posiciones(AGENTES), []);
  const posIso = useMemo(() => posicionesIso(AGENTES), []);
  const est = useMemo(() => new Map(AGENTES.map((a) => [a.id, estadoAgente(a.id, tareas)])), [tareas]);
  const cuenta = useMemo(() => { const c: Record<EstadoAg, number> = { trabajando: 0, esperando_revision: 0, en_cola: 0, libre: 0 }; est.forEach((v) => { c[v.estado]++; }); return c; }, [est]);
  const ceo = { x: SALAS.direccion.x + 6 + 150, y: SALAS.direccion.y + 44 + 56 };
  const porRevisar = cuenta.esperando_revision;
  const [calma, setCalma] = useState(false);
  const [vista, setVista] = useState<"plano" | "iso" | "3d">("3d");
  // Haz de luz solo cuando existe una tarea REAL en curso delegada a otro agente (CIRO enruta todas las tareas).
  const haces = useMemo(() => {
    const c = pos.get("ciro"); if (!c) return [];
    const vistos = new Set<string>(); const out: { id: string; d: string; to: string; area: string; n: string }[] = [];
    for (const t of tareas) {
      if (t.estado !== "en_curso" || t.agente === "ciro" || vistos.has(t.agente)) continue;
      const q = pos.get(t.agente); const ag = AGENTES.find((x) => x.id === t.agente); if (!q || !ag) continue;
      vistos.add(t.agente);
      out.push({ id: t.id, to: t.agente, area: ag.area, n: ag.nombre, d: `M ${c.x} ${c.y} Q ${(c.x + q.x) / 2} ${Math.min(c.y, q.y) - 40} ${q.x} ${q.y}` });
    }
    return out;
  }, [tareas, pos]);
  const a = AGENTES.find((x) => x.id === sel) || null; const e = a ? est.get(a.id) : null;

  return (
    <section aria-label="Plano de la oficina" style={grande ? { position: "fixed", inset: 0, zIndex: 80, overflow: "auto", display: "flex", flexDirection: "column", padding: 12, background: "radial-gradient(1200px 600px at 15% -10%,#0F3A8A 0%,#07182E 60%,#040B1E 100%)" } : { marginTop: 14, display: "flex", flexDirection: "column" }}>
      <div style={{ order: 2, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: col.mut, margin: "10px 0 8px", alignItems: "center" }}>
        <button type="button" onClick={() => setGrande((g) => !g)} aria-pressed={grande} title={grande ? "Volver a la vista normal (Esc)" : "Ver solo la oficina a pantalla completa"} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #FFD600", background: grande ? "#FFD600" : "transparent", color: grande ? "#07182E" : "#FFD600", fontWeight: 800, cursor: "pointer" }}>{grande ? "✕ Salir de pantalla completa" : "⛶ Pantalla completa"}</button>
        {(Object.keys(ESTADO_COL) as EstadoAg[]).map((k) => <span key={k}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: ESTADO_COL[k], marginRight: 4 }} />{ESTADO_AG_LABEL[k]} ({cuenta[k]})</span>)}
      </div>
      <div style={{ order: 2, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: col.mut, marginBottom: 6 }} aria-label="Colores de las pantallas de los ordenadores"><b style={{ color: col.txt }}>Pantallas:</b>{(["ejecutando", "pausa", "terminada"] as const).map((k) => <span key={k}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: PANTALLA_COL[k], marginRight: 4 }} />{k === "ejecutando" ? "Ejecutando" : k === "pausa" ? "En pausa" : "Terminada"}</span>)}</div>
      <style>{`@keyframes icflujo{to{stroke-dashoffset:-24}}@keyframes ichalo{0%,100%{opacity:.25}50%{opacity:.6}}.icflujo{animation:icflujo 1.2s linear infinite}.ichalo{animation:ichalo 2.4s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.icflujo,.ichalo{animation:none}}`}</style>
      <details style={{ order: 4, marginBottom: 8 }}><summary style={{ cursor: "pointer", color: "#FFD600", fontSize: 13, fontWeight: 700 }}>⚙️ Buscar y opciones de vista</summary>
      <BuscadorAgentes onPick={(id) => { setVista("3d"); setSel(id); setFoc({ id, n: Date.now() }); }} />
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 6 }}>
        <label style={{ fontSize: 12, color: col.mut }}><input type="checkbox" checked={nombres} onChange={(e) => setNombres(e.target.checked)} /> Mostrar nombres siempre</label>
        <label style={{ fontSize: 12, color: col.mut }}><input type="checkbox" checked={giro} onChange={(e) => setGiro(e.target.checked)} /> Giro 360° automático</label>
        <label style={{ fontSize: 12, color: col.mut }}><input type="checkbox" checked={calma} onChange={(e) => setCalma(e.target.checked)} /> Reducir efectos visuales</label>
      </div></details>
      <div style={{ order: 3, display: "flex", gap: 8, marginBottom: 8 }}>
        {(["3d", "iso", "plano"] as const).map((v) => <button key={v} type="button" onClick={() => setVista(v)} aria-pressed={vista === v} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${vista === v ? col.gold : col.line}`, background: vista === v ? "#13294D" : "transparent", color: col.txt, cursor: "pointer", fontSize: 12 }}>{v === "3d" ? "Oficina 3D" : v === "iso" ? "Isométrica 2D" : "Plano 2D"}</button>)}
      </div>
      <div style={{ order: 1 }}>{vista === "3d" && <Oficina3D alto={grande ? "calc(100dvh - 170px)" : undefined} enfocar={foc} rolDe={rolDe} etiquetasTodas={nombres} giro={giro} propios={NOMBRE_PROPIO} pos={posIso} est={est} sel={sel} onSel={abrir} haces={haces} calma={calma} ceo={CEO_ISO} porRevisar={porRevisar} estadoCol={ESTADO_COL} areaCol={AREA_COL} nombreArea={Object.fromEntries((Object.keys(AREAS) as Area[]).map((k) => [k, AREAS[k].nombre]))} />}
      {vista === "iso" && <OficinaIso pos={posIso} est={est} sel={sel} onSel={abrir} haces={haces} calma={calma} ceo={CEO_ISO} porRevisar={porRevisar} estadoCol={ESTADO_COL} areaCol={AREA_COL} nombreArea={Object.fromEntries((Object.keys(AREAS) as Area[]).map((k) => [k, AREAS[k].nombre]))} />}
      {vista === "plano" && <svg viewBox={`0 0 ${PLANO.ancho} ${PLANO.alto}`} role="group" style={{ width: "100%", height: "auto", background: "#07182E", border: `1px solid ${col.line}`, borderRadius: 12 }}>
        {(Object.keys(SALAS) as Area[]).map((ar) => { const s = SALAS[ar]; return (
          <g key={ar}>
            <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={14} fill="#0E2140" stroke={AREA_COL[ar]} strokeOpacity={0.6} strokeWidth={2} />
            <text x={s.x + 14} y={s.y + 26} fill={AREA_COL[ar]} fontSize={15} fontWeight={800}>{AREAS[ar].nombre}</text>
          </g>); })}
        <defs>{haces.map((h) => <linearGradient key={h.id} id={`g${h.id}`} gradientUnits="userSpaceOnUse" x1={pos.get("ciro")!.x} y1="0" x2={pos.get(h.to)!.x} y2="0"><stop offset="0" stopColor={AREA_COL.direccion} /><stop offset="1" stopColor={AREA_COL[h.area]} /></linearGradient>)}</defs>
        {haces.map((h) => <g key={"h" + h.id} role="img" aria-label={`Delegación activa: CIRO a ${h.n}`}><path d={h.d} fill="none" stroke={`url(#g${h.id})`} strokeWidth={3} strokeLinecap="round" strokeDasharray="6 6" opacity={0.9} className={calma ? undefined : "icflujo"} /></g>)}
        {AGENTES.map((ag) => { const p = pos.get(ag.id); const v = est.get(ag.id); if (!p || !v || v.estado !== "trabajando") return null; return <ellipse key={"o" + ag.id} cx={p.x} cy={p.y + 30} rx={42} ry={8} fill={ESTADO_COL.trabajando} className={calma ? undefined : "ichalo"} opacity={0.35} />; })}
        <g role="img" aria-label={`${PROYECTO.ceo.trim() || "CEO"}, CEO: ${porRevisar} tareas esperando tu revisión`}>
          <line x1={ceo.x - 44} y1={ceo.y + 9} x2={ceo.x - 56} y2={ceo.y + 9} stroke={col.gold} strokeDasharray="3 3" />
          <rect x={ceo.x - 44} y={ceo.y - 8} width={88} height={34} rx={6} fill="#13294D" stroke={col.gold} strokeWidth={2} />
          <image href="/oficina/cabra-direccion.png" x={ceo.x - 20} y={ceo.y - 56} width={40} height={48} />
          <circle cx={ceo.x + 17} cy={ceo.y - 12} r={6} fill={porRevisar ? ESTADO_COL.esperando_revision : ESTADO_COL.libre} stroke="#07182E" strokeWidth={2} />
          <text x={ceo.x} y={ceo.y + 8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={col.txt}>{PROYECTO.ceo.trim() || "CEO"}</text>
          <text x={ceo.x} y={ceo.y + 21} textAnchor="middle" fontSize={9} fill={porRevisar ? ESTADO_COL.esperando_revision : col.mut}>{porRevisar ? `CEO · ${porRevisar} por revisar` : "CEO · al día"}</text>
        </g>
        {AGENTES.map((ag) => { const p = pos.get(ag.id); const v = est.get(ag.id); if (!p || !v) return null; const on = sel === ag.id; return (
          <g key={ag.id} role="button" tabIndex={0} aria-label={`${ag.nombre}: ${ESTADO_AG_LABEL[v.estado]}`} onClick={() => abrir(ag.id)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abrir(ag.id); } }} style={{ cursor: "pointer", outline: "none" }}>
            <rect x={p.x - 44} y={p.y - 8} width={88} height={34} rx={6} fill="#13294D" stroke={on ? col.gold : col.line} strokeWidth={on ? 2.5 : 1} />
            <image href={`/oficina/cabra-${ag.area}.png`} x={p.x - 20} y={p.y - 56} width={40} height={48} />
            <circle cx={p.x + 17} cy={p.y - 12} r={6} fill={ESTADO_COL[v.estado]} stroke="#07182E" strokeWidth={2} />
            <text x={p.x} y={p.y + 8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={col.txt}>{corto(ag.nombre, 15)}</text>
            <text x={p.x} y={p.y + 21} textAnchor="middle" fontSize={9} fill={v.tarea ? ESTADO_COL[v.estado] : col.mut}>{v.tarea ? corto(v.tarea.instruccion, 17) : "libre"}</text>
          </g>); })}
      </svg>}</div>
      <div style={{ order: 5 }}>
      {a && e && (
        <div style={{ background: col.card, border: `1px solid ${col.line}`, borderRadius: 12, padding: 14, marginTop: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{a.nombre}{a.jefe ? " ★" : ""} <span style={{ color: ESTADO_COL[e.estado], fontSize: 13 }}>· {ESTADO_AG_LABEL[e.estado]}</span></div>
          <div style={{ fontSize: 12, color: col.mut }}>{a.rol} · {AREAS[a.area].nombre}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Habilidades: {a.habilidades.join(" · ")}</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>{e.tarea ? <>Tarea actual ({ESTADO_LABEL[e.tarea.estado as Estado]}): {e.tarea.instruccion}</> : "Sin tarea asignada ahora mismo."}</div>
        </div>
      )}
      {chat && (() => { const ev = est.get(chat); return <AgenteChat id={chat} estado={ev ? ESTADO_AG_LABEL[ev.estado] : "libre"} tarea={ev?.tarea?.instruccion} onClose={() => setChat(null)} />; })()}
      <p style={{ fontSize: 11, color: col.mut, marginTop: 8 }}>Los haces de luz entre CIRO y un agente solo aparecen mientras hay una tarea en curso delegada a ese agente; el halo cian marca a quien está trabajando de verdad. La posición de cada mesa es fija por departamento. El estado y la tarea salen solo de las tareas registradas: si no hay tareas, todos aparecen libres.</p>
      </div>
    </section>
  );
}
