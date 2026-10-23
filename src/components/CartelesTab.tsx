"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { FORMATOS, LIM, type Formato } from "@/lib/oficina/cartel";
import AnuncioEmpleoTab from "@/components/AnuncioEmpleoTab";
import PerfilMarcaTab from "./PerfilMarcaTab";
import MarketingStudioTab from "@/components/MarketingStudioTab";
import { FONDOS, FONDO_POR_DEFECTO, fondoSeleccionado } from "@/lib/oficina/fondos";

const col = { card: "#FFFDF7", line: "#07182E", gold: "#FFD600", mut: "#5A6B7F", txt: "#07182E", bg: "#07182E", bad: "#C0392B" };
const campo = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `2px solid ${col.line}`, background: "#FFF3C4", color: col.txt, fontSize: 14 } as const;
type F = { negocio: string; titulo: string; oferta: string; precio: string; condiciones: string; direccion: string; contacto: string; cta: string; fotoUrl: string };
const VACIO: F = { negocio: "", titulo: "", oferta: "", precio: "", condiciones: "", direccion: "", contacto: "", cta: "", fotoUrl: FONDO_POR_DEFECTO };

/** Fábrica de carteles: texto exacto compuesto por código. Genera un PNG real; no inventa datos del negocio. */
export default function CartelesTab() {
  const [f, setF] = useState<F>(VACIO); const [formato, setFormato] = useState<Formato>("cuadrado");
  const [url, setUrl] = useState<string | null>(null); const [guardado, setGuardado] = useState<{ ok: boolean; aviso: string } | null>(null); const [lib, setLib] = useState<{ id: string; nombre: string; url: string | null; creado: string; bytes: number }[]>([]); const [libErr, setLibErr] = useState(""); const [pIA, setPIA] = useState(""); const [iaCargando, setIaCargando] = useState(false); const [iaMsg, setIaMsg] = useState<{ ok: boolean; t: string; url?: string } | null>(null); const [iaConf, setIaConf] = useState<boolean | null>(null); const [cargando, setCargando] = useState(false); const [err, setErr] = useState("");
  async function cargarLib() {
    try { const { data: s } = await supabase.auth.getSession(); const r = await fetch("/api/oficina/archivos", { headers: { authorization: `Bearer ${s.session?.access_token || ""}` } }); const j = await r.json().catch(() => ({})); if (r.ok && j.ok) { setLib(j.archivos || []); setLibErr(""); } else setLibErr(j.error || "No se pudo cargar la biblioteca."); } catch { setLibErr("Sin conexión con el servidor."); }
  }
  async function borrar(id: string) {
    try { const { data: s } = await supabase.auth.getSession(); await fetch(`/api/oficina/archivos?id=${id}`, { method: "DELETE", headers: { authorization: `Bearer ${s.session?.access_token || ""}` } }); } catch { /* se recarga igualmente */ }
    cargarLib();
  }
  async function generarIA(e: React.FormEvent) {
    e.preventDefault(); if (iaCargando) return; setIaCargando(true); setIaMsg(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch("/api/oficina/imagen", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.session?.access_token || ""}` }, body: JSON.stringify({ prompt: pIA }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) { setIaMsg({ ok: true, t: "✓ Imagen generada, verificada y guardada en tu biblioteca.", url: j.url || undefined }); cargarLib(); } else setIaMsg({ ok: false, t: j.error || "No se pudo generar la imagen." });
    } catch { setIaMsg({ ok: false, t: "Sin conexión con el servidor." }); }
    setIaCargando(false);
  }
  useEffect(() => { (async () => { try { const { data: s } = await supabase.auth.getSession(); const r = await fetch("/api/oficina/imagen", { headers: { authorization: `Bearer ${s.session?.access_token || ""}` } }); const j = await r.json().catch(() => ({})); setIaConf(!!(r.ok && j.ok && j.proveedores?.some((p: { configurado: boolean }) => p.configurado))); } catch { setIaConf(null); } })(); }, []);
  useEffect(() => { cargarLib(); }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement>) => setF((o) => ({ ...o, [k]: e.target.value }));
  async function generar(e: React.FormEvent) {
    e.preventDefault(); if (cargando) return; setCargando(true); setErr("");
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch("/api/oficina/cartel", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.session?.access_token || ""}` }, body: JSON.stringify({ ...f, formato }) });
      if (!r.ok) { let m = "No se pudo generar el cartel."; try { const j = await r.json(); if (j?.error) m = j.error; } catch { /* sin cuerpo */ } setErr(m); return; }
      setGuardado({ ok: r.headers.get("x-archivo-guardado") === "1", aviso: decodeURIComponent(r.headers.get("x-archivo-aviso") || "") });
      const blob = await r.blob(); if (!blob.type.startsWith("image/") || blob.size < 2000) { setErr("El archivo recibido no es una imagen válida."); return; }
      setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); }); cargarLib();
    } catch { setErr("Sin conexión con el servidor."); } finally { setCargando(false); }
  }
  const txt = (k: keyof F, et: string, ph = "") => <label style={{ fontSize: 12, color: col.mut, display: "block" }}>{et}<input value={f[k]} onChange={set(k)} maxLength={LIM[k]} placeholder={ph} style={campo} /></label>;
  return (
    <section style={{ marginTop: 14, display: "grid", gap: 12 }}>
      <p style={{ fontSize: 13, color: col.mut, margin: 0 }}>Carteles listos para publicar, con tu texto exacto (precios, horarios, contacto) y los colores de tu marca. Los datos los pones tú: no se inventa nada. Si añades una foto, usa solo imágenes que tengas autorizadas (URL https).</p>
      <PerfilMarcaTab />
      <MarketingStudioTab />
      <AnuncioEmpleoTab />
      <form onSubmit={generar} style={{ background: col.card, border: `2px solid ${col.line}`, borderRadius: 12, padding: 12, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
        {txt("negocio", "Negocio *", "Nombre de tu negocio")}{txt("titulo", "Titular *", "Oferta de lanzamiento")}{txt("oferta", "Oferta", "Qué incluye la oferta")}{txt("precio", "Precio", "12,90 €")}
        {txt("condiciones", "Condiciones", "De lunes a viernes · hasta fin de existencias")}{txt("direccion", "Dirección", "")}{txt("contacto", "Contacto", "")}{txt("cta", "Llamada a la acción", "Reserva ya")}<label style={{ fontSize: 12, color: col.mut, display: "block" }}>Fondo<select value={fondoSeleccionado(f.fotoUrl)} onChange={(e) => { const z = FONDOS.find((x) => x.id === e.target.value); setF((o) => ({ ...o, fotoUrl: z ? z.url : "https://" })); }} style={campo}>{FONDOS.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}<option value="otra">Otra foto (URL https)</option></select></label>{fondoSeleccionado(f.fotoUrl) === "otra" && txt("fotoUrl", "Foto propia (URL https, autorizada)", "https://…")}
        <label style={{ fontSize: 12, color: col.mut }}>Formato<select value={formato} onChange={(e) => setFormato(e.target.value as Formato)} style={campo}>{(Object.keys(FORMATOS) as Formato[]).map((k) => <option key={k} value={k}>{FORMATOS[k].nombre}</option>)}</select></label>
        <div style={{ display: "flex", alignItems: "flex-end" }}><button type="submit" disabled={cargando} style={{ padding: "10px 18px", borderRadius: 10, border: 0, background: col.gold, color: col.bg, fontWeight: 800, cursor: "pointer", opacity: cargando ? 0.6 : 1 }}>{cargando ? "Generando…" : "Generar cartel"}</button></div>
      </form>
      {err && <div role="alert" style={{ color: col.bad, fontSize: 13 }}>{err}</div>}
      {url && <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Cartel generado" style={{ maxWidth: "100%", maxHeight: 640, borderRadius: 10, border: `2px solid ${col.line}` }} />
        <a href={url} download={`cartel-${formato}.png`} style={{ padding: "8px 16px", borderRadius: 10, background: col.gold, color: col.bg, fontWeight: 800, textDecoration: "none" }}>Descargar PNG</a>
        <span style={{ fontSize: 11, color: col.mut }}>Revísalo antes de publicarlo: tú apruebas el contenido. </span>
        {guardado && (guardado.ok ? <span style={{ fontSize: 12, color: "#2E8B57" }}>✓ Guardado en tu biblioteca (verificado en el servidor).</span> : <span role="alert" style={{ fontSize: 12, color: "#B7791F" }}>No se guardó en la biblioteca{guardado.aviso ? `: ${guardado.aviso}` : ""}. Descárgalo ahora.</span>)}
      </div>}
      <form onSubmit={generarIA} style={{ background: col.card, border: `2px solid ${col.line}`, borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
        <b style={{ fontSize: 14 }}>Imagen con IA (FLUX.1 schnell, vía Cloudflare)</b>
        <span style={{ fontSize: 12, color: col.mut }}>Describe la imagen. Sirve para fondos y fotos de ambiente; el texto exacto (precios, horarios) ponlo en los carteles de arriba, porque la IA no escribe bien. Licencia del modelo: Apache-2.0. Cuota gratuita diaria limitada.</span>
        {iaConf === false && <span role="status" style={{ fontSize: 12, color: "#B7791F" }}>Aún no está configurado: faltan CF_ACCOUNT_ID y CF_API_TOKEN en Vercel.</span>}
        <input value={pIA} onChange={(e) => setPIA(e.target.value)} maxLength={400} placeholder="Ej.: plato de pescado fresco en una terraza frente al mar al atardecer, fotografía realista" style={campo} aria-label="Descripción de la imagen" />
        <div><button type="submit" disabled={iaCargando || pIA.trim().length < 8 || iaConf === false} style={{ padding: "9px 16px", borderRadius: 10, border: 0, background: col.gold, color: col.bg, fontWeight: 800, cursor: "pointer", opacity: iaCargando || pIA.trim().length < 8 || iaConf === false ? 0.6 : 1 }}>{iaCargando ? "Generando…" : "Generar imagen"}</button></div>
        {iaMsg && <div role={iaMsg.ok ? "status" : "alert"} style={{ fontSize: 12.5, color: iaMsg.ok ? "#2E8B57" : col.bad }}>{iaMsg.t} {iaMsg.url && <a href={iaMsg.url} target="_blank" rel="noopener noreferrer" style={{ color: "#07182E" }}>Abrir</a>}</div>}
      </form>
      <div style={{ background: col.card, border: `2px solid ${col.line}`, borderRadius: 12, padding: 12 }}>
        <b style={{ fontSize: 14 }}>Biblioteca de archivos</b>
        {libErr && <div role="alert" style={{ color: col.bad, fontSize: 12, marginTop: 6 }}>{libErr}</div>}
        {!libErr && !lib.length && <div style={{ color: col.mut, fontSize: 12, marginTop: 6 }}>Aún no hay archivos guardados.</div>}
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>{lib.map((a) => <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}><span style={{ flex: "1 1 200px", overflowWrap: "anywhere" }}>{a.nombre} <span style={{ color: col.mut }}>· {new Date(a.creado).toLocaleString("es-ES")} · {Math.round(a.bytes / 1024)} KB</span></span>{a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: "#07182E" }}>Abrir</a>}<button type="button" onClick={() => borrar(a.id)} style={{ background: "transparent", color: col.bad, border: `2px solid ${col.line}`, borderRadius: 8, padding: "2px 8px", cursor: "pointer" }}>Borrar</button></div>)}</div>
      </div>
    </section>
  );
}
