import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { correrCiclo } from "@/lib/oficina/correrCiclo";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Un ciclo del bucle 24/7. Lo dispara un cron externo (GitHub Actions) con Authorization: Bearer CRON_SECRET.
 *  Ejecuta SOLO tareas ya encoladas por el CEO. Nunca completa tareas ni ejecuta acciones externas. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || tk !== secret) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !srv) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 503 });
  const r = await correrCiclo(createClient(url, srv, { auth: { persistSession: false } }), undefined, "cron");
  return NextResponse.json(r, { status: r.ok ? 200 : r.status });
}
