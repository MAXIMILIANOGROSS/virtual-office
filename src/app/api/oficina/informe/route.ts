import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { permitido } from "@/lib/cabra/limite";
import { generarInforme } from "@/lib/oficina/informeDb";

export const runtime = "nodejs";
export const maxDuration = 30;
/** "Generar informe ahora": solo administrador. El informe se construye con registros reales (sin IA) y sustituye al de hoy. */
export async function POST(request: Request) {
  const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY, srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!tk || !url || !key) return NextResponse.json({ ok: false, error: "Inicia sesión." }, { status: 401 });
  const usr = createClient(url, key, { global: { headers: { Authorization: `Bearer ${tk}` } } });
  const { data: u, error: ue } = await usr.auth.getUser(tk); const uid = u?.user?.id;
  if (ue || !uid) return NextResponse.json({ ok: false, error: "Tu sesión ha caducado." }, { status: 401 });
  const { data: adm, error: ae } = await usr.rpc("oficina_is_admin");
  if (ae || adm !== true) return NextResponse.json({ ok: false, error: "Solo para Dirección (administrador)." }, { status: 403 });
  if (!srv) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel." }, { status: 503 });
  if (!permitido("informe:" + uid, 20, 3600000)) return NextResponse.json({ ok: false, error: "Demasiados informes seguidos." }, { status: 429 });
  const r = await generarInforme(createClient(url, srv, { auth: { persistSession: false } }), uid, "manual");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
