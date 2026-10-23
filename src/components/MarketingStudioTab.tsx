"use client";
import { useEffect, useState } from "react";
import ImagenDeTexto from "@/components/ImagenDeTexto";
import { supabase } from "@/lib/supabaseClient";
import { revisarReglas, type Regla } from "@/lib/oficina/perfilMarca";
import { AJUSTES, CANALES, MODOS, OBJETIVOS, TONOS, estadoLongitud, revisarAfirmaciones, type Ajuste, type Alerta, type Canal, type Modo, type Objetivo, type Salida, type Tono } from "@/lib/oficina/marketing";

const col = { card: "#FFFDF7", line: "#07182E", gold: "#FFD600", mut: "#5A6B7F", txt: "#07182E", bg: "#07182E", bad: "#C0392B", warn: "#B7791F", ok: "#2E8B57" };
const campo = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `2px solid ${col.line}`, background: "#FFF3C4", color: col.txt, fontSize: 14 } as const;
const btn = { padding: "9px 16px", borderRadius: 10, border: 0, background: col.gold, color: col.bg, fontWeight: 800, cursor: "pointer" } as const;
const ghost = { background: "transparent", color: "#07182E", border: `2px solid ${col.line}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 12.5 } as const;
type Pieza = { id: string; modo: string; canal: string; entrada: string; salida: Salida & { alertas?: Alerta[][] }; created_at: string };
const AJ: [Ajuste, string][] = [["mas_corto", "Acortar"], ["mas_largo", "Alargar"], ["mas_humano", "Más humano"], ["mas_convincente", "Más convincente"], ["menos_comercial", "Menos comercial"]];

/** Estudio de marketing: mejora o crea textos con IA real (si está configurada), con comprobación local de afirmaciones. No inventa datos de empresa. */
export default function MarketingStudioTab() {
  const [modo, setModo] = useState<Modo>("crear"); const [canal, setCanal] = useState<Canal>("instagram"); const [tono, setTono] = useState<Tono>("cercano"); const [objetivo, setObjetivo] = useState<Objetivo>("vender");
  const [texto, setTexto] = useState(""); const [contexto, setContexto] = useState(""); const [uno, setUno] = useState(false); const [kitId, setKitId] = useState(""); const [kits, setKits] = useState<{ id: string; nombre: string }[]>([]);
  const [ia, setIa] = useState<boolean | null>(null); const [cargando, setCargando] = useState(false); const [err, setErr] = useState("");
  const [res, setRes] = useState<Salida | null>(null); const [vers, setVers] = useState<string[]>([]); const [guardado, setGuardado] = useState(false); const [copiado, setCopiado] = useState(-1);
  const [reglas, setReglas] = useState<Regla[]>([]); const [hist, setHist] = useState<Pieza[]>([]); const [histErr, setHistErr] = useState("");

  async function cargarHist() {
    const { data, error } = await supabase.from("marketing_piezas").select("id,modo,canal,entrada,salida,created_at").order("created_at", { ascending: false }).limit(15);
    if (error) { setHistErr(/does not exist|relation/i.test(error.message) ? "Falta ejecutar el SQL 94 (historial de marketing) en Supabase." : "No se pudo cargar el historial."); return; }
    setHistErr(""); setHist((data as Pieza[]) || []);
  }
  useEffect(() => {
    cargarHist();
    (async () => { try { const r = await fetch("/api/oficina/marketing"); const j = await r.json(); setIa(!!j.ia); } catch { setIa(null); } })();
    (async () => { const { data } = await supabase.from("brand_kits").select("id,nombre").order("updated_at", { ascending: false }); setKits((data as { id: string; nombre: string }[]) || []); })();
  }, []);

  useEffect(() => { if (!kitId) { setReglas([]); return; } (async () => { const { data } = await supabase.from("brand_rules").select("termino,severidad,alternativa,excepcion").eq("kit_id", kitId); setReglas((data as Regla[]) || []); })(); }, [kitId]);
  async function pedir(over: { texto?: string; ajuste?: Ajuste; modo?: Modo }) {
    if (cargando) return; setCargando(true); setErr("");
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch("/api/oficina/marketing", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.session?.access_token || ""}` }, body: JSON.stringify({ modo: over.modo || modo, canal, tono, objetivo, texto: over.texto ?? texto, contexto, versiones: uno || over.ajuste ? 1 : 3, ajuste: over.ajuste || "", kitId: kitId || undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErr(j.error || "No se pudo generar."); return; }
      setRes(j.salida); setVers((j.salida as Salida).versiones.map((v) => v.texto)); setGuardado(!!j.guardado); cargarHist();
    } catch { setErr("Sin conexión con el servidor."); } finally { setCargando(false); }
  }
  async function copiar(i: number) { try { await navigator.clipboard.writeText(vers[i]); setCopiado(i); setTimeout(() => setCopiado(-1), 1500); } catch { setCopiado(-2); } }
  function abrir(p: Pieza) { setRes(p.salida); setVers(p.salida.versiones.map((v) => v.texto)); setGuardado(true); setTexto(p.entrada); setErr(""); }
  async function borrar(id: string) { await supabase.from("marketing_piezas").delete().eq("id", id); cargarHist(); }
  const necesitaTexto = modo === "mejorar" || modo === "revision" || modo === "traduccion";
  const sel = <T extends string>(et: string, v: T, set: (x: T) => void, dic: Record<string, string>) => <label style={{ fontSize: 12, color: col.mut, display: "block" }}>{et}<select value={v} onChange={(e) => set(e.target.value as T)} style={campo}>{Object.entries(dic).map(([k, n]) => <option key={k} value={k}>{n.split(":")[0]}</option>)}</select></label>;

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <b style={{ fontSize: 15 }}>Estudio de marketing</b>
      <p style={{ fontSize: 13, color: col.mut, margin: 0 }}>Mejora un texto o crea publicidad desde una idea, con el tono y el canal que elijas. La IA solo usa los datos que escribas o los del kit de marca: lo que falte se marca como <b>[DATO PENDIENTE]</b>. Todo queda como borrador: tú revisas y publicas.</p>
      {ia === false && <div role="status" style={{ border: `1px solid ${col.warn}`, borderRadius: 10, padding: 10, fontSize: 12.5, color: col.warn }}>La IA de texto no está configurada en el servidor (LLM_BASE_URL, LLM_API_KEY y LLM_MODEL). Sin ella no se genera nada: no se simula.</div>}
      <div style={{ background: col.card, border: `2px solid ${col.line}`, borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
          {sel("Qué quieres hacer", modo, setModo, MODOS)}{sel("Canal", canal, setCanal, CANALES)}{sel("Tono", tono, setTono, TONOS)}{sel("Objetivo", objetivo, setObjetivo, OBJETIVOS)}
          <label style={{ fontSize: 12, color: col.mut, display: "block" }}>Marca (kit)<select value={kitId} onChange={(e) => setKitId(e.target.value)} style={campo}><option value="">Sin marca</option>{kits.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}</select></label>
        </div>
        <label style={{ fontSize: 12, color: col.mut, display: "block" }}>{necesitaTexto ? "Pega tu texto" : "Cuéntame la idea (aunque esté desordenada)"}<textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={3000} rows={5} placeholder={necesitaTexto ? "Pega aquí el texto…" : "Ej.: oferta de lanzamiento: 20 % de descuento en el plan anual, hasta fin de mes"} style={{ ...campo, resize: "vertical" }} /></label>
        <label style={{ fontSize: 12, color: col.mut, display: "block" }}>Contexto opcional (público, diferencia, condiciones…)<input value={contexto} onChange={(e) => setContexto(e.target.value)} maxLength={1200} style={campo} /></label>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" disabled={cargando || ia === false || texto.trim().length < 8} onClick={() => pedir({})} style={{ ...btn, opacity: cargando || ia === false || texto.trim().length < 8 ? 0.55 : 1 }}>{cargando ? "Generando…" : necesitaTexto ? "Mejorar" : "Generar"}</button>
          <label style={{ fontSize: 12.5, color: col.mut }}><input type="checkbox" checked={uno} onChange={(e) => setUno(e.target.checked)} /> Solo una versión</label>
        </div>
      </div>
      {err && <div role="alert" style={{ color: col.bad, fontSize: 13 }}>{err}</div>}
      {res && <div style={{ display: "grid", gap: 10 }}>
        {res.diagnostico && <div style={{ fontSize: 12.5, color: col.mut }}><b style={{ color: col.txt }}>Lo que entendí:</b> {res.diagnostico}</div>}
        {res.supuestos.length > 0 && <div style={{ fontSize: 12.5, color: col.mut }}><b style={{ color: col.txt }}>Supuestos (edítalos si no son correctos):</b> {res.supuestos.join(" · ")}</div>}
        {res.pregunta && <div role="status" style={{ fontSize: 13, color: col.warn }}>Para afinar: {res.pregunta}</div>}
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", alignItems: "start" }}>
          {res.versiones.map((v, i) => { const al = revisarAfirmaciones(vers[i] ?? v.texto); const rr = revisarReglas(vers[i] ?? v.texto, reglas); const L = estadoLongitud(vers[i] ?? v.texto, canal); return (
            <div key={i} style={{ background: col.card, border: `2px solid ${col.line}`, borderRadius: 12, padding: 10, display: "grid", gap: 6 }}>
              <b style={{ fontSize: 13, color: "#07182E" }}>{v.etiqueta}</b>
              <textarea value={vers[i] ?? ""} onChange={(e) => setVers((o) => o.map((x, j) => (j === i ? e.target.value : x)))} rows={9} style={{ ...campo, resize: "vertical", fontSize: 13.5, lineHeight: 1.4 }} aria-label={`Texto ${v.etiqueta}`} />
              <div style={{ fontSize: 11.5, color: L.excede ? col.bad : col.mut }}>{L.n} caracteres{L.max ? ` de ${L.max} (${L.nota})` : ""}{L.excede ? " · te pasas del límite" : ""}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" style={ghost} onClick={() => copiar(i)}>{copiado === i ? "Copiado ✓" : copiado === -2 ? "No se pudo" : "Copiar"}</button>
                {AJ.map(([a, n]) => <button key={a} type="button" disabled={cargando || ia === false} style={{ ...ghost, opacity: cargando ? 0.5 : 1 }} title={AJUSTES[a]} onClick={() => pedir({ texto: vers[i], ajuste: a, modo: "mejorar" })}>{n}</button>)}
                <ImagenDeTexto texto={vers[i] ?? v.texto} />
              </div>
              {kitId && <div style={{ fontSize: 12, color: rr.aprobado ? col.ok : col.bad }}>{rr.aprobado ? (rr.hallazgos.length ? "✓ Sin infracciones estrictas (hay recomendaciones de estilo)" : `✓ Cumple las reglas de marca (${reglas.length} activas)`) : "✗ NO APROBADA: incumple reglas estrictas de la marca"}</div>}
              {rr.hallazgos.length > 0 && <div style={{ border: `1px solid ${rr.aprobado ? col.warn : col.bad}`, borderRadius: 8, padding: 8, fontSize: 12, color: rr.aprobado ? col.warn : col.bad, display: "grid", gap: 3 }}><b>Reglas de marca</b>{rr.hallazgos.map((h, k) => <span key={k}>• {h.severidad === "estricta" ? "Prohibido" : "Estilo"}: “{h.termino}” en “…{h.fragmento}…”{h.alternativa ? ` → prueba: ${h.alternativa}` : ""}</span>)}<button type="button" style={{ ...ghost, justifySelf: "start" }} disabled={cargando} onClick={() => pedir({ texto: `${vers[i]}\n\n[Corrige estas infracciones de marca: ${rr.hallazgos.map((h) => `evita "${h.termino}"${h.alternativa ? ` usando "${h.alternativa}"` : ""}`).join("; ")}]`, ajuste: "mas_humano", modo: "mejorar" })}>Regenerar corregido</button></div>}
              {al.length > 0 && <div style={{ border: `1px solid ${col.warn}`, borderRadius: 8, padding: 8, fontSize: 12, color: col.warn, display: "grid", gap: 3 }}><b>Verifica antes de publicar</b>{al.map((a, k) => <span key={k}>• “{a.fragmento}” — {a.motivo}</span>)}</div>}
            </div>); })}
        </div>
        {res.verificar.length > 0 && <div style={{ fontSize: 12.5, color: col.warn }}><b>La IA recomienda confirmar:</b> {res.verificar.join(" · ")}</div>}
        <div style={{ fontSize: 12, color: guardado ? col.ok : col.warn }}>{guardado ? "✓ Guardado en tu historial (las ediciones que hagas aquí no se guardan: cópialas)." : "No se guardó en el historial (¿ejecutaste el SQL 94?). Copia lo que necesites."}</div>
      </div>}
      <div style={{ background: col.card, border: `2px solid ${col.line}`, borderRadius: 12, padding: 12 }}>
        <b style={{ fontSize: 14 }}>Historial</b>
        {histErr && <div role="alert" style={{ color: col.bad, fontSize: 12, marginTop: 6 }}>{histErr}</div>}
        {!histErr && !hist.length && <div style={{ color: col.mut, fontSize: 12, marginTop: 6 }}>Aún no hay piezas guardadas.</div>}
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>{hist.map((p) => <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}><span style={{ flex: "1 1 220px", overflowWrap: "anywhere" }}>{(MODOS[p.modo as Modo] || p.modo)} · {(CANALES[p.canal as Canal] || p.canal)} <span style={{ color: col.mut }}>· {new Date(p.created_at).toLocaleString("es-ES")} · “{p.entrada.slice(0, 50)}…”</span></span><button type="button" style={ghost} onClick={() => abrir(p)}>Abrir</button><button type="button" style={{ ...ghost, color: col.bad }} onClick={() => borrar(p.id)}>Borrar</button></div>)}</div>
      </div>
    </section>
  );
}
