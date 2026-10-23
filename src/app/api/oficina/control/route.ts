import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { llmProvider } from "@/lib/llm";
import { evaluarSalud, erroresSeguidos } from "@/lib/oficina/salud";

export const runtime = "nodejs";
export const maxDuration = 30;

async function admin(request: Request): Promise<{ sb: SupabaseClient; uid: string } | NextResponse> {
  const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!tk || !url || !key) return NextResponse.json({ ok: false, error: "Inicia sesión." }, { status: 401 });
  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${tk}` } } });
  const { data: u, error } = await sb.auth.getUser(tk); const uid = u?.user?.id;
  if (error || !uid) return NextResponse.json({ ok: false, error: "Tu sesión ha caducado." }, { status: 401 });
  const { data: adm, error: ae } = await sb.rpc("oficina_is_admin");
  if (ae || adm !== true) return NextResponse.json({ ok: false, error: "Solo para Dirección (administrador)." }, { status: 403 });
  return { sb, uid };
}

/** Salud real de la oficina, calculada con datos persistidos (ciclos, tareas, control) y configuración del servidor. */
export async function GET(request: Request) {
  const a = await admin(request); if (a instanceof NextResponse) return a; const { sb, uid } = a; const ahora = Date.now();
  const { data: ctl, error: ce } = await sb.from("office_control").select("detenida,motivo,desde,umbral_ciclo_min,umbral_atasco_min,max_errores_seguidos").eq("id", 1).maybeSingle();
  const tablaControl = !ce && !!ctl;
  const { data: ciclos } = tablaControl ? await sb.from("office_ciclos").select("id,inicio,fin,origen,resultado,ejecutadas,fallos,bloqueadas,ideas,sin_ia,error").order("inicio", { ascending: false }).limit(20) : { data: [] };
  const cs = (ciclos || []) as { inicio: string; fin: string | null; resultado: string | null; error: string | null; origen: string }[];
  const real = cs.filter((c) => c.resultado !== "omitido");
  const ult = real[0]; const enMarcha = cs.find((c) => !c.fin);
  const { data: ts, error: te } = await sb.from("office_tasks").select("estado,updated_at,created_at").in("estado", ["pendiente", "en_curso", "bloqueada", "fallida", "requiere_aprobacion"]).limit(1000);
  const lista = (ts || []) as { estado: string; updated_at: string }[];
  const n = (e: string) => lista.filter((t) => t.estado === e).length;
  const viejas = lista.filter((t) => t.estado === "en_curso").map((t) => Math.round((ahora - Date.parse(t.updated_at)) / 60000));
  const hoy = new Date(ahora).toISOString().slice(0, 10);
  const [{ count: llm }, { data: aj }, { data: hist }] = await Promise.all([
    sb.from("office_log").select("id", { count: "exact", head: true }).eq("owner", uid).eq("evento", "llm").gte("at", hoy + "T00:00:00Z"),
    sb.from("office_settings").select("presupuesto_dia").eq("owner", uid).maybeSingle(),
    tablaControl ? sb.from("office_control_hist").select("*").order("at", { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
  ]);
  const salud = evaluarSalud({
    ahora, detenida: ctl?.detenida === true, motivoParada: ctl?.motivo ?? null, bdOk: !te, tablaControl, iaConfigurada: !!llmProvider(),
    cronSecret: !!process.env.CRON_SECRET, serviceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    ultimoInicio: ult ? Date.parse(ult.inicio) : null, ultimoFin: ult?.fin ? Date.parse(ult.fin) : null, ultimoResultado: ult?.resultado ?? null, ultimoError: ult?.error ?? null,
    cicloEnMarchaDesde: enMarcha ? Date.parse(enMarcha.inicio) : null,
    umbralCicloMin: ctl?.umbral_ciclo_min ?? 45, umbralAtascoMin: ctl?.umbral_atasco_min ?? 20, maxErrores: ctl?.max_errores_seguidos ?? 3,
    erroresSeguidos: erroresSeguidos(real.map((c) => c.resultado)),
    tareas: { pendientes: n("pendiente"), enCurso: n("en_curso"), bloqueadas: n("bloqueada"), fallidas: n("fallida"), aprobacion: n("requiere_aprobacion") },
    enCursoMasViejaMin: viejas.length ? Math.max(...viejas) : null,
    presupuesto: { usado: llm || 0, limite: aj?.presupuesto_dia ?? 40 }, cuotasAgotadas: [],
  });
  return NextResponse.json({ ok: true, ...salud, conexiones: { ia: !!llmProvider(), cronReciente: salud.minutosDesdeCiclo !== null && salud.minutosDesdeCiclo < 45 && ult?.resultado !== "error", bd: !te }, detenida: ctl?.detenida === true, motivo: ctl?.motivo ?? null, desde: ctl?.desde ?? null, tablaControl, ciclos: cs.slice(0, 10), historial: hist || [], tareas: { pendientes: n("pendiente"), enCurso: n("en_curso"), bloqueadas: n("bloqueada"), fallidas: n("fallida"), aprobacion: n("requiere_aprobacion") }, presupuesto: { usado: llm || 0, limite: aj?.presupuesto_dia ?? 40 } });
}

/** DETENER / REANUDAR. Solo el administrador; las RPC vuelven a comprobar el permiso en la base de datos. */
export async function POST(request: Request) {
  const a = await admin(request); if (a instanceof NextResponse) return a; const { sb } = a;
  let b: { accion?: unknown; motivo?: unknown; confirmar?: unknown }; try { b = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Petición no válida." }, { status: 400 }); }
  const motivo = typeof b.motivo === "string" ? b.motivo.trim().slice(0, 300) : "";
  if (b.accion === "detener") {
    const { data, error } = await sb.rpc("office_detener", { p_motivo: motivo || "Parada manual" });
    if (error) return NextResponse.json({ ok: false, error: /does not exist|function/i.test(error.message) ? "Falta ejecutar el SQL 98." : "No se pudo detener: " + error.message }, { status: 400 });
    return NextResponse.json({ ok: true, detenida: true, resultado: data });
  }
  if (b.accion === "reanudar") {
    const { data: sens } = await sb.from("office_tasks").select("id").in("estado", ["requiere_aprobacion"]).in("nivel", ["C", "D"]).limit(1);
    if (sens?.length && b.confirmar !== true) return NextResponse.json({ ok: false, necesitaConfirmar: true, error: "Hay tareas sensibles (nivel C/D) esperando aprobación. Confirma que quieres reanudar; no se ejecutarán sin tu aprobación." }, { status: 409 });
    if (!llmProvider()) return NextResponse.json({ ok: false, error: "No hay IA configurada en el servidor; reanudar no serviría de nada." }, { status: 412 });
    const { data, error } = await sb.rpc("office_reanudar", { p_motivo: motivo || "Reanudación manual" });
    if (error) return NextResponse.json({ ok: false, error: "No se pudo reanudar: " + error.message }, { status: 400 });
    return NextResponse.json({ ok: true, detenida: false, resultado: data });
  }
  return NextResponse.json({ ok: false, error: "Acción desconocida." }, { status: 422 });
}
