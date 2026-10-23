import { NextResponse } from "next/server";
import { autenticar, envRed, esRespuesta, tablaFalta } from "@/lib/intel/servidor";
import { diagnosticar, UPSTREAM } from "@/lib/intel/diagnostico";
import { puedeInvestigar } from "@/lib/intel/permisosRed";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET: último diagnóstico guardado (no hace consultas). POST: ejecuta consultas reales de solo lectura a cada fuente y lo guarda. */
export async function GET(request: Request) {
  const a = await autenticar(request); if (esRespuesta(a)) return a;
  const { data, error } = await a.sb.from("intel_diagnostico").select("datos,comprobado").eq("owner", a.uid).maybeSingle();
  if (error && !tablaFalta(error)) return NextResponse.json({ ok: false, error: "No se pudo leer el diagnóstico." }, { status: 500 });
  return NextResponse.json({ ok: true, tabla: !tablaFalta(error), diagnostico: data?.datos ?? null, comprobado: data?.comprobado ?? null, upstream: UPSTREAM, ejecutaAgentReachPython: false });
}
export async function POST(request: Request) {
  const a = await autenticar(request, { clave: "intel-diag", max: 10, ms: 3600000 }); if (esRespuesta(a)) return a;
  let b: { probarBusqueda?: unknown } = {}; try { b = await request.json(); } catch { /* cuerpo vacío */ }
  const diag = await diagnosticar({ env: envRed(), probarBusqueda: b.probarBusqueda === true });
  const { error } = await a.sb.from("intel_diagnostico").upsert({ owner: a.uid, datos: diag, comprobado: new Date().toISOString() }, { onConflict: "owner" });
  return NextResponse.json({ ok: true, tabla: !tablaFalta(error), guardado: !error, diagnostico: diag, comprobado: new Date().toISOString(), upstream: UPSTREAM, ejecutaAgentReachPython: false, agentes: puedeInvestigar("ciro") });
}
