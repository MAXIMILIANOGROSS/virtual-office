import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { permitido } from "@/lib/cabra/limite";
import { callLLM, llmProvider } from "@/lib/llm";
import { AREAS, agentePorId } from "@/lib/oficina/agentes";
import { contextoDeAgente } from "@/lib/oficina/contextoDb";
import { limpiarMensajes, promptChat } from "@/lib/oficina/chat";

export const runtime = "nodejs";
export const maxDuration = 60;
/** Chat directo del CEO con un agente. Solo conversa: no crea tareas ni ejecuta acciones. Solo administrador. */
export async function POST(request: Request) {
  const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!tk || !url || !key) return NextResponse.json({ ok: false, error: "Inicia sesión." }, { status: 401 });
  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${tk}` } } });
  const { data: u, error: ue } = await sb.auth.getUser(tk); const uid = u?.user?.id;
  if (ue || !uid) return NextResponse.json({ ok: false, error: "Tu sesión ha caducado." }, { status: 401 });
  const { data: adm, error: ae } = await sb.rpc("oficina_is_admin");
  if (ae || adm !== true) return NextResponse.json({ ok: false, error: "La oficina es solo para Dirección (administrador)." }, { status: 403 });
  if (!permitido("oficinachat:" + uid, 60, 3600000)) return NextResponse.json({ ok: false, error: "Demasiados mensajes seguidos. Espera un poco." }, { status: 429 });
  let b: { agente?: unknown; mensajes?: unknown }; try { b = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Petición no válida." }, { status: 400 }); }
  const ag = typeof b.agente === "string" ? agentePorId(b.agente) : undefined; const msgs = limpiarMensajes(b.mensajes);
  if (!ag || !msgs) return NextResponse.json({ ok: false, error: "Mensaje no válido." }, { status: 422 });
  if (!llmProvider()) return NextResponse.json({ ok: false, error: "No hay IA configurada en el servidor (LLM_BASE_URL, LLM_API_KEY y LLM_MODEL, o ANTHROPIC_API_KEY)." }, { status: 503 });
  let tareas: string[] = [];
  try { const { data } = await sb.from("office_tasks").select("instruccion,estado").eq("owner", uid).eq("agente", ag.id).order("created_at", { ascending: false }).limit(5); tareas = ((data as { instruccion: string; estado: string }[] | null) || []).map((t) => `${t.instruccion.slice(0, 120)} (${t.estado})`); } catch { /* sin tareas */ }
  const ctx = await contextoDeAgente(sb, uid, ag.id, msgs[msgs.length - 1].content);
  const sistema = promptChat({ nombre: ag.nombre, rol: ag.rol, areaNombre: AREAS[ag.area].nombre, mision: AREAS[ag.area].mision, habilidades: ag.habilidades }, tareas) + ctx;
  const r = await callLLM(sistema, msgs, 1400);
  if (!r) return NextResponse.json({ ok: false, error: "El proveedor de IA no respondió (límite gratuito, clave o modelo incorrectos)." }, { status: 502 });
  return NextResponse.json({ ok: true, respuesta: r.slice(0, 6000) });
}
