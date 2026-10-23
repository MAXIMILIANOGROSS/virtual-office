"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CONTRATOS, ESTILOS_EMPLEO, FORMATOS_EMPLEO, LIMV, MODALIDADES, type EstiloEmpleo, type FormatoEmpleo, type Textos, type Vacante } from "@/lib/oficina/anuncioEmpleo";
import { KIT_DEFECTO, LIMK, limpiarKit, paletaDesdeKit, type KitMarca } from "@/lib/oficina/marca";
import { FONDOS, FONDO_POR_DEFECTO, fondoSeleccionado } from "@/lib/oficina/fondos";

const col = { card: "#FFFDF7", line: "#07182E", gold: "#FFD600", mut: "#5A6B7F", txt: "#07182E", bg: "#07182E", bad: "#C0392B" };
const campo = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `2px solid ${col.line}`, background: "#FFF3C4", color: col.txt, fontSize: 14 } as const;
const btn = { padding: "9px 16px", borderRadius: 10, border: 0, background: col.gold, color: col.bg, fontWeight: 800, cursor: "pointer" } as const;
const ghost = { background: "transparent", color: "#07182E", border: `2px solid ${col.line}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer" } as const;
type D = Omit<Vacante, "formato" | "estilo">;
const VACIO: D = { empresa: "", puesto: "", sector: "", localidad: "", modalidad: "", contrato: "", jornada: "", horario: "", salario: "", funciones: "", requisitos: "", beneficios: "", incorporacion: "", plazo: "", contacto: "", url: "", fotoUrl: FONDO_POR_DEFECTO };
type Res = { formato: FormatoEmpleo; png: string; avisos: string[]; textos: Textos; guardado: boolean; aviso: string };
type KitFila = KitMarca & { id: string };
const CAMPANA: FormatoEmpleo[] = ["ig_cuadrado", "ig_vertical", "story"];

/** Hiring Studio: kit de marca + anuncio de vacante + campaña coherente en varios formatos. No inventa ningún dato. */
export default function AnuncioEmpleoTab() {
  const [d, setD] = useState<D>(VACIO); const [formato, setFormato] = useState<FormatoEmpleo>("ig_cuadrado"); const [estilo, setEstilo] = useState<EstiloEmpleo>("corporativo");
  const [cargando, setCargando] = useState(false); const [err, setErr] = useState("");
  const [res, setRes] = useState<Res[]>([]); const [copiado, setCopiado] = useState("");
  const [kits, setKits] = useState<KitFila[]>([]); const [kitId, setKitId] = useState(""); const [kitErr, setKitErr] = useState(""); const [kf, setKf] = useState<KitMarca | null>(null); const [kitMsg, setKitMsg] = useState("");
  const set = (k: keyof D) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((o) => ({ ...o, [k]: e.target.value }));

  async function cargarKits() {
    const { data, error } = await supabase.from("brand_kits").select("*").order("updated_at", { ascending: false });
    if (error) { setKitErr(/does not exist|relation/i.test(error.message) ? "Falta ejecutar el SQL 93 (kit de marca) en Supabase." : "No se pudieron cargar los kits: " + error.message); return; }
    setKitErr(""); setKits((data || []).map((r) => ({ id: r.id, nombre: r.nombre, color_primario: r.color_primario, color_secundario: r.color_secundario, color_acento: r.color_acento, estilo: r.estilo, logo_url: r.logo_url || "", eslogan: r.eslogan || "", sector: r.sector || "", localidad: r.localidad || "", contacto: r.contacto || "", url: r.url || "" })));
  }
  useEffect(() => { cargarKits(); }, []);
  function elegirKit(id: string) {
    setKitId(id); const k = kits.find((x) => x.id === id); if (!k) return;
    setEstilo((k.estilo in ESTILOS_EMPLEO ? k.estilo : "corporativo") as EstiloEmpleo);
    setD((o) => ({ ...o, empresa: o.empresa || k.nombre, sector: o.sector || k.sector, localidad: o.localidad || k.localidad, contacto: o.contacto || k.contacto, url: o.url || k.url }));
  }
  async function guardarKit(e: React.FormEvent) {
    e.preventDefault(); if (!kf) return; setKitMsg("");
    const v = limpiarKit(kf); if (!v.ok) { setKitMsg(v.error); return; }
    const { data: s } = await supabase.auth.getSession(); const uid = s.session?.user.id; if (!uid) { setKitMsg("Inicia sesión."); return; }
    const fila = { ...v.kit, logo_url: v.kit.logo_url || null, eslogan: v.kit.eslogan || null, sector: v.kit.sector || null, localidad: v.kit.localidad || null, contacto: v.kit.contacto || null, url: v.kit.url || null, updated_at: new Date().toISOString() };
    const q = kitId && kits.some((x) => x.id === kitId && x.nombre === v.kit.nombre) ? supabase.from("brand_kits").update(fila).eq("id", kitId).select("id").maybeSingle() : supabase.from("brand_kits").insert({ ...fila, owner: uid }).select("id").maybeSingle();
    const { data, error } = await q; if (error) { setKitMsg("No se pudo guardar: " + error.message); return; }
    setKitMsg("✓ Kit guardado."); setKf(null); await cargarKits(); if (data?.id) setKitId(data.id);
  }
  async function borrarKit() { if (!kitId) return; const { error } = await supabase.from("brand_kits").delete().eq("id", kitId); if (error) { setKitMsg("No se pudo borrar: " + error.message); return; } setKitId(""); setKitMsg("Kit borrado."); cargarKits(); }

  async function pedir(f: FormatoEmpleo, token: string): Promise<Res> {
    const r = await fetch("/api/oficina/anuncio", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ ...d, formato: f, estilo, kitId: kitId || undefined }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "No se pudo generar el anuncio.");
    return { formato: f, png: j.png, avisos: j.avisos || [], textos: j.textos, guardado: !!j.guardado, aviso: j.aviso || "" };
  }
  async function generar(formatos: FormatoEmpleo[]) {
    if (cargando) return; setCargando(true); setErr(""); setRes([]);
    try {
      const { data: s } = await supabase.auth.getSession(); const out: Res[] = [];
      for (const f of formatos) { out.push(await pedir(f, s.session?.access_token || "")); setRes([...out]); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Sin conexión con el servidor."); } finally { setCargando(false); }
  }
  async function copiar(k: string, t: string) { try { await navigator.clipboard.writeText(t); setCopiado(k); setTimeout(() => setCopiado(""), 1500); } catch { setCopiado("no"); } }
  const txt = (k: keyof D, et: string, ph = "") => <label style={{ fontSize: 12, color: col.mut, display: "block" }}>{et}<input value={d[k]} onChange={set(k)} maxLength={LIMV[k]} placeholder={ph} style={campo} /></label>;
  const sel = (k: "modalidad" | "contrato", et: string, op: readonly string[]) => <label style={{ fontSize: 12, color: col.mut, display: "block" }}>{et}<select value={d[k]} onChange={set(k)} style={campo}>{op.map((o) => <option key={o} value={o}>{o || "—"}</option>)}</select></label>;
  const kt = (k: keyof KitMarca, et: string, ph = "") => kf && <label style={{ fontSize: 12, color: col.mut, display: "block" }}>{et}<input value={kf[k]} onChange={(e) => setKf({ ...kf, [k]: e.target.value })} maxLength={LIMK[k]} placeholder={ph} style={campo} /></label>;
  const kc = (k: "color_primario" | "color_secundario" | "color_acento", et: string) => kf && <label style={{ fontSize: 12, color: col.mut, display: "block" }}>{et}<input type="color" value={kf[k]} onChange={(e) => setKf({ ...kf, [k]: e.target.value.toUpperCase() })} style={{ ...campo, padding: 2, height: 38 }} /></label>;
  const prev = kf && limpiarKit(kf).ok ? paletaDesdeKit({ ...KIT_DEFECTO, ...kf }) : null;

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <b style={{ fontSize: 15 }}>Anuncios de empleo (Hiring Studio)</b>
      <p style={{ fontSize: 13, color: col.mut, margin: 0 }}>Crea el <b>kit de marca</b> de una empresa una vez (colores, logo, eslogan, contacto) y todos sus anuncios salen coherentes. Solo aparece lo que escribes: no se inventan salarios, beneficios ni requisitos. La empresa es responsable del contenido publicado.</p>

      <div style={{ background: col.card, border: `2px solid ${col.line}`, borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
        <b style={{ fontSize: 14 }}>Kit de marca</b>
        {kitErr && <div role="alert" style={{ color: col.bad, fontSize: 12.5 }}>{kitErr}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={kitId} onChange={(e) => elegirKit(e.target.value)} style={{ ...campo, maxWidth: 280 }} aria-label="Kit de marca"><option value="">Sin kit (estilo por defecto)</option>{kits.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}</select>
          <button type="button" style={ghost} onClick={() => { setKitMsg(""); setKf({ ...KIT_DEFECTO }); }}>+ Nuevo kit</button>
          {kitId && <button type="button" style={ghost} onClick={() => { setKitMsg(""); const k = kits.find((x) => x.id === kitId); if (k) { const { ...r } = k; setKf(r); } }}>Editar</button>}
          {kitId && <button type="button" style={{ ...ghost, color: col.bad }} onClick={borrarKit}>Borrar</button>}
        </div>
        {kitMsg && <div role="status" style={{ fontSize: 12.5, color: kitMsg.startsWith("✓") ? "#2E8B57" : "#B7791F" }}>{kitMsg}</div>}
        {kf && <form onSubmit={guardarKit} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          {kt("nombre", "Nombre de la marca *", "Bar Sol")}{kc("color_primario", "Color principal")}{kc("color_secundario", "Color secundario")}{kc("color_acento", "Color de acento")}
          {kt("logo_url", "Logotipo (URL https, tuyo o autorizado)", "https://…")}{kt("eslogan", "Eslogan", "")}{kt("sector", "Sector", "Tu sector")}{kt("localidad", "Localidad", "Tu ciudad")}{kt("contacto", "Contacto", "WhatsApp 600 000 000")}{kt("url", "Enlace de empleo (https)", "https://…")}
          {prev && <div style={{ gridColumn: "1/-1", borderRadius: 10, padding: 14, background: prev.paleta.fondo, color: prev.paleta.texto }}><b style={{ color: prev.paleta.acento }}>{kf.nombre || "Tu marca"}</b> · Así se verá el texto sobre tu color <span style={{ background: prev.paleta.chip, color: prev.paleta.chipTxt, padding: "2px 10px", borderRadius: 999, fontWeight: 800 }}>Estamos conectando</span>{prev.avisos.map((a) => <div key={a} style={{ fontSize: 12, color: prev.paleta.suave }}>• {a}</div>)}</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}><button type="submit" style={btn}>Guardar kit</button><button type="button" style={ghost} onClick={() => setKf(null)}>Cancelar</button></div>
        </form>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); generar([formato]); }} style={{ background: col.card, border: `2px solid ${col.line}`, borderRadius: 12, padding: 12, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
        {txt("empresa", "Empresa *", "Nombre de la empresa")}{txt("puesto", "Puesto *", "Puesto a cubrir")}{txt("sector", "Sector", "Tu sector")}{txt("localidad", "Localidad", "Tu ciudad")}
        {sel("modalidad", "Modalidad", MODALIDADES)}{sel("contrato", "Contrato", CONTRATOS)}{txt("jornada", "Jornada", "Completa / media")}{txt("horario", "Horario o turnos", "Turno de tarde")}
        {txt("salario", "Salario (solo si lo indicas)", "1.200 €/mes")}{txt("funciones", "Funciones", "")}{txt("requisitos", "Requisitos", "")}{txt("beneficios", "Qué ofreces", "")}
        {txt("incorporacion", "Incorporación", "Inmediata")}{txt("plazo", "Plazo de candidaturas", "Hasta el 30/10")}{txt("contacto", "Contacto *", "WhatsApp 600 000 000")}{txt("url", "Enlace para solicitar (https)", "https://…")}<label style={{ fontSize: 12, color: col.mut, display: "block" }}>Fondo<select value={fondoSeleccionado(d.fotoUrl)} onChange={(e) => { const f = FONDOS.find((x) => x.id === e.target.value); setD((o) => ({ ...o, fotoUrl: f ? f.url : "https://" })); }} style={campo}>{FONDOS.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}<option value="otra">Otra foto (URL https)</option></select></label>{fondoSeleccionado(d.fotoUrl) === "otra" && txt("fotoUrl", "Foto propia (URL https, autorizada)", "https://…")}
        <label style={{ fontSize: 12, color: col.mut }}>Estilo{kitId ? " (el kit manda en los colores)" : ""}<select value={estilo} onChange={(e) => setEstilo(e.target.value as EstiloEmpleo)} style={campo}>{(Object.keys(ESTILOS_EMPLEO) as EstiloEmpleo[]).map((k) => <option key={k} value={k}>{ESTILOS_EMPLEO[k].nombre}</option>)}</select></label>
        <label style={{ fontSize: 12, color: col.mut }}>Formato<select value={formato} onChange={(e) => setFormato(e.target.value as FormatoEmpleo)} style={campo}>{(Object.keys(FORMATOS_EMPLEO) as FormatoEmpleo[]).map((k) => <option key={k} value={k}>{FORMATOS_EMPLEO[k].nombre}</option>)}</select></label>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <button type="submit" disabled={cargando} style={{ ...btn, opacity: cargando ? 0.6 : 1 }}>{cargando ? "Generando…" : "Generar anuncio"}</button>
          <button type="button" disabled={cargando} onClick={() => generar(CAMPANA)} style={{ ...ghost, opacity: cargando ? 0.6 : 1 }}>Campaña de marca (3 formatos)</button>
        </div>
      </form>
      {err && <div role="alert" style={{ color: col.bad, fontSize: 13 }}>{err}</div>}
      {res.length > 0 && <div style={{ display: "grid", gap: 10 }}>
        {res[0].avisos.length > 0 && <div role="status" style={{ border: "1px solid #B7791F", borderRadius: 10, padding: 10, fontSize: 12.5, color: "#B7791F", display: "grid", gap: 4 }}><b>Revisa antes de publicar</b>{res[0].avisos.map((a) => <span key={a}>• {a}</span>)}</div>}
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", alignItems: "start" }}>
          {res.map((x) => <div key={x.formato} style={{ display: "grid", gap: 6, justifyItems: "start" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={x.png} alt={`Anuncio ${FORMATOS_EMPLEO[x.formato].nombre}`} style={{ maxWidth: "100%", maxHeight: 520, borderRadius: 10, border: `2px solid ${col.line}` }} />
            <a href={x.png} download={`empleo-${x.formato}.png`} style={{ padding: "6px 14px", borderRadius: 10, background: col.gold, color: col.bg, fontWeight: 800, textDecoration: "none", fontSize: 13 }}>Descargar {FORMATOS_EMPLEO[x.formato].nombre.split(" ")[0]} PNG</a>
            {x.guardado ? <span style={{ fontSize: 12, color: "#2E8B57" }}>✓ Guardado en tu biblioteca (verificado).</span> : <span role="alert" style={{ fontSize: 12, color: "#B7791F" }}>No se guardó{x.aviso ? `: ${x.aviso}` : ""}. Descárgalo ahora.</span>}
          </div>)}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {([["whatsapp", "WhatsApp"], ["linkedin", "LinkedIn"], ["instagram", "Instagram / Facebook"]] as const).map(([k, et]) => <div key={k} style={{ background: col.card, border: `2px solid ${col.line}`, borderRadius: 10, padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: 13 }}>Texto para {et}</b><button type="button" onClick={() => copiar(k, res[0].textos[k])} style={ghost}>{copiado === k ? "Copiado ✓" : "Copiar"}</button></div>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12.5, color: col.txt, margin: "6px 0 0" }}>{res[0].textos[k]}</pre>
          </div>)}
        </div>
      </div>}
    </section>
  );
}
