// Servidor: interruptor de parada global. Se consulta en cada ciclo y antes de ejecutar o encolar trabajo automático.
import type { SupabaseClient } from "@supabase/supabase-js";
export type Parada = { detenida: boolean; motivo: string | null; desde: string | null; tablaOk: boolean };
/** Si la tabla no existe (SQL 98 sin ejecutar) devuelve tablaOk=false y detenida=false: no hay interruptor que consultar. */
export async function estadoParada(sb: SupabaseClient): Promise<Parada> {
  const { data, error } = await sb.from("office_control").select("detenida,motivo,desde").eq("id", 1).maybeSingle();
  if (error || !data) return { detenida: false, motivo: null, desde: null, tablaOk: false };
  return { detenida: data.detenida === true, motivo: data.motivo ?? null, desde: data.desde ?? null, tablaOk: true };
}
