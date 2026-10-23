"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DIM, INSTRUCCIONES_VIDEO, duracionTotal, extraerGuion, validarGuion, type Guion } from "@/lib/video/escenas";
import { dibujarFotograma } from "@/lib/video/dibujo";

const EJEMPLO = JSON.stringify({
  titulo: "Presenta tu proyecto en 15 segundos",
  formato: "vertical",
  paleta: "isla",
  escenas: [
    { tipo: "titulo", titulo: "Un título que enganche", texto: "Una frase de apoyo", segundos: 4 },
    { tipo: "lista", titulo: "Cómo funciona", items: ["Primer paso", "Segundo paso", "Tercer paso"], segundos: 7 },
    { tipo: "cierre", titulo: "Empieza hoy", segundos: 3 },
  ],
}, null, 2);

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, marginTop: 12 };
const btn: React.CSSProperties = { padding: "10px 16px", borderRadius: 10, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", cursor: "pointer", font: "600 14px system-ui" };
const btn2: React.CSSProperties = { ...btn, background: "#f8fafc", color: "#0f172a", border: "1px solid #cbd5e1" };

export default function VideoStudio() {
  const [texto, setTexto] = useState(EJEMPLO);
  const [t, setT] = useState(0);
  const [reproduce, setReproduce] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [ext, setExt] = useState("webm");
  const [aviso, setAviso] = useState("");
  const [copiado, setCopiado] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);

  const res = useMemo(() => {
    let dato: unknown;
    try { dato = JSON.parse(texto); } catch { dato = extraerGuion(texto); }
    if (dato == null) return { ok: false as const, errores: ["No encuentro un JSON válido. Pega la respuesta del agente (con su bloque ```json) o el JSON directamente."] };
    return validarGuion(dato);
  }, [texto]);
  const guion: Guion | null = res.ok ? res.guion : null;
  const total = guion ? duracionTotal(guion) : 0;

  useEffect(() => { // dibujo de fotograma al cambiar guion o tiempo
    const c = cv.current; if (!c || !guion) return;
    const { w, h } = DIM[guion.formato]; c.width = w; c.height = h;
    const ctx = c.getContext("2d"); if (ctx) dibujarFotograma(ctx, guion, Math.min(t, Math.max(total - 0.001, 0)));
  }, [guion, t, total]);

  useEffect(() => { // reproducción en vista previa
    if (!reproduce || !guion) return;
    let raf = 0; const ini = performance.now() - t * 1000;
    const paso = (ahora: number) => {
      const s = (ahora - ini) / 1000;
      if (s >= total) { setT(0); setReproduce(false); return; }
      setT(s); raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reproduce, guion]);

  async function grabar() {
    const c = cv.current; if (!c || !guion) return;
    setAviso(""); setReproduce(false);
    if (typeof MediaRecorder === "undefined" || !c.captureStream) { setAviso("Tu navegador no puede grabar vídeo desde el lienzo. Prueba con Chrome, Edge, Firefox o Safari actualizados."); return; }
    const tipos = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
    const mime = tipos.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) { setAviso("Tu navegador no ofrece un formato de grabación compatible."); return; }
    if (url) URL.revokeObjectURL(url);
    setUrl(null); setGrabando(true);
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const trozos: Blob[] = [];
    rec.ondataavailable = (ev) => { if (ev.data.size) trozos.push(ev.data); };
    const fin = new Promise<void>((ok) => { rec.onstop = () => ok(); });
    const ctx = c.getContext("2d")!;
    rec.start(250);
    const ini = performance.now();
    await new Promise<void>((ok) => {
      const paso = (ahora: number) => {
        const s = (ahora - ini) / 1000;
        dibujarFotograma(ctx, guion, Math.min(s, total - 0.001)); setT(Math.min(s, total));
        if (s >= total) ok(); else requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    });
    rec.stop(); await fin;
    const blob = new Blob(trozos, { type: mime.split(";")[0] });
    setExt(mime.includes("mp4") ? "mp4" : "webm");
    setUrl(URL.createObjectURL(blob)); setGrabando(false); setT(0);
  }

  const nombre = (guion?.titulo ?? "video").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "video";

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "88px 16px 64px", font: "16px/1.5 system-ui" }}>
      <h1 style={{ font: "800 clamp(28px,5vw,44px)/1.1 system-ui", margin: 0 }}>Vídeo Studio</h1>
      <p style={{ color: "#475569" }}>Convierte un guion de escenas en un vídeo animado, en tu navegador. Los agentes de YouTube de la oficina pueden escribir el guion; aquí lo revisas, lo previsualizas y lo grabas. Sin audio, sin imágenes externas y sin subir nada a ningún servidor. Nada se publica.</p>

      <section style={card}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>1. Guion de escenas</h2>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false} aria-label="Guion de escenas en JSON"
          style={{ width: "100%", minHeight: 240, padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", font: "13px/1.4 ui-monospace,monospace", boxSizing: "border-box" }} />
        {!res.ok && <ul style={{ color: "#b91c1c" }}>{res.errores.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        {guion && <p style={{ color: "#166534", margin: "8px 0 0" }}>Guion válido: {guion.escenas.length} escenas, {total.toFixed(1)} s, formato {guion.formato} ({DIM[guion.formato].w}×{DIM[guion.formato].h}).</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button style={btn2} onClick={() => setTexto(EJEMPLO)}>Cargar ejemplo</button>
          <button style={btn2} onClick={() => { navigator.clipboard?.writeText(INSTRUCCIONES_VIDEO).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); }); }}>{copiado ? "Copiado" : "Copiar instrucciones para un agente"}</button>
        </div>
      </section>

      <section style={card}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>2. Vista previa y grabación</h2>
        <div style={{ display: "grid", placeItems: "center", background: "#0b1220", borderRadius: 12, padding: 12 }}>
          <canvas ref={cv} style={{ maxWidth: "100%", maxHeight: 560, height: "auto", width: guion?.formato === "horizontal" ? "100%" : guion?.formato === "cuadrado" ? 420 : 315, background: "#000", borderRadius: 8 }} aria-label="Vista previa del vídeo" />
        </div>
        {guion && <input type="range" min={0} max={Math.max(total, 0.1)} step={0.05} value={Math.min(t, total)} disabled={grabando}
          onChange={(e) => { setReproduce(false); setT(Number(e.target.value)); }} style={{ width: "100%", marginTop: 10 }} aria-label="Posición del vídeo" />}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button style={btn2} disabled={!guion || grabando} onClick={() => setReproduce((r) => !r)}>{reproduce ? "Pausar" : "Reproducir"}</button>
          <button style={btn} disabled={!guion || grabando} onClick={grabar}>{grabando ? `Grabando… ${Math.round((t / total) * 100)} %` : "Grabar vídeo"}</button>
          {url && <a style={{ ...btn, textDecoration: "none" }} href={url} download={`${nombre}.${ext}`}>Descargar .{ext}</a>}
        </div>
        {aviso && <p style={{ color: "#b91c1c" }}>{aviso}</p>}
        <p style={{ color: "#64748b", fontSize: 13 }}>La grabación dura lo mismo que el vídeo y se hace en tiempo real en tu navegador: no cambies de pestaña mientras graba. El formato es WebM (MP4 en Safari). Si necesitas MP4 para alguna red social, conviértelo con una herramienta gratuita como HandBrake o ffmpeg.</p>
      </section>
    </main>
  );
}
