"use client";
import { useMemo, useState } from "react";
import { AGENTES, AREAS } from "@/lib/oficina/agentes";
import { NOMBRE_PROPIO } from "@/lib/oficina/nombresPropios";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Buscador de agentes: por nombre propio, puesto, departamento o habilidad. Al elegir uno, la oficina lo enfoca. */
export default function BuscadorAgentes({ onPick, dark = true }: { onPick: (id: string) => void; dark?: boolean }) {
  const [q, setQ] = useState(""); const [abierto, setAbierto] = useState(false);
  const res = useMemo(() => {
    const n = norm(q.trim()); if (!n) return [];
    return AGENTES.filter((a) => norm([NOMBRE_PROPIO[a.id] || "", a.nombre, a.rol, AREAS[a.area].nombre, ...a.habilidades].join(" ")).includes(n)).slice(0, 8);
  }, [q]);
  return (
    <div style={{ position: "relative", maxWidth: 420, margin: "6px 0" }}>
      <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setAbierto(true); }} onFocus={() => setAbierto(true)} placeholder="Buscar cabra: nombre, puesto, habilidad…" aria-label="Buscar agente" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #2A5CAA", background: dark ? "#0B2A5B" : "#fff", color: "#F4F8FF", fontSize: 13 }} />
      {abierto && res.length > 0 && <ul role="listbox" style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: "100%", margin: 0, padding: 4, listStyle: "none", background: "#0B2A5B", border: "1px solid #2A5CAA", borderRadius: 8, maxHeight: 280, overflow: "auto" }}>
        {res.map((a) => <li key={a.id}><button type="button" onClick={() => { onPick(a.id); setAbierto(false); setQ(""); }} style={{ width: "100%", textAlign: "left", padding: "6px 8px", background: "transparent", border: 0, color: "#F4F8FF", cursor: "pointer", fontSize: 12 }}><b>{NOMBRE_PROPIO[a.id] || a.nombre}</b> <span style={{ color: "#A9C1E8" }}>· {a.rol} · {AREAS[a.area].nombre}</span></button></li>)}
      </ul>}
      {abierto && q.trim() && res.length === 0 && <div style={{ fontSize: 12, color: "#A9C1E8", marginTop: 4 }}>Ninguna cabra coincide.</div>}
    </div>
  );
}
