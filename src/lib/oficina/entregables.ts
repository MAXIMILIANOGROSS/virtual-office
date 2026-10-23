// Servidor: guarda el resultado de una tarea como entregable persistente enlazado a ella (SQL 99). Cliente service role.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
export type TipoEntregable = "informe" | "analisis" | "campana" | "documento" | "evidencia";
export const hashTexto = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
export function nombreEntregable(agente: string, instruccion: string, tipo: TipoEntregable): string {
  const base = instruccion.replace(/\s+/g, " ").trim().slice(0, 80) || "tarea";
  return `${tipo}-${agente}: ${base}`.slice(0, 160);
}
/** Devuelve { ok:true, id } o { ok:false, motivo }. Nunca lanza: un fallo aquí no debe romper el ciclo, pero queda registrado por quien llama. */
export async function guardarEntregable(sb: SupabaseClient, e: { owner: string; taskId: string; agente: string; instruccion: string; contenido: string; tipo?: TipoEntregable; fuentes?: unknown; meta?: Record<string, unknown> }): Promise<{ ok: true; id: string } | { ok: false; motivo: string }> {
  const contenido = (e.contenido || "").trim(); if (!contenido) return { ok: false, motivo: "Contenido vacío." };
  const tipo = e.tipo ?? "informe"; const sha = hashTexto(contenido);
  const { data: prev } = await sb.from("office_entregables").select("id,sha256,version").eq("task_id", e.taskId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (prev && prev.sha256 === sha) return { ok: true, id: prev.id }; // idempotente: mismo contenido, no se duplica
  const { data, error } = await sb.from("office_entregables").insert({ owner: e.owner, task_id: e.taskId, agente: e.agente, tipo, nombre: nombreEntregable(e.agente, e.instruccion, tipo), contenido, bytes: Buffer.byteLength(contenido, "utf8"), sha256: sha, version: (prev?.version ?? 0) + 1, fuentes: e.fuentes ?? null, meta: e.meta ?? null }).select("id").maybeSingle();
  if (error || !data) return { ok: false, motivo: /relation|does not exist|schema cache/i.test(error?.message || "") ? "Falta ejecutar el SQL 99." : (error?.message || "No se pudo guardar").slice(0, 160) };
  return { ok: true, id: data.id };
}
