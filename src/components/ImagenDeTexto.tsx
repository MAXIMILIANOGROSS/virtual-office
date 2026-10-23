"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { FORMATOS_AD, ORDEN_FORMATOS, desdeTexto, type FormatoAd } from "@/lib/oficina/publicidadImagen";
import { FONDOS } from "@/lib/oficina/fondos";

const campo = { width: "100%", padding: 8, borderRadius: 8, border: "2px solid #07182E", background: "#fff", color: "#07182E", fontSize: 13 } as const;
const btn = { padding: "8px 14px", borderRadius: 10, border: 0, background: "#FFD600", color: "#07182E", fontWeight: 800, cursor: "pointer" } as const;

/** Crea una imagen (PNG) con el texto generado: editable, con fondo de foto o degradado de marca. */
export default function ImagenDeTexto({ texto }: { texto: string }) {
  const [abierto, setAbierto] = useState(false);
  const [c, setC] = useState({ titular: "", subtitulo: "", cta: "" });
  const [fondo, setFondo] = useState<string>(""); const [formato, setFormato] = useState<FormatoAd>("ig_cuadrado");
  const [src, setSrc] = useState<string | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  function abrir() { setC(desdeTexto(texto)); setFondo(FONDOS[0].url); setAbierto(true); setSrc(null); setErr(""); }
  async function crear() {
    setBusy(true); setErr("");
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch("/api/oficina/publicidad", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.session?.access_token || ""}` }, body: JSON.stringify({ ...c, fondo, formato }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || "No se pudo crear la imagen."); return; }
      const b = await r.blob(); if (!b.type.startsWith("image/")) { setErr("Respuesta no válida."); return; }
      setSrc(URL.createObjectURL(b));
    } catch { setErr("Sin conexión con el servidor."); } finally { setBusy(false); }
  }
  if (!abierto) return <button type="button" style={btn} onClick={abrir}>🖼️ Crear imagen</button>;
  return (
    <div style={{ display: "grid", gap: 8, border: "2px dashed #07182E", borderRadius: 10, padding: 10 }}>
      <input style={campo} value={c.titular} maxLength={48} onChange={(e) => setC({ ...c, titular: e.target.value })} placeholder="Titular" aria-label="Titular" />
      <input style={campo} value={c.subtitulo} maxLength={90} onChange={(e) => setC({ ...c, subtitulo: e.target.value })} placeholder="Subtítulo" aria-label="Subtítulo" />
      <input style={campo} value={c.cta} maxLength={28} onChange={(e) => setC({ ...c, cta: e.target.value })} placeholder="Botón" aria-label="Botón" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select style={{ ...campo, width: "auto" }} value={fondo} onChange={(e) => setFondo(e.target.value)} aria-label="Fondo">
          {FONDOS.map((f) => <option key={f.id} value={f.url}>{f.nombre}</option>)}
        </select>
        <select style={{ ...campo, width: "auto" }} value={formato} onChange={(e) => setFormato(e.target.value as FormatoAd)} aria-label="Formato">
          {ORDEN_FORMATOS.map((f) => <option key={f} value={f}>{FORMATOS_AD[f].n}</option>)}
        </select>
        <button type="button" style={btn} disabled={busy} aria-busy={busy} onClick={crear}>{busy ? "Dibujando…" : "Crear"}</button>
      </div>
      {err && <span style={{ color: "#C0392B", fontSize: 13 }}>{err}</span>}
      {src && <><img src={src} alt="Imagen creada" style={{ width: "100%", maxWidth: 340, borderRadius: 10, border: "2px solid #07182E" }} /><a href={src} download="imagen.png" style={{ ...btn, textDecoration: "none", justifySelf: "start" }}>Descargar PNG</a></>}
    </div>
  );
}
