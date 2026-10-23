"use client";
import { useEffect, useMemo, useState } from "react";
import { ordenarGanchos } from "@/lib/youtube/gancho";
import { ordenarTitulos } from "@/lib/youtube/titulo";
import { parseTranscript, mmss } from "@/lib/youtube/transcripto";
import { listaEdicion } from "@/lib/youtube/edicion";
import { capitulos, bloqueCapitulos } from "@/lib/youtube/capitulos";
import { analizarRetencion } from "@/lib/youtube/retencion";
import { atipicos } from "@/lib/youtube/viral";

const TABS = ["Ganchos", "Títulos", "Edición", "Capítulos", "Retención", "Atípicos", "Mi canal"] as const;
type Tab = (typeof TABS)[number];
const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, marginTop: 12 };
const ta: React.CSSProperties = { width: "100%", minHeight: 130, padding: 10, borderRadius: 10, border: "1px solid #cbd5e1", font: "14px/1.4 ui-monospace,monospace", boxSizing: "border-box" };
const col = (v: number) => (v >= 72 ? "#16a34a" : v >= 55 ? "#d97706" : "#dc2626");

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return <button onClick={() => { navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer" }}>{ok ? "Copiado" : "Copiar"}</button>;
}

export default function YoutubeStudio() {
  const [tab, setTab] = useState<Tab>("Ganchos");
  const [ganchos, setGanchos] = useState("");
  const [titulos, setTitulos] = useState("");
  const [miniatura, setMiniatura] = useState("");
  const [trans, setTrans] = useState("");
  const [csv, setCsv] = useState("");
  const [dur, setDur] = useState("");
  const [filas, setFilas] = useState("");
  const [canal, setCanal] = useState({ nombre: "", nicho: "", voz: "", prohibido: "", notas: "" });

  useEffect(() => { try { const r = localStorage.getItem("ic-yt-canal"); if (r) setCanal(JSON.parse(r)); } catch {} }, []);
  const guardarCanal = (c: typeof canal) => { setCanal(c); try { localStorage.setItem("ic-yt-canal", JSON.stringify(c)); } catch {} };

  const rg = useMemo(() => ordenarGanchos(ganchos.split("\n")), [ganchos]);
  const rt = useMemo(() => ordenarTitulos(titulos.split("\n"), miniatura.trim() || undefined), [titulos, miniatura]);
  const cues = useMemo(() => { try { return trans.trim() ? parseTranscript(trans) : []; } catch { return []; } }, [trans]);
  const ed = useMemo(() => (cues.length ? listaEdicion(cues) : null), [cues]);
  const cap = useMemo(() => (cues.length ? capitulos(cues) : null), [cues]);
  const ret = useMemo(() => { try { return csv.trim() ? analizarRetencion(csv, { duration: Number(dur) || undefined, cues: cues.length ? cues : undefined }) : null; } catch { return null; } }, [csv, dur, cues]);
  const at = useMemo(() => {
    const rows = filas.split("\n").map((l) => l.split(/\t|;|\|/).map((x) => x.trim())).filter((r) => r.length >= 3).map((r) => ({ channel: r[0], title: r[1], views: Number(r[2].replace(/[^\d.]/g, "")) || 0 }));
    return rows.length ? atipicos(rows) : null;
  }, [filas]);

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px 80px" }}>
      <h1 style={{ fontSize: 30, margin: 0 }}>YouTube Studio</h1>
      <p style={{ color: "#475569" }}>Herramientas para preparar tus vídeos. Todo se calcula en tu navegador con reglas fijas: no se sube nada, no se publica nada y no se conecta con tu cuenta de YouTube. Las puntuaciones son una guía de revisión, no una predicción de visitas.</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
        {TABS.map((t) => <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid #cbd5e1", background: tab === t ? "#0f2a4a" : "#fff", color: tab === t ? "#fff" : "#0f2a4a", cursor: "pointer" }}>{t}</button>)}
      </div>

      {tab === "Ganchos" && <section style={card}>
        <h2 style={{ marginTop: 0 }}>Puntúa tus ganchos</h2>
        <p>Una frase de apertura por línea. Mide concreción, a quién habla, qué se juega, curiosidad y brevedad. La clasificación de fórmula usa vocabulario en inglés, así que en español puede salir «sin fórmula» aunque el gancho sea bueno.</p>
        <textarea style={ta} value={ganchos} onChange={(e) => setGanchos(e.target.value)} placeholder="Perdí 4.000 € en mi primer año de bar y esto es lo que cambié" />
        {rg.map((g, i) => <div key={i} style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8, marginTop: 8 }}>
          <b style={{ color: col(g.verdict) }}>{g.verdict}/100 · {g.band}</b> — {g.hook}
          <div style={{ fontSize: 13, color: "#475569" }}>{Object.entries(g.properties).map(([k, v]) => `${k} ${v}`).join(" · ")}</div>
          <div style={{ fontSize: 13 }}>Punto débil: {g.weakest}. {g.fix}</div>
        </div>)}
      </section>}

      {tab === "Títulos" && <section style={card}>
        <h2 style={{ marginTop: 0 }}>Revisa títulos y miniatura</h2>
        <p>Un título por línea. Opcional: el texto de la miniatura, para evitar repetirlo.</p>
        <input style={{ ...ta, minHeight: 0 }} value={miniatura} onChange={(e) => setMiniatura(e.target.value)} placeholder="Texto de la miniatura (opcional)" />
        <textarea style={{ ...ta, marginTop: 8 }} value={titulos} onChange={(e) => setTitulos(e.target.value)} placeholder="Cómo lancé mi proyecto sin presupuesto" />
        {rt.map((t, i) => <div key={i} style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8, marginTop: 8 }}>
          <b style={{ color: col(t.score) }}>{t.score}/100</b> — {t.title} <span style={{ color: "#64748b" }}>({t.chars} caracteres)</span>
          {t.issues.map((x, j) => <div key={j} style={{ fontSize: 13, color: "#b45309" }}>⚠ {x.mensaje}</div>)}
          {t.good.map((x, j) => <div key={j} style={{ fontSize: 13, color: "#15803d" }}>✓ {x}</div>)}
        </div>)}
      </section>}

      {(tab === "Edición" || tab === "Capítulos") && <section style={card}>
        <h2 style={{ marginTop: 0 }}>{tab === "Edición" ? "Lista de cortes" : "Capítulos"} desde tu transcripción</h2>
        <p>Pega el contenido de un archivo SRT, VTT o JSON de Whisper. Se queda en tu navegador.</p>
        <textarea style={ta} value={trans} onChange={(e) => setTrans(e.target.value)} placeholder="1&#10;00:00:00,000 --> 00:00:03,000&#10;Hola a todos…" />
        {trans.trim() && !cues.length && <p style={{ color: "#b91c1c" }}>No he podido leer ningún subtítulo con ese formato.</p>}
        {tab === "Edición" && ed && <div>
          <p><b>{ed.cuts.length} cortes propuestos</b> · se quitan {Math.round(ed.removed)} s de {Math.round(ed.duration)} s (quedan {Math.round(ed.out)} s). Revísalos antes de aplicarlos en tu editor.</p>
          {ed.cuts.map((c, i) => <div key={i} style={{ fontSize: 14 }}>{mmss(c.start)}–{mmss(c.end)} · {c.kind} · {c.why}</div>)}
        </div>}
        {tab === "Capítulos" && cap && (cap.valid ? <div>
          <pre style={{ background: "#f1f5f9", padding: 10, borderRadius: 10, whiteSpace: "pre-wrap" }}>{bloqueCapitulos(cap)}</pre>
          <Copiar texto={bloqueCapitulos(cap)} />
          <p style={{ fontSize: 13, color: "#475569" }}>Los nombres son borradores sacados de las palabras más repetidas: ponles tú el título final. YouTube exige empezar en 0:00, al menos 3 capítulos y 10 s cada uno.</p>
        </div> : <p>No salen capítulos válidos: {cap.motivo}</p>)}
      </section>}

      {tab === "Retención" && <section style={card}>
        <h2 style={{ marginTop: 0 }}>Lee tu curva de retención</h2>
        <p>Exporta de YouTube Studio la curva de retención del vídeo (CSV con tiempo y porcentaje) y pégala. Opcional: duración en segundos y, en la pestaña Edición, la transcripción para ver qué decías en cada caída.</p>
        <input style={{ ...ta, minHeight: 0, marginBottom: 8 }} value={dur} onChange={(e) => setDur(e.target.value)} placeholder="Duración en segundos (opcional)" inputMode="numeric" />
        <textarea style={ta} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="0,100&#10;10,82&#10;20,70…" />
        {csv.trim() && !ret && <p style={{ color: "#b91c1c" }}>No he podido leer esa curva.</p>}
        {ret && <div>
          <p><b>Veredicto: {ret.veredicto}</b> · fuga en el arranque: {ret.hook_leak} puntos.</p>
          {ret.cliffs.map((c, i) => <div key={i} style={{ fontSize: 14 }}>Caída de {c.lost.toFixed(1)} puntos ({c.from}→{c.to}){c.at_seconds != null ? ` · hacia ${mmss(c.at_seconds)}` : ""}{ret.said[String(c.from)] ? ` · decías: «${ret.said[String(c.from)]}»` : ""}</div>)}
        </div>}
      </section>}

      {tab === "Atípicos" && <section style={card}>
        <h2 style={{ marginTop: 0 }}>Vídeos que rinden por encima de lo normal</h2>
        <p>Una línea por vídeo: canal ; título ; visitas. Pega datos que hayas copiado tú; no se consulta YouTube. Cuenta cuántas veces supera cada vídeo la mediana de su propio canal (hacen falta 4 vídeos por canal).</p>
        <textarea style={ta} value={filas} onChange={(e) => setFilas(e.target.value)} placeholder="Canal A ; Título del vídeo ; 120000" />
        {at && (at.outliers.length ? at.outliers.map((o, i) => <div key={i} style={{ borderTop: "1px solid #e2e8f0", paddingTop: 6, marginTop: 6 }}><b>{o.multiple.toFixed(1)}×</b> {o.channel} — {o.title} ({o.views.toLocaleString("es-ES")} vs mediana {Math.round(o.median).toLocaleString("es-ES")})</div>) : <p>Ningún vídeo destaca con estos datos.</p>)}
      </section>}

      {tab === "Mi canal" && <section style={card}>
        <h2 style={{ marginTop: 0 }}>Ficha de tu canal</h2>
        <p>Se guarda solo en este navegador (no en nuestros servidores). Copia el resumen y úsalo como contexto cuando pidas ayuda a un asistente.</p>
        {([["nombre", "Nombre del canal"], ["nicho", "Tema y público"], ["voz", "Cómo hablas (tono, expresiones)"], ["prohibido", "Qué nunca dirías"], ["notas", "Notas"]] as const).map(([k, l]) => <label key={k} style={{ display: "block", marginTop: 8 }}>{l}<textarea style={{ ...ta, minHeight: 56 }} value={canal[k]} onChange={(e) => guardarCanal({ ...canal, [k]: e.target.value })} /></label>)}
        <div style={{ marginTop: 10 }}><Copiar texto={Object.entries(canal).map(([k, v]) => `${k}: ${v}`).join("\n")} /></div>
      </section>}

      <section style={{ ...card, background: "#f8fafc" }}>
        <b>Qué es y qué no es</b>
        <p style={{ marginBottom: 0 }}>Los agentes de IA de YouTube (guion, títulos, arte, Shorts, SEO…) existen en la oficina virtual y trabajan con aprobación humana; aquí solo ofrecemos las herramientas de cálculo. No hay conexión con YouTube, ni publicación automática, ni métricas simuladas. Basado en <a href="https://github.com/Jakeschincariol/youtube-agent-skill">youtube-agent-skill</a> (licencia MIT, Jake Schincariol).</p>
      </section>
    </main>
  );
}
