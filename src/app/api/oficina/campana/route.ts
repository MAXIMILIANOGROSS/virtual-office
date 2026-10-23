import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { permitido } from "@/lib/cabra/limite";
import { callLLM, llmProvider } from "@/lib/llm";
import { canalesFaltantes, estadoValido, limpiarEntrada, parseCampana, parsePieza, promptCampana, promptPieza, puedeAprobar, type CanalCamp, type EntradaCamp } from "@/lib/oficina/campana";
import { consumir, reembolsar } from "@/lib/oficina/cuota";
import { limpiarPerfil, promptPerfil, type Regla } from "@/lib/oficina/perfilMarca";

export const runtime = "nodejs";
export const maxDuration = 60;
const err = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

export async function GET() { return NextResponse.json({ ok: true, ia: !!llmProvider() }); }

/** Campañas multicanal. Acciones: crear (paquete completo), regenerar (una pieza), estado (cambio con comprobación en servidor). Solo Dirección. Todo con RLS por la sesión del usuario. */
export async function POST(request: Request) {
  const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!tk || !url || !key) return err("Inicia sesión.", 401);
  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${tk}` } } });
  const { data: u, error: ue } = await sb.auth.getUser(tk); const uid = u?.user?.id; if (ue || !uid) return err("Tu sesión ha caducado.", 401);
  const { data: adm, error: ae } = await sb.rpc("oficina_is_admin"); if (ae || adm !== true) return err("Solo para Dirección (administrador).", 403);
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return err("Petición no válida.", 400); }
  const accion = body.accion;

  async function contextoMarca(kitId: string) {
    if (!kitId) return { bloque: "", reglas: [] as Regla[], marca: "" };
    const [k, p, r] = await Promise.all([
      sb.from("brand_kits").select("nombre,eslogan,sector,localidad,contacto,url").eq("id", kitId).maybeSingle(),
      sb.from("brand_profiles").select("datos").eq("kit_id", kitId).maybeSingle(),
      sb.from("brand_rules").select("termino,severidad,alternativa,excepcion").eq("kit_id", kitId).limit(300),
    ]);
    const kit = k.data as Record<string, string> | null; const reglas = (r.data || []) as Regla[];
    const marca = kit ? `Marca: ${kit.nombre}${kit.eslogan ? ` · eslogan: ${kit.eslogan}` : ""}${kit.sector ? ` · sector: ${kit.sector}` : ""}${kit.localidad ? ` · localidad: ${kit.localidad}` : ""}${kit.contacto ? ` · contacto: ${kit.contacto}` : ""}${kit.url ? ` · enlace: ${kit.url}` : ""}` : "";
    return { bloque: [marca, promptPerfil(p.data?.datos ? limpiarPerfil(p.data.datos) : null, reglas)].filter(Boolean).join("\n"), reglas, marca };
  }

  if (accion === "estado") {
    const id = String(body.piezaId || ""), nuevo = String(body.estado || ""), urlPub = typeof body.publicacionUrl === "string" ? body.publicacionUrl.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return err("Pieza no válida.", 400);
    if (!estadoValido(nuevo, urlPub)) return err(nuevo === "publicado" ? "Para marcar «publicado» hace falta el enlace https de la publicación real." : "Estado no válido.", 400);
    const { data: p } = await sb.from("campana_piezas").select("id,canal,texto,campana_id").eq("id", id).maybeSingle(); if (!p) return err("No se encontró la pieza.", 404);
    if (nuevo === "aprobado" || nuevo === "programado" || nuevo === "publicado") {
      const { data: c } = await sb.from("campanas").select("kit_id").eq("id", p.campana_id).maybeSingle();
      const { reglas } = await contextoMarca(c?.kit_id || ""); const v = puedeAprobar(p.texto, p.canal as CanalCamp, reglas);
      if (!v.ok) return NextResponse.json({ ok: false, error: "No se puede aprobar: " + v.motivos.join(" "), motivos: v.motivos }, { status: 422 });
    }
    const { error } = await sb.from("campana_piezas").update({ estado: nuevo, publicacion_url: nuevo === "publicado" ? urlPub : null, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return err("No se pudo cambiar el estado.", 500);
    const { data: chk } = await sb.from("campana_piezas").select("estado").eq("id", id).maybeSingle();
    return chk?.estado === nuevo ? NextResponse.json({ ok: true, estado: nuevo }) : err("No se pudo confirmar el cambio.", 500);
  }

  if (!llmProvider()) return err("No hay IA configurada en el servidor (LLM_BASE_URL, LLM_API_KEY y LLM_MODEL, o ANTHROPIC_API_KEY). No se genera nada simulado.", 503);
  if (!permitido("campana:" + uid, 20, 3600000)) return err("Demasiadas generaciones seguidas. Espera un poco.", 429);

  if (accion === "crear") {
    const v = limpiarEntrada(body); if (!v.ok) return err(v.error, 400); const e = v.e;
    if (e.kitId) { const { data: k } = await sb.from("brand_kits").select("id").eq("id", e.kitId).maybeSingle(); if (!k) return err("No se encontró esa marca.", 404); }
    const cu = await consumir(uid, "campana"); if (!cu.ok) return err(cu.error, cu.status);
    const { bloque } = await contextoMarca(e.kitId);
    const r = await callLLM(promptCampana(e, bloque), [{ role: "user", content: "Genera la campaña ahora." }], 4200);
    if (!r) { await reembolsar(uid, cu.ref); return err("El proveedor de IA no respondió (límite gratuito, clave o modelo incorrectos). Inténtalo de nuevo en un minuto.", 502); }
    const sal = parseCampana(r, e.canales); if (!sal) { await reembolsar(uid, cu.ref); return err("La IA no devolvió una campaña legible. Reinténtalo.", 502); }
    const faltan = canalesFaltantes(sal, e.canales);
    const { data: c, error: ce } = await sb.from("campanas").insert({ owner: uid, kit_id: e.kitId || null, titulo: sal.titulo, entrada: e, estrategia: { ...sal.estrategia, titulares: sal.titulares, calendario: sal.calendario, verificar: sal.verificar, pregunta: sal.pregunta }, proveedor: "llm" }).select("id").maybeSingle();
    if (ce || !c) { await reembolsar(uid, cu.ref); return err("La campaña se generó pero no se pudo guardar (¿ejecutaste el SQL 96?).", 500); }
    const { data: ps, error: pe } = await sb.from("campana_piezas").insert(sal.piezas.map((p) => ({ owner: uid, campana_id: c.id, canal: p.canal, titulo: p.titulo, texto: p.texto, cta: p.cta, visual: p.visual }))).select("id,canal");
    if (pe || !ps?.length) return err("No se pudieron guardar las piezas.", 500);
    return NextResponse.json({ ok: true, id: c.id, faltan, pregunta: sal.pregunta });
  }

  if (accion === "regenerar") {
    const id = String(body.piezaId || ""); if (!/^[0-9a-f-]{36}$/i.test(id)) return err("Pieza no válida.", 400);
    const { data: p } = await sb.from("campana_piezas").select("id,canal,texto,version,campana_id").eq("id", id).maybeSingle(); if (!p) return err("No se encontró la pieza.", 404);
    const { data: c } = await sb.from("campanas").select("kit_id,entrada,estrategia").eq("id", p.campana_id).maybeSingle(); if (!c) return err("No se encontró la campaña.", 404);
    const cu = await consumir(uid, "pieza"); if (!cu.ok) return err(cu.error, cu.status);
    const e = c.entrada as EntradaCamp; const { bloque } = await contextoMarca(c.kit_id || "");
    const r = await callLLM(promptPieza(e, c.estrategia, p.canal as CanalCamp, p.texto, bloque), [{ role: "user", content: "Reescribe la pieza." }], 1800);
    if (!r) { await reembolsar(uid, cu.ref); return err("El proveedor de IA no respondió. Inténtalo de nuevo en un minuto.", 502); }
    const np = parsePieza(r); if (!np) { await reembolsar(uid, cu.ref); return err("La IA no devolvió una pieza legible. Reinténtalo.", 502); }
    await sb.from("campana_pieza_versiones").insert({ owner: uid, pieza_id: p.id, version: p.version, texto: p.texto });
    const { error } = await sb.from("campana_piezas").update({ ...np, estado: "borrador", publicacion_url: null, version: p.version + 1, updated_at: new Date().toISOString() }).eq("id", p.id);
    if (error) return err("No se pudo guardar la pieza regenerada.", 500);
    return NextResponse.json({ ok: true });
  }
  return err("Acción no válida.", 400);
}
