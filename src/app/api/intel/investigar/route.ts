import { NextResponse, after } from "next/server";
import { createHash } from "node:crypto";
import { autenticar, envRed, esRespuesta, paradaActiva, SQL_FALTA, tablaFalta } from "@/lib/intel/servidor";
import { diagnosticar, type Diagnostico } from "@/lib/intel/diagnostico";
import { ejecutarInvestigacion } from "@/lib/intel/ejecutor";
import { fuentesPermitidas, puedeInvestigar } from "@/lib/intel/permisosRed";
import { PLATAFORMAS, type Plataforma } from "@/lib/intel/tipos";
import { urlPublica, sinSecretos } from "@/lib/intel/seguridad";
import { callLLM, llmProvider } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_DIA = Number(process.env.INTEL_MAX_DIA) > 0 ? Number(process.env.INTEL_MAX_DIA) : 20;
const MAX_SIMULTANEAS = 2;
const COLS = "id,proyecto,agente,pregunta,objetivo,fuentes,urls,profundidad,estado,intentos,motivo,guardado,ms,created_at,started_at,finished_at";

/** GET sin id: últimas investigaciones (sin informe). GET ?id=: investigación completa con informe y elementos. Las que quedaron "en curso" más de 3 minutos se marcan interrumpidas. */
export async function GET(request: Request) {
  const a = await autenticar(request); if (esRespuesta(a)) return a;
  const id = new URL(request.url).searchParams.get("id");
  const corte = new Date(Date.now() - 3 * 60000).toISOString();
  await a.sb.from("intel_jobs").update({ estado: "fallida", motivo: "Interrumpida: el servidor terminó antes de acabar (tiempo máximo o reinicio). Puedes repetirla.", finished_at: new Date().toISOString() }).eq("owner", a.uid).in("estado", ["en_cola", "en_curso"]).lt("created_at", corte);
  if (id) {
    const { data, error } = await a.sb.from("intel_jobs").select(COLS + ",informe,elementos,registros,omitidas").eq("id", id).eq("owner", a.uid).maybeSingle();
    if (tablaFalta(error)) return NextResponse.json({ ok: false, error: SQL_FALTA }, { status: 400 });
    return data ? NextResponse.json({ ok: true, job: data }) : NextResponse.json({ ok: false, error: "No existe esa investigación." }, { status: 404 });
  }
  const { data, error } = await a.sb.from("intel_jobs").select(COLS).eq("owner", a.uid).order("created_at", { ascending: false }).limit(30);
  if (tablaFalta(error)) return NextResponse.json({ ok: true, tabla: false, jobs: [], aviso: SQL_FALTA });
  return NextResponse.json({ ok: true, tabla: true, jobs: data ?? [] });
}

export async function POST(request: Request) {
  const a = await autenticar(request, { clave: "intel-nueva", max: 15, ms: 3600000 }); if (esRespuesta(a)) return a;
  const parada = await paradaActiva(a.sb); if (parada) return NextResponse.json({ ok: false, error: parada }, { status: 423 });
  let b: Record<string, unknown>; try { b = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Petición no válida." }, { status: 400 }); }
  const pregunta = typeof b.pregunta === "string" ? b.pregunta.trim().slice(0, 1000) : ""; if (pregunta.length < 3) return NextResponse.json({ ok: false, error: "Escribe la pregunta." }, { status: 422 });
  const agente = typeof b.agente === "string" ? b.agente : "ciro"; if (!puedeInvestigar(agente)) return NextResponse.json({ ok: false, error: "Ese agente no tiene permiso para investigar fuera." }, { status: 403 });
  const proyecto = (typeof b.proyecto === "string" && b.proyecto.trim() ? b.proyecto.trim() : "island-crew").slice(0, 80);
  const objetivo = typeof b.objetivo === "string" ? b.objetivo.trim().slice(0, 500) : null;
  const profundidad = b.profundidad === "rapida" || b.profundidad === "profunda" ? b.profundidad : "normal";
  const urls = (Array.isArray(b.urls) ? b.urls : []).slice(0, 8).map((x) => urlPublica(x)).filter((x): x is string => !!x);
  const preferidas = (Array.isArray(b.fuentes) ? b.fuentes : []).filter((x): x is Plataforma => PLATAFORMAS.includes(x as Plataforma) && fuentesPermitidas(agente).includes(x as Plataforma));
  const clave = typeof b.clave === "string" && b.clave.length >= 8 ? b.clave.slice(0, 120) : createHash("sha256").update([pregunta, proyecto, agente, urls.join(","), preferidas.join(","), profundidad, new Date().toISOString().slice(0, 13)].join("|")).digest("hex");

  const desde = new Date(Date.now() - 86400000).toISOString();
  const { count: hoy, error: ce } = await a.sb.from("intel_jobs").select("id", { count: "exact", head: true }).eq("owner", a.uid).gte("created_at", desde);
  if (tablaFalta(ce)) return NextResponse.json({ ok: false, error: SQL_FALTA }, { status: 400 });
  if ((hoy ?? 0) >= MAX_DIA) return NextResponse.json({ ok: false, error: `Límite de ${MAX_DIA} investigaciones en 24 horas (INTEL_MAX_DIA).` }, { status: 429 });
  const { count: activas } = await a.sb.from("intel_jobs").select("id", { count: "exact", head: true }).eq("owner", a.uid).in("estado", ["en_cola", "en_curso"]).gte("created_at", new Date(Date.now() - 3 * 60000).toISOString());
  if ((activas ?? 0) >= MAX_SIMULTANEAS) return NextResponse.json({ ok: false, error: "Ya hay investigaciones en marcha. Espera a que terminen o cancélalas." }, { status: 429 });

  const { data: ins, error } = await a.sb.from("intel_jobs").insert({ owner: a.uid, proyecto, agente, pregunta, objetivo, fuentes: preferidas, urls, profundidad, estado: "en_cola", idempotency_key: clave }).select("id").single();
  if (error?.code === "23505") { const { data: ya } = await a.sb.from("intel_jobs").select("id,estado").eq("owner", a.uid).eq("idempotency_key", clave).maybeSingle(); return NextResponse.json({ ok: true, id: ya?.id, estado: ya?.estado, repetida: true }, { status: 200 }); }
  if (error || !ins) return NextResponse.json({ ok: false, error: tablaFalta(error) ? SQL_FALTA : "No se pudo registrar la investigación." }, { status: 400 });
  const id = ins.id as string; const { sb, uid } = a;

  // La investigación sigue en el servidor aunque el navegador se cierre; la interfaz consulta el estado por id.
  after(async () => {
    const env = envRed();
    try {
      await sb.from("intel_jobs").update({ estado: "en_curso", started_at: new Date().toISOString(), intentos: 1 }).eq("id", id).eq("owner", uid).eq("estado", "en_cola");
      const res = await ejecutarInvestigacion({ pregunta, objetivo: objetivo ?? undefined, proyecto, agente, urls, preferidas: preferidas.length ? preferidas : undefined, profundidad }, {
        env,
        diagnostico: async () => {
          const { data } = await sb.from("intel_diagnostico").select("datos,comprobado").eq("owner", uid).maybeSingle();
          if (data && Date.now() - Date.parse(data.comprobado) < 30 * 60000) return data.datos as Diagnostico[];
          const d = await diagnosticar({ env }); await sb.from("intel_diagnostico").upsert({ owner: uid, datos: d, comprobado: new Date().toISOString() }, { onConflict: "owner" }); return d;
        },
        llm: llmProvider() ? (sis, usr) => callLLM(sis, [{ role: "user", content: usr }], 1500) : undefined,
        cancelado: async () => { const { data } = await sb.from("intel_jobs").select("estado").eq("id", id).eq("owner", uid).maybeSingle(); return data?.estado === "cancelada"; },
        presupuestoMs: 40000,
      });
      if (res.estado === "cancelada") { await sb.from("intel_jobs").update({ finished_at: new Date().toISOString(), ms: res.ms, motivo: "Cancelada por el usuario." }).eq("id", id).eq("owner", uid); return; }
      await sb.from("intel_jobs").update({ estado: res.estado, informe: res.informe || null, elementos: res.elementos, registros: res.registros, omitidas: res.omitidas, motivo: res.motivo ?? null, ms: res.ms, finished_at: new Date().toISOString() }).eq("id", id).eq("owner", uid).neq("estado", "cancelada");
    } catch (e) {
      await sb.from("intel_jobs").update({ estado: "fallida", motivo: sinSecretos(String((e as Error)?.message || e)).slice(0, 300), finished_at: new Date().toISOString() }).eq("id", id).eq("owner", uid);
    }
  });
  return NextResponse.json({ ok: true, id, estado: "en_cola" }, { status: 202 });
}
