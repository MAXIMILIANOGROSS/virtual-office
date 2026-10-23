"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AGENTES_RED, fuentesPermitidas } from "@/lib/intel/permisosRed";
import { ETIQUETA, type EstadoConector, type Elemento, type Plataforma } from "@/lib/intel/tipos";
import { AGENTES, AGENTES_YT } from "@/lib/oficina/agentes";

const c = { card: "#FFFDF7", line: "#07182E", gold: "#FFD600", txt: "#07182E", mut: "#5A6B7F", bad: "#C0392B", warn: "#B7791F", ok: "#2E8B57" };
const COL: Record<EstadoConector, string> = { operativa: c.ok, limitada: c.warn, no_configurada: c.mut, fallida: c.bad };
type Diag = { plataforma: Plataforma; herramienta: string; estado: EstadoConector; acceso: string; requisitos: string[]; comprobado: string; ms: number | null; mensaje: string | null; prueba: string };
type Job = { id: string; proyecto: string; agente: string; pregunta: string; estado: string; motivo: string | null; guardado: boolean; ms: number | null; created_at: string; finished_at: string | null; informe?: string | null; elementos?: Elemento[] | null; omitidas?: { plataforma: string; motivo: string }[] | null };
const ESTADO_JOB: Record<string, { t: string; col: string }> = { en_cola: { t: "En cola", col: c.mut }, en_curso: { t: "En curso", col: c.warn }, completada: { t: "Completada", col: c.ok }, parcial: { t: "Parcial", col: c.warn }, fallida: { t: "Fallida", col: c.bad }, cancelada: { t: "Cancelada", col: c.mut }, bloqueada: { t: "Bloqueada", col: c.bad } };
const hora = (x: string | null | undefined) => (x ? new Date(x).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—");
const nombreAgente = (id: string) => [...AGENTES, ...AGENTES_YT].find((a) => a.id === id)?.nombre ?? id;
const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 10, border: `2px solid ${c.line}`, background: c.gold, color: c.txt, fontWeight: 800, cursor: "pointer" };
const btn2: React.CSSProperties = { ...btn, background: "#fff", fontWeight: 600 };
const inp: React.CSSProperties = { width: "100%", padding: 8, borderRadius: 8, border: `1px solid ${c.line}`, boxSizing: "border-box", font: "inherit" };

/** Intelligence Network: diagnóstico real de conectores, nuevas investigaciones y resultados. Todo viene del servidor; no hay estados inventados. */
export default function IntelligenceTab() {
  const [diag, setDiag] = useState<Diag[] | null>(null); const [comprobado, setComprobado] = useState<string | null>(null); const [tabla, setTabla] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]); const [aviso, setAviso] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Job | null>(null);
  const [f, setF] = useState({ pregunta: "", objetivo: "", proyecto: "mi-proyecto", agente: "ciro", profundidad: "normal", urls: "", fuentes: [] as string[] });
  const tok = async () => (await supabase.auth.getSession()).data.session?.access_token || "";
  const api = useCallback(async (ruta: string, init?: RequestInit) => { const r = await fetch(ruta, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${await tok()}` } }); return r.json().catch(() => null); }, []);
  const cargarJobs = useCallback(async () => { const j = await api("/api/intel/investigar"); if (j?.ok) { setJobs(j.jobs); setTabla(j.tabla !== false); if (j.aviso) setAviso(j.aviso); } else if (j?.error) setErr(j.error); }, [api]);
  const cargarDiag = useCallback(async () => { const j = await api("/api/intel/diagnostico"); if (j?.ok) { setDiag(j.diagnostico); setComprobado(j.comprobado); } }, [api]);
  useEffect(() => { cargarJobs(); cargarDiag(); }, [cargarJobs, cargarDiag]);
  const activas = jobs.some((j) => j.estado === "en_cola" || j.estado === "en_curso");
  useEffect(() => { if (!activas) return; const t = setInterval(async () => { await cargarJobs(); if (sel && (sel.estado === "en_cola" || sel.estado === "en_curso")) abrir(sel.id, true); }, 3500); return () => clearInterval(t); }); // eslint-disable-line react-hooks/exhaustive-deps
  async function abrir(id: string, silencioso = false) { const j = await api("/api/intel/investigar?id=" + id); if (j?.ok) setSel(j.job); else if (!silencioso) setErr(j?.error || "No se pudo abrir."); }
  async function comprobar(probarBusqueda = false) { setBusy(true); setErr(""); const j = await api("/api/intel/diagnostico", { method: "POST", body: JSON.stringify({ probarBusqueda }) }); setBusy(false); if (j?.ok) { setDiag(j.diagnostico); setComprobado(j.comprobado); if (j.guardado === false) setAviso("Diagnóstico hecho, pero no se pudo guardar: ¿has ejecutado el SQL 103?"); } else setErr(j?.error || "No se pudo diagnosticar."); }
  async function lanzar() {
    setBusy(true); setErr(""); setAviso("");
    const j = await api("/api/intel/investigar", { method: "POST", body: JSON.stringify({ pregunta: f.pregunta, objetivo: f.objetivo, proyecto: f.proyecto, agente: f.agente, profundidad: f.profundidad, fuentes: f.fuentes, urls: f.urls.split(/\s+/).filter(Boolean), clave: crypto.randomUUID() }) });
    setBusy(false); if (!j?.ok) { setErr(j?.error || "No se pudo iniciar."); return; }
    setAviso(j.repetida ? "Esa investigación ya existía; no se ha duplicado." : "Investigación iniciada. Sigue en el servidor aunque cierres esta pestaña."); await cargarJobs(); abrir(j.id, true);
  }
  async function accion(id: string, a: "cancelar" | "guardar" | "quitar") { const j = await api("/api/intel/accion", { method: "POST", body: JSON.stringify({ id, accion: a }) }); if (!j?.ok) setErr(j?.error || "Error"); else setAviso(a === "cancelar" ? "Cancelada." : a === "guardar" ? "Guardada en la biblioteca del proyecto." : "Quitada de la biblioteca."); await cargarJobs(); abrir(id, true); }
  function exportar(j: Job) { const blob = new Blob([j.informe || ""], { type: "text/markdown;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `investigacion-${j.id.slice(0, 8)}.md`; a.click(); URL.revokeObjectURL(a.href); }
  const permitidas = fuentesPermitidas(f.agente); const operativas = new Set((diag ?? []).filter((d) => d.estado === "operativa" || d.estado === "limitada").map((d) => d.plataforma));
  const card: React.CSSProperties = { background: c.card, border: `2px solid ${c.line}`, borderRadius: 16, padding: 14, color: c.txt };

  return (
    <section style={{ display: "grid", gap: 12, marginTop: 14 }}>
      {(err || aviso) && <div role="status" style={{ ...card, borderColor: err ? c.bad : c.ok }}>{err || aviso}</div>}
      {!tabla && <div style={{ ...card, borderColor: c.warn }}>Falta ejecutar el SQL 103 (<code>TODO_CORRER_103_INTELLIGENCE.sql</code>) en Supabase para guardar investigaciones.</div>}

      <div style={card}>
        <h2 style={{ margin: 0 }}>🔎 Intelligence Network</h2>
        <p style={{ color: c.mut, margin: "6px 0 10px" }}>Investigación con fuentes reales. Un conector solo aparece como operativo si una consulta de solo lectura ha devuelto contenido de la fuente. Lo que lees en cada informe sale de esas fuentes, con su enlace original.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <button type="button" style={btn} disabled={busy} aria-busy={busy} onClick={() => comprobar(false)}>{busy ? "Comprobando…" : "Comprobar conectores ahora"}</button>
          <button type="button" style={btn2} disabled={busy} aria-busy={busy} onClick={() => comprobar(true)} title="Hace una consulta real al buscador y gasta cuota">Probar buscador (gasta cuota)</button>
        </div>
        {!diag ? <p style={{ color: c.mut }}>Aún no hay diagnóstico guardado. Pulsa «Comprobar conectores ahora».</p> : <>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
            {diag.map((d) => <div key={d.plataforma} style={{ border: `1px solid ${c.line}`, borderRadius: 12, padding: 10, background: "#fff" }}>
              <b>{d.plataforma}</b> <span style={{ color: COL[d.estado], fontWeight: 800 }}>● {ETIQUETA[d.estado]}</span>
              <div style={{ fontSize: 13, color: c.mut }}>{d.herramienta}{d.ms != null ? ` · ${d.ms} ms` : ""}</div>
              {d.mensaje && <div style={{ fontSize: 13 }}>{d.mensaje}</div>}
              {d.requisitos.length > 0 && <div style={{ fontSize: 12, color: c.mut }}>Pendiente: {d.requisitos.join(" · ")}</div>}
              <div style={{ fontSize: 12, color: c.mut }}>Prueba: {d.prueba}</div>
            </div>)}
          </div>
          <p style={{ fontSize: 12, color: c.mut, marginBottom: 0 }}>Última comprobación: {hora(comprobado)}. Los conectores web, GitHub y RSS usan los mismos backends que Agent-Reach v1.5.0 (Jina Reader, API de GitHub, feeds). El trabajador Python de Agent-Reach (YouTube con yt-dlp, redes sociales) aún no está instalado.</p>
        </>}
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Nueva investigación</h3>
        <div style={{ display: "grid", gap: 8 }}>
          <label>Pregunta<textarea style={{ ...inp, minHeight: 70 }} value={f.pregunta} maxLength={1000} onChange={(e) => setF({ ...f, pregunta: e.target.value })} placeholder="Investiga alternativas gratuitas a la herramienta que uso hoy para mi proyecto" /></label>
          <label>Objetivo (opcional)<input style={inp} value={f.objetivo} maxLength={500} onChange={(e) => setF({ ...f, objetivo: e.target.value })} /></label>
          <label>URLs concretas a leer (opcional, una por línea; repos de GitHub, páginas, feeds)<textarea style={{ ...inp, minHeight: 60 }} value={f.urls} onChange={(e) => setF({ ...f, urls: e.target.value })} placeholder="https://github.com/usuario/repo" /></label>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
            <label>Agente<select style={inp} value={f.agente} onChange={(e) => setF({ ...f, agente: e.target.value, fuentes: [] })}>{AGENTES_RED.map((id) => <option key={id} value={id}>{nombreAgente(id)}</option>)}</select></label>
            <label>Proyecto<input style={inp} value={f.proyecto} maxLength={80} onChange={(e) => setF({ ...f, proyecto: e.target.value })} /></label>
            <label>Profundidad<select style={inp} value={f.profundidad} onChange={(e) => setF({ ...f, profundidad: e.target.value })}><option value="rapida">Rápida (3 consultas)</option><option value="normal">Normal (6)</option><option value="profunda">Profunda (10)</option></select></label>
          </div>
          <div>Fuentes preferidas (solo las permitidas al agente y operativas ahora; si no marcas ninguna, se eligen solas):{" "}
            {permitidas.map((p) => { const ok = operativas.has(p); return <label key={p} style={{ marginRight: 10, opacity: ok ? 1 : 0.5 }}><input type="checkbox" disabled={!ok} checked={f.fuentes.includes(p)} onChange={(e) => setF({ ...f, fuentes: e.target.checked ? [...f.fuentes, p] : f.fuentes.filter((x) => x !== p) })} /> {p}{ok ? "" : " (no disponible)"}</label>; })}
          </div>
          <div><button type="button" style={btn} disabled={busy || f.pregunta.trim().length < 3} onClick={lanzar}>Iniciar investigación</button></div>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Investigaciones</h3>
        {jobs.length === 0 ? <p style={{ color: c.mut }}>Todavía no hay investigaciones.</p> : <div style={{ display: "grid", gap: 6 }}>
          {jobs.map((j) => <button key={j.id} type="button" onClick={() => abrir(j.id)} style={{ textAlign: "left", background: sel?.id === j.id ? "#FFF3B0" : "#fff", border: `1px solid ${c.line}`, borderRadius: 10, padding: 8, cursor: "pointer", color: c.txt }}>
            <b style={{ color: ESTADO_JOB[j.estado]?.col }}>● {ESTADO_JOB[j.estado]?.t ?? j.estado}</b> · {j.pregunta.slice(0, 110)} <span style={{ color: c.mut, fontSize: 12 }}>· {nombreAgente(j.agente)} · {j.proyecto} · {hora(j.created_at)}{j.guardado ? " · 📚 guardada" : ""}</span>
          </button>)}
        </div>}
      </div>

      {sel && <div style={card}>
        <h3 style={{ marginTop: 0 }}>Resultado · <span style={{ color: ESTADO_JOB[sel.estado]?.col }}>{ESTADO_JOB[sel.estado]?.t ?? sel.estado}</span></h3>
        <p style={{ margin: "0 0 8px" }}>{sel.pregunta}</p>
        {sel.motivo && <p style={{ color: c.bad }}>{sel.motivo}</p>}
        {(sel.estado === "en_cola" || sel.estado === "en_curso") && <button type="button" style={btn2} onClick={() => accion(sel.id, "cancelar")}>Cancelar investigación</button>}
        {sel.informe && <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
            <button type="button" style={btn} onClick={() => accion(sel.id, sel.guardado ? "quitar" : "guardar")}>{sel.guardado ? "Quitar de la biblioteca" : "Guardar en la biblioteca"}</button>
            <button type="button" style={btn2} onClick={() => exportar(sel)}>Exportar informe (.md)</button>
            <button type="button" style={btn2} onClick={() => { setF({ ...f, pregunta: "Amplía la investigación anterior con fuentes adicionales: " + sel.pregunta.slice(0, 600), urls: "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Pedir investigación complementaria</button>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", background: "#fff", border: `1px solid ${c.line}`, borderRadius: 10, padding: 10, fontFamily: "inherit", fontSize: 14, maxHeight: 520, overflow: "auto" }}>{sel.informe}</pre>
          <h4>Fuentes originales y extractos</h4>
          {(sel.elementos ?? []).map((e, i) => <details key={i} style={{ borderTop: "1px solid #ddd", padding: "6px 0" }}>
            <summary><b>[{i + 1}]</b> {e.titulo} <span style={{ color: c.mut, fontSize: 12 }}>· {e.plataforma} · {e.seccion}{e.verificacion === "sin_verificar" ? " · sin verificar" : ""}</span></summary>
            <p style={{ margin: "6px 0" }}><a href={e.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: "#0B5CAD", wordBreak: "break-all" }}>{e.url}</a></p>
            {e.hechos.map((h, k) => <div key={k} style={{ fontSize: 13 }}>• {h}</div>)}
            {e.extracto && <div style={{ fontSize: 13, color: c.mut, whiteSpace: "pre-wrap" }}>{e.extracto.slice(0, 700)}{e.extracto.length > 700 ? "…" : ""}</div>}
            {e.limitaciones.map((l, k) => <div key={k} style={{ fontSize: 12, color: c.warn }}>⚠ {l}</div>)}
          </details>)}
        </>}
        {sel.omitidas && sel.omitidas.length > 0 && <div style={{ fontSize: 13, color: c.warn }}>Fuentes no usadas: {sel.omitidas.map((o) => `${o.plataforma} (${o.motivo})`).join("; ")}</div>}
      </div>}
    </section>
  );
}
