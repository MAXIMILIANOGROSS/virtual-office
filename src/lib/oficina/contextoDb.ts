import type { SupabaseClient } from "@supabase/supabase-js";
import { armarContexto, type Ejemplo, type Kb } from "@/lib/oficina/contexto";

/** Lee el conocimiento y los ejemplos aprobados del CEO y devuelve el texto extra para el prompt del agente.
 *  Si faltan las tablas (SQL 89) o falla la lectura, devuelve "" y el agente trabaja sin contexto extra. */
export async function contextoDeAgente(sb: SupabaseClient, owner: string, agente: string, instruccion: string): Promise<string> {
  try {
    const [k, e] = await Promise.all([
      sb.from("office_kb").select("agente,titulo,contenido").eq("owner", owner).limit(200),
      sb.from("office_tasks").select("instruccion,resultado").eq("owner", owner).eq("agente", agente).eq("estado", "completada").not("resultado", "is", null).order("updated_at", { ascending: false }).limit(2),
    ]);
    const kb = (k.error ? [] : (k.data as Kb[] | null) || []);
    const ej = (e.error ? [] : ((e.data as { instruccion: string; resultado: string | null }[] | null) || []).filter((x) => x.resultado).map((x) => ({ instruccion: x.instruccion, resultado: x.resultado as string }) as Ejemplo));
    return armarContexto(kb, ej, agente, instruccion);
  } catch { return ""; }
}
