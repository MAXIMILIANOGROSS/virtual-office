"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { PROYECTO } from "@/oficina.config";
import dynamic from "next/dynamic";
import { AGENTES, AREAS, type Area } from "@/lib/oficina/agentes";
import BuscadorAgentes from "@/components/BuscadorAgentes";
import OficinaIso, { CEO_ISO, posicionesIso } from "@/components/OficinaIso";
import { ESTADO_AG_LABEL, estadoAgente, type EstadoAg } from "@/lib/oficina/mapa";
import { NOMBRE_PROPIO } from "@/lib/oficina/nombresPropios";
import type { EventoPublico, TareaPublica } from "@/lib/oficina/publico";

const Oficina3D = dynamic(() => import("@/components/Oficina3D"), { ssr: false, loading: () => <p style={{ color: "#9FB3D6", fontSize: 12 }}>Cargando la oficina…</p> });
const col = { bg: "#07182E", card: "#0B2A5B", line: "#2A5CAA", gold: "#FFD600", txt: "#F4F8FF", mut: "#A9C1E8", blue: "#1D5FD0", white: "#FFFFFF" };
const ESTADO_COL: Record<EstadoAg, string> = { trabajando: "#22D3EE", esperando_revision: "#FBBF24", en_cola: "#60A5FA", libre: "#64748B" };
const AREA_COL: Record<string, string> = { direccion: "#FFD600", estrategia: "#FFFFFF", tecnologia: "#4A8CFF", crecimiento: "#FFB020", youtube: "#FF4D4D" };
type Datos = { agentesConfigurados: number; agentesTrabajando: number; tareas: TareaPublica[]; eventos: EventoPublico[] };

export default function Observatorio() {
  const [d, setD] = useState<Datos | null>(null); const [err, setErr] = useState(false); const [vista, setVista] = useState<"3d" | "2d">("3d"); const [calma, setCalma] = useState(false); const [giro, setGiro] = useState(false); const [nombres, setNombres] = useState(false); const [foco, setFoco] = useState<{ id: string; n: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    const cargar = async () => { try { const r = await fetch("/api/office-observatory", { cache: "no-store" }); const j = await r.json(); if (!vivo) return; if (j.ok) { setD(j); setErr(false); } else setErr(true); } catch { if (vivo) setErr(true); } };
    void cargar(); const t = setInterval(cargar, 30000); return () => { vivo = false; clearInterval(t); };
  }, []);
  const wrapRef = useRef<HTMLDivElement | null>(null); const [fs, setFs] = useState(false);
  const toggleFs = () => { const el = wrapRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null; const dd = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }; try { if (dd.fullscreenElement || dd.webkitFullscreenElement) (dd.exitFullscreen || dd.webkitExitFullscreen)?.call(dd); else if (el) (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el); } catch { /* sin pantalla completa */ } };
  useEffect(() => { const dd = document as Document & { webkitFullscreenElement?: Element }; const h = () => { setFs(!!(dd.fullscreenElement || dd.webkitFullscreenElement)); setTimeout(() => window.dispatchEvent(new Event("resize")), 80); }; const k = (e: KeyboardEvent) => { if (e.code === "KeyL" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) toggleFs(); }; document.addEventListener("fullscreenchange", h); document.addEventListener("webkitfullscreenchange", h); window.addEventListener("keydown", k); return () => { document.removeEventListener("fullscreenchange", h); document.removeEventListener("webkitfullscreenchange", h); window.removeEventListener("keydown", k); }; }, []);
  const tareas = useMemo(() => (d?.tareas || []).map((t) => ({ ...t, estado: t.estado as never })), [d]);
  const pos = useMemo(() => posicionesIso(AGENTES), []);
  const est = useMemo(() => new Map(AGENTES.map((a) => [a.id, estadoAgente(a.id, tareas as never)])), [tareas]);
  const nombreArea = useMemo(() => Object.fromEntries((Object.keys(AREAS) as Area[]).map((k) => [k, AREAS[k].nombre])), []);
  const haces = useMemo(() => { const c = pos.get("ciro"); if (!c) return []; const vistos = new Set<string>(); const out: { id: string; d: string; to: string; area: string; n: string }[] = [];
    for (const t of tareas) { if (t.estado !== ("en_curso" as never) || t.agente === "ciro" || vistos.has(t.agente)) continue; const q = pos.get(t.agente); const ag = AGENTES.find((x) => x.id === t.agente); if (!q || !ag) continue; vistos.add(t.agente); out.push({ id: t.id, to: t.agente, area: ag.area, n: ag.nombre, d: "" }); } return out; }, [tareas, pos]);
  const rolDe = useMemo(() => Object.fromEntries(AGENTES.map((a) => [a.id, a.rol])), []);
  const noop = () => {};
  const props = { pos, est, sel: null, onSel: noop, haces, calma, ceo: CEO_ISO, porRevisar: 0, estadoCol: ESTADO_COL, areaCol: AREA_COL, nombreArea, rolDe, etiquetasTodas: nombres, giro, enfocar: foco, propios: NOMBRE_PROPIO } as never;
  const btn = (v: "3d" | "2d") => ({ padding: "6px 12px", borderRadius: 8, border: `1px solid ${vista === v ? col.gold : col.line}`, background: vista === v ? col.gold : "transparent", color: vista === v ? col.bg : col.txt, cursor: "pointer", fontWeight: 700 });
  return (
    <main style={{ background: `radial-gradient(1200px 500px at 50% -10%, #12409A 0%, ${col.bg} 60%)`, color: col.txt, minHeight: "100dvh", padding: "0 0 60px" }}>
      <div aria-hidden style={{ display: "flex", height: 8 }}><div style={{ flex: 1, background: col.white }} /><div style={{ flex: 1, background: col.blue }} /><div style={{ flex: 1, background: col.gold }} /></div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 0" }}>
      <header><div style={{ color: col.gold, fontWeight: 800, letterSpacing: 1.5 }}>{(PROYECTO.nombre.trim() || "OFICINA VIRTUAL").toUpperCase()} · OFFICE OBSERVATORY{PROYECTO.ciudad.trim() ? " · " + PROYECTO.ciudad.trim().toUpperCase() : ""}</div>
        <h1 style={{ margin: "2px 0 6px", fontSize: 24 }}>Una ventana a la oficina{PROYECTO.nombre.trim() ? " de " + PROYECTO.nombre.trim() : ""}</h1>
        <p style={{ fontSize: 14, color: col.mut, margin: 0 }}>Bienvenido a la oficina{PROYECTO.nombre.trim() ? " de " + PROYECTO.nombre.trim() : ""}. Aquí puedes observar cómo trabajan nuestras cabras. Esta ventana es exclusivamente de observación: el trabajo interno permanece protegido.</p></header>
      <BuscadorAgentes onPick={(id) => { setVista("3d"); setFoco({ id, n: Date.now() }); }} />
      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" style={btn("3d")} aria-pressed={vista === "3d"} onClick={() => setVista("3d")}>Vista 3D</button>
        <button type="button" style={btn("2d")} aria-pressed={vista === "2d"} onClick={() => setVista("2d")}>Vista 2D ligera</button>
        <label style={{ fontSize: 12, color: col.mut }}><input type="checkbox" checked={nombres} onChange={(e) => setNombres(e.target.checked)} /> Mostrar nombres siempre</label>
        <label style={{ fontSize: 12, color: col.mut }}><input type="checkbox" checked={giro} onChange={(e) => setGiro(e.target.checked)} /> Giro 360° automático</label>
        <label style={{ fontSize: 12, color: col.mut }}><input type="checkbox" checked={calma} onChange={(e) => setCalma(e.target.checked)} /> Reducir efectos</label>
      </div>
      <div role="status" style={{ fontSize: 13, color: err ? "#F87171" : col.mut, marginBottom: 8 }}>
        {err ? "Sin conexión con la oficina ahora mismo; mostramos el último estado conocido." : d ? `Agentes configurados: ${d.agentesConfigurados} · trabajando ahora: ${d.agentesTrabajando}. ${d.tareas.length === 0 ? "No hay actividad en este momento: las cabras están en reposo." : ""}` : "Conectando…"}
      </div>
      <div ref={wrapRef} style={{ position: "relative", background: col.bg, ...(fs ? { width: "100vw", height: "100vh" } : {}) }}>
        {vista === "3d" ? <Oficina3D {...(props as object as React.ComponentProps<typeof Oficina3D>)} alto={fs ? "100vh" : undefined} /> : <OficinaIso {...(props as object as React.ComponentProps<typeof OficinaIso>)} />}
        <button type="button" onClick={toggleFs} aria-label={fs ? "Salir de pantalla completa" : "Pantalla completa"} style={{ position: "absolute", right: 12, bottom: 12, zIndex: 20, padding: "8px 12px", borderRadius: 8, border: `1px solid ${col.gold}`, background: "rgba(6,20,46,.88)", color: col.gold, cursor: "pointer", fontWeight: 800, fontSize: 13 }}>{fs ? "⤢ Salir (L)" : "⛶ Pantalla completa (L)"}</button>
      </div>
      <p style={{ fontSize: 12, color: col.mut, margin: "6px 0 0" }}>Vista 360°: arrastra para girar alrededor de la oficina y acércate con la rueda o los dedos. Cada cabra se ve desde el ángulo en que la miras.</p>
      <h2 style={{ fontSize: 17, marginTop: 18, color: col.gold }}>El equipo: quién es cada cabra y a qué se dedica</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 8 }}>
        {AGENTES.map((a) => { const e = est.get(a.id); const st = e?.estado || "libre"; return (
          <div key={a.id} style={{ background: col.card, border: `1px solid ${AREA_COL[a.area]}`, borderRadius: 12, padding: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><img src="/cabra360/cabra-2.webp" alt="" width={34} height={40} style={{ objectFit: "contain" }} /><div><div style={{ fontWeight: 800 }}>{NOMBRE_PROPIO[a.id] || a.nombre}{a.jefe ? " ★" : ""} <span style={{ fontWeight: 500, fontSize: 11, color: col.mut }}>· {a.nombre}</span></div><div style={{ fontSize: 12, color: AREA_COL[a.area] }}>{nombreArea[a.area]}</div></div></div>
            <div style={{ fontSize: 12, marginTop: 4 }}>{a.rol}</div>
            <div style={{ fontSize: 11, color: col.mut, marginTop: 3 }}>{a.habilidades.join(" · ")}</div>
            <button type="button" onClick={() => { setVista("3d"); setFoco({ id: a.id, n: Date.now() }); }} style={{ marginTop: 6, padding: "3px 9px", borderRadius: 8, border: `1px solid ${col.gold}`, background: "transparent", color: col.gold, cursor: "pointer", fontSize: 11 }}>Ver en la oficina</button>
            <div style={{ fontSize: 11, marginTop: 4 }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: ESTADO_COL[st], marginRight: 5 }} />{ESTADO_AG_LABEL[st]}</div>
          </div>); })}
      </div>
      <h2 style={{ fontSize: 17, marginTop: 18, color: col.gold }}>Lo que está pasando{PROYECTO.nombre.trim() ? " en " + PROYECTO.nombre.trim() : ""}</h2>
      <div style={{ background: col.card, border: `1px solid ${col.line}`, borderRadius: 12, padding: 12, fontSize: 13, display: "grid", gap: 4 }}>
        {(d?.eventos || []).length === 0 ? <span style={{ color: col.mut }}>Sin actividad pública reciente.</span> : d!.eventos.map((e, i) => <div key={i}><span style={{ color: col.mut }}>{new Date(e.at).toLocaleString("es-ES")}</span> · {e.texto}</div>)}
      </div>
      <p style={{ fontSize: 12, color: col.mut, marginTop: 12 }}>{Object.values(ESTADO_AG_LABEL).join(" · ")}. No estás viendo una oficina de decoración: el estado sale de las tareas reales, sin mostrar su contenido.</p>
      </div>
    </main>
  );
}
