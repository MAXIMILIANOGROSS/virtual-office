import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { permitido } from "@/lib/cabra/limite";
import { FORMATOS_AD, validarImagen } from "@/lib/oficina/publicidadImagen";
import { MARCA_VISUAL, PROYECTO, etiquetaImagen, firmaImagen } from "@/oficina.config";
import { resolverFoto } from "@/lib/oficina/fondos";

export const runtime = "nodejs";
export const maxDuration = 30;
const C = { bg: MARCA_VISUAL.fondo, gold: MARCA_VISUAL.acento, white: MARCA_VISUAL.texto, mut: MARCA_VISUAL.suave };

/** Dibuja el PNG de un anuncio propuesto por las cabras (texto exacto, colores de tu marca en oficina.config.ts). Solo Dirección. No guarda nada: se regenera siempre igual desde la propuesta. */
export async function POST(request: Request) {
  const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!tk || !url || !key) return NextResponse.json({ ok: false, error: "Inicia sesión." }, { status: 401 });
  const usr = createClient(url, key, { global: { headers: { Authorization: `Bearer ${tk}` } } });
  const { data: u, error: ue } = await usr.auth.getUser(tk); const uid = u?.user?.id;
  if (ue || !uid) return NextResponse.json({ ok: false, error: "Tu sesión ha caducado." }, { status: 401 });
  const { data: adm, error: ae } = await usr.rpc("oficina_is_admin");
  if (ae || adm !== true) return NextResponse.json({ ok: false, error: "Solo para Dirección (administrador)." }, { status: 403 });
  if (!permitido("publicidad:" + uid, 120, 3600000)) return NextResponse.json({ ok: false, error: "Demasiadas peticiones. Espera un poco." }, { status: 429 });
  let body: Record<string, unknown> = {}; try { const j = await request.json(); if (j && typeof j === "object") body = j as Record<string, unknown>; } catch { /* sin cuerpo */ }
  const v = validarImagen(body); if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  const a = v.a;

  const { w, h } = FORMATOS_AD[a.formato]; const story = a.formato === "story"; const pad = story ? 84 : 72;
  const fs = a.titular.length <= 20 ? (story ? 150 : 124) : a.titular.length <= 34 ? (story ? 122 : 100) : (story ? 100 : 82);
  const logo = MARCA_VISUAL.logo ? new URL(MARCA_VISUAL.logo, request.url).toString() : "";
  try {
    const img = new ImageResponse(
      (
        <div style={{ display: "flex", position: "relative", width: w, height: h, background: C.bg }}>
          {a.fondo ? <img src={resolverFoto(a.fondo, request.url)} alt="" width={w} height={h} style={{ position: "absolute", top: 0, left: 0, width: w, height: h, objectFit: "cover" }} /> : <div style={{ position: "absolute", top: 0, left: 0, width: w, height: h, display: "flex", background: "linear-gradient(160deg, #0B2A55 0%, #07182E 100%)" }} />}
          <div style={{ position: "absolute", top: 0, left: 0, width: w, height: h, display: "flex", background: "linear-gradient(180deg, rgba(4,16,38,0.35) 0%, rgba(4,16,38,0.45) 38%, rgba(4,16,38,0.90) 100%)" }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: w, height: h, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: pad }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {logo ? <img src={logo} alt="" height={story ? 110 : 90} style={{ height: story ? 110 : 90 }} /> : <div style={{ display: "flex", color: C.white, fontSize: story ? 54 : 46, fontWeight: 900 }}>{PROYECTO.nombre.trim()}</div>}
              {etiquetaImagen() ? <div style={{ display: "flex", color: C.white, fontSize: 30, fontWeight: 700, letterSpacing: 2, background: "rgba(4,16,38,0.55)", padding: "10px 22px", borderRadius: 999 }}>{etiquetaImagen()}</div> : <div style={{ display: "flex" }} />}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", color: C.white, fontSize: fs, fontWeight: 900, lineHeight: 1.02, letterSpacing: -2 }}>{a.titular}</div>
              {a.subtitulo ? <div style={{ display: "flex", color: C.mut, fontSize: story ? 46 : 38, marginTop: 26, lineHeight: 1.25 }}>{a.subtitulo}</div> : null}
              <div style={{ display: "flex", alignItems: "center", marginTop: 44 }}>
                <div style={{ display: "flex", background: C.gold, color: C.bg, fontSize: story ? 44 : 38, fontWeight: 900, padding: "20px 44px", borderRadius: 999 }}>{a.cta}</div>
                <div style={{ display: "flex", color: C.white, fontSize: 32, fontWeight: 700, marginLeft: 28 }}>{firmaImagen()}</div>
              </div>
            </div>
          </div>
        </div>
      ),
      { width: w, height: h },
    );
    const buf = await img.arrayBuffer();
    if (buf.byteLength < 2000) return NextResponse.json({ ok: false, error: "La imagen salió vacía; reinténtalo." }, { status: 502 });
    return new Response(buf, { status: 200, headers: { "content-type": "image/png", "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo dibujar el anuncio." }, { status: 502 });
  }
}
