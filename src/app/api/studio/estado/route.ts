import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const EVENTOS = new Set(["video_generado", "video_fallido", "video_subido", "subida_fallida"]);

/** El worker local informa del resultado. Idempotente: un guion solo se cierra una vez. Solo con CRON_SECRET. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET; const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || tk !== secret) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  let b: { tarea?: unknown; evento?: unknown; detalle?: unknown }; try { b = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Petición no válida." }, { status: 400 }); }
  const tarea = typeof b.tarea === "string" ? b.tarea : ""; const evento = typeof b.evento === "string" ? b.evento : ""; const detalle = typeof b.detalle === "string" ? b.detalle.slice(0, 280) : "";
  if (!/^[0-9a-f-]{36}$/i.test(tarea) || !EVENTOS.has(evento)) return NextResponse.json({ ok: false, error: "Datos no válidos." }, { status: 422 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srv) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 503 });
  const sb = createClient(url, srv, { auth: { persistSession: false } });
  const { data: t } = await sb.from("office_tasks").select("owner").eq("id", tarea).maybeSingle(); if (!t) return NextResponse.json({ ok: false, error: "Tarea no encontrada." }, { status: 404 });
  const grupo = evento === "video_generado" || evento === "video_fallido" ? ["video_generado", "video_fallido"] : [evento];
  const { data: ya } = await sb.from("office_log").select("id").eq("task_id", tarea).in("evento", grupo).limit(1);
  if (ya?.length) return NextResponse.json({ ok: true, duplicado: true });
  const { error } = await sb.from("office_log").insert({ owner: t.owner, task_id: tarea, evento, detalle });
  return error ? NextResponse.json({ ok: false, error: "No se pudo guardar." }, { status: 500 }) : NextResponse.json({ ok: true });
}
