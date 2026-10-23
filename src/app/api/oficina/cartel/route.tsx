import { ImageResponse } from "next/og";
import { MARCA_VISUAL } from "@/oficina.config";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { permitido } from "@/lib/cabra/limite";
import { FORMATOS, limpiarBrief, tamanoTitular } from "@/lib/oficina/cartel";
import { rutaArchivo, verificarArchivo } from "@/lib/oficina/archivos";
import { createHash } from "node:crypto";
import { resolverFoto } from "@/lib/oficina/fondos";

export const runtime = "nodejs";
export const maxDuration = 30;
const C = { bg: MARCA_VISUAL.fondo, card: MARCA_VISUAL.fondo, gold: MARCA_VISUAL.acento, blue: MARCA_VISUAL.acento, white: MARCA_VISUAL.texto, mut: MARCA_VISUAL.suave };

/** Genera un cartel PNG real (texto exacto, colores de tu marca). Solo Dirección. Lo guarda en Storage privado (SQL 92) y lo devuelve; si no pudo guardarlo lo indica en cabeceras. */
export async function POST(request: Request) {
  const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!tk || !url || !key) return NextResponse.json({ ok: false, error: "Inicia sesión." }, { status: 401 });
  const usr = createClient(url, key, { global: { headers: { Authorization: `Bearer ${tk}` } } });
  const { data: u, error: ue } = await usr.auth.getUser(tk); const uid = u?.user?.id;
  if (ue || !uid) return NextResponse.json({ ok: false, error: "Tu sesión ha caducado." }, { status: 401 });
  const { data: adm, error: ae } = await usr.rpc("oficina_is_admin");
  if (ae || adm !== true) return NextResponse.json({ ok: false, error: "Solo para Dirección (administrador)." }, { status: 403 });
  if (!permitido("cartel:" + uid, 30, 3600000)) return NextResponse.json({ ok: false, error: "Demasiados carteles seguidos. Espera un poco." }, { status: 429 });

  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Petición no válida." }, { status: 400 }); }
  const v = limpiarBrief(body); if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  const b = v.brief; const { w, h } = FORMATOS[b.formato]; const vert = b.formato === "vertical"; const hor = b.formato === "horizontal";
  const logo = MARCA_VISUAL.logo ? new URL(MARCA_VISUAL.logo, request.url).toString() : "";
  const pad = vert ? 80 : hor ? 44 : 64;
  const fs = tamanoTitular(b.titulo, b.formato);
  const peq = vert ? 38 : hor ? 24 : 32;

  try {
    const img = new ImageResponse(
      (
        <div style={{ width: w, height: h, display: "flex", flexDirection: "column", background: C.bg, position: "relative", fontFamily: "sans-serif", color: C.white }}>
          {b.fotoUrl ? <img src={resolverFoto(b.fotoUrl, request.url)} alt="" width={w} height={h} style={{ position: "absolute", top: 0, left: 0, width: w, height: h, objectFit: "cover" }} /> : null}
          <div style={{ position: "absolute", top: 0, left: 0, width: w, height: h, display: "flex", background: b.fotoUrl ? "linear-gradient(180deg, rgba(6,20,46,0.40) 0%, rgba(6,20,46,0.92) 100%)" : "linear-gradient(160deg, #0B2A5B 0%, #07182E 70%)" }} />
          <div style={{ display: "flex", height: 14, width: w, position: "absolute", top: 0, left: 0 }}><div style={{ flex: 1, background: C.white }} /><div style={{ flex: 1, background: C.blue }} /><div style={{ flex: 1, background: C.gold }} /></div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: w, height: h, padding: pad, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", fontSize: peq + 6, fontWeight: 800, color: C.gold, letterSpacing: 2, textTransform: "uppercase" }}>{b.negocio}</div>
              {logo ? <img src={logo} alt="" width={vert ? 120 : 90} height={vert ? 120 : 90} style={{ objectFit: "contain" }} /> : <div style={{ display: "flex" }} />}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: vert ? 28 : 18 }}>
              <div style={{ display: "flex", fontSize: fs, fontWeight: 900, lineHeight: 1.05 }}>{b.titulo}</div>
              {b.oferta ? <div style={{ display: "flex", fontSize: peq + 8, color: C.white, lineHeight: 1.25 }}>{b.oferta}</div> : null}
              {b.precio ? <div style={{ display: "flex", alignSelf: "flex-start", background: C.gold, color: C.bg, fontSize: vert ? 96 : hor ? 56 : 76, fontWeight: 900, padding: "6px 28px", borderRadius: 18 }}>{b.precio}</div> : null}
              {b.condiciones ? <div style={{ display: "flex", fontSize: peq - 6, color: C.mut }}>{b.condiciones}</div> : null}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: peq - 4, color: C.mut }}>
                {b.direccion ? <div style={{ display: "flex" }}>{b.direccion}</div> : null}
                {b.contacto ? <div style={{ display: "flex", color: C.white, fontWeight: 700 }}>{b.contacto}</div> : null}
              </div>
              {b.cta ? <div style={{ display: "flex", background: C.blue, color: C.white, fontSize: peq, fontWeight: 800, padding: "14px 32px", borderRadius: 999 }}>{b.cta}</div> : null}
            </div>
          </div>
        </div>
      ),
      { width: w, height: h },
    );
    const buf = await img.arrayBuffer();
    if (buf.byteLength < 2000) return NextResponse.json({ ok: false, error: "El cartel salió vacío; reinténtalo." }, { status: 502 });
    // Persistencia: se valida el archivo, se sube a Storage (bucket privado), se registra y se RELEE para confirmar que existe. Si algo falla, el cartel se entrega igual pero se dice que NO quedó guardado.
    const cab: Record<string, string> = { "content-type": "image/png", "content-disposition": `attachment; filename="cartel-${b.formato}.png"`, "cache-control": "no-store", "x-archivo-guardado": "0" };
    const srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bytes = new Uint8Array(buf); const ver = verificarArchivo(bytes);
    if (!ver.ok) { cab["x-archivo-aviso"] = encodeURIComponent(ver.error); }
    else if (!srv) { cab["x-archivo-aviso"] = encodeURIComponent("Falta SUPABASE_SERVICE_ROLE_KEY: el cartel no se guardó en la biblioteca."); }
    else {
      try {
        const adm = createClient(url, srv, { auth: { persistSession: false } });
        const sha = createHash("sha256").update(bytes).digest("hex");
        const ruta = rutaArchivo(uid, "cartel", `${b.negocio}-${b.titulo}`, sha, ver.ext);
        const up = await adm.storage.from("oficina-archivos").upload(ruta, bytes, { contentType: ver.mime, upsert: false });
        if (up.error && !/already exists|Duplicate/i.test(up.error.message)) throw new Error(up.error.message);
        const rd = await adm.storage.from("oficina-archivos").download(ruta);
        if (rd.error || !rd.data || rd.data.size !== bytes.length) throw new Error("La verificación posterior falló");
        const { data: fila, error: fe } = await adm.from("office_files").upsert({ owner: uid, tipo: "cartel", nombre: `${b.negocio} · ${b.titulo}`.slice(0, 120), ruta, mime: ver.mime, bytes: bytes.length, sha256: sha, proveedor: "codigo", brief: b }, { onConflict: "ruta" }).select("id").maybeSingle();
        if (fe) throw new Error("No se pudo registrar el archivo (¿ejecutaste el SQL 92?)");
        cab["x-archivo-guardado"] = "1"; if (fila?.id) cab["x-archivo-id"] = String(fila.id);
      } catch (e) { cab["x-archivo-aviso"] = encodeURIComponent(e instanceof Error ? e.message.slice(0, 160) : "No se pudo guardar"); }
    }
    return new Response(buf, { status: 200, headers: cab });
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo generar el cartel (¿la foto no es accesible?). Quita la foto o prueba otra URL." }, { status: 502 });
  }
}
