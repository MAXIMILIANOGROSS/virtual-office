"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
type Ent = { id: string; nombre: string; tipo: string; version: number; bytes: number; sha256: string; validacion: string; created_at: string; contenido: string };
/** Entregables guardados de una tarea (SQL 99). Muestra nombre, versión, tamaño y huella, y permite descargarlos como .md. */
export default function EntregablesTarea({ taskId }: { taskId: string }) {
  const [e, setE] = useState<Ent[] | null>(null); const [err, setErr] = useState("");
  useEffect(() => { (async () => {
    const { data, error } = await supabase.from("office_entregables").select("id,nombre,tipo,version,bytes,sha256,validacion,created_at,contenido").eq("task_id", taskId).order("version", { ascending: false });
    if (error) setErr(/does not exist|relation|schema cache/i.test(error.message) ? "Falta ejecutar el SQL 99." : error.message); else setE((data as Ent[]) || []);
  })(); }, [taskId]);
  function bajar(x: Ent) { const u = URL.createObjectURL(new Blob([x.contenido], { type: "text/markdown" })); const a = document.createElement("a"); a.href = u; a.download = (x.nombre.replace(/[^\w\-]+/g, "_").slice(0, 60) || "entregable") + `_v${x.version}.md`; a.click(); URL.revokeObjectURL(u); }
  if (err) return <div style={{ fontSize: 12, color: "#C0392B", marginTop: 6 }}>{err}</div>;
  if (!e) return null;
  if (!e.length) return <div style={{ fontSize: 12, color: "#5A6B7F", marginTop: 6 }}>Sin entregables guardados para esta tarea.</div>;
  return <div style={{ marginTop: 8, display: "grid", gap: 4 }}>{e.map((x) => <div key={x.id} style={{ fontSize: 12.5, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <span>📎 <b>{x.nombre}</b> · {x.tipo} · v{x.version} · {Math.round(x.bytes / 100) / 10} KB · huella {x.sha256.slice(0, 8)} · {x.validacion}</span>
    <button type="button" onClick={() => bajar(x)} style={{ background: "transparent", color: "#07182E", border: "1px solid #07182E", borderRadius: 8, padding: "2px 8px", cursor: "pointer" }}>Descargar .md</button></div>)}</div>;
}
