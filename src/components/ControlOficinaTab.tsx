"use client";
import { confirmar } from "@/lib/confirmar";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import CostesTab from "@/components/CostesTab";
import { ETIQUETA_ESTADO, type Alerta, type EstadoOficina } from "@/lib/oficina/salud";

const c = { card: "#FFFDF7", line: "#07182E", gold: "#FFD600", txt: "#07182E", mut: "#5A6B7F", bad: "#C0392B", warn: "#B7791F", ok: "#2E8B57" };
const COL: Record<EstadoOficina, string> = { operativo: c.ok, degradado: c.warn, detenido: c.bad, requiere_configuracion: c.warn };
type Ciclo = { inicio: string; fin: string | null; origen: string; resultado: string | null; ejecutadas: number; fallos: number; error: string | null };
type Salud = { ok: boolean; estado: EstadoOficina; alertas: Alerta[]; minutosDesdeCiclo: number | null; detenida: boolean; motivo: string | null; desde: string | null; tablaControl: boolean; ciclos: Ciclo[]; historial: { at: string; accion: string; motivo: string | null }[]; tareas: Record<string, number>; presupuesto: { usado: number; limite: number }; error?: string };

/** Panel de salud y freno de emergencia. Los datos vienen del servidor (ciclos persistidos), no de suposiciones. */
export default function ControlOficinaTab({ onCambio }: { onCambio?: (detenida: boolean) => void }) {
  const [s, setS] = useState<Salud | null>(null); const [err, setErr] = useState(""); const [motivo, setMotivo] = useState(""); const [busy, setBusy] = useState(false); const [aviso, setAviso] = useState("");
  const tok = async () => (await supabase.auth.getSession()).data.session?.access_token || "";
  const cargar = useCallback(async () => {
    const r = await fetch("/api/oficina/control", { headers: { Authorization: `Bearer ${await tok()}` } }); const j = await r.json().catch(() => null);
    if (!j?.ok) { setErr(j?.error || "No se pudo leer la salud."); return; } setErr(""); setS(j); onCambio?.(j.detenida);
  }, [onCambio]);
  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, [cargar]);
  async function actuar(tipo: "detener" | "reanudar", yaConfirmado = false): Promise<void> {
    if (tipo === "reanudar" && !yaConfirmado && !await confirmar("¿Reanudar la oficina? Las tareas pendientes volverán a ejecutarse en el próximo ciclo.")) return;
    setBusy(true); setAviso("");
    const r = await fetch("/api/oficina/control", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await tok()}` }, body: JSON.stringify({ accion: tipo, motivo, confirmar: yaConfirmado }) }); const j = await r.json().catch(() => null);
    if (j?.necesitaConfirmar && await confirmar(j.error + "\n\n¿Reanudar igualmente?")) { setBusy(false); return actuar("reanudar", true); }
    setAviso(j?.ok ? (tipo === "detener" ? "Oficina detenida." : "Oficina reanudada.") : j?.error || "Error"); setMotivo(""); setBusy(false); cargar();
  }
  const hora = (x: string | null) => (x ? new Date(x).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—");
  return (
    <section style={{ background: c.card, border: `2px solid ${c.line}`, borderRadius: 16, padding: 14, color: c.txt, display: "grid", gap: 12 }}>
      <b style={{ fontSize: 18 }}>🛡️ Control y salud</b>
      {err && <div role="alert" style={{ color: c.bad, fontSize: 13 }}>{err}</div>}
      {s && <>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ background: COL[s.estado], color: "#FFFDF7", fontWeight: 800, borderRadius: 999, padding: "4px 12px" }}>{ETIQUETA_ESTADO[s.estado]}</span>
          <span style={{ fontSize: 13, color: c.mut }}>Último ciclo: {s.minutosDesdeCiclo == null ? "ninguno registrado" : `hace ${s.minutosDesdeCiclo} min`} · Pendientes {s.tareas.pendientes} · En curso {s.tareas.enCurso} · Bloqueadas {s.tareas.bloqueadas} · Fallidas {s.tareas.fallidas} · IA hoy {s.presupuesto.usado}/{s.presupuesto.limite}</span>
        </div>
        {s.alertas.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: "grid", gap: 4 }}>{s.alertas.map((a, i) => <li key={i} style={{ color: a.nivel === "critica" ? c.bad : c.warn }}>{a.texto}</li>)}</ul>}
        <div style={{ display: "grid", gap: 8, border: `1px solid ${s.detenida ? c.bad : c.line}`, borderRadius: 12, padding: 12 }}>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" maxLength={300} style={{ background: "#FFFDF7", color: c.txt, border: `2px solid ${c.line}`, borderRadius: 8, padding: 8 }} />
          {s.detenida
            ? <button disabled={busy} aria-busy={busy} onClick={() => actuar("reanudar")} style={{ background: c.ok, color: "#FFFDF7", fontWeight: 800, border: 0, borderRadius: 10, padding: "12px 16px", cursor: "pointer" }}>▶ Reanudar oficina</button>
            : <button disabled={busy || !s.tablaControl} onClick={() => actuar("detener")} style={{ background: "#DC2626", color: "#fff", fontWeight: 800, border: 0, borderRadius: 10, padding: "12px 16px", cursor: "pointer" }}>⛔ DETENER OFICINA</button>}
          <div style={{ fontSize: 12, color: c.mut }}>Al detener: no se inicia ninguna tarea nueva, las pendientes quedan bloqueadas por la parada y las que ya estaban en curso se dejan terminar. Reanudar las devuelve a la cola.</div>
          {aviso && <div style={{ fontSize: 13, color: "#07182E" }}>{aviso}</div>}
        </div>
        <details><summary style={{ cursor: "pointer", fontWeight: 700 }}>Últimos ciclos</summary>
          <div style={{ display: "grid", gap: 4, fontSize: 12.5, marginTop: 6 }}>{s.ciclos.length === 0 ? <i style={{ color: c.mut }}>Sin ciclos registrados todavía.</i> : s.ciclos.map((x, i) => <div key={i}>{hora(x.inicio)} · {x.origen} · <b style={{ color: x.resultado === "ok" ? c.ok : x.resultado === "error" ? c.bad : c.warn }}>{x.resultado || "en marcha"}</b> · ejecutadas {x.ejecutadas ?? 0} · fallos {x.fallos ?? 0}{x.error ? ` · ${x.error}` : ""}</div>)}</div></details>
        <details><summary style={{ cursor: "pointer", fontWeight: 700 }}>Costes de IA (estimados)</summary><CostesTab /></details>
        <details><summary style={{ cursor: "pointer", fontWeight: 700 }}>Historial de paradas</summary>
          <div style={{ display: "grid", gap: 4, fontSize: 12.5, marginTop: 6 }}>{s.historial.length === 0 ? <i style={{ color: c.mut }}>Sin paradas.</i> : s.historial.map((h, i) => <div key={i}>{hora(h.at)} · <b>{h.accion}</b> {h.motivo ? `· ${h.motivo}` : ""}</div>)}</div></details>
      </>}
    </section>
  );
}
