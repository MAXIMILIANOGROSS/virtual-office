"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { KIT_DEFECTO, limpiarKit, type KitMarca } from "@/lib/oficina/marca";
import { CAMPOS_PERFIL, LIM_CAMPO, diferencias, limpiarPerfil, limpiarRegla, type CampoPerfil, type DatosPerfil, type Regla } from "@/lib/oficina/perfilMarca";

const col = { card: "#FFFDF7", line: "#07182E", gold: "#FFD600", mut: "#5A6B7F", txt: "#07182E", bg: "#07182E", bad: "#C0392B", ok: "#2E8B57", warn: "#B7791F" };
const campo = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `2px solid ${col.line}`, background: "#FFF3C4", color: col.txt, fontSize: 14 } as const;
const btn = { padding: "9px 16px", borderRadius: 10, border: 0, background: col.gold, color: col.bg, fontWeight: 800, cursor: "pointer" } as const;
const ghost = { background: "transparent", color: "#07182E", border: `2px solid ${col.line}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 12.5 } as const;
type Ver = { id: string; revision: number; datos: DatosPerfil; created_at: string };
const falta = (m: string) => (/does not exist|relation|schema cache/i.test(m) ? "Falta ejecutar el SQL 95 (perfil de marca) en Supabase." : m);

/** Mi marca · Memoria de marca · Reglas y palabras prohibidas. Todo estructurado, editable y con historial. */
export default function PerfilMarcaTab() {
  const [kits, setKits] = useState<{ id: string; nombre: string }[]>([]); const [kitId, setKitId] = useState("");
  const [d, setD] = useState<DatosPerfil>(limpiarPerfil({})); const [rev, setRev] = useState(0); const [reglas, setReglas] = useState<Regla[]>([]); const [vers, setVers] = useState<Ver[]>([]);
  const [nr, setNr] = useState<Regla>({ termino: "", severidad: "estricta", alternativa: "", excepcion: "" });
  const [nueva, setNueva] = useState(false); const [nk, setNk] = useState<KitMarca>(KIT_DEFECTO);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [ocupado, setOcupado] = useState(false);

  async function cargarKits() { const { data } = await supabase.from("brand_kits").select("id,nombre").order("updated_at", { ascending: false }); setKits((data as { id: string; nombre: string }[]) || []); }
  useEffect(() => { void cargarKits(); }, []);
  async function crearMarca() {
    const v = limpiarKit(nk); if (!v.ok) { setErr(v.error); return; }
    const { data: u } = await supabase.auth.getUser(); const uid = u.user?.id; if (!uid) { setErr("Tu sesión ha caducado. Vuelve a entrar."); return; }
    const { data, error } = await supabase.from("brand_kits").insert({ ...v.kit, owner: uid }).select("id").maybeSingle();
    if (error || !data?.id) { setErr(/does not exist|relation|schema cache/i.test(error?.message || "") ? "Falta ejecutar el SQL 93 (kit de marca) en Supabase." : "No se pudo crear la marca: " + (error?.message || "sin respuesta")); return; }
    await cargarKits(); setKitId(String(data.id)); setNueva(false); setNk(KIT_DEFECTO); setErr(""); setMsg("✓ Marca creada. Rellena su memoria y guárdala.");
  }
  async function cargar(id: string) {
    setMsg(""); setErr(""); if (!id) { setD(limpiarPerfil({})); setRev(0); setReglas([]); setVers([]); return; }
    const [p, r, v] = await Promise.all([
      supabase.from("brand_profiles").select("datos,revision").eq("kit_id", id).maybeSingle(),
      supabase.from("brand_rules").select("id,termino,severidad,alternativa,excepcion").eq("kit_id", id).order("created_at"),
      supabase.from("brand_profile_versions").select("id,revision,datos,created_at").eq("kit_id", id).order("revision", { ascending: false }).limit(15),
    ]);
    const e = p.error || r.error || v.error; if (e) { setErr(falta(e.message)); return; }
    setD(limpiarPerfil(p.data?.datos)); setRev(p.data?.revision || 0); setReglas((r.data as Regla[]) || []); setVers((v.data as Ver[]) || []);
  }
  useEffect(() => { cargar(kitId); }, [kitId]);

  async function guardar(datos: DatosPerfil = d, nota = "Guardado") {
    if (!kitId || ocupado) return; setOcupado(true); setMsg(""); setErr("");
    try {
      const limpio = limpiarPerfil(datos); const nueva = rev + 1;
      const { error: e1 } = await supabase.from("brand_profiles").upsert({ kit_id: kitId, datos: limpio, revision: nueva, updated_at: new Date().toISOString() }, { onConflict: "kit_id" });
      if (e1) { setErr(falta(e1.message)); return; }
      const { error: e2 } = await supabase.from("brand_profile_versions").insert({ kit_id: kitId, revision: nueva, datos: limpio });
      // Verificación: se vuelve a leer lo guardado antes de afirmar éxito.
      const { data: chk } = await supabase.from("brand_profiles").select("revision").eq("kit_id", kitId).maybeSingle();
      if (chk?.revision !== nueva) { setErr("No se pudo confirmar el guardado. Reintenta."); return; }
      setMsg(`✓ ${nota} (revisión ${nueva})${e2 ? " · el historial no se pudo guardar" : ""}`); await cargar(kitId);
    } finally { setOcupado(false); }
  }
  async function anadirRegla() {
    const r = limpiarRegla(nr); if (!r) { setErr("Escribe una palabra o expresión de al menos 2 caracteres."); return; }
    if (reglas.some((x) => x.termino.toLowerCase() === r.termino.toLowerCase())) { setErr("Esa regla ya existe."); return; }
    const { error } = await supabase.from("brand_rules").insert({ kit_id: kitId, ...r }); if (error) { setErr(falta(error.message)); return; }
    setNr({ termino: "", severidad: "estricta", alternativa: "", excepcion: "" }); setErr(""); cargar(kitId);
  }
  async function quitarRegla(id?: string) { if (!id) return; await supabase.from("brand_rules").delete().eq("id", id); cargar(kitId); }
  const rellenos = (Object.keys(CAMPOS_PERFIL) as CampoPerfil[]).filter((k) => d[k]).length;

  return (
    <section style={{ background: "#FFF3C4", border: `2px solid ${col.line}`, borderRadius: 14, padding: 14, color: col.txt, display: "grid", gap: 12, marginBottom: 14 }}>
      <div><b style={{ fontSize: 16 }}>🧠 Mi marca · memoria y reglas</b><div style={{ fontSize: 12.5, color: col.mut }}>La IA lee esta memoria antes de escribir. Solo contiene lo que tú aportas: lo que no rellenes no se inventa.</div></div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={{ fontSize: 12, color: col.mut, flex: "1 1 220px" }}>Marca (kit)<select value={kitId} onChange={(e) => setKitId(e.target.value)} style={campo}><option value="">Elige una marca…</option>{kits.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}</select></label>
      <button type="button" style={btn} onClick={() => setNueva((n) => !n)} aria-expanded={nueva}>{nueva ? "✕ Cancelar" : "＋ Nueva marca"}</button>
      </div>
      {!kits.length && !nueva && <div style={{ fontSize: 12.5, color: col.warn }}>Aún no tienes ninguna marca. Pulsa «＋ Nueva marca» para crear la primera.</div>}
      {nueva && <div style={{ border: `2px solid ${col.line}`, borderRadius: 12, padding: 10, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        {([["nombre", "Nombre de la marca *"], ["sector", "Sector"], ["localidad", "Localidad"], ["eslogan", "Eslogan"], ["contacto", "Contacto (teléfono o email)"], ["url", "Web (https://…)"]] as const).map(([k, n]) => <label key={k} style={{ fontSize: 12, color: col.mut }}>{n}<input style={campo} value={nk[k]} maxLength={80} onChange={(e) => setNk({ ...nk, [k]: e.target.value })} /></label>)}
        {([["color_primario", "Color principal"], ["color_secundario", "Color secundario"], ["color_acento", "Color de acento"]] as const).map(([k, n]) => <label key={k} style={{ fontSize: 12, color: col.mut }}>{n}<input type="color" style={{ ...campo, padding: 2, height: 38 }} value={nk[k]} onChange={(e) => setNk({ ...nk, [k]: e.target.value })} /></label>)}
        <button type="button" style={{ ...btn, alignSelf: "end" }} onClick={crearMarca}>Crear marca</button>
      </div>}
      {err && <div role="alert" style={{ color: col.bad, fontSize: 13 }}>{err}</div>}
      {kitId && <>
        <div style={{ fontSize: 12, color: col.mut }}>{rellenos}/{Object.keys(CAMPOS_PERFIL).length} campos rellenos · revisión actual: {rev || "sin guardar"}</div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
          {(Object.keys(CAMPOS_PERFIL) as CampoPerfil[]).map((k) => <label key={k} style={{ fontSize: 12, color: col.mut }}>{CAMPOS_PERFIL[k]}<textarea value={d[k]} maxLength={LIM_CAMPO} rows={k === "instrucciones" || k === "reglasCanal" || k.startsWith("ejemplos") ? 4 : 2} onChange={(e) => setD((o) => ({ ...o, [k]: e.target.value }))} style={{ ...campo, resize: "vertical" }} /></label>)}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><button type="button" style={btn} disabled={ocupado} onClick={() => guardar()}>{ocupado ? "Guardando…" : "Guardar memoria"}</button>{msg && <span style={{ color: col.ok, fontSize: 13 }}>{msg}</span>}</div>

        <div style={{ borderTop: `1px solid ${col.line}`, paddingTop: 10, display: "grid", gap: 8 }}>
          <b>Reglas y palabras prohibidas ({reglas.length})</b>
          <div style={{ fontSize: 12, color: col.mut }}>«Estricta»: un texto que la incumpla NO se marca como aprobado. «Estilo»: solo recomendación. Se detectan mayúsculas, tildes, espacios y plurales simples. Es una regla de marca, no una revisión legal.</div>
          <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            <input style={campo} placeholder="Palabra o expresión" value={nr.termino} maxLength={120} onChange={(e) => setNr({ ...nr, termino: e.target.value })} />
            <select style={campo} value={nr.severidad} onChange={(e) => setNr({ ...nr, severidad: e.target.value as Regla["severidad"] })}><option value="estricta">Estricta (prohibida)</option><option value="estilo">Estilo (recomendación)</option></select>
            <input style={campo} placeholder="Alternativa (opcional)" value={nr.alternativa} maxLength={160} onChange={(e) => setNr({ ...nr, alternativa: e.target.value })} />
            <input style={campo} placeholder="Excepción justificada (frase permitida)" value={nr.excepcion} maxLength={200} onChange={(e) => setNr({ ...nr, excepcion: e.target.value })} />
            <button type="button" style={btn} onClick={anadirRegla}>Añadir regla</button>
          </div>
          {!reglas.length && <div style={{ fontSize: 12.5, color: col.mut }}>Aún no hay reglas para esta marca.</div>}
          {reglas.map((r) => <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}><span style={{ color: r.severidad === "estricta" ? col.bad : col.warn, fontWeight: 700 }}>{r.severidad === "estricta" ? "Prohibida" : "Estilo"}</span><span style={{ flex: "1 1 200px" }}>“{r.termino}”{r.alternativa ? ` → ${r.alternativa}` : ""}{r.excepcion ? ` · excepción: “${r.excepcion}”` : ""}</span><button type="button" style={ghost} onClick={() => quitarRegla(r.id)}>Quitar</button></div>)}
        </div>

        <div style={{ borderTop: `1px solid ${col.line}`, paddingTop: 10, display: "grid", gap: 6 }}>
          <b>Historial de versiones</b>
          {!vers.length && <div style={{ fontSize: 12.5, color: col.mut }}>Se guarda una versión cada vez que pulsas «Guardar memoria».</div>}
          {vers.map((v, i) => { const prev = vers[i + 1]; const cambios = diferencias(prev?.datos || {}, v.datos).map((k) => CAMPOS_PERFIL[k]); return <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}><span style={{ flex: "1 1 240px" }}>Rev. {v.revision} · {new Date(v.created_at).toLocaleString("es-ES")} <span style={{ color: col.mut }}>· {cambios.length ? cambios.join(", ") : "sin cambios"}</span></span><button type="button" style={ghost} disabled={ocupado} onClick={() => guardar(v.datos, `Restaurada la revisión ${v.revision} como nueva versión`)}>Restaurar</button></div>; })}
        </div>
      </>}
    </section>
  );
}
