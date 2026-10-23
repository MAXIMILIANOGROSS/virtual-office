import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PREFIJO_GUION } from "@/lib/oficina/studioVideo";

export const runtime = "nodejs";

/** Cola de producción para el worker local (0 €): guiones APROBADOS por ti que aún no tienen vídeo generado ni fallo definitivo. Solo con CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET; const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || tk !== secret) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srv) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 503 });
  const sb = createClient(url, srv, { auth: { persistSession: false } });
  const { data: ts } = await sb.from("office_tasks").select("id,instruccion,resultado,created_at").like("instruccion", PREFIJO_GUION + "%").eq("estado", "completada").order("created_at", { ascending: true }).limit(20);
  const ids = (ts || []).map((t: { id: string }) => t.id);
  const { data: hechos } = ids.length ? await sb.from("office_log").select("task_id,evento").in("task_id", ids).in("evento", ["video_generado", "video_fallido"]) : { data: [] };
  const cerrados = new Set((hechos || []).map((h: { task_id: string }) => h.task_id));
  const cola = (ts || []).filter((t: { id: string }) => !cerrados.has(t.id)).slice(0, 3).map((t: { id: string; instruccion: string; resultado: string | null }) => ({ id: t.id, titulo: t.instruccion.replace(PREFIJO_GUION, ""), guion: t.resultado || "" }));
  return NextResponse.json({ ok: true, cola });
}
