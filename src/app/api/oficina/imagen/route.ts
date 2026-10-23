import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { permitido } from "@/lib/cabra/limite";
import { generarCloudflare, limpiarPrompt, proveedores } from "@/lib/oficina/imagenIA";
import { consumir, reembolsar } from "@/lib/oficina/cuota";
import { rutaArchivo, verificarArchivo } from "@/lib/oficina/archivos";

export const runtime = "nodejs";
export const maxDuration = 60;
async function admin(request: Request) {
  const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY, srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!tk || !url || !key) return { err: NextResponse.json({ ok: false, error: "Inicia sesión." }, { status: 401 }) };
  const usr = createClient(url, key, { global: { headers: { Authorization: `Bearer ${tk}` } } });
  const { data: u, error } = await usr.auth.getUser(tk); const uid = u?.user?.id;
  if (error || !uid) return { err: NextResponse.json({ ok: false, error: "Tu sesión ha caducado." }, { status: 401 }) };
  const { data: adm } = await usr.rpc("oficina_is_admin");
  if (adm !== true) return { err: NextResponse.json({ ok: false, error: "Solo para Dirección (administrador)." }, { status: 403 }) };
  if (!srv) return { err: NextResponse.json({ ok: false, error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." }, { status: 503 }) };
  return { uid, db: createClient(url, srv, { auth: { persistSession: false } }) };
}
/** Estado de los proveedores (sin claves). */
export async function GET(request: Request) {
  const s = await admin(request); if (s.err) return s.err;
  return NextResponse.json({ ok: true, proveedores: proveedores(process.env) });
}
/** Genera una imagen con IA, la valida, la guarda en Storage privado y la registra. Nunca marca "generada" sin verificarla. */
export async function POST(request: Request) {
  const s = await admin(request); if (s.err) return s.err;
  if (!permitido("imagen:" + s.uid, 10, 3600000)) return NextResponse.json({ ok: false, error: "Demasiadas imágenes seguidas. Espera un poco." }, { status: 429 });
  let body: { prompt?: unknown }; try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Petición no válida." }, { status: 400 }); }
  const v = limpiarPrompt(body.prompt); if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  const cu = await consumir(s.uid, "imagen"); if (!cu.ok) return NextResponse.json({ ok: false, error: cu.error }, { status: cu.status });
  const g = await generarCloudflare(v.prompt, process.env); if (!g.ok) { await reembolsar(s.uid, cu.ref); return NextResponse.json({ ok: false, error: g.error }, { status: 502 }); }
  const ver = verificarArchivo(g.bytes); if (!ver.ok) { await reembolsar(s.uid, cu.ref); return NextResponse.json({ ok: false, error: "La imagen generada no es válida: " + ver.error }, { status: 502 }); }
  const sha = createHash("sha256").update(g.bytes).digest("hex"); const ruta = rutaArchivo(s.uid!, "imagen", v.prompt, sha, ver.ext);
  const up = await s.db!.storage.from("oficina-archivos").upload(ruta, g.bytes, { contentType: ver.mime, upsert: false });
  if (up.error && !/already exists|Duplicate/i.test(up.error.message)) return NextResponse.json({ ok: false, error: "No se pudo guardar el archivo (¿ejecutaste el SQL 92?)." }, { status: 500 });
  const rd = await s.db!.storage.from("oficina-archivos").download(ruta);
  if (rd.error || !rd.data || rd.data.size !== g.bytes.length) return NextResponse.json({ ok: false, error: "La verificación posterior del archivo falló." }, { status: 500 });
  const { data: fila, error: fe } = await s.db!.from("office_files").upsert({ owner: s.uid, tipo: "imagen", nombre: v.prompt.slice(0, 120), ruta, mime: ver.mime, bytes: g.bytes.length, sha256: sha, proveedor: `${g.proveedor}:${g.modelo}`.slice(0, 60), brief: { prompt: v.prompt } }, { onConflict: "ruta" }).select("id").maybeSingle();
  if (fe) return NextResponse.json({ ok: false, error: `No se pudo registrar la imagen (${String(fe.code || "")} ${String(fe.message || "").slice(0, 160)}).` }, { status: 500 });
  const { data: su } = await s.db!.storage.from("oficina-archivos").createSignedUrl(ruta, 600);
  return NextResponse.json({ ok: true, id: fila?.id, url: su?.signedUrl || null, bytes: g.bytes.length, proveedor: g.proveedor });
}
