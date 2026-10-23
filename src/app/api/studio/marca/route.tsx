import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { MARCA_VISUAL, PROYECTO, etiquetaImagen, firmaImagen } from "@/oficina.config";

export const runtime = "nodejs";
export const maxDuration = 30;
const C = { bg: MARCA_VISUAL.fondo, gold: MARCA_VISUAL.acento, white: MARCA_VISUAL.texto };
const W = 1080, H = 1920;

/** Recursos de marca para los vídeos del Studio: "overlay" (logo + enlace, transparente) y "fin" (pantalla final de 3 s). Solo el worker local, con CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET; const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || tk !== secret) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  const tipo = new URL(request.url).searchParams.get("tipo");
  if (tipo !== "overlay" && tipo !== "fin") return NextResponse.json({ ok: false, error: "Tipo no válido." }, { status: 422 });
  const logo = MARCA_VISUAL.logo ? new URL(MARCA_VISUAL.logo, request.url).toString() : "";
  try {
    const img = tipo === "overlay"
      ? new ImageResponse(
          (
            <div style={{ display: "flex", width: W, height: H }}>
              <div style={{ position: "absolute", top: 150, left: 44, display: "flex", alignItems: "center" }}>
                {logo ? <img src={logo} alt="" width={150} height={150} style={{ width: 150, height: 150 }} /> : <div style={{ display: "flex" }} />}
                <div style={{ display: "flex", marginLeft: 14, background: "rgba(7,24,46,0.78)", color: C.white, fontSize: 38, fontWeight: 900, padding: "12px 26px", borderRadius: 999, border: `3px solid ${C.gold}` }}>{firmaImagen()}</div>
              </div>
            </div>
          ),
          { width: W, height: H },
        )
      : new ImageResponse(
          (
            <div style={{ display: "flex", position: "relative", width: W, height: H, background: C.bg }}>
              
              <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", background: "linear-gradient(180deg, rgba(4,16,38,0.55) 0%, rgba(4,16,38,0.82) 100%)" }} />
              <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80 }}>
                {logo ? <img src={logo} alt="" width={460} height={460} style={{ width: 460, height: 460 }} /> : <div style={{ display: "flex", color: C.white, fontSize: 96, fontWeight: 900 }}>{PROYECTO.nombre.trim()}</div>}
                <div style={{ display: "flex", textAlign: "center", color: C.white, fontSize: 78, fontWeight: 900, lineHeight: 1.05, marginTop: 40 }}>{PROYECTO.propuestaDeValor.trim()}</div>
                <div style={{ display: "flex", marginTop: 54, background: C.gold, color: C.bg, fontSize: 56, fontWeight: 900, padding: "20px 54px", borderRadius: 999 }}>{firmaImagen()}</div>
                <div style={{ display: "flex", marginTop: 30, color: MARCA_VISUAL.suave, fontSize: 36, fontWeight: 700, letterSpacing: 3 }}>{etiquetaImagen()}</div>
              </div>
            </div>
          ),
          { width: W, height: H },
        );
    const buf = await img.arrayBuffer();
    if (buf.byteLength < 1500) return NextResponse.json({ ok: false, error: "El recurso salió vacío." }, { status: 502 });
    return new Response(buf, { status: 200, headers: { "content-type": "image/png", "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo generar el recurso de marca." }, { status: 502 });
  }
}
