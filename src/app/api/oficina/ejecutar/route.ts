import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { permitido } from "@/lib/cabra/limite";
import { callLLM, llmProvider } from "@/lib/llm";
import { agentePorId, areaDb, enrutar, promptDe } from "@/lib/oficina/agentes";
import { contextoDeAgente } from "@/lib/oficina/contextoDb";
import { estadoParada } from "@/lib/oficina/control";
import { clasificarNivel, estadoTrasEjecutar, limpiarInstruccion } from "@/lib/oficina/tareas";

export const runtime = "nodejs";
export const maxDuration = 60;
/** CIRO recibe la orden del CEO, la delega al agente adecuado y deja el resultado EN REVISIÓN (o pendiente de aprobación). Nunca marca "completada".
 *  Si no hay IA configurada o falla, la tarea queda FALLIDA con el motivo (no se inventa un resultado). Solo para el administrador. */
export async function POST(request: Request) {
  const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!tk || !url || !key) return NextResponse.json({ ok: false, error: "Inicia sesión." }, { status: 401 });
  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${tk}` } } });
  const { data: u, error: ue } = await sb.auth.getUser(tk); const uid = u?.user?.id;
  if (ue || !uid) return NextResponse.json({ ok: false, error: "Tu sesión ha caducado." }, { status: 401 });
  const { data: adm, error: ae } = await sb.rpc("oficina_is_admin");
  if (ae || adm !== true) return NextResponse.json({ ok: false, error: "La oficina es solo para Dirección (administrador)." }, { status: 403 });
  if (!permitido("oficina:" + uid, 30, 3600000)) return NextResponse.json({ ok: false, error: "Demasiadas órdenes seguidas. Espera un poco." }, { status: 429 });
  const par = await estadoParada(sb); if (par.detenida) return NextResponse.json({ ok: false, parada: true, error: "La oficina está DETENIDA" + (par.motivo ? `: ${par.motivo}` : "") + ". Reanúdala en Control y salud." }, { status: 423 });
  let b: { instruccion?: unknown; cola?: unknown; agente?: unknown }; try { b = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Petición no válida." }, { status: 400 }); }
  const instruccion = limpiarInstruccion(b.instruccion); if (!instruccion) return NextResponse.json({ ok: false, error: "Escribe la orden." }, { status: 422 });
  const agente = (typeof b.agente === "string" && agentePorId(b.agente)) || enrutar(instruccion); const nivel = clasificarNivel(instruccion);
  let resultado: string | null = null; let motivo = "";
  if (b.cola === true) {
    const { data: q, error: qe } = await sb.rpc("office_create", { p_instruccion: instruccion, p_agente: agente.id, p_area: areaDb(agente.area), p_nivel: nivel, p_estado: "pendiente", p_resultado: null, p_error: null });
    if (qe) return NextResponse.json({ ok: false, error: "No se pudo encolar. ¿Has ejecutado el SQL 87?" }, { status: 400 });
    return NextResponse.json({ ok: true, id: q, agente: agente.id, nivel, estado: "pendiente", motivo: "" });
  }
  if (!llmProvider()) motivo = "No hay IA configurada en el servidor (LLM_BASE_URL, LLM_API_KEY y LLM_MODEL).";
  else {
    const extra = nivel === "C" || nivel === "D" ? "\nEsta orden implica una acción sensible: prepara SOLO el borrador/plan y señala qué debe aprobar el CEO." : "";
    const ctx = await contextoDeAgente(sb, uid, agente.id, instruccion);
    resultado = await callLLM(promptDe(agente) + extra + ctx, [{ role: "user", content: instruccion }], 1400);
    if (!resultado) motivo = "El proveedor de IA no respondió (límite gratuito, clave o modelo incorrectos).";
  }
  const estado = estadoTrasEjecutar(nivel, !!resultado);
  const { data, error } = await sb.rpc("office_create", { p_instruccion: instruccion, p_agente: agente.id, p_area: areaDb(agente.area), p_nivel: nivel, p_estado: estado, p_resultado: resultado, p_error: resultado ? null : motivo });
  if (error) return NextResponse.json({ ok: false, error: String(error.message || "").includes("FORBIDDEN") ? "Sin permiso." : "No se pudo registrar la tarea. ¿Has ejecutado el SQL 87?" }, { status: 400 });
  return NextResponse.json({ ok: true, id: data, agente: agente.id, nivel, estado, motivo: resultado ? "" : motivo });
}
