import { ImageResponse } from "next/og";
import { MARCA_VISUAL } from "@/oficina.config";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { permitido } from "@/lib/cabra/limite";
import { ESTILOS_EMPLEO, FORMATOS_EMPLEO, avisosVacante, filasAnuncio, limpiarVacante, tamanoPuesto, textosVacante } from "@/lib/oficina/anuncioEmpleo";
import { paletaDesdeKit, type KitMarca } from "@/lib/oficina/marca";
import { rutaArchivo, verificarArchivo } from "@/lib/oficina/archivos";
import { createHash } from "node:crypto";
import { resolverFoto } from "@/lib/oficina/fondos";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Hiring Studio: anuncio de vacante en PNG real (texto exacto, nada inventado). Solo Dirección por ahora. Se guarda en Storage privado (SQL 92). Devuelve JSON con textos, avisos y URL firmada. */
export async function POST(request: Request) {
  const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!tk || !url || !key) return NextResponse.json({ ok: false, error: "Inicia sesión." }, { status: 401 });
  const usr = createClient(url, key, { global: { headers: { Authorization: `Bearer ${tk}` } } });
  const { data: u, error: ue } = await usr.auth.getUser(tk); const uid = u?.user?.id;
  if (ue || !uid) return NextResponse.json({ ok: false, error: "Tu sesión ha caducado." }, { status: 401 });
  const { data: adm, error: ae } = await usr.rpc("oficina_is_admin");
  if (ae || adm !== true) return NextResponse.json({ ok: false, error: "Solo para Dirección (administrador)." }, { status: 403 });
  if (!permitido("anuncio:" + uid, 40, 3600000)) return NextResponse.json({ ok: false, error: "Demasiados anuncios seguidos. Espera un poco." }, { status: 429 });

  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Petición no válida." }, { status: 400 }); }
  const val = limpiarVacante(body); if (!val.ok) return NextResponse.json({ ok: false, error: val.error }, { status: 400 });
  const v = val.v; const { w, h } = FORMATOS_EMPLEO[v.formato];
  // Kit de marca (opcional): se lee de la base con la sesión del usuario (RLS), nunca se confía en colores enviados por el cliente.
  let E: { bg: string; fondo: string; acento: string; texto: string; suave: string; chip: string; chipTxt: string; peso: number } = ESTILOS_EMPLEO[v.estilo];
  let logoKit = ""; let eslogan = ""; const avisosKit: string[] = [];
  const kitId = typeof (body as Record<string, unknown>)?.kitId === "string" ? String((body as Record<string, unknown>).kitId) : "";
  if (kitId) {
    if (!/^[0-9a-f-]{36}$/i.test(kitId)) return NextResponse.json({ ok: false, error: "Kit de marca no válido." }, { status: 400 });
    const { data: k, error: ke } = await usr.from("brand_kits").select("nombre,color_primario,color_secundario,color_acento,estilo,logo_url,eslogan,sector,localidad,contacto,url").eq("id", kitId).maybeSingle();
    if (ke || !k) return NextResponse.json({ ok: false, error: "No se encontró ese kit de marca (¿ejecutaste el SQL 93?)." }, { status: 404 });
    const pk = paletaDesdeKit({ ...(k as KitMarca), logo_url: k.logo_url || "", eslogan: k.eslogan || "", sector: k.sector || "", localidad: k.localidad || "", contacto: k.contacto || "", url: k.url || "" });
    E = pk.paleta; avisosKit.push(...pk.avisos); logoKit = k.logo_url || ""; eslogan = k.eslogan || "";
  }
  const alto = v.formato === "story" || v.formato === "a4" || v.formato === "ig_vertical"; const ban = v.formato === "banner";
  const pad = v.formato === "story" ? 80 : v.formato === "a4" ? 90 : ban ? 40 : 64;
  const peq = v.formato === "story" ? 40 : v.formato === "a4" ? 38 : ban ? 22 : 32;
  const fs = tamanoPuesto(v.puesto, v.formato);
  const filas = filasAnuncio(v, ban ? 3 : v.formato === "ig_cuadrado" ? 5 : 7);
  const logo = logoKit || (MARCA_VISUAL.logo ? new URL(MARCA_VISUAL.logo, request.url).toString() : "");
  const solicitar = v.url ? v.url.replace(/^https:\/\//, "") : v.contacto;

  try {
    const img = new ImageResponse(
      (
        <div style={{ width: w, height: h, display: "flex", flexDirection: "column", background: E.bg, position: "relative", fontFamily: "sans-serif", color: E.texto }}>
          {v.fotoUrl ? <img src={resolverFoto(v.fotoUrl, request.url)} alt="" width={w} height={h} style={{ position: "absolute", top: 0, left: 0, width: w, height: h, objectFit: "cover" }} /> : null}
          <div style={{ position: "absolute", top: 0, left: 0, width: w, height: h, display: "flex", background: v.fotoUrl ? "linear-gradient(180deg, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.88) 100%)" : E.fondo }} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: w, height: h, padding: pad, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div style={{ display: "flex", background: E.chip, color: E.chipTxt, fontSize: peq, fontWeight: 900, letterSpacing: 2, padding: "8px 24px", borderRadius: 999, textTransform: "uppercase" }}>{v.estilo === "urgente" ? "Incorporación inmediata" : "Estamos conectando"}</div>
              <div style={{ display: "flex", fontSize: peq + 2, fontWeight: 800, color: E.acento, textAlign: "right" }}>{v.empresa}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: alto ? 28 : 14 }}>
              {v.sector ? <div style={{ display: "flex", fontSize: peq, color: E.suave, textTransform: "uppercase", letterSpacing: 3 }}>{v.sector}</div> : null}
              <div style={{ display: "flex", fontSize: fs, fontWeight: E.peso, lineHeight: 1.05, color: E.texto }}>{v.puesto}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: alto ? 16 : 8 }}>
                {filas.map((f) => <div key={f.et} style={{ display: "flex", fontSize: peq, lineHeight: 1.25 }}><span style={{ color: E.acento, fontWeight: 800, marginRight: 12 }}>{f.et}:</span><span style={{ color: E.texto }}>{f.valor}</span></div>)}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: peq - 2, color: E.suave }}>
                {eslogan ? <div style={{ display: "flex", color: E.acento, fontWeight: 800 }}>{eslogan}</div> : null}
                <div style={{ display: "flex" }}>Solicítalo ahora</div>
                <div style={{ display: "flex", color: E.texto, fontWeight: 800, fontSize: peq + 2 }}>{solicitar}</div>
              </div>
              {logo ? <img src={logo} alt="" width={ban ? 70 : 100} height={ban ? 70 : 100} style={{ objectFit: "contain" }} /> : <div style={{ display: "flex" }} />}
            </div>
          </div>
        </div>
      ),
      { width: w, height: h },
    );
    const buf = await img.arrayBuffer();
    if (buf.byteLength < 2000) return NextResponse.json({ ok: false, error: "El anuncio salió vacío; reinténtalo." }, { status: 502 });
    const bytes = new Uint8Array(buf); const ver = verificarArchivo(bytes);
    const png64 = Buffer.from(bytes).toString("base64");
    const out: Record<string, unknown> = { ok: true, png: `data:image/png;base64,${png64}`, avisos: [...avisosKit, ...avisosVacante(v)], textos: textosVacante(v), guardado: false, aviso: "" };
    const srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!ver.ok) out.aviso = ver.error;
    else if (!srv) out.aviso = "Falta SUPABASE_SERVICE_ROLE_KEY: el anuncio no se guardó en la biblioteca.";
    else {
      try {
        const sb = createClient(url, srv, { auth: { persistSession: false } });
        const sha = createHash("sha256").update(bytes).digest("hex");
        const ruta = rutaArchivo(uid, "cartel", `empleo-${v.puesto}`, sha, ver.ext);
        const up = await sb.storage.from("oficina-archivos").upload(ruta, bytes, { contentType: ver.mime, upsert: false });
        if (up.error && !/already exists|Duplicate/i.test(up.error.message)) throw new Error(up.error.message);
        const rd = await sb.storage.from("oficina-archivos").download(ruta);
        if (rd.error || !rd.data || rd.data.size !== bytes.length) throw new Error("La verificación posterior falló");
        const { error: fe } = await sb.from("office_files").upsert({ owner: uid, tipo: "cartel", nombre: `Empleo · ${v.empresa} · ${v.puesto}`.slice(0, 120), ruta, mime: ver.mime, bytes: bytes.length, sha256: sha, proveedor: "codigo", brief: { tipo: "anuncio_empleo", kitId: kitId || null, ...v } }, { onConflict: "ruta" });
        if (fe) throw new Error("No se pudo registrar el archivo (¿ejecutaste el SQL 92?)");
        out.guardado = true;
      } catch (e) { out.aviso = e instanceof Error ? e.message.slice(0, 160) : "No se pudo guardar"; }
    }
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo generar el anuncio (¿la foto no es accesible?). Quita la foto o prueba otra URL." }, { status: 502 });
  }
}
