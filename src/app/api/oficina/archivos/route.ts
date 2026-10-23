import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rutaEsDe } from "@/lib/oficina/archivos";

export const runtime = "nodejs";
export const maxDuration = 30;
async function sesion(request: Request) {
  const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY, srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!tk || !url || !key) return { err: NextResponse.json({ ok: false, error: "Inicia sesión." }, { status: 401 }) };
  const usr = createClient(url, key, { global: { headers: { Authorization: `Bearer ${tk}` } } });
  const { data: u, error } = await usr.auth.getUser(tk); const uid = u?.user?.id;
  if (error || !uid) return { err: NextResponse.json({ ok: false, error: "Tu sesión ha caducado." }, { status: 401 }) };
  const { data: adm } = await usr.rpc("oficina_is_admin");
  if (adm !== true) return { err: NextResponse.json({ ok: false, error: "Solo para Dirección (administrador)." }, { status: 403 }) };
  if (!srv) return { err: NextResponse.json({ ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 503 }) };
  return { usr, uid, admin: createClient(url, srv, { auth: { persistSession: false } }) };
}
/** Lista tus archivos con enlaces firmados de 10 min (el bucket es privado). */
export async function GET(request: Request) {
  const s = await sesion(request); if (s.err) return s.err;
  const { data, error } = await s.usr!.from("office_files").select("id,tipo,nombre,ruta,mime,bytes,proveedor,created_at").order("created_at", { ascending: false }).limit(30);
  if (error) return NextResponse.json({ ok: false, error: "¿Ejecutaste el SQL 92?" }, { status: 400 });
  const filas = (data || []).filter((f: { ruta: string }) => rutaEsDe(f.ruta, s.uid!));
  const out = await Promise.all(filas.map(async (f: { id: string; tipo: string; nombre: string; ruta: string; mime: string; bytes: number; proveedor: string; created_at: string }) => {
    const { data: su } = await s.admin!.storage.from("oficina-archivos").createSignedUrl(f.ruta, 600);
    return { id: f.id, tipo: f.tipo, nombre: f.nombre, mime: f.mime, bytes: f.bytes, proveedor: f.proveedor, creado: f.created_at, url: su?.signedUrl || null };
  }));
  return NextResponse.json({ ok: true, archivos: out });
}
/** Borra un archivo propio (registro + objeto). */
export async function DELETE(request: Request) {
  const s = await sesion(request); if (s.err) return s.err;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Id no válido." }, { status: 400 });
  const { data: f } = await s.usr!.from("office_files").select("ruta").eq("id", id).maybeSingle();
  if (!f || !rutaEsDe(f.ruta, s.uid!)) return NextResponse.json({ ok: false, error: "No existe." }, { status: 404 });
  await s.admin!.storage.from("oficina-archivos").remove([f.ruta]);
  const { error } = await s.usr!.from("office_files").delete().eq("id", id);
  return error ? NextResponse.json({ ok: false, error: "No se pudo borrar." }, { status: 400 }) : NextResponse.json({ ok: true });
}
