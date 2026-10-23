// Servidor: reúne los registros reales del día y guarda el informe (una fila por propietario y fecha). Cliente service role.
import type { SupabaseClient } from "@supabase/supabase-js";
import { construirInforme } from "./informe.ts";
import { agentePorId } from "./agentes.ts";
export async function generarInforme(sb: SupabaseClient, owner: string, origen: "ciclo" | "manual", fecha = new Date().toISOString().slice(0, 10)): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const desde = new Date(Date.now() - 60 * 86400000).toISOString();
  const [t, e, c, ci, ctl] = await Promise.all([
    sb.from("office_tasks").select("id,instruccion,agente,nivel,estado,error,intentos,created_at,updated_at,resultado").eq("owner", owner).gte("created_at", desde).limit(1000),
    sb.from("office_entregables").select("task_id,nombre,tipo,version,created_at").eq("owner", owner).gte("created_at", fecha + "T00:00:00Z").limit(200),
    sb.from("office_costes").select("agente,llamadas,tokens_entrada,tokens_salida,coste_eur,estado,created_at").eq("owner", owner).gte("created_at", fecha + "T00:00:00Z").limit(500),
    sb.from("office_ciclos").select("inicio,resultado,error").gte("inicio", fecha + "T00:00:00Z").order("inicio", { ascending: false }).limit(200),
    sb.from("office_control").select("detenida,motivo").eq("id", 1).maybeSingle(),
  ]);
  if (t.error) return { ok: false, error: "No se pudieron leer las tareas." };
  const alertas: string[] = []; if (ctl.data?.detenida) alertas.push(`Oficina DETENIDA${ctl.data.motivo ? ": " + ctl.data.motivo : ""}.`);
  if (e.error) alertas.push("No se pudieron leer los entregables (¿SQL 99?)."); if (c.error) alertas.push("No hay libro de costes (¿SQL 100?)."); if (ci.error) alertas.push("No hay registro de ciclos (¿SQL 98?).");
  const { texto, resumen } = construirInforme({ fecha, tareas: (t.data || []) as never, entregables: (e.data || []) as never, costes: (c.data || []) as never, ciclos: (ci.data || []) as never, alertas, nombreAgente: (id) => agentePorId(id)?.nombre ?? id });
  const { data, error } = await sb.from("office_informes").upsert({ owner, fecha, contenido: texto, datos: resumen, origen }, { onConflict: "owner,fecha" }).select("id").maybeSingle();
  if (error) return { ok: false, error: /does not exist|relation|schema cache/i.test(error.message) ? "Falta ejecutar el SQL 101 (informes)." : error.message.slice(0, 160) };
  return { ok: true, id: data?.id };
}
