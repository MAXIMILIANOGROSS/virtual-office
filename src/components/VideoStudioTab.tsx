"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { MODOS, type Modo } from "@/lib/studio/autonomia";
import { estadoPresupuesto } from "@/lib/studio/presupuesto";
import { interpretar, type Instruccion } from "@/lib/studio/instruccion";
import { generarCalendario } from "@/lib/studio/calendario";
import { CAMPANAS, ETAPAS, HERRAMIENTAS, MARCA_BRIEF, MAX_GUIONES_DIA, PREFIJO_GUION } from "@/lib/oficina/studioVideo";

type G = { id: string; instruccion: string; estado: string; resultado: string | null; created_at: string };

/** Estudio de vídeo dentro del AI Marketing Studio: las cabras de YouTube Studio proponen guiones solas; tú apruebas. Los motores de vídeo aún no están conectados y se muestra tal cual. */
export default function VideoStudioTab() {
  const [gs, setGs] = useState<G[] | null>(null); const [ev, setEv] = useState<Record<string, { evento: string; detalle: string }[]>>({}); const [open, setOpen] = useState<string | null>(null); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const estadoVideo = (g: G): { txt: string; url?: string; color: string } | null => {
    const e = ev[g.id] || []; const ult = (k: string) => [...e].reverse().find((x) => x.evento === k);
    const sub = ult("video_subido"); if (sub) return { txt: "▶ Subido a YouTube en privado", url: sub.detalle.match(/https:\/\/youtu\.be\/[\w-]+/)?.[0], color: "#2EE66B" };
    const sf = ult("subida_fallida"); if (sf) return { txt: "⚠ Vídeo hecho; la subida a YouTube falló: " + sf.detalle, color: "#FF4757" };
    if (ult("video_generado")) return { txt: "🎬 Vídeo producido en tu Mac · subiendo a YouTube en el próximo ciclo", color: "#FFD400" };
    const vf = ult("video_fallido"); if (vf) return { txt: "✘ El vídeo falló: " + vf.detalle, color: "#FF4757" };
    return g.estado === "completada" ? { txt: "⏳ Aprobado · tu Mac lo producirá en el próximo ciclo (08:00-22:00, Mac encendido)", color: "#FFD400" } : null;
  };
  const cargar = useCallback(async () => {
    const r = await supabase.from("office_tasks").select("id,instruccion,estado,resultado,created_at").like("instruccion", PREFIJO_GUION + "%").order("created_at", { ascending: false }).limit(12);
    const lista = (r.data as G[]) || []; setGs(lista);
    if (lista.length) { const l = await supabase.from("office_log").select("task_id,evento,detalle,at").in("task_id", lista.map((g) => g.id)).in("evento", ["video_generado", "video_fallido", "video_subido", "subida_fallida"]).order("at", { ascending: true }); const m: Record<string, { evento: string; detalle: string }[]> = {}; for (const e of (l.data || []) as { task_id: string; evento: string; detalle: string }[]) (m[e.task_id] ||= []).push(e); setEv(m); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  const [trab, setTrab] = useState<string | null>(null); const [con, setCon] = useState<{ ia: boolean; cronReciente: boolean; bd: boolean } | null | "err">(null);
  useEffect(() => { (async () => { try { const { data: s } = await supabase.auth.getSession(); const r = await fetch("/api/oficina/control", { headers: { Authorization: `Bearer ${s.session?.access_token || ""}` } }); const j = await r.json(); setCon(j.ok && j.conexiones ? j.conexiones : "err"); } catch { setCon("err"); } })(); }, []);
  type Cx = { id: string; nombre: string; controlable: boolean; estado: string; detalle: string };
  const [cx, setCx] = useState<Cx[] | null>(null); const [cxMsg, setCxMsg] = useState(""); const [cxBusy, setCxBusy] = useState("");
  const cargarCx = useCallback(async () => { try { const { data: s } = await supabase.auth.getSession(); const r = await fetch("/api/studio/conexiones", { headers: { Authorization: `Bearer ${s.session?.access_token || ""}` } }); const j = await r.json(); if (j.ok) { setCx(j.conexiones); setCxMsg(j.tabla ? "" : "Falta ejecutar el SQL de conexiones (tabla studio_conexiones)."); } else setCxMsg(j.error || "No se pudo comprobar."); } catch { setCxMsg("No se pudo comprobar."); } }, []);
  useEffect(() => { void cargarCx(); }, [cargarCx]);
  async function cambiarCx(id: string, habilitada: boolean) {
    if (cxBusy) return; setCxBusy(id); setCxMsg("");
    try { const { data: s } = await supabase.auth.getSession(); const r = await fetch("/api/studio/conexiones", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${s.session?.access_token || ""}` }, body: JSON.stringify({ id, habilitada }) }); const j = await r.json(); setCxMsg(j.ok ? (habilitada ? "Conectada: el worker volverá a usarla y la comprobará en su próximo latido (máx. 15 min)." : "Desconectada: el worker ya no la usa.") : (j.error || "No se pudo cambiar.")); await cargarCx(); } catch { setCxMsg("No se pudo cambiar."); }
    setCxBusy("");
  }
  async function accion(g: G, a: "aprobar" | "rechazar" | "archivar") {
    if (trab) return; setTrab(g.id); setMsg("");
    const r = a === "archivar" ? await supabase.rpc("office_set_estado", { p_id: g.id, p_estado: "cancelada" }) : await supabase.rpc("office_decidir", { p_id: g.id, p_decision: a === "aprobar" ? "aceptada" : "rechazada", p_nota: a === "aprobar" ? "Guion aprobado en Estudio de vídeo" : "Guion rechazado en Estudio de vídeo" });
    setMsg(r.error ? "No se pudo: " + (r.error.message || "error") : a === "aprobar" ? "Guion aprobado. Tu Mac lo producirá solo en el próximo ciclo (cada 15 min, entre las 08:00 y las 22:00)." : a === "rechazar" ? "Guion rechazado." : "Guion archivado.");
    setTrab(null); await cargar();
  }
  async function ahora() {
    setBusy(true); setMsg("Las cabras están trabajando…");
    try { const { data: s } = await supabase.auth.getSession(); const r = await fetch("/api/oficina/ciclo-ahora", { method: "POST", headers: { authorization: `Bearer ${s.session?.access_token || ""}` } }); const j = await r.json(); setMsg(j.ok ? (j.sinIA ? "No hay IA configurada en el servidor." : "Ciclo hecho. Si no hay guion nuevo abajo es por un límite: 8 guiones al día con este botón (3 en automático), 9 sin revisar, o fuera de 08:00-22:00 (zona horaria de oficina.config.ts). Revisa o archiva los pendientes.") : (j.error || "No se pudo ejecutar.")); await cargar(); } catch { setMsg("Error de red."); }
    setBusy(false);
  }
  const [modo, setModo] = useState<Modo>("SUPERVISADO"); const [cfg, setCfg] = useState<{ lim: number; gasto: number } | null>(null); const [cfgMsg, setCfgMsg] = useState("");
  const [orden, setOrden] = useState(""); const [ins, setIns] = useState<Instruccion | null>(null); const [ordMsg, setOrdMsg] = useState("");
  useEffect(() => { supabase.from("studio_config").select("modo,presupuesto_mes_eur,gasto_mes_eur").maybeSingle().then(({ data, error }) => { if (error) { setCfgMsg("Falta ejecutar el SQL de configuración del Studio: de momento rige el modo Supervisado."); return; } if (data) { setModo(data.modo as Modo); setCfg({ lim: Number(data.presupuesto_mes_eur), gasto: Number(data.gasto_mes_eur) }); } }); }, []);
  async function guardarCfg(m: Modo, lim?: number) {
    const { data: u } = await supabase.auth.getUser(); const id = u.user?.id; if (!id) return;
    const { error } = await supabase.from("studio_config").upsert({ owner: id, modo: m, presupuesto_mes_eur: lim ?? cfg?.lim ?? 0, updated_at: new Date().toISOString() }, { onConflict: "owner" });
    if (error) setCfgMsg("No se pudo guardar. ¿Has ejecutado el SQL del Studio?"); else { setModo(m); setCfg((c) => ({ lim: lim ?? c?.lim ?? 0, gasto: c?.gasto ?? 0 })); setCfgMsg("Guardado."); }
  }
  async function encolar() {
    if (!ins || ins.stop) return; setOrdMsg("Enviando a CIRO…");
    try { const { data: s } = await supabase.auth.getSession(); const r = await fetch("/api/oficina/ejecutar", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.session?.access_token || ""}` }, body: JSON.stringify({ instruccion: orden.slice(0, 1900), cola: true }) }); const j = await r.json(); setOrdMsg(j.ok ? "Enviada: la oficina la tratará en su próximo ciclo y quedará en revisión." : (j.error || "No se pudo enviar.")); } catch { setOrdMsg("Error de red."); }
  }
  const cal = ins && !ins.stop ? generarCalendario({ inicio: new Date(Date.now() + 86400000), dias: ins.duracionDias, publico: ins.publico, canales: ins.canales, porDia: ins.videosPorDia }) : [];
  const pr = cfg ? estadoPresupuesto(cfg.gasto, cfg.lim) : null;
  const bx: React.CSSProperties = { border: "1px solid rgba(0,229,255,.4)", padding: 14, marginBottom: 14 };
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <h2 style={{ margin: 0 }}>ESTUDIO DE VÍDEO · oficina de vídeo</h2>
      <p style={{ margin: "0 0 8px" }}>Las cabras de YouTube Studio proponen guiones por su cuenta, hasta {MAX_GUIONES_DIA} al día. Tú apruebas: nada se produce ni se publica solo.</p>
      <div style={bx}><b>Modo de autonomía</b>
        <div style={{ display: "grid", gap: 6, margin: "8px 0" }}>{MODOS.map((m) => <label key={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><input type="radio" name="modo" checked={modo === m.id} disabled={m.id === "AUTONOMO"} onChange={() => void guardarCfg(m.id)} /><span><b>{m.nombre}</b> — {m.d}{m.id === "AUTONOMO" ? " (bloqueado: aún no hay publicación en YouTube verificada)" : ""}</span></label>)}</div>
        {pr && cfg && <p style={{ margin: "6px 0" }}>Presupuesto del mes: {cfg.gasto.toFixed(2)} € de {cfg.lim.toFixed(2)} € ({pr.pct}%) · {pr.nivel === "ok" ? "dentro del límite" : pr.nivel === "100" ? "AGOTADO: no se lanzan tareas de pago" : `alerta al ${pr.nivel}%`}</p>}
        {cfgMsg && <p role="status" style={{ fontSize: 13 }}>{cfgMsg}</p>}
        <p style={{ fontSize: 13, margin: "6px 0 0" }}>STOP ALL: en <Link href="/oficina">Control y salud</Link> está «Detener oficina»; con ella activa no se crean guiones ni tareas nuevas y se conserva todo lo ya hecho.</p>
      </div>
      <div style={bx}><b>Nueva instrucción</b>
        <textarea aria-label="Instrucción" value={orden} onChange={(e) => setOrden(e.target.value)} rows={3} maxLength={1500} placeholder="Ej.: Crea una campaña de 30 días para captar nuevos clientes. Un vídeo diario para YouTube Shorts." style={{ width: "100%", marginTop: 8 }} />
        <div style={{ margin: "8px 0", display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" disabled={!orden.trim()} aria-busy={false} onClick={() => setIns(interpretar(orden))}>Interpretar</button>{ins && !ins.stop && <button type="button" onClick={() => void encolar()}>Enviar a la oficina</button>}</div>
        {ordMsg && <p role="status" style={{ fontSize: 13 }}>{ordMsg}</p>}
        {ins && (ins.stop ? <p><b>Orden de parada detectada.</b> Usa «Detener oficina» en <Link href="/oficina">Control y salud</Link>.</p> : <div style={{ fontSize: 14 }}>
          <p style={{ margin: "4px 0" }}><b>{ins.nombre}</b></p>
          <p style={{ margin: "4px 0" }}>Objetivo: {ins.objetivo} · Público: {ins.publico} · {ins.localizacion} · {ins.duracionDias} días · {ins.videosPorDia} vídeo/día · Canales: {ins.canales.join(", ")} · Formato: {ins.formatos.join(", ")} · CTA: {ins.cta}</p>
          {ins.supuestos.map((x) => <p key={x} style={{ margin: "2px 0", fontSize: 13 }}>Supuesto: {x}</p>)}{ins.faltan.map((x) => <p key={x} style={{ margin: "2px 0", fontSize: 13 }}>Falta: {x}</p>)}
          <details style={{ marginTop: 8 }}><summary>Calendario previsto ({cal.length} piezas)</summary>{cal.map((c, i) => <div key={i} style={{ fontSize: 13, padding: "3px 0" }}>{c.fecha} · {c.nombre} · gancho: {c.gancho} · {c.canal} · mide: {c.objetivoMedible}</div>)}</details>
        </div>)}
      </div>
      <div style={bx}><b>Estado real</b>
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>{ETAPAS.map((e) => { const real = e.n === "4" ? cx?.find((c) => c.id === "motor_video")?.estado : undefined; const [txt, color] = e.estado === "activo" ? ["Activo (autónomo)", "#2EE66B"] : e.n === "4" ? (real === "conectado" ? ["Conectado: tu Mac produce vídeos", "#2EE66B"] : real === "desconectado" ? ["Desconectado por ti", "#FFD400"] : real === undefined ? ["Comprobando…", "#FFD400"] : ["Sin respuesta ahora mismo: revisa tu Mac y el disco", "#FF4757"]) : ["Subida privada verificada a mano · la automática aún no está conectada", "#FFD400"]; return <div key={e.n}><b>{e.n}. {e.t}</b> · {e.d} — <span style={{ color, fontWeight: 700 }}>{txt}</span></div>; })}</div>
        <p style={{ fontSize: 13, margin: "10px 0 0" }}>El motor de vídeo funciona en tu Mac (solo mientras está encendido). La publicación pública automática sigue bloqueada hasta verificarla con datos reales.</p>
      </div>
      <div style={bx}><b>Guiones de las cabras</b>
        <div style={{ margin: "8px 0" }}><button type="button" disabled={busy} aria-busy={busy} onClick={() => void ahora()}>{busy ? "Trabajando…" : "Pedir un guion ahora"}</button> <Link href="/oficina">Ver la oficina →</Link></div>
        {msg && <p role="status" style={{ fontSize: 13 }}>{msg}</p>}
        {gs && gs.length === 0 && <p>Aún no hay guiones. Aparecen solos cuando la oficina está activa y hay IA configurada.</p>}
        {(gs || []).map((g) => <div key={g.id} style={{ borderTop: "1px solid rgba(0,229,255,.25)", padding: "8px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><span>{g.instruccion.replace(PREFIJO_GUION, "")}</span><span>{/superado/.test(g.resultado || "") ? "✔ Calidad superada" : "⚠ Revisar"} · {g.estado === "en_revision" ? "Pendiente de tu OK" : g.estado}</span></div>
          {(() => { const sv = estadoVideo(g); return sv ? <div style={{ marginTop: 6, fontSize: 13, color: sv.color, fontWeight: 700 }}>{sv.txt} {sv.url && <a href={sv.url} target="_blank" rel="noopener noreferrer">Ver en YouTube ↗</a>}</div> : null; })()}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <button type="button" onClick={() => setOpen(open === g.id ? null : g.id)}>{open === g.id ? "Ocultar" : "Leer guion"}</button>
            {g.estado === "en_revision" && <><button type="button" disabled={!!trab} aria-busy={trab === g.id} onClick={() => void accion(g, "aprobar")}>Aprobar</button><button type="button" disabled={!!trab} aria-busy={trab === g.id} onClick={() => void accion(g, "rechazar")}>Rechazar</button></>}
            {g.estado !== "cancelada" && <button type="button" disabled={!!trab} aria-busy={trab === g.id} onClick={() => void accion(g, "archivar")}>Archivar</button>}
          </div>
          {open === g.id && <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, marginTop: 8 }}>{g.resultado}</pre>}
        </div>)}
      </div>
      <div style={bx}><b>Conexiones (estado real)</b>
{[["Proveedor de IA (servidor)", con && con !== "err" ? (con.ia ? "Conectado" : "No configurado") : con === "err" ? "Error al comprobar" : "Comprobando…"],
          ["Base de datos", con && con !== "err" ? (con.bd ? "Conectado" : "Error") : con === "err" ? "Error al comprobar" : "Comprobando…"],
          ["Ciclo automático (GitHub Actions)", con && con !== "err" ? (con.cronReciente ? "Conectado (ciclo reciente)" : "Sin ciclos recientes") : con === "err" ? "Error al comprobar" : "Comprobando…"]].map(([n, e]) => <div key={n} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", borderTop: "1px solid rgba(0,229,255,.15)" }}><span>{n}</span><b style={{ color: /^Conectado/.test(e) ? "#2EE66B" : /^(Error|Sin ciclos)/.test(e) ? "#FF4757" : "#FFD400" }}>{e}</b></div>)}
        {(cx || []).map((c) => { const col = c.estado === "conectado" ? "#2EE66B" : c.estado === "sin_respuesta" ? "#FF4757" : "#FFD400"; const et = ({ conectado: "Conectado", desconectado: "Desconectado", sin_respuesta: "Sin respuesta", no_configurado: "No configurado", no_disponible: "No disponible aún" } as Record<string, string>)[c.estado] || c.estado;
          return <div key={c.id} style={{ padding: "6px 0", borderTop: "1px solid rgba(0,229,255,.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><span>{c.nombre}</span><span style={{ display: "flex", gap: 8, alignItems: "center" }}><b style={{ color: col }}>{et}</b>{c.controlable && <button type="button" aria-busy={cxBusy === c.id} disabled={!!cxBusy} onClick={() => void cambiarCx(c.id, c.estado === "desconectado")}>{cxBusy === c.id ? "…" : c.estado === "desconectado" ? "Conectar" : "Desconectar"}</button>}</span></div>
            <small>{c.detalle}</small></div>; })}
        {!cx && <p style={{ fontSize: 13 }}>Comprobando conexiones del Studio…</p>}
        {cxMsg && <p role="status" style={{ fontSize: 13 }}>{cxMsg}</p>}
      </div>
      <div style={bx}><b>Campañas</b>{CAMPANAS.map((c) => <p key={c.id} style={{ margin: "6px 0" }}><b>{c.id} · {c.nombre}</b> — {c.objetivo}</p>)}</div>
      <div style={bx}><b>Herramientas de código abierto</b>
        {HERRAMIENTAS.map((h) => <p key={h.id} style={{ margin: "8px 0" }}><b>{h.nombre}</b> ({h.prioridad}) — {h.rol}. <a href={h.repo} target="_blank" rel="noreferrer">{h.repo.replace("https://", "")}</a><br /><small>{h.nota}</small></p>)}
        <p style={{ fontSize: 13 }}>Gratis no significa coste cero: servidores, GPU y algunas APIs pueden costar. Empieza con n8n + MoneyPrinterTurbo + Penpot.</p>
      </div>
      <details style={bx}><summary>Brief de marca que usan las cabras</summary><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13 }}>{MARCA_BRIEF}</pre></details>
    </div>
  );
}
