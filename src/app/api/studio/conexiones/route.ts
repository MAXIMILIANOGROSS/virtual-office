import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CONEXIONES, CONTROLABLES, estadoConexion, type Fila } from "@/lib/studio/conexiones";

export const runtime = "nodejs";

async function admin(request: Request) {
  const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY, srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!tk || !url || !key) return NextResponse.json({ ok: false, error: "Inicia sesión." }, { status: 401 });
  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${tk}` } } });
  const { data: u, error } = await sb.auth.getUser(tk); if (error || !u?.user?.id) return NextResponse.json({ ok: false, error: "Tu sesión ha caducado." }, { status: 401 });
  const { data: adm, error: ae } = await sb.rpc("oficina_is_admin"); if (ae || adm !== true) return NextResponse.json({ ok: false, error: "Solo para Dirección." }, { status: 403 });
  if (!srv) return NextResponse.json({ ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 503 });
  return createClient(url, srv, { auth: { persistSession: false } });
}

export async function GET(request: Request) {
  const sb = await admin(request); if (sb instanceof NextResponse) return sb;
  const { data, error } = await sb.from("studio_conexiones").select("id,habilitada,ultimo_ok,detalle");
  const tabla = !error; const filas = new Map(((data || []) as Fila[]).map((f) => [f.id, f]));
  return NextResponse.json({ ok: true, tabla, conexiones: CONEXIONES.map((d) => ({ id: d.id, nombre: d.nombre, controlable: d.controlable, ...estadoConexion(d, filas.get(d.id)) })) });
}

/** Conectar / desconectar. Solo las que tienen módulo real. */
export async function POST(request: Request) {
  const sb = await admin(request); if (sb instanceof NextResponse) return sb;
  let b: { id?: unknown; habilitada?: unknown }; try { b = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Petición no válida." }, { status: 400 }); }
  const id = typeof b.id === "string" ? b.id : ""; if (!CONTROLABLES.has(id) || typeof b.habilitada !== "boolean") return NextResponse.json({ ok: false, error: "Esa conexión no se puede cambiar." }, { status: 422 });
  const { error } = await sb.from("studio_conexiones").upsert({ id, habilitada: b.habilitada, updated_at: new Date().toISOString() }, { onConflict: "id" });
  return error ? NextResponse.json({ ok: false, error: "No se pudo guardar. ¿Has ejecutado el SQL de conexiones?" }, { status: 500 }) : NextResponse.json({ ok: true });
}
