"use client";
import { confirmar } from "@/lib/confirmar";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CANALES_CAMP, ESTADOS_MANUALES, puedeAprobar, type CanalCamp, type EstadoPieza } from "@/lib/oficina/campana";
import { OBJETIVOS, TONOS, revisarAfirmaciones } from "@/lib/oficina/marketing";
import { revisarReglas, type Regla } from "@/lib/oficina/perfilMarca";

const c = { card: "#FFFDF7", card2: "#FFFDF7", line: "#07182E", acc: "#1D5FD0", acc2: "#0E8FD6", txt: "#07182E", mut: "#5A6B7F", bg: "#FFFDF7", bad: "#C0392B", warn: "#B7791F", ok: "#2E8B57" };
const campo = { width: "100%", padding: "9px 11px", borderRadius: 10, border: `2px solid ${c.line}`, background: c.bg, color: c.txt, fontSize: 14 } as const;
const grad = { padding: "11px 20px", borderRadius: 12, border: 0, background: `linear-gradient(90deg,${c.acc},${c.acc2})`, color: "#fff", fontWeight: 800, cursor: "pointer" } as const;
const ghost = { background: "transparent", color: "#07182E", border: `2px solid ${c.line}`, borderRadius: 9, padding: "5px 11px", cursor: "pointer", fontSize: 12.5 } as const;
type Pz = { id: string; canal: CanalCamp; titulo: string; texto: string; cta: string; visual: string; estado: EstadoPieza; publicacion_url: string | null; version: number };
type Camp = { id: string; titulo: string; kit_id: string | null; estrategia: { idea?: string; propuesta?: string; publico?: string; mensajes?: string[]; titulares?: string[]; calendario?: { canal: string; cuando: string; nota: string }[]; verificar?: string[]; pregunta?: string }; created_at: string };
const ETQ: Record<string, string> = { borrador: "Borrador", revision: "Revisión pendiente", aprobado: "Aprobado", programado: "Programado", publicado: "Publicado" };
const falta = (m: string) => (/does not exist|relation|schema cache/i.test(m) ? "Falta ejecutar el SQL 96 (campañas) en Supabase." : m);

export default function CampanaStudio() {
  const [kits, setKits] = useState<{ id: string; nombre: string }[]>([]); const [ia, setIa] = useState<boolean | null>(null);
  const [f, setF] = useState({ kitId: "", producto: "", objetivo: "vender", tono: "cercano", idioma: "español", publico: "", oferta: "", beneficio: "", cta: "", periodo: "", restricciones: "" });
  const [canales, setCanales] = useState<CanalCamp[]>(["instagram", "facebook", "email", "whatsapp"]); const [avz, setAvz] = useState(false);
  const [gen, setGen] = useState(false); const [err, setErr] = useState(""); const [aviso, setAviso] = useState("");
  const [lista, setLista] = useState<Camp[]>([]); const [sel, setSel] = useState<Camp | null>(null); const [pzs, setPzs] = useState<Pz[]>([]); const [tab, setTab] = useState<string>("estrategia");
  const [edit, setEdit] = useState<Record<string, string>>({}); const [reglas, setReglas] = useState<Regla[]>([]); const [vers, setVers] = useState<{ version: number; texto: string; created_at: string }[]>([]); const [ocup, setOcup] = useState("");

  async function tokenAuth() { const { data } = await supabase.auth.getSession(); return data.session?.access_token || ""; }
  async function post(b: Record<string, unknown>) { const r = await fetch("/api/oficina/campana", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await tokenAuth()}` }, body: JSON.stringify(b) }); return { r, j: await r.json().catch(() => ({})) }; }
  async function cargarLista() { const { data, error } = await supabase.from("campanas").select("id,titulo,kit_id,estrategia,created_at").order("created_at", { ascending: false }).limit(30); if (error) { setErr(falta(error.message)); return; } setLista((data as Camp[]) || []); }
  useEffect(() => {
    (async () => { const { data } = await supabase.from("brand_kits").select("id,nombre").order("updated_at", { ascending: false }); setKits((data as { id: string; nombre: string }[]) || []); })();
    fetch("/api/oficina/campana").then((r) => r.json()).then((j) => setIa(!!j.ia)).catch(() => setIa(null)); cargarLista();
  }, []);

  async function abrir(cm: Camp) {
    setSel(cm); setTab("estrategia"); setErr(""); setAviso(""); setVers([]);
    const { data, error } = await supabase.from("campana_piezas").select("id,canal,titulo,texto,cta,visual,estado,publicacion_url,version").eq("campana_id", cm.id).order("created_at"); if (error) { setErr(falta(error.message)); return; }
    const ps = (data as Pz[]) || []; setPzs(ps); setEdit(Object.fromEntries(ps.map((p) => [p.id, p.texto])));
    if (cm.kit_id) { const { data: r } = await supabase.from("brand_rules").select("termino,severidad,alternativa,excepcion").eq("kit_id", cm.kit_id); setReglas((r as Regla[]) || []); } else setReglas([]);
  }
  async function crear() {
    if (gen) return; setGen(true); setErr(""); setAviso("");
    try {
      const { r, j } = await post({ accion: "crear", ...f, canales, kitId: f.kitId || undefined }); if (!r.ok || !j.ok) { setErr(j.error || "No se pudo crear la campaña."); return; }
      let av = ""; if (j.faltan?.length) av += `La IA no entregó estos canales (puedes reintentar): ${j.faltan.join(", ")}. `; if (j.pregunta) av += `La IA pregunta: ${j.pregunta}`; setAviso(av.trim());
      await cargarLista(); const { data } = await supabase.from("campanas").select("id,titulo,kit_id,estrategia,created_at").eq("id", j.id).maybeSingle(); if (data) await abrir(data as Camp);
    } catch { setErr("Sin conexión con el servidor."); } finally { setGen(false); }
  }
  async function guardarTexto(p: Pz) {
    const t = edit[p.id] ?? p.texto; if (t === p.texto) return; setOcup(p.id);
    await supabase.from("campana_pieza_versiones").insert({ pieza_id: p.id, version: p.version, texto: p.texto });
    const { error } = await supabase.from("campana_piezas").update({ texto: t, estado: "borrador", publicacion_url: null, version: p.version + 1, updated_at: new Date().toISOString() }).eq("id", p.id);
    setOcup(""); if (error) { setErr(falta(error.message)); return; } if (sel) abrir(sel);
  }
  async function estado(p: Pz, e: string) {
    let urlPub = ""; if (e === "publicado") { urlPub = window.prompt("Enlace https de la publicación real:") || ""; if (!urlPub) return; }
    if (edit[p.id] !== p.texto) { setErr("Guarda primero los cambios del texto."); return; }
    setOcup(p.id); const { r, j } = await post({ accion: "estado", piezaId: p.id, estado: e, publicacionUrl: urlPub }); setOcup("");
    if (!r.ok || !j.ok) { setErr(j.error || "No se pudo cambiar el estado."); return; } setErr(""); if (sel) abrir(sel);
  }
  async function regenerar(p: Pz) { setOcup(p.id); setErr(""); const { r, j } = await post({ accion: "regenerar", piezaId: p.id }); setOcup(""); if (!r.ok || !j.ok) { setErr(j.error || "No se pudo regenerar."); return; } if (sel) abrir(sel); }
  async function verVersiones(p: Pz) { const { data } = await supabase.from("campana_pieza_versiones").select("version,texto,created_at").eq("pieza_id", p.id).order("version", { ascending: false }).limit(10); setVers((data as typeof vers) || []); }
  async function borrar(id: string) { if (!await confirmar("¿Borrar esta campaña y todas sus piezas?")) return; await supabase.from("campanas").delete().eq("id", id); setSel(null); cargarLista(); }
  function exportar() {
    if (!sel) return; const e = sel.estrategia; const l: string[] = [`# ${sel.titulo}`, ""];
    if (e.idea) l.push(`**Idea:** ${e.idea}`); if (e.propuesta) l.push(`**Propuesta de valor:** ${e.propuesta}`); if (e.publico) l.push(`**Público:** ${e.publico}`); l.push("");
    for (const p of pzs) { l.push(`## ${CANALES_CAMP[p.canal]?.n || p.canal} · ${ETQ[p.estado]}`); if (p.titulo) l.push(`**${p.titulo}**`); l.push("", edit[p.id] ?? p.texto, ""); if (p.cta) l.push(`CTA: ${p.cta}`); if (p.visual) l.push(`Visual: ${p.visual}`); l.push(""); }
    if (e.calendario?.length) { l.push("## Calendario"); for (const k of e.calendario) l.push(`- ${k.cuando} · ${k.canal}: ${k.nota}`); }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([l.join("\n")], { type: "text/markdown" })); a.download = `${sel.titulo.replace(/[^\w-]+/g, "_").slice(0, 40) || "campana"}.md`; a.click(); URL.revokeObjectURL(a.href);
  }
  const pz = pzs.find((p) => p.id === tab);
  const alternar = (k: CanalCamp) => setCanales((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const lbl = { fontSize: 12, color: c.mut, display: "block" } as const;

  return (
    <div style={{ display: "grid", gap: 14, color: c.txt }}>
      <section style={{ background: `linear-gradient(160deg,${c.card},${c.bg})`, border: `2px solid ${c.line}`, borderRadius: 16, padding: 16, display: "grid", gap: 12 }}>
        <div><b style={{ fontSize: 18 }}>Crear campaña multicanal</b><div style={{ fontSize: 12.5, color: c.mut }}>Una estrategia, una pieza distinta por canal. Solo usa lo que escribas aquí y la memoria de tu marca.</div></div>
        {ia === false && <div role="alert" style={{ color: c.warn, fontSize: 13 }}>No hay IA configurada en el servidor: no se generará nada simulado.</div>}
        <label style={lbl}>¿Qué quieres promocionar?<textarea rows={3} value={f.producto} onChange={(e) => setF({ ...f, producto: e.target.value })} maxLength={1500} placeholder="Ej.: lanzar mi nuevo producto a clientes que aún no me conocen…" style={{ ...campo, resize: "vertical" }} /></label>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
          <label style={lbl}>Empresa / Marca<select value={f.kitId} onChange={(e) => setF({ ...f, kitId: e.target.value })} style={campo}><option value="">Sin marca</option>{kits.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}</select></label>
          <label style={lbl}>Objetivo<select value={f.objetivo} onChange={(e) => setF({ ...f, objetivo: e.target.value })} style={campo}>{Object.entries(OBJETIVOS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <label style={lbl}>Tono<select value={f.tono} onChange={(e) => setF({ ...f, tono: e.target.value })} style={campo}>{Object.entries(TONOS).map(([k, n]) => <option key={k} value={k}>{n.split(":")[0]}</option>)}</select></label>
        </div>
        <div><span style={lbl}>Canales ({canales.length})</span><div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>{(Object.keys(CANALES_CAMP) as CanalCamp[]).map((k) => <button key={k} type="button" onClick={() => alternar(k)} aria-pressed={canales.includes(k)} style={{ ...ghost, background: canales.includes(k) ? c.acc : "transparent", color: canales.includes(k) ? "#fff" : "#FFD600" }}>{CANALES_CAMP[k].n}</button>)}</div></div>
        <button type="button" style={{ ...ghost, justifySelf: "start" }} onClick={() => setAvz(!avz)}>{avz ? "Ocultar modo avanzado" : "Modo avanzado"}</button>
        {avz && <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          {([["publico", "Público"], ["oferta", "Oferta"], ["beneficio", "Beneficio principal"], ["cta", "Llamada a la acción"], ["periodo", "Fecha o periodo"], ["idioma", "Idioma"], ["restricciones", "Restricciones de marca"]] as const).map(([k, n]) => <label key={k} style={lbl}>{n}<input value={f[k]} maxLength={300} onChange={(e) => setF({ ...f, [k]: e.target.value })} style={campo} /></label>)}
        </div>}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><button type="button" style={{ ...grad, opacity: gen || ia === false ? 0.6 : 1 }} disabled={gen || ia === false} onClick={crear}>{gen ? "Generando campaña… (hasta 1 min)" : "Generar campaña"}</button></div>
        {err && <div role="alert" style={{ color: c.bad, fontSize: 13 }}>{err}</div>}{aviso && <div style={{ color: c.warn, fontSize: 13 }}>{aviso}</div>}
      </section>

      <section style={{ background: c.card, border: `2px solid ${c.line}`, borderRadius: 16, padding: 14 }}>
        <b>Campañas guardadas</b>
        {!lista.length && !err && <div style={{ color: c.mut, fontSize: 13, marginTop: 6 }}>Aún no has creado ninguna campaña.</div>}
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", marginTop: 8 }}>{lista.map((cm) => <button key={cm.id} type="button" onClick={() => abrir(cm)} style={{ textAlign: "left", background: sel?.id === cm.id ? c.card2 : c.bg, border: `1px solid ${sel?.id === cm.id ? c.acc : c.line}`, borderRadius: 12, padding: 10, color: c.txt, cursor: "pointer" }}><b style={{ fontSize: 13.5 }}>{cm.titulo}</b><div style={{ fontSize: 11.5, color: c.mut }}>{new Date(cm.created_at).toLocaleString("es-ES")}</div></button>)}</div>
      </section>

      {sel && <section style={{ background: c.card, border: `2px solid ${c.line}`, borderRadius: 16, padding: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><b style={{ fontSize: 16, flex: "1 1 200px" }}>{sel.titulo}</b><button type="button" style={ghost} onClick={exportar}>Exportar (.md)</button><button type="button" style={{ ...ghost, color: c.bad }} onClick={() => borrar(sel.id)}>Borrar</button></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{[{ id: "estrategia", n: "Vista general" }, ...pzs.map((p) => ({ id: p.id, n: CANALES_CAMP[p.canal]?.n || p.canal })), { id: "calendario", n: "Calendario" }].map((t) => <button key={t.id} type="button" onClick={() => { setTab(t.id); setVers([]); }} style={{ ...ghost, background: tab === t.id ? c.acc : "transparent", color: tab === t.id ? "#fff" : "#FFD600" }}>{t.n}</button>)}</div>
        {tab === "estrategia" && <div style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
          {sel.estrategia.idea && <div><b>Idea:</b> {sel.estrategia.idea}</div>}{sel.estrategia.propuesta && <div><b>Propuesta de valor:</b> {sel.estrategia.propuesta}</div>}{sel.estrategia.publico && <div><b>Público:</b> {sel.estrategia.publico}</div>}
          {!!sel.estrategia.mensajes?.length && <div><b>Mensajes clave:</b> {sel.estrategia.mensajes.join(" · ")}</div>}{!!sel.estrategia.titulares?.length && <div><b>Variantes de titular:</b><ul style={{ margin: "4px 0 0 18px" }}>{sel.estrategia.titulares.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
          {!!sel.estrategia.verificar?.length && <div style={{ color: c.warn }}><b>Confirma antes de publicar:</b> {sel.estrategia.verificar.join(" · ")}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>{pzs.map((p) => <span key={p.id} style={{ fontSize: 12, border: `2px solid ${c.line}`, borderRadius: 999, padding: "3px 10px", color: p.estado === "aprobado" ? c.ok : c.mut }}>{CANALES_CAMP[p.canal]?.n}: {ETQ[p.estado]}</span>)}</div>
        </div>}
        {tab === "calendario" && <div style={{ fontSize: 13.5 }}>{sel.estrategia.calendario?.length ? <ul style={{ margin: "0 0 0 18px" }}>{sel.estrategia.calendario.map((k, i) => <li key={i}><b>{k.cuando}</b> · {CANALES_CAMP[k.canal as CanalCamp]?.n || k.canal}: {k.nota}</li>)}</ul> : "La IA no propuso calendario. Los días son relativos: no se inventan fechas."}</div>}
        {pz && (() => { const t = edit[pz.id] ?? pz.texto; const ap = puedeAprobar(t, pz.canal, reglas); const rr = revisarReglas(t, reglas); const al = revisarAfirmaciones(t); const max = CANALES_CAMP[pz.canal].max; return (
          <div style={{ display: "grid", gap: 8 }}>
            {pz.titulo && <b>{pz.titulo}</b>}
            <textarea rows={10} value={t} onChange={(e) => setEdit((o) => ({ ...o, [pz.id]: e.target.value }))} style={{ ...campo, resize: "vertical", lineHeight: 1.45 }} aria-label={`Texto ${pz.canal}`} />
            <div style={{ fontSize: 12, color: max && t.length > max ? c.bad : c.mut }}>{t.length} caracteres{max ? ` de ${max}` : ""} · versión {pz.version} · estado: <b>{ETQ[pz.estado]}</b>{pz.publicacion_url ? ` · ${pz.publicacion_url}` : ""}</div>
            {pz.cta && <div style={{ fontSize: 13 }}><b>CTA:</b> {pz.cta}</div>}{pz.visual && <div style={{ fontSize: 13, color: c.mut }}><b>Creatividad visual:</b> {pz.visual}</div>}
            {rr.hallazgos.length > 0 && <div style={{ border: `1px solid ${rr.aprobado ? c.warn : c.bad}`, borderRadius: 9, padding: 8, fontSize: 12.5, color: rr.aprobado ? c.warn : c.bad }}><b>Reglas de marca</b>{rr.hallazgos.map((h, k) => <div key={k}>• {h.severidad === "estricta" ? "Prohibido" : "Estilo"}: “{h.termino}”{h.alternativa ? ` → ${h.alternativa}` : ""}</div>)}</div>}
            {al.length > 0 && <div style={{ border: `1px solid ${c.warn}`, borderRadius: 9, padding: 8, fontSize: 12.5, color: c.warn }}><b>Verifica antes de publicar</b>{al.map((a, k) => <div key={k}>• “{a.fragmento}” — {a.motivo}</div>)}</div>}
            {!ap.ok && <div style={{ fontSize: 12.5, color: c.bad }}>No se puede aprobar: {ap.motivos.join(" ")}</div>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" style={ghost} disabled={ocup === pz.id || t === pz.texto} onClick={() => guardarTexto(pz)}>Guardar borrador</button>
              <button type="button" style={ghost} disabled={ocup === pz.id} onClick={() => regenerar(pz)}>{ocup === pz.id ? "Trabajando…" : "Regenerar esta pieza"}</button>
              <button type="button" style={ghost} onClick={() => navigator.clipboard?.writeText(t)}>Copiar</button>
              <button type="button" style={ghost} onClick={() => verVersiones(pz)}>Historial</button>
              <select aria-label="Estado" value={pz.estado} onChange={(e) => estado(pz, e.target.value)} style={{ ...campo, width: "auto", padding: "5px 8px", fontSize: 12.5 }}>{ESTADOS_MANUALES.map((x) => <option key={x} value={x}>{ETQ[x]}</option>)}<option value="publicado">{pz.estado === "publicado" ? "Publicado" : "Marcar publicado (con enlace)…"}</option></select>
            </div>
            {!!vers.length && <div style={{ fontSize: 12.5, display: "grid", gap: 4 }}>{vers.map((v) => <div key={v.version} style={{ border: `2px solid ${c.line}`, borderRadius: 8, padding: 6 }}><b>Versión {v.version}</b> · {new Date(v.created_at).toLocaleString("es-ES")}<div style={{ color: c.mut, whiteSpace: "pre-wrap" }}>{v.texto.slice(0, 400)}</div><button type="button" style={ghost} onClick={() => setEdit((o) => ({ ...o, [pz.id]: v.texto }))}>Cargar en el editor</button></div>)}</div>}
          </div>); })()}
      </section>}
    </div>
  );
}
