import { NextResponse } from "next/server";
import { autenticar, esRespuesta } from "@/lib/intel/servidor";

export const runtime = "nodejs";
/** Acciones sobre una investigación propia: cancelar (solo si sigue en cola o en curso) o guardar/quitar de la biblioteca. */
export async function POST(request: Request) {
  const a = await autenticar(request, { clave: "intel-accion", max: 60, ms: 3600000 }); if (esRespuesta(a)) return a;
  let b: { id?: unknown; accion?: unknown }; try { b = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Petición no válida." }, { status: 400 }); }
  const id = typeof b.id === "string" ? b.id : ""; if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Identificador no válido." }, { status: 422 });
  if (b.accion === "cancelar") {
    const { data, error } = await a.sb.from("intel_jobs").update({ estado: "cancelada", motivo: "Cancelada por el usuario.", finished_at: new Date().toISOString() }).eq("id", id).eq("owner", a.uid).in("estado", ["en_cola", "en_curso"]).select("id");
    if (error) return NextResponse.json({ ok: false, error: "No se pudo cancelar." }, { status: 400 });
    return data?.length ? NextResponse.json({ ok: true, estado: "cancelada" }) : NextResponse.json({ ok: false, error: "Esa investigación ya había terminado." }, { status: 409 });
  }
  if (b.accion === "guardar" || b.accion === "quitar") {
    const { data, error } = await a.sb.from("intel_jobs").update({ guardado: b.accion === "guardar" }).eq("id", id).eq("owner", a.uid).not("informe", "is", null).select("id");
    if (error) return NextResponse.json({ ok: false, error: "No se pudo actualizar la biblioteca." }, { status: 400 });
    return data?.length ? NextResponse.json({ ok: true, guardado: b.accion === "guardar" }) : NextResponse.json({ ok: false, error: "Solo se guardan investigaciones con informe." }, { status: 409 });
  }
  return NextResponse.json({ ok: false, error: "Acción no reconocida." }, { status: 422 });
}
