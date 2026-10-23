import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { permitido } from "@/lib/cabra/limite";
import { proyectar, type FilaPublica } from "@/lib/oficina/publico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** API pública de SOLO LECTURA del observatorio. Solo GET. Devuelve agregados sin textos privados. */
export async function GET(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") || "anon").split(",")[0].trim();
  if (!permitido("obs:" + ip, 60, 60000)) return NextResponse.json({ ok: false, error: "Demasiadas peticiones." }, { status: 429 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srv) return NextResponse.json({ ok: false, error: "Observatorio no disponible." }, { status: 503 });
  const sb = createClient(url, srv, { auth: { persistSession: false } });
  const { data, error } = await sb.from("office_tasks").select("agente,area,estado,updated_at").in("estado", ["en_curso", "pendiente", "en_revision", "requiere_aprobacion"]).limit(200);
  if (error) return NextResponse.json({ ok: false, error: "Sin datos por ahora." }, { status: 503 });
  return NextResponse.json({ ok: true, ...proyectar((data || []) as FilaPublica[]) }, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } });
}
