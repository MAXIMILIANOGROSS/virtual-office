import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CONTROLABLES } from "@/lib/studio/conexiones";

export const runtime = "nodejs";
function cliente(request: Request) {
  const secret = process.env.CRON_SECRET; const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || tk !== secret) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srv) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  return createClient(url, srv, { auth: { persistSession: false } });
}
/** El worker pregunta qué conexiones has desconectado. */
export async function GET(request: Request) {
  const sb = cliente(request); if (sb instanceof NextResponse) return sb;
  const { data } = await sb.from("studio_conexiones").select("id").eq("habilitada", false);
  return NextResponse.json({ ok: true, desconectadas: (data || []).map((r: { id: string }) => r.id) });
}
/** El worker informa de lo que ha comprobado de verdad: { estados: { id: { ok, detalle } } }. */
export async function POST(request: Request) {
  const sb = cliente(request); if (sb instanceof NextResponse) return sb;
  let b: { estados?: Record<string, { ok?: unknown; detalle?: unknown }> }; try { b = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Petición no válida." }, { status: 400 }); }
  const ahora = new Date().toISOString(); const filas = [];
  for (const [id, e] of Object.entries(b.estados || {})) {
    if (!CONTROLABLES.has(id) || typeof e?.ok !== "boolean") continue;
    const f: Record<string, unknown> = { id, detalle: typeof e.detalle === "string" ? e.detalle.slice(0, 200) : null, updated_at: ahora };
    if (e.ok) f.ultimo_ok = ahora; else { f.ultimo_ok = null; }
    filas.push(f);
  }
  if (!filas.length) return NextResponse.json({ ok: false, error: "Nada que guardar." }, { status: 422 });
  const { error } = await sb.from("studio_conexiones").upsert(filas, { onConflict: "id" });
  return error ? NextResponse.json({ ok: false, error: "No se pudo guardar." }, { status: 500 }) : NextResponse.json({ ok: true });
}
