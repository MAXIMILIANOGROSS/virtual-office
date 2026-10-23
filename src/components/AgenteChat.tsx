"use client";
import { useEffect, useRef, useState } from "react";
import { AGENTES, AREAS } from "@/lib/oficina/agentes";
import { NOMBRE_PROPIO } from "@/lib/oficina/nombresPropios";
import { supabase } from "@/lib/supabaseClient";
import type { MsgChat } from "@/lib/oficina/chat";
import { elegirVoz, IDIOMAS, textoParaVoz, type Genero, type Idioma } from "@/lib/voz";

const col = { bg: "#07182E", card: "#0B2A5B", line: "#2A5CAA", gold: "#FFD600", txt: "#F4F8FF", mut: "#A9C1E8" };
/** Renderizado mínimo: **negrita**, títulos # y listas con guion (sin HTML crudo). */
function Md({ t }: { t: string }) {
  const linea = (l: string, k: number) => {
    const h = l.match(/^\s*#{1,4}\s+(.*)$/); const li = l.match(/^\s*[-*]\s+(.*)$/); const cuerpo = h ? h[1] : li ? li[1] : l;
    const partes = cuerpo.split(/(\*\*[^*]+\*\*)/g).map((x, i) => (x.startsWith("**") && x.endsWith("**") && x.length > 4 ? <b key={i}>{x.slice(2, -2)}</b> : x.replace(/\*\*/g, "")));
    if (/^\s*-{3,}\s*$/.test(l)) return <hr key={k} style={{ border: 0, borderTop: "1px solid #2A5CAA", margin: "6px 0" }} />;
    return <div key={k} style={{ fontWeight: h ? 800 : 400, marginTop: h ? 6 : 0, paddingLeft: li ? 12 : 0, textIndent: li ? -12 : 0 }}>{li ? "• " : ""}{partes}</div>;
  };
  return <>{t.split("\n").map(linea)}</>;
}
const HIST = new Map<string, MsgChat[]>(); // el historial vive mientras la pestaña esté abierta

/** Ventana con la foto de la cabra y un chat directo con ese agente (responde desde su puesto). */
export default function AgenteChat({ id, estado, tarea, onClose }: { id: string; estado: string; tarea?: string; onClose: () => void }) {
  const ag = AGENTES.find((x) => x.id === id);
  const [msgs, setMsgs] = useState<MsgChat[]>(() => HIST.get(id) || []);
  const [okT, setOkT] = useState(""); const [txt, setTxt] = useState(""); const [env, setEnv] = useState(false); const [err, setErr] = useState("");
  const fin = useRef<HTMLDivElement>(null);
  const [leer, setLeer] = useState(false); const [idi, setIdi] = useState<Idioma>("es"); const [gen, setGen] = useState<Genero>("mujer"); const [aviso, setAviso] = useState(""); const [oyendo, setOyendo] = useState(false);
  const reco = useRef<{ stop: () => void } | null>(null);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem("ic_voz") || "{}"); if (v.idi) setIdi(v.idi); if (v.gen) setGen(v.gen); if (v.leer) setLeer(true); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("ic_voz", JSON.stringify({ idi, gen, leer })); } catch {} }, [idi, gen, leer]);
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); reco.current?.stop(); } catch {} }, []);
  function hablar(t: string) {
    try {
      const ss = window.speechSynthesis; if (!ss) { setAviso("Tu navegador no tiene voz integrada."); return; }
      ss.cancel(); const { voz, exacta } = elegirVoz(ss.getVoices(), idi, gen);
      const u = new SpeechSynthesisUtterance(textoParaVoz(t)); u.lang = IDIOMAS[idi].bcp; if (voz) u.voice = voz; u.rate = 1;
      setAviso(!voz ? `No hay voz instalada en ${IDIOMAS[idi].etiqueta} en este dispositivo.` : exacta ? "" : `Voz ${gen === "mujer" ? "femenina" : "masculina"} no disponible aquí: usando ${voz.name}.`);
      ss.speak(u);
    } catch { setAviso("No se pudo reproducir la voz."); }
  }
  function dictar() {
    try {
      if (oyendo) { reco.current?.stop(); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const W = window as any; const SR = W.SpeechRecognition || W.webkitSpeechRecognition; if (!SR) { setAviso("Dictado no disponible en este navegador (prueba Chrome o Safari)."); return; }
      const r = new SR(); r.lang = IDIOMAS[idi].bcp; r.interimResults = false; r.continuous = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r.onresult = (e: any) => { const t = String(e.results?.[0]?.[0]?.transcript || "").trim(); if (t) setTxt((x) => (x ? x + " " : "") + t); };
      r.onerror = () => setAviso("No se pudo usar el micrófono (revisa el permiso)."); r.onend = () => setOyendo(false);
      reco.current = r; setOyendo(true); setAviso(""); r.start();
    } catch { setAviso("No se pudo iniciar el dictado."); setOyendo(false); }
  }
  useEffect(() => { setMsgs(HIST.get(id) || []); setErr(""); setTxt(""); }, [id]);
  useEffect(() => { fin.current?.scrollIntoView({ block: "end" }); }, [msgs, env]);
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [onClose]);
  if (!ag) return null;
  const propio = NOMBRE_PROPIO[ag.id] || ag.nombre;

  async function enviar(t: string) {
    const q = t.trim(); if (!q || env || !ag) return;
    const nuevos: MsgChat[] = [...msgs, { role: "user", content: q }]; setMsgs(nuevos); HIST.set(ag.id, nuevos); setTxt(""); setEnv(true); setErr("");
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch("/api/oficina/chat", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.session?.access_token || ""}` }, body: JSON.stringify({ agente: ag.id, mensajes: nuevos }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) { const m2: MsgChat[] = [...nuevos, { role: "assistant", content: j.respuesta }]; setMsgs(m2); HIST.set(ag.id, m2); if (leer) hablar(j.respuesta); } else setErr(j.error || "No se pudo responder.");
    } catch { setErr("Sin conexión con el servidor."); }
    setEnv(false);
  }
  async function aTarea() {
    if (!ag || env || !msgs.length) return;
    setEnv(true); setErr(""); setOkT("");
    try {
      const { data: s } = await supabase.auth.getSession();
      const resumen = msgs.slice(-8).map((m) => (m.role === "user" ? "CEO: " : `${propio}: `) + m.content).join("\n");
      const instruccion = `Continúa y ejecuta lo hablado en el chat con ${propio}. Conversación:\n${resumen}`.slice(0, 1800);
      const r = await fetch("/api/oficina/ejecutar", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.session?.access_token || ""}` }, body: JSON.stringify({ instruccion, cola: true, agente: ag.id }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) setOkT("Tarea creada: la ejecutará el ciclo y la verás en Tareas."); else setErr(j.error || "No se pudo crear la tarea.");
    } catch { setErr("Sin conexión con el servidor."); }
    setEnv(false);
  }
  const sugerencias = [`¿Qué estrategia propones desde ${AREAS[ag.area].nombre}?`, "¿Cuál es la prioridad esta semana?", "¿Qué necesitas de mí?"];

  return (
    <div role="dialog" aria-modal="true" aria-label={`Chat con ${propio}`} onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(3,10,24,.72)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <style>{`.acm{display:grid;grid-template-columns:240px minmax(0,1fr);grid-template-rows:minmax(0,1fr)}@media (max-width:700px){.acm{grid-template-columns:minmax(0,1fr)}.aca{display:none!important}}`}</style>
      <div className="acm" onClick={(e) => e.stopPropagation()} style={{ width: "min(860px,100%)", height: "min(640px,calc(100dvh - 24px))", maxHeight: "calc(100vh - 24px)", background: col.bg, border: `2px solid ${col.gold}`, borderRadius: 16, overflow: "hidden", color: col.txt }}>
        <aside className="aca" style={{ minHeight: 0, background: col.card, padding: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center", overflowY: "auto" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cabra360/cabra-2.webp" alt={propio} width={150} height={180} style={{ objectFit: "contain", background: "#07182E", border: `1px solid ${col.line}`, borderRadius: 12, width: 150, height: 180 }} />
          <div style={{ fontWeight: 800, fontSize: 18 }}>{propio}</div>
          <div style={{ fontSize: 12, color: col.gold }}>{ag.nombre}{ag.jefe ? " ★" : ""}</div>
          <div style={{ fontSize: 12, color: col.mut }}>{ag.rol}</div>
          <div style={{ fontSize: 12, color: col.mut }}>{AREAS[ag.area].nombre}</div>
          <div style={{ fontSize: 12, marginTop: 6 }}><b>Ahora:</b> {estado}{tarea ? ` · ${tarea.slice(0, 80)}` : ""}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}><b>Ficha técnica:</b> {ag.habilidades.join(" · ")}</div>
          <p style={{ fontSize: 10.5, color: col.mut, marginTop: "auto" }}>Perfil de IA con instrucciones propias (no una persona). Solo conversa y propone: para que ejecute algo, dalo como orden en el Panel.</p>
        </aside>
        <section style={{ minWidth: 0, minHeight: 0, height: "100%", display: "flex", flexDirection: "column" }}>
          <header style={{ flex: "0 0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${col.line}` }}>
            <b>Chat con {propio}</b>
            <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: "transparent", color: col.txt, border: `1px solid ${col.line}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>✕</button>
          </header>
          <div style={{ flex: "0 0 auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "6px 12px", borderBottom: `1px solid ${col.line}`, fontSize: 12 }}>
            <button type="button" onClick={() => { if (leer) window.speechSynthesis?.cancel(); setLeer(!leer); }} aria-pressed={leer} style={{ background: leer ? col.gold : "#13294D", color: leer ? "#07182E" : col.txt, border: `1px solid ${col.line}`, borderRadius: 8, padding: "3px 9px", cursor: "pointer" }}>{leer ? "🔊 Voz activada" : "🔇 Voz apagada"}</button>
            <select value={idi} onChange={(e) => setIdi(e.target.value as Idioma)} aria-label="Idioma" style={{ background: "#07182E", color: col.txt, border: `1px solid ${col.line}`, borderRadius: 8, padding: "3px 6px" }}>{(Object.keys(IDIOMAS) as Idioma[]).map((k) => <option key={k} value={k}>{IDIOMAS[k].etiqueta}</option>)}</select>
            <select value={gen} onChange={(e) => setGen(e.target.value as Genero)} aria-label="Tipo de voz" style={{ background: "#07182E", color: col.txt, border: `1px solid ${col.line}`, borderRadius: 8, padding: "3px 6px" }}><option value="mujer">Voz de mujer</option><option value="hombre">Voz de hombre</option></select>
            {msgs.length > 0 && <button type="button" onClick={() => hablar(msgs.filter((m) => m.role === "assistant").slice(-1)[0]?.content || "")} style={{ background: "#13294D", color: col.txt, border: `1px solid ${col.line}`, borderRadius: 8, padding: "3px 9px", cursor: "pointer" }}>▶ Escuchar última</button>}
            {aviso && <span role="status" style={{ color: "#FCD34D" }}>{aviso}</span>}
          </div>
          <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", padding: 14, display: "grid", gap: 8, alignContent: "start" }}>
            {!msgs.length && <div style={{ color: col.mut, fontSize: 13 }}>Pregúntame lo que quieras desde mi puesto: {ag.rol.toLowerCase()}.<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{sugerencias.map((s) => <button key={s} type="button" onClick={() => enviar(s)} style={{ background: "#13294D", color: col.txt, border: `1px solid ${col.line}`, borderRadius: 999, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}>{s}</button>)}</div></div>}
            {msgs.map((m, i) => <div key={i} style={{ justifySelf: m.role === "user" ? "end" : "start", maxWidth: "88%", background: m.role === "user" ? "#1E4FA3" : col.card, border: `1px solid ${col.line}`, borderRadius: 12, padding: "8px 11px", fontSize: 13.5, lineHeight: 1.45, overflowWrap: "anywhere" }}>{m.role === "assistant" ? <Md t={m.content} /> : m.content}</div>)}
            {env && <div style={{ color: col.mut, fontSize: 12 }}>{propio} está pensando…</div>}
            {err && <div role="alert" style={{ color: "#FCA5A5", fontSize: 12.5 }}>{err}</div>}
            <div ref={fin} />
          </div>
          {okT && <div style={{ padding: "6px 12px", fontSize: 12, color: "#7CE0A0" }}>{okT}</div>}
          <form onSubmit={(e) => { e.preventDefault(); enviar(txt); }} style={{ flex: "0 0 auto", display: "flex", gap: 8, padding: 10, borderTop: `1px solid ${col.line}` }}>
            <input value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={2000} placeholder={`Escribe a ${propio}…`} aria-label="Mensaje" style={{ flex: 1, background: "#07182E", color: col.txt, border: `1px solid ${col.line}`, borderRadius: 10, padding: "9px 12px", fontSize: 14 }} />
            <button type="button" onClick={dictar} aria-label="Dictar por voz" aria-pressed={oyendo} style={{ background: oyendo ? "#DC2626" : "#13294D", color: col.txt, border: `1px solid ${col.line}`, borderRadius: 10, padding: "0 12px", cursor: "pointer" }}>{oyendo ? "⏹" : "🎤"}</button>
            <button type="submit" disabled={env || !txt.trim()} style={{ background: col.gold, color: "#07182E", fontWeight: 800, border: 0, borderRadius: 10, padding: "0 16px", cursor: env ? "wait" : "pointer", opacity: env || !txt.trim() ? 0.6 : 1 }}>Enviar</button>
          <button type="button" onClick={aTarea} disabled={env || !msgs.length} style={{ background: col.gold, color: "#0B1730", border: 0, borderRadius: 10, padding: "0 12px", fontWeight: 700, cursor: "pointer", opacity: env || !msgs.length ? .5 : 1 }}>Convertir en tarea</button></form>
        </section>
      </div>
    </div>
  );
}
