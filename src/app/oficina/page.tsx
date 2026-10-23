"use client";
import EntregablesTarea from "@/components/EntregablesTarea";
import ControlOficinaTab from "@/components/ControlOficinaTab";
import IntelligenceTab from "@/components/IntelligenceTab";
import InformesTab from "@/components/InformesTab";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./oficina.css";
import OficinaMapa from "@/components/OficinaMapa";
import CartelesTab from "@/components/CartelesTab";
import VideoStudioTab from "@/components/VideoStudioTab";
import CampanaStudio from "@/components/CampanaStudio";
import PerfilMarcaTab from "@/components/PerfilMarcaTab";
import MarketingStudioTab from "@/components/MarketingStudioTab";
import AnuncioEmpleoTab from "@/components/AnuncioEmpleoTab";
import ConsumoTab from "@/components/ConsumoTab";
import { NOMBRE_PROPIO } from "@/lib/oficina/nombresPropios";
import { supabase } from "@/lib/supabaseClient";
import { PROYECTO } from "@/oficina.config";
import { AGENTES, AREAS, agentePorId, type Area } from "@/lib/oficina/agentes";
import { CANALES, ESTADO_LABEL, NIVEL_LABEL, puedeCompletar, puedeIr, type Estado, type Nivel } from "@/lib/oficina/tareas";

type Tarea = { id: string; instruccion: string; agente: string; area: Area; nivel: Nivel; estado: Estado; resultado: string | null; error: string | null; created_at: string };
type Kb = { id: string; agente: string | null; titulo: string; contenido: string };
type Log = { id: number; evento: string; detalle: string | null; at: string };
const col = { bg: "#07182E", card: "#FFFDF7", line: "#07182E", gold: "#FFD600", txt: "#07182E", mut: "#5A6B7F", ok: "#2E8B57", bad: "#C0392B", warn: "#B7791F" };
const estCol = (e: Estado) => (e === "completada" ? col.ok : e === "fallida" || e === "cancelada" ? col.bad : e === "requiere_aprobacion" ? col.warn : col.mut);

function Reloj() {
  const [h, setH] = useState(""); const [w, setW] = useState("");
  useEffect(() => { const t = () => setH(new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: PROYECTO.zonaHoraria || "UTC" })); t(); const i = setInterval(t, 20000); return () => clearInterval(i); }, []);
  useEffect(() => { if (PROYECTO.latitud === null || PROYECTO.longitud === null) return; fetch(`https://api.open-meteo.com/v1/forecast?latitude=${PROYECTO.latitud}&longitude=${PROYECTO.longitud}&current=temperature_2m,weather_code`).then((r) => r.json()).then((j) => { const c = j.current; const k = c.weather_code; const d = k === 0 ? "Despejado" : k <= 3 ? "Poco nublado" : k < 50 ? "Niebla" : k < 70 ? "Lluvia" : "Tormenta"; setW(`${Math.round(c.temperature_2m)} °C · ${d}`); }).catch(() => {}); }, []);
  const noche = h && (Number(h.slice(0, 2)) >= 21 || Number(h.slice(0, 2)) < 7);
  return <div className="of-g of-clk"><b>{noche ? "☾ " : "☀ "}{h || "--:--"}</b><small>{PROYECTO.ciudad.trim() ? PROYECTO.ciudad.trim() + " · " : ""}{noche ? "noche" : "día"}</small>{w && <small>{w}</small>}{PROYECTO.latitud !== null && PROYECTO.longitud !== null && <small>{PROYECTO.latitud.toFixed(2)}°, {PROYECTO.longitud.toFixed(2)}°</small>}</div>;
}


export default function Oficina() {
  const [sesion, setSesion] = useState<"cargando" | "no" | "noadmin" | "ok">("cargando");
  const [tareas, setTareas] = useState<Tarea[]>([]); const [log, setLog] = useState<Log[]>([]);
  const [orden, setOrden] = useState(""); const [enviando, setEnviando] = useState(false); const [msg, setMsg] = useState(""); const [abierta, setAbierta] = useState<string | null>(null); const [decidiendo, setDecidiendo] = useState<Tarea | null>(null); const [nota, setNota] = useState(""); const [guardando, setGuardando] = useState(false);
  const [parada, setParada] = useState(false);
  const [foco, setFoco] = useState<{ id: string; n: number } | null>(null);
  const [vista, setVista] = useState<"oficina" | "panel" | "equipo" | "conocimiento" | "canales" | "carteles" | "control" | "informes" | "intel" | "estudio">("oficina");
  const [subEst, setSubEst] = useState<"video" | "campanas" | "marcas" | "textos" | "empleo" | "consumo">("video");
  useEffect(() => { try { const q = new URLSearchParams(window.location.search); if (q.get("vista") === "estudio") { setVista("estudio"); const x = q.get("sec"); if (x && ["video", "campanas", "marcas", "textos", "empleo", "consumo"].includes(x)) setSubEst(x as typeof subEst); } } catch { /* sin query */ } }, []);
  const [kb, setKb] = useState<Kb[]>([]); const [kbAg, setKbAg] = useState(""); const [kbT, setKbT] = useState(""); const [kbC, setKbC] = useState("");

  const cargar = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession(); if (!s.session) { setSesion("no"); return; }
    const { data: adm } = await supabase.rpc("oficina_is_admin"); if (adm !== true) { setSesion("noadmin"); return; }
    setSesion("ok");
    const t = await supabase.from("office_tasks").select("id,instruccion,agente,area,nivel,estado,resultado,error,created_at").order("created_at", { ascending: false }).limit(60);
    if (t.error) setMsg("No se pudieron leer las tareas. ¿Has ejecutado el SQL 87?"); else setTareas((t.data as Tarea[]) || []);
    const k = await supabase.from("office_kb").select("id,agente,titulo,contenido").order("created_at", { ascending: false }).limit(200); if (!k.error) setKb((k.data as Kb[]) || []);
    const l = await supabase.from("office_log").select("id,evento,detalle,at").order("at", { ascending: false }).limit(25); if (!l.error) setLog((l.data as Log[]) || []);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault(); const texto = orden.trim(); if (!texto || enviando) return; setEnviando(true); setMsg("");
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch("/api/oficina/ejecutar", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.session?.access_token || ""}` }, body: JSON.stringify({ instruccion: texto, cola: typeof window !== "undefined" && window.localStorage.getItem("oficina_cola") === "1" }) });
      const j = await r.json();
      if (!j.ok) setMsg(j.error || "No se pudo enviar."); else { setOrden(""); setMsg(j.estado === "fallida" ? `CIRO la delegó en ${agentePorId(j.agente)?.nombre}, pero FALLÓ: ${j.motivo}` : `CIRO la delegó en ${agentePorId(j.agente)?.nombre}. Queda ${ESTADO_LABEL[j.estado as Estado].toLowerCase()}: revísala antes de darla por buena.`); await cargar(); if (j.estado === "pendiente") await cicloAhora(); }
    } catch { setMsg("Error de red."); } finally { setEnviando(false); }
  }
  async function addKb(e: React.FormEvent) {
    e.preventDefault(); if (!kbT.trim() || !kbC.trim()) return;
    const { error } = await supabase.rpc("office_kb_add", { p_agente: kbAg, p_titulo: kbT, p_contenido: kbC });
    if (error) setMsg(String(error.message || "").includes("LIMIT") ? "Máximo 200 notas." : "No se pudo guardar. ¿Has ejecutado el SQL 89?"); else { setKbT(""); setKbC(""); setMsg("Nota guardada: los agentes la usarán cuando sea relevante."); await cargar(); }
  }
  async function cicloAhora() {
    setMsg("Ejecutando ciclo…");
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch("/api/oficina/ciclo-ahora", { method: "POST", headers: { authorization: `Bearer ${s.session?.access_token || ""}` } });
      const j = await r.json();
      if (!j.ok) { setMsg(j.error || "No se pudo ejecutar el ciclo."); return; }
      const d = (j.diag || [])[0];
      const partes: string[] = [];
      if (d?.pausa) partes.push("La oficina está en PAUSA: el ciclo no ejecuta nada.");
      else if (!d) partes.push("No hay tareas pendientes ni en curso.");
      else {
        partes.push(`Pendientes: ${d.pendientes}. Presupuesto hoy: ${d.usadasHoy}/${d.presupuesto}. Tomadas: ${d.tomadas}.`);
        if (d.presupuesto <= 0) partes.push("El presupuesto diario es 0.");
      }
      if (j.sinIA) partes.push("No hay IA configurada en el servidor (faltan claves LLM en Vercel).");
      partes.push(`Ejecutadas ${j.ejecutadas}, fallos ${j.fallos}, bloqueadas ${j.bloqueadas}. Latido: ${j.latido ? "ok" : "no registrado (¿SQL 90?)"}.`);
      setMsg(partes.join(" ")); await cargar();
    } catch { setMsg("Error de red."); }
  }
  async function aprobarEjecutar() {
    if (!decidiendo || guardando) return; const t = decidiendo; setGuardando(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const texto = ((t.instruccion || "").replace(/^💡\s*Idea de [^:]*:\s*/, "") + "\n\nDetalle de la idea:\n" + (t.resultado || "")).slice(0, 1800);
      const r = await fetch("/api/oficina/ejecutar", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.session?.access_token || ""}` }, body: JSON.stringify({ instruccion: texto, cola: true, agente: t.agente }) });
      if (!r.ok) { setGuardando(false); setMsg("No se pudo crear la tarea de la idea."); return; }
      const { error } = await supabase.rpc("office_decidir", { p_id: t.id, p_decision: "aceptada", p_nota: "Aprobada y enviada a ejecución" });
      setGuardando(false);
      if (error) { setMsg("La tarea se creó pero no se pudo cerrar la idea: " + (error.message || "error")); return; }
      setMsg("Idea aprobada: se ejecutará en el próximo ciclo (máx. 15 min)."); setDecidiendo(null); setNota(""); await cargar();
    } catch { setGuardando(false); setMsg("Error de red."); }
  }
  async function decidir(d: "aceptada" | "rechazada") {
    if (!decidiendo || guardando) return; setGuardando(true);
    const { error } = await supabase.rpc("office_decidir", { p_id: decidiendo.id, p_decision: d, p_nota: nota.trim() || null });
    setGuardando(false);
    if (error) { setMsg(String(error.message || "").includes("office_decidir") ? "Falta ejecutar el SQL 91 en Supabase." : "No se pudo registrar tu decisión: " + (error.message || "error")); return; }
    setMsg(d === "aceptada" ? "Aceptada: la tarea queda completada y verificada por ti." : "Rechazada: la tarea queda cancelada."); setDecidiendo(null); setNota(""); await cargar();
  }
  async function delKb(id: string) { const { error } = await supabase.rpc("office_kb_del", { p_id: id }); if (error) setMsg("No se pudo borrar."); else await cargar(); }
  async function mover(t: Tarea, a: Estado) {
    if (!puedeIr(t.estado, a) || (a === "completada" && !puedeCompletar(t))) return;
    const { error } = await supabase.rpc("office_set_estado", { p_id: t.id, p_estado: a }); if (error) setMsg("No se pudo cambiar el estado."); else await cargar();
  }

  const porAgente = useMemo(() => { const m = new Map<string, { total: number; fallidas: number; abiertas: number }>(); for (const t of tareas) { const c = m.get(t.agente) || { total: 0, fallidas: 0, abiertas: 0 }; c.total++; if (t.estado === "fallida") c.fallidas++; if (["en_revision", "requiere_aprobacion", "en_curso", "pendiente", "planificada", "bloqueada"].includes(t.estado)) c.abiertas++; m.set(t.agente, c); } return m; }, [tareas]);
  const aprobar = tareas.filter((t) => t.estado === "requiere_aprobacion"); const revisar = tareas.filter((t) => t.estado === "en_revision"); const falladas = tareas.filter((t) => t.estado === "fallida");

  const caja: React.CSSProperties = { background: col.card, border: `2px solid ${col.line}`, borderRadius: 12, padding: 14 };
  const btn: React.CSSProperties = { background: col.gold, color: col.bg, border: 0, borderRadius: 8, padding: "6px 12px", fontWeight: 700, cursor: "pointer" };
  const ghost: React.CSSProperties = { background: "transparent", color: col.txt, border: `2px solid ${col.line}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer" };

  if (sesion === "cargando") return <main className="of" style={{ padding: 24 }}>Cargando la oficina…</main>;
  if (sesion !== "ok") return <main className="of" style={{ padding: 24 }}><h1>Oficina de Dirección</h1><p>{sesion === "no" ? "Inicia sesión como administrador para entrar." : "Esta oficina es solo para Dirección (cuenta administradora)."}</p><Link href="/">← Volver</Link></main>;

  return (
    <main className="of">
      <div className="of-top">
        <Link href="/" className="of-lg">{(PROYECTO.nombre.trim() || "OFICINA VIRTUAL").toUpperCase()}</Link>
        <div className="of-bc">Despacho de Dirección</div>
        <div className="of-us">{PROYECTO.ceo.trim() || "CEO"} <span className="of-adm">ADMINISTRADOR</span></div>
        <Link href="/" className="of-ic" aria-label="Inicio">⌂</Link><Link href="/login" className="of-ic" aria-label="Salir">⏻</Link>
      </div>
      <div className="of-w">
      {parada && <div role="alert" style={{ background: "#B91C1C", color: "#fff", fontWeight: 800, padding: "10px 14px", borderRadius: 12, margin: "0 0 12px", cursor: "pointer" }} onClick={() => setVista("control")}>⛔ OFICINA DETENIDA — no se inician tareas nuevas. Pulsa para ir a Control y salud.</div>}
      <nav aria-label="Secciones de la oficina" className="of-tiles">
        {([["oficina", "🏢", "Oficina"], ["panel", "✅", "Tareas"], ["equipo", "👥", "Equipo (43)"], ["conocimiento", "📚", "Conocimiento"], ["canales", "📡", "Canales"], ["carteles", "🎨", "Carteles e imágenes"], ["informes", "📰", "Informe diario"], ["intel", "🔎", "Intelligence"], ["estudio", "🚀", "Marketing Studio"],  ["control", "🛡️", "Control y salud"]] as const).map(([v, i, n]) => <button key={v} type="button" onClick={() => setVista(v)} aria-current={vista === v ? "page" : undefined} className={"of-tile" + (vista === v ? " on" : "")}><span className="of-tile-i">{i}</span><span className="of-tile-n">{n}</span></button>)}
        <Link href="/oficinapublica" className="of-tile" style={{ backgroundImage: "url(/images/hoteles.jpg)" }}><span className="of-tile-i">🪟</span><span className="of-tile-n">Oficina vidriera</span></Link>
      </nav>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div className="of-in" style={{ display: "contents" }}><details style={{ ...caja, marginTop: 14, order: vista === "oficina" ? 5 : 0 }}><summary style={{ cursor: "pointer", fontWeight: 800, color: "#07182E" }}>💬 Dale una orden a CIRO</summary>
      <form onSubmit={enviar} style={{ marginTop: 8 }}>
        <label htmlFor="orden" style={{ fontWeight: 700 }}>Dale una orden a CIRO</label>
        <textarea id="orden" value={orden} onChange={(e) => setOrden(e.target.value)} rows={3} maxLength={2000} placeholder="Ej.: Busca modelos de monetización para el proyecto · Prepara una propuesta comercial para un cliente potencial…" style={{ width: "100%", marginTop: 6, background: "#FFF3C4", color: col.txt, border: `2px solid ${col.line}`, borderRadius: 8, padding: 8, boxSizing: "border-box" }} />
        <label style={{ display: "block", marginTop: 6, fontSize: 13 }}><input type="checkbox" defaultChecked={typeof window !== "undefined" && window.localStorage.getItem("oficina_cola") === "1"} onChange={(e) => { try { window.localStorage.setItem("oficina_cola", e.target.checked ? "1" : "0"); } catch {} }} /> Encolar para el ciclo 24/7 (se ejecuta solo, con reintentos; requiere SQL 88 + cron)</label>
        <button type="button" onClick={cicloAhora} style={{ marginTop: 6, fontSize: 13 }}>Ejecutar ciclo ahora (diagnóstico)</button>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}><button type="submit" disabled={enviando || !orden.trim()} style={btn}>{enviando ? "CIRO está delegando…" : "Enviar a CIRO"}</button><span style={{ fontSize: 12, color: col.mut }}>CIRO elige el agente. Los agentes solo preparan borradores: no envían, no publican, no pagan.</span></div>
        {msg && <div role="status" style={{ marginTop: 8, fontSize: 13, color: msg.includes("FALL") ? col.bad : col.txt }}>{msg}</div>}
      </form></details>

      {!decidiendo && <div className="of-alert" role="status" style={{ order: -1 }}><span>🔔 {aprobar.length + revisar.length > 0 ? `Tienes ${aprobar.length + revisar.length} tareas esperando tu decisión` : "No tienes tareas esperando tu decisión"}</span>{aprobar.length + revisar.length > 0 && <button type="button" style={{ padding: "12px 22px", fontSize: 17, boxShadow: "0 0 18px rgba(255,212,0,.5)" }} onClick={() => { setNota(""); setDecidiendo(aprobar[0] || revisar[0]); }}>Revisar ahora ›</button>}</div>}
      {decidiendo && <div className="of-modal" role="dialog" aria-modal="true" aria-label="Decisión de Dirección" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 9999, padding: 16 }}>
        <div className="of-modal-box" style={{ ...caja, maxWidth: 640, width: "100%", maxHeight: "90dvh", overflow: "auto" }}>
          <div style={{ color: "#07182E", fontWeight: 800 }}>¿ACEPTAS ESTO?</div>
          <div style={{ fontWeight: 700, marginTop: 6 }}>{decidiendo.instruccion}</div>
          <div style={{ fontSize: 12, color: col.mut, marginTop: 2 }}>{agentePorId(decidiendo.agente)?.nombre || decidiendo.agente} · Nivel {NIVEL_LABEL[decidiendo.nivel]} · {ESTADO_LABEL[decidiendo.estado]}</div>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, background: "#FFF3C4", borderRadius: 8, padding: 10, marginTop: 8 }}>{decidiendo.resultado || "Sin resultado."}</pre>
          <p style={{ fontSize: 12, color: col.mut }}>Si aceptas, la tarea se marca completada y verificada por ti. Esto no envía ni publica nada fuera de la oficina. Si rechazas, se cancela.</p>
          <input aria-label="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder="Nota opcional" style={{ width: "100%", background: "#FFF3C4", color: col.txt, border: `2px solid ${col.line}`, borderRadius: 8, padding: 8 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" disabled={guardando || !puedeCompletar(decidiendo)} style={btn} onClick={() => void decidir("aceptada")}>Sí, acepto</button>
            {decidiendo.instruccion.startsWith("💡") && <button type="button" disabled={guardando} aria-busy={guardando} style={btn} onClick={() => void aprobarEjecutar()}>Aprobar y ejecutar</button>}
            <button type="button" disabled={guardando} aria-busy={guardando} style={ghost} onClick={() => void decidir("rechazada")}>No, rechazar</button>
            <button type="button" disabled={guardando} aria-busy={guardando} style={ghost} onClick={() => setDecidiendo(null)}>Volver</button>
          </div>
        </div>
      </div>}

      </div>
      {vista === "oficina" && <div className="of-fr"><OficinaMapa tareas={tareas} enfocar={foco} /></div>}
      <div className="of-in" style={{ display: "contents" }}>

      {vista === "conocimiento" && <section style={{ marginTop: 14, display: "grid", gap: 10 }}>
        <p style={{ fontSize: 13, color: col.mut, margin: 0 }}>Biblioteca de conocimiento: notas tuyas que los agentes leen antes de trabajar (marca, precios, datos de tu mercado, procedimientos). Además, cada tarea que apruebas como completada se usa como ejemplo de buen trabajo para ese agente. No es entrenamiento del modelo: es contexto que se añade a cada orden.</p>
        <form onSubmit={addKb} style={caja}>
          <label htmlFor="kbag" style={{ fontWeight: 700 }}>Para qué agente</label>
          <select id="kbag" value={kbAg} onChange={(e) => setKbAg(e.target.value)} style={{ display: "block", marginTop: 4, background: "#FFF3C4", color: col.txt, border: `2px solid ${col.line}`, borderRadius: 8, padding: 6 }}>
            <option value="">Todos los agentes</option>{AGENTES.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
          <input aria-label="Título" value={kbT} onChange={(e) => setKbT(e.target.value)} maxLength={80} placeholder="Título (ej.: Precios del plan para empresas)" style={{ width: "100%", marginTop: 8, background: "#FFF3C4", color: col.txt, border: `2px solid ${col.line}`, borderRadius: 8, padding: 8, boxSizing: "border-box" }} />
          <textarea aria-label="Contenido" value={kbC} onChange={(e) => setKbC(e.target.value)} maxLength={4000} rows={5} placeholder="Contenido que debe saber el agente. Solo datos verdaderos." style={{ width: "100%", marginTop: 8, background: "#FFF3C4", color: col.txt, border: `2px solid ${col.line}`, borderRadius: 8, padding: 8, boxSizing: "border-box" }} />
          <div style={{ marginTop: 8 }}><button type="submit" disabled={!kbT.trim() || !kbC.trim()} style={btn}>Guardar nota</button></div>
          {msg && <div role="status" style={{ marginTop: 8, fontSize: 13 }}>{msg}</div>}
        </form>
        {kb.length === 0 && <div style={{ ...caja, color: col.mut }}>Todavía no hay notas.</div>}
        {kb.map((k) => <article key={k.id} style={caja}><div style={{ fontWeight: 700 }}>{k.titulo} <span style={{ fontSize: 12, color: col.mut }}>· {k.agente ? agentePorId(k.agente)?.nombre || k.agente : "Todos"}</span></div><div style={{ fontSize: 13, marginTop: 4, whiteSpace: "pre-wrap" }}>{k.contenido}</div><button type="button" style={{ ...ghost, marginTop: 8 }} onClick={() => void delKb(k.id)}>Borrar</button></article>)}
      </section>}

      {vista === "panel" && <>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 14 }}>
          {[["Requieren tu aprobación", aprobar.length, col.warn], ["En revisión", revisar.length, col.txt], ["Fallidas", falladas.length, col.bad], ["Tareas registradas", tareas.length, col.mut]].map(([t, n, c]) => <div key={String(t)} style={caja}><div style={{ fontSize: 28, fontWeight: 800, color: String(c) }}>{n as number}</div><div style={{ fontSize: 12, color: col.mut }}>{t as string}</div></div>)}
        </section>
        <h2 style={{ fontSize: 18, marginTop: 18 }}>Tareas</h2>
        {tareas.length === 0 && <div style={{ ...caja, color: col.mut }}>Aún no hay tareas. Escribe la primera orden arriba.</div>}
        <div style={{ display: "grid", gap: 8 }}>{tareas.map((t) => { const ag = agentePorId(t.agente); const open = abierta === t.id; return (
          <article key={t.id} style={caja}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700 }}>{t.instruccion.length > 140 ? t.instruccion.slice(0, 140) + "…" : t.instruccion}</div>
              <span style={{ color: estCol(t.estado), fontWeight: 700, fontSize: 13 }}>{ESTADO_LABEL[t.estado]}</span>
            </div>
            <div style={{ fontSize: 12, color: col.mut, marginTop: 2 }}>{ag?.nombre || t.agente} · {AREAS[t.area].nombre} · Nivel {NIVEL_LABEL[t.nivel]} · {new Date(t.created_at).toLocaleString("es-ES")}</div>
            {t.error && <div style={{ fontSize: 12, color: col.bad, marginTop: 4 }}>Motivo del fallo: {t.error}</div>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {t.resultado && <button type="button" style={ghost} onClick={() => setAbierta(open ? null : t.id)}>{open ? "Ocultar resultado" : "Ver resultado"}</button>}
              {puedeCompletar(t) && <button type="button" style={btn} onClick={() => { setNota(""); setDecidiendo(t); }}>{t.estado === "requiere_aprobacion" ? "Aprobar y completar" : "Marcar completada"}</button>}
              {puedeIr(t.estado, "cancelada") && <button type="button" style={ghost} onClick={() => void mover(t, "cancelada")}>Cancelar</button>}
              {t.estado === "fallida" && <button type="button" style={ghost} onClick={() => void mover(t, "pendiente")}>Volver a pendiente</button>}
            </div>
            {open && <EntregablesTarea taskId={t.id} />}
            {open && t.resultado && <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, background: "#FFF3C4", borderRadius: 8, padding: 10, marginTop: 8 }}>{t.resultado}</pre>}
          </article>); })}</div>
        <h2 style={{ fontSize: 18, marginTop: 18 }}>Historial de actividad</h2>
        <div style={{ ...caja, fontSize: 12, color: col.mut, display: "grid", gap: 3 }}>{log.length === 0 ? "Sin actividad todavía." : log.map((l) => <div key={l.id}>{new Date(l.at).toLocaleString("es-ES")} · {l.evento}{l.detalle ? ` · ${l.detalle}` : ""}</div>)}</div>
      </>}

      {vista === "equipo" && <>
        <p style={{ fontSize: 13, color: col.mut }}>43 perfiles: CIRO, 3 jefes de departamento, 26 especialistas y 13 de YouTube Studio. Son perfiles con instrucciones y límites propios que usan el modelo de IA del servidor; no son 30 inteligencias entrenadas por separado. Los contadores salen de tus tareas reales.</p>
        {(Object.keys(AREAS) as Area[]).map((ar) => <section key={ar} style={{ marginTop: 12 }}>
          <h2 style={{ fontSize: 17, marginBottom: 2 }}>{AREAS[ar].nombre}</h2><div style={{ fontSize: 12, color: col.mut, marginBottom: 6 }}>{AREAS[ar].mision}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 8 }}>{AGENTES.filter((a) => a.area === ar).map((a) => { const c = porAgente.get(a.id); return <div key={a.id} style={{ ...caja, borderColor: a.jefe ? col.gold : col.line }}>
            <div style={{ fontWeight: 800 }}>{NOMBRE_PROPIO[a.id] || a.nombre}{a.jefe ? " ★" : ""} <span style={{ fontWeight: 500, fontSize: 11, color: col.mut }}>· {a.nombre}</span></div><div style={{ fontSize: 12, color: col.mut }}>{a.rol}</div>
            <button type="button" onClick={() => { setFoco({ id: a.id, n: Date.now() }); setVista("oficina"); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ marginTop: 6, padding: "4px 10px", borderRadius: 8, border: `1px solid ${col.gold}`, background: "transparent", color: "#07182E", cursor: "pointer", fontSize: 12 }}>Ver en la oficina</button>
            <div style={{ fontSize: 11, marginTop: 4 }}>{a.habilidades.join(" · ")}</div>
            <div style={{ fontSize: 11, color: col.mut, marginTop: 4 }}>{c ? `${c.total} tareas · ${c.abiertas} abiertas · ${c.fallidas} fallidas` : "Sin tareas todavía"}</div></div>; })}</div>
        </section>)}
      </>}

      {vista === "estudio" && <section style={{ marginTop: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([["video", "🎬 Vídeo"], ["campanas", "🚀 Campañas"], ["marcas", "🧠 Marcas"], ["textos", "✍️ Textos"], ["empleo", "📣 Anuncios de empleo"], ["consumo", "📊 Consumo y límites"]] as const).map(([v, n]) => <button key={v} type="button" onClick={() => setSubEst(v)} aria-current={subEst === v ? "page" : undefined} className={"of-nv" + (subEst === v ? " on" : "")}>{n}</button>)}
        </div>
        <div style={{ background: "#FFFDF7", color: "#07182E", borderRadius: 14, padding: 14 }}>
          {subEst === "video" && <VideoStudioTab />}{subEst === "campanas" && <CampanaStudio />}{subEst === "marcas" && <PerfilMarcaTab />}{subEst === "textos" && <MarketingStudioTab />}{subEst === "empleo" && <AnuncioEmpleoTab />}{subEst === "consumo" && <ConsumoTab />}
        </div>
      </section>}
      {vista === "carteles" && <CartelesTab />}
      {vista === "informes" && <InformesTab />}
      {vista === "control" && <ControlOficinaTab onCambio={setParada} />}
      {vista === "intel" && <IntelligenceTab />}

      {vista === "canales" && <section style={{ marginTop: 14, display: "grid", gap: 8 }}>
        <p style={{ fontSize: 13, color: col.mut, margin: 0 }}>Bandeja unificada: solo el chat con CIRO funciona hoy. WhatsApp, teléfono y correo son adaptadores por construir y se muestran como NO conectados hasta tener credenciales y pruebas reales.</p>
        {CANALES.map((c) => <div key={c.id} style={caja}><b>{c.nombre}</b> · <span style={{ color: c.conectado ? col.ok : col.bad }}>{c.conectado ? "Conectado" : "No conectado"}</span><div style={{ fontSize: 12, color: col.mut, marginTop: 2 }}>{c.nota}</div></div>)}
      </section>}
      </div>
      </div>
      <aside className="of-aside">
        <Reloj />
        <div className="of-g"><h2>Tu día</h2>
          <div className="of-m"><div><span>Tareas pendientes</span><b>{aprobar.length + revisar.length + tareas.filter((t) => ["pendiente", "en_curso", "planificada"].includes(t.estado)).length}</b></div><i><span style={{ width: Math.min(100, (aprobar.length + revisar.length) * 10) + "%" }} /></i></div>
          <div className="of-m g"><div><span>Equipo con trabajo</span><b>{Array.from(porAgente.values()).filter((c) => c.abiertas > 0).length}</b></div><i><span style={{ width: Math.round((Array.from(porAgente.values()).filter((c) => c.abiertas > 0).length / 43) * 100) + "%" }} /></i></div>
          <button type="button" className="of-nv" onClick={() => setVista("informes")}>📰 Informe diario ›</button>
        </div>
      </aside>
      </div>
    </main>
  );
}
