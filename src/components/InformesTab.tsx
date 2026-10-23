"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
type Inf = { id: string; fecha: string; contenido: string; origen: string; created_at: string };
const c = { card: "#FFFDF7", line: "#07182E", gold: "#FFD600", txt: "#07182E", mut: "#5A6B7F", bg: "#FFFDF7", bad: "#C0392B" };
/** Historial del informe diario del CEO. Se genera solo con registros reales; aquí puedes regenerar el de hoy. */
export default function InformesTab() {
  const [l, setL] = useState<Inf[]>([]); const [sel, setSel] = useState<string | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("office_informes").select("id,fecha,contenido,origen,created_at").order("fecha", { ascending: false }).limit(30);
    if (error) setErr(/does not exist|relation|schema cache/i.test(error.message) ? "Falta ejecutar el SQL 101 (informes)." : error.message); else { setErr(""); setL((data as Inf[]) || []); setSel((s) => s ?? (data as Inf[])?.[0]?.id ?? null); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  async function generar() {
    setBusy(true); const tk = (await supabase.auth.getSession()).data.session?.access_token || "";
    const r = await fetch("/api/oficina/informe", { method: "POST", headers: { Authorization: `Bearer ${tk}` } }); const j = await r.json().catch(() => null);
    setBusy(false); if (!j?.ok) { setErr(j?.error || "No se pudo generar."); return; } setSel(null); await cargar();
  }
  const actual = l.find((x) => x.id === sel);
  return (
    <section style={{ background: c.card, border: `2px solid ${c.line}`, borderRadius: 16, padding: 14, color: c.txt, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ fontSize: 18 }}>📰 Informe diario del CEO</b>
        <button type="button" disabled={busy} aria-busy={busy} onClick={generar} style={{ background: c.gold, color: "#07182E", fontWeight: 800, border: 0, borderRadius: 10, padding: "8px 14px", cursor: "pointer" }}>{busy ? "Generando…" : "Generar informe de hoy"}</button>
      </div>
      <div style={{ fontSize: 12.5, color: c.mut }}>Se construye solo con registros reales (tareas, entregables, costes y ciclos). No usa IA y no inventa ingresos, clientes ni oportunidades. El envío por email no está activado: no hay proveedor de correo conectado.</div>
      {err && <div role="alert" style={{ color: c.bad, fontSize: 13 }}>{err}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{l.map((x) => <button key={x.id} type="button" onClick={() => setSel(x.id)} style={{ background: sel === x.id ? "#1D5FD0" : "transparent", color: "#fff", border: `2px solid ${c.line}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 12.5 }}>{x.fecha}</button>)}</div>
      {!l.length && !err && <i style={{ color: c.mut, fontSize: 13 }}>Aún no hay informes. Pulsa «Generar informe de hoy».</i>}
      {actual && <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, background: c.bg, borderRadius: 8, padding: 12, margin: 0 }}>{actual.contenido}</pre>}
    </section>
  );
}
