"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { OPERACIONES, resumenUso, type Evento, type Limite } from "@/lib/oficina/cuotaLib";

const c = { card: "#FFFDF7", line: "#07182E", gold: "#FFD600", txt: "#07182E", mut: "#5A6B7F", bg: "#FFFDF7", bad: "#C0392B", warn: "#B7791F", ok: "#2E8B57", blue: "#1D5FD0" };

/** Consumo y límites del mes. Los datos vienen del libro del servidor (SQL 97); aquí solo se muestran. */
export default function ConsumoTab() {
  const [lim, setLim] = useState<Limite[]>([]); const [ev, setEv] = useState<Evento[]>([]); const [plan, setPlan] = useState("interno"); const [err, setErr] = useState(""); const [ok, setOk] = useState(false);
  useEffect(() => { (async () => {
    const { data: u } = await supabase.auth.getUser(); const uid = u.user?.id; if (!uid) return;
    const { data: pl } = await supabase.from("owner_plan").select("plan").eq("owner", uid).maybeSingle(); const p = pl?.plan || "interno"; setPlan(p);
    const [l, e] = await Promise.all([
      supabase.from("plan_limits").select("operacion,limite,periodo,coste_unidad").eq("plan", p),
      supabase.from("usage_events").select("id,operacion,unidades,coste_estimado,estado,created_at").gte("created_at", new Date(Date.now() - 40 * 86400000).toISOString()).order("created_at", { ascending: false }).limit(500),
    ]);
    const er = l.error || e.error; if (er) { setErr(/does not exist|relation|schema cache/i.test(er.message) ? "Falta ejecutar el SQL 97 (cuotas y consumo) en Supabase." : er.message); return; }
    setLim((l.data as Limite[]) || []); setEv((e.data as Evento[]) || []); setOk(true);
  })(); }, []);
  const res = resumenUso(lim, ev);
  return (
    <section style={{ background: c.card, border: `2px solid ${c.line}`, borderRadius: 16, padding: 14, color: c.txt, display: "grid", gap: 12 }}>
      <div><b style={{ fontSize: 18 }}>Consumo y límites</b><div style={{ fontSize: 12.5, color: c.mut }}>Plan: <b style={{ color: "#07182E" }}>{plan}</b> · Los límites se aplican en el servidor y se editan en la tabla <code>plan_limits</code>. Si una operación falla, las unidades se devuelven.</div></div>
      {err && <div role="alert" style={{ color: c.bad, fontSize: 13 }}>{err}</div>}
      {ok && !res.length && <div style={{ color: c.warn, fontSize: 13 }}>Tu plan no tiene límites definidos todavía.</div>}
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        {res.map((r) => { const color = r.nivel === "limite" ? c.bad : r.nivel === "aviso" ? c.warn : c.ok; return (
          <div key={r.operacion} style={{ background: c.bg, border: `2px solid ${c.line}`, borderRadius: 12, padding: 10 }}>
            <div style={{ fontSize: 13 }}>{OPERACIONES[r.operacion] || r.operacion}</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{r.usado}<span style={{ fontSize: 14, color: c.mut }}> / {r.limite} {r.periodo === "dia" ? "hoy" : "este mes"}</span></div>
            <div role="progressbar" aria-valuenow={r.pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 8, background: "#FFFDF7", borderRadius: 4, overflow: "hidden", marginTop: 4 }}><div style={{ width: `${r.pct}%`, height: "100%", background: color }} /></div>
            <div style={{ fontSize: 12, color, marginTop: 4 }}>{r.nivel === "limite" ? "Límite alcanzado: no se pueden hacer más hasta el siguiente periodo." : r.nivel === "aviso" ? `Te quedan ${r.restante}: te acercas al límite.` : `Te quedan ${r.restante}.`}{r.coste != null ? ` · Coste estimado: ${r.coste.toFixed(2)}` : ""}</div>
          </div>); })}
      </div>
      <div>
        <b style={{ fontSize: 14 }}>Últimos movimientos</b>
        {!ev.length && ok && <div style={{ fontSize: 12.5, color: c.mut, marginTop: 4 }}>Aún no hay consumo registrado.</div>}
        <div style={{ display: "grid", gap: 3, marginTop: 6, fontSize: 12.5 }}>{ev.slice(0, 25).map((e) => <div key={e.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", color: e.estado === "ok" ? c.txt : c.mut }}><span style={{ flex: "1 1 160px" }}>{new Date(e.created_at).toLocaleString("es-ES")}</span><span style={{ flex: "1 1 160px" }}>{OPERACIONES[e.operacion] || e.operacion} ×{e.unidades}</span><span>{e.estado === "ok" ? "consumido" : "reembolsado"}</span></div>)}</div>
      </div>
      <div style={{ fontSize: 12, color: c.mut }}>Plan y facturación: próximamente. No se hará ningún cargo sin tu autorización.</div>
    </section>
  );
}
