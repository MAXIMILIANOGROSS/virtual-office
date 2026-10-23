"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
type C = { agente: string; task_id: string | null; modelo: string; llamadas: number; tokens_entrada: number | null; tokens_salida: number | null; coste_eur: number | null; coste_origen: string; estado: string; created_at: string };
const c = { mut: "#A9B8E0", bad: "#F87171", warn: "#FCD34D" };
/** Libro de costes de IA. Tokens ESTIMADOS (los proveedores gratuitos no los devuelven); el coste en € solo existe si hay tarifa registrada. */
export default function CostesTab() {
  const [f, setF] = useState<C[] | null>(null); const [err, setErr] = useState("");
  useEffect(() => { (async () => {
    const { data, error } = await supabase.from("office_costes").select("agente,task_id,modelo,llamadas,tokens_entrada,tokens_salida,coste_eur,coste_origen,estado,created_at").gte("created_at", new Date(Date.now() - 31 * 86400000).toISOString()).order("created_at", { ascending: false }).limit(500);
    if (error) setErr(/does not exist|relation|schema cache/i.test(error.message) ? "Falta ejecutar el SQL 100 (costes)." : error.message); else setF((data as C[]) || []);
  })(); }, []);
  if (err) return <div style={{ color: c.bad, fontSize: 12.5 }}>{err}</div>;
  if (!f) return null;
  if (!f.length) return <i style={{ color: c.mut, fontSize: 12.5 }}>Aún no hay costes registrados (se anotan cuando el ciclo ejecuta tareas).</i>;
  const por = new Map<string, { n: number; tin: number; tout: number; eur: number; sinTarifa: boolean; fallos: number }>();
  for (const x of f) { const m = por.get(x.agente) ?? { n: 0, tin: 0, tout: 0, eur: 0, sinTarifa: false, fallos: 0 }; m.n += x.llamadas; m.tin += x.tokens_entrada || 0; m.tout += x.tokens_salida || 0; m.eur += x.coste_eur || 0; if (x.coste_origen === "sin_tarifa") m.sinTarifa = true; if (x.estado === "fallo") m.fallos++; por.set(x.agente, m); }
  const tot = f.reduce((n, x) => n + (x.coste_eur || 0), 0);
  return <div style={{ display: "grid", gap: 4, fontSize: 12.5, marginTop: 6 }}>
    <div style={{ color: c.warn }}>Últimos 31 días · tokens estimados (≈4 caracteres/token) · {tot > 0 ? `coste estimado ${tot.toFixed(4)} €` : "sin tarifa registrada: coste en € no calculado"}</div>
    {Array.from(por.entries()).sort((a, b) => b[1].n - a[1].n).map(([ag, m]) => <div key={ag}><b>{ag}</b> · {m.n} llamadas · ~{m.tin + m.tout} tokens{m.eur > 0 ? ` · ${m.eur.toFixed(4)} €` : ""}{m.fallos ? ` · ${m.fallos} fallidas` : ""}</div>)}
  </div>;
}
