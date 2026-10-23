import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { permitido } from "@/lib/cabra/limite";
import { callLLM, llmProvider } from "@/lib/llm";
import { consumir, reembolsar } from "@/lib/oficina/cuota";
import { limpiarPerfil, promptPerfil, revisarReglas, type Regla } from "@/lib/oficina/perfilMarca";
import { limpiarEncargo, parseSalida, promptMarketing, revisarAfirmaciones } from "@/lib/oficina/marketing";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET: ¿hay IA configurada? (para avisar en la interfaz sin simular generación). */
export async function GET() { return NextResponse.json({ ok: true, ia: !!llmProvider() }); }

/** Estudio de marketing: mejora o crea textos. Solo Dirección por ahora. Usa el kit de marca como única fuente de datos de empresa. Guarda cada pieza en el historial (SQL 94). */
export async function POST(request: Request) {
  const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!tk || !url || !key) return NextResponse.json({ ok: false, error: "Inicia sesión." }, { status: 401 });
  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${tk}` } } });
  const { data: u, error: ue } = await sb.auth.getUser(tk); const uid = u?.user?.id;
  if (ue || !uid) return NextResponse.json({ ok: false, error: "Tu sesión ha caducado." }, { status: 401 });
  const { data: adm, error: ae } = await sb.rpc("oficina_is_admin");
  if (ae || adm !== true) return NextResponse.json({ ok: false, error: "Solo para Dirección (administrador)." }, { status: 403 });
  if (!permitido("marketing:" + uid, 40, 3600000)) return NextResponse.json({ ok: false, error: "Demasiadas generaciones seguidas. Espera un poco." }, { status: 429 });

  let body: Record<string, unknown>; try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Petición no válida." }, { status: 400 }); }
  const v = limpiarEncargo(body); if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  if (!llmProvider()) return NextResponse.json({ ok: false, error: "No hay IA configurada en el servidor (LLM_BASE_URL, LLM_API_KEY y LLM_MODEL, o ANTHROPIC_API_KEY). No se genera nada simulado." }, { status: 503 });

  // Kit de marca: se lee con la sesión del usuario (RLS). Los datos de una marca nunca se mezclan con los de otra.
  let kit: Record<string, string> | null = null; const kitId = typeof body.kitId === "string" ? body.kitId : "";
  if (kitId) {
    if (!/^[0-9a-f-]{36}$/i.test(kitId)) return NextResponse.json({ ok: false, error: "Kit de marca no válido." }, { status: 400 });
    const { data: k } = await sb.from("brand_kits").select("nombre,eslogan,sector,localidad,contacto,url").eq("id", kitId).maybeSingle();
    if (!k) return NextResponse.json({ ok: false, error: "No se encontró ese kit de marca." }, { status: 404 });
    kit = k as Record<string, string>;
  }
  // Memoria de marca + reglas (SQL 95). Si aún no existen las tablas, se sigue sin ellas.
  let reglas: Regla[] = []; let bloqueMemoria = "";
  if (kitId) {
    const { data: pf } = await sb.from("brand_profiles").select("datos").eq("kit_id", kitId).maybeSingle();
    const { data: rs } = await sb.from("brand_rules").select("termino,severidad,alternativa,excepcion").eq("kit_id", kitId).limit(300);
    reglas = ((rs || []) as Regla[]);
    bloqueMemoria = promptPerfil(pf?.datos ? limpiarPerfil(pf.datos) : null, reglas);
  }
  const cu = await consumir(uid, "texto"); if (!cu.ok) return NextResponse.json({ ok: false, error: cu.error }, { status: cu.status });
  const sistema = promptMarketing(v.e, kit) + (bloqueMemoria ? "\n" + bloqueMemoria : "");
  const r = await callLLM(sistema, [{ role: "user", content: `${v.e.modo === "mejorar" || v.e.modo === "revision" || v.e.modo === "traduccion" ? "Texto del usuario" : "Idea del usuario"}:\n${v.e.texto}` }], v.e.versiones === 3 ? 2600 : 1400);
  if (!r) { await reembolsar(uid, cu.ref); }
  if (!r) return NextResponse.json({ ok: false, error: "El proveedor de IA no respondió (límite gratuito, clave o modelo incorrectos). Inténtalo de nuevo en un minuto." }, { status: 502 });
  const salida = parseSalida(r);
  if (!salida) { await reembolsar(uid, cu.ref); }
  if (!salida) return NextResponse.json({ ok: false, error: "La IA devolvió una respuesta vacía. Reinténtalo." }, { status: 502 });
  // Comprobación local (sin IA) de afirmaciones que necesitan evidencia, por versión.
  const alertas = salida.versiones.map((x) => revisarAfirmaciones(x.texto));
  const revision = salida.versiones.map((x) => revisarReglas(x.texto, reglas));
  let id: string | null = null; let guardado = false;
  try {
    const { data: fila, error: ge } = await sb.from("marketing_piezas").insert({ owner: uid, kit_id: kitId || null, modo: v.e.modo, canal: v.e.canal, tono: v.e.tono, objetivo: v.e.objetivo, entrada: v.e.texto, salida: { ...salida, alertas, revision }, proveedor: llmProvider() ? "llm" : null }).select("id").maybeSingle();
    if (!ge && fila?.id) { id = String(fila.id); guardado = true; }
  } catch { /* se entrega igualmente */ }
  return NextResponse.json({ ok: true, id, guardado, salida, alertas, revision, reglasActivas: reglas.length });
}
