import type { SupabaseClient } from "@supabase/supabase-js";
import { guardarEntregable } from "@/lib/oficina/entregables";
import { puede, politicaDe } from "@/lib/oficina/permisos";
import { analizarLeads, promptLeads, type LeadFila } from "@/lib/oficina/leadsAnalisis";
import { producir } from "@/lib/oficina/productor";
import { limpiarRegla } from "@/lib/oficina/perfilMarca";
import { nuevoMedidor, envuelve, registrarCoste } from "@/lib/oficina/costes";
import { buscarWeb } from "@/lib/oficina/busqueda";
import { analizarCola, textoOperaciones, type TareaOp } from "@/lib/oficina/operaciones";
import { generarInforme } from "@/lib/oficina/informeDb";
import { investigar } from "@/lib/oficina/investigacion";
import type { Fuente } from "@/lib/oficina/busqueda";
import { estadoParada } from "@/lib/oficina/control";
import { callLLM, llmProvider } from "@/lib/llm";
import { agentePorId, areaDb, promptDe } from "@/lib/oficina/agentes";
import { contextoDeAgente } from "@/lib/oficina/contextoDb";
import { estadoTrasEjecutar, clasificarNivel, type Nivel } from "@/lib/oficina/tareas";
import { instruccionIdea, parseIdea, PREFIJO_IDEA, promptIdea, elegirAutor, tocaIdea } from "@/lib/oficina/iniciativa";
import { AGENTES } from "@/lib/oficina/agentes";
import { PREFIJO_GUION, MAX_GUIONES_DIA_MANUAL, guionistaDe, instruccionGuion, parseGuion, promptGuion, tocaGuion, controlCalidad, elegirCampana } from "@/lib/oficina/studioVideo";
import { esRepetido } from "@/lib/studio/calendario";
import { atascadas, elegirTareas, resumenDiario, tocaResumen, trasFallo, type TareaC } from "@/lib/oficina/ciclo";


type Fila = TareaC & { owner: string; instruccion: string; agente: string; nivel: string };

export type Diag = { pausa: boolean; presupuesto: number; usadasHoy: number; pendientes: number; tomadas: number };
/** Un ciclo del bucle 24/7. Lo usan el cron (GitHub Actions) y el botón "Ejecutar ciclo ahora" del CEO. Nunca completa tareas ni ejecuta acciones externas. */
async function cicloInterno(sb: SupabaseClient, soloOwner: string | undefined, alto: () => Promise<boolean>) {
    const now = Date.now(); const hoy = new Date(now).toISOString().slice(0, 10);
  const out = { ejecutadas: 0, fallos: 0, bloqueadas: 0, resumenes: 0, pausadas: 0, ideas: 0 };

  const { data: filas, error } = await sb.from("office_tasks").select("id,owner,instruccion,agente,nivel,estado,intentos,prox_intento,created_at,updated_at").in("estado", ["pendiente", "en_curso"]).limit(200);
  if (error) return { ok: false as const, status: 500, error: `No se pudieron leer las tareas (${String(error.code || "")} ${String(error.message || "").slice(0, 160)}). ¿Ejecutaste el SQL 87 y 88?` };
  const tareas = (filas || []) as Fila[];
  const owners = Array.from(new Set(tareas.map((t) => t.owner))).filter((o) => !soloOwner || o === soloOwner);
  const diag: Diag[] = [];
  const log = (owner: string, task_id: string | null, evento: string, detalle: string) => sb.from("office_log").insert({ owner, task_id, evento, detalle: detalle.slice(0, 300) });

  for (const owner of owners) {
    const { data: aj } = await sb.from("office_settings").select("pausa,presupuesto_dia").eq("owner", owner).maybeSingle();
    if (aj?.pausa) { out.pausadas++; diag.push({ pausa: true, presupuesto: aj?.presupuesto_dia ?? 40, usadasHoy: 0, pendientes: 0, tomadas: 0 }); continue; }
    const mias = tareas.filter((t) => t.owner === owner);
    for (const t of atascadas(mias, now)) { await sb.from("office_tasks").update({ estado: "bloqueada", error: "Ciclo interrumpido: la tarea quedó en curso más de 20 min.", updated_at: new Date().toISOString() }).eq("id", t.id).eq("estado", "en_curso"); await log(owner, t.id, "bloqueada", "Atascada en curso"); out.bloqueadas++; }
    const { count } = await sb.from("office_log").select("id", { count: "exact", head: true }).eq("owner", owner).eq("evento", "llm").gte("at", hoy + "T00:00:00Z");
    const elegidas = elegirTareas(mias, now, count || 0, aj?.presupuesto_dia ?? 40);
    diag.push({ pausa: false, presupuesto: aj?.presupuesto_dia ?? 40, usadasHoy: count || 0, pendientes: mias.filter((t) => t.estado === "pendiente").length, tomadas: elegidas.length });
    for (const t of elegidas) {
      if (await alto()) break; // freno de emergencia: no se inicia ninguna tarea más
      // Idempotencia: solo la ejecuta quien consiga pasarla de pendiente a en_curso.
      const { data: ganada } = await sb.from("office_tasks").update({ estado: "en_curso", updated_at: new Date().toISOString() }).eq("id", t.id).eq("estado", "pendiente").select("id");
      if (!ganada || !ganada.length) continue;
      await log(owner, t.id, "llm", "Ejecución automática");
      const ag = agentePorId(t.agente); const nivel = (["A", "B", "C", "D"].includes(t.nivel) ? t.nivel : clasificarNivel(t.instruccion)) as Nivel;
      let res: string | null = null; let motivo = ""; let fuentesInv: Fuente[] | null = null; let bloqueoDuro = false; const med = nuevoMedidor(); const llm = envuelve(callLLM, med); let tipoEnt: "informe" | "analisis" | "campana" = "informe"; let metaEnt: Record<string, unknown> = {};
      if (!ag) motivo = "Agente desconocido.";
      else if (!llmProvider()) motivo = "No hay IA configurada en el servidor.";
      else {
        const extra = nivel === "C" || nivel === "D" ? "\nEsta orden implica una acción sensible: prepara SOLO el borrador/plan y señala qué debe aprobar el CEO." : "";
        try {
          const ctx = await contextoDeAgente(sb, owner, ag.id, t.instruccion);
          if (puede(ag.id, "buscar_web").ok) {
            const inv = await investigar(t.instruccion, promptDe(ag) + extra + ctx, { buscarWeb: (q) => buscarWeb(q), callLLM: llm });
            if (inv.ok) { res = inv.texto; fuentesInv = inv.fuentes; }
            else if (inv.bloqueo) { bloqueoDuro = true; motivo = inv.motivo; }
            else motivo = inv.motivo;
          } else if (puede(ag.id, "leer_tareas").ok) {
            const { data: ot } = await sb.from("office_tasks").select("id,instruccion,agente,nivel,estado,error,intentos,created_at,updated_at").eq("owner", owner).neq("id", t.id).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).limit(500);
            res = textoOperaciones(analizarCola((ot || []) as TareaOp[], now), (id) => agentePorId(id)?.nombre ?? id);
          } else if (puede(ag.id, "leer_marca").ok) {
            const pr = await producir(t.instruccion, promptDe(ag) + extra + ctx, {
              callLLM: llm,
              cargarMarca: async () => {
                const { data: ks } = await sb.from("brand_kits").select("id,nombre").eq("owner", owner).order("updated_at", { ascending: false }).limit(20);
                const kit = (ks || []).find((k: { nombre: string }) => t.instruccion.toLowerCase().includes(k.nombre.toLowerCase())) ?? (ks || [])[0]; if (!kit) return null;
                const [{ data: pf }, { data: rs }] = await Promise.all([sb.from("brand_profiles").select("datos").eq("kit_id", kit.id).maybeSingle(), sb.from("brand_rules").select("termino,severidad,alternativa,excepcion").eq("kit_id", kit.id).limit(300)]);
                return { kit: kit.nombre, datos: pf?.datos ?? {}, reglas: (rs || []).map((r: unknown) => limpiarRegla(r)).filter((r): r is NonNullable<ReturnType<typeof limpiarRegla>> => !!r) };
              },
            });
            if (pr.ok) { res = pr.texto; tipoEnt = "campana"; metaEnt = { marca: pr.marca, aprobada: pr.aprobado, hallazgos: pr.hallazgos.length }; } else motivo = pr.motivo;
          } else if (puede(ag.id, "leer_leads").ok) {
            const { data: ls, error: le2 } = await sb.from("leads").select("id,type,payload,created_at,status,score").order("created_at", { ascending: false }).limit(2000);
            if (le2) { bloqueoDuro = true; motivo = "No se pudieron leer los leads: " + le2.message.slice(0, 120); }
            else {
              const an = analizarLeads((ls || []) as LeadFila[]);
              const txt = await llm(promptLeads(promptDe(ag) + extra, an), [{ role: "user", content: t.instruccion }], 1400);
              if (txt) { res = txt.trim() + "\n\n## Datos calculados por el sistema\n```json\n" + JSON.stringify(an, null, 1) + "\n```"; tipoEnt = "analisis"; }
            }
          } else res = await llm(promptDe(ag) + extra + ctx, [{ role: "user", content: t.instruccion }], 1400);
        } catch { res = null; }
        if (!res && !motivo) motivo = "El proveedor de IA no respondió.";
      }
      await registrarCoste(sb, { owner, taskId: t.id, agente: t.agente, m: med, estado: res ? "ok" : "fallo" }).catch(() => false);
      if (res) {
        await sb.from("office_tasks").update({ estado: estadoTrasEjecutar(nivel, true), resultado: res.slice(0, 20000), error: null, prox_intento: null, updated_at: new Date().toISOString() }).eq("id", t.id);
        const ent = await guardarEntregable(sb, { owner, taskId: t.id, agente: t.agente, instruccion: t.instruccion, contenido: res, tipo: tipoEnt, fuentes: fuentesInv, meta: { ...metaEnt, nivel, origen: "ciclo", politica: politicaDe(t.agente).nivel } });
        await log(owner, t.id, "estado", ent.ok ? "Resultado listo para tu revisión (entregable guardado)" : `Resultado listo; entregable NO guardado: ${ent.motivo}`); out.ejecutadas++;
      } else {
        if (bloqueoDuro) { // falta configuración: no se reintenta ni se simula
          await sb.from("office_tasks").update({ estado: "bloqueada", error: motivo.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", t.id);
          await log(owner, t.id, "bloqueada", motivo); out.bloqueadas++; continue;
        }
        const f = trasFallo(t.intentos, now);
        await sb.from("office_tasks").update({ estado: f.estado, intentos: f.intentos, prox_intento: f.prox, error: motivo, updated_at: new Date().toISOString() }).eq("id", t.id);
        await log(owner, t.id, f.estado === "fallida" ? "escalada" : "reintento", `${motivo} (intento ${f.intentos}/3)`); out.fallos++;
      }
    }
  }

  // Resumen diario determinista por propietario con actividad
  const { data: todos } = await sb.from("office_tasks").select("owner,estado").limit(2000);
  const duenos = Array.from(new Set((todos || []).map((r: { owner: string }) => r.owner))).filter((o) => !soloOwner || o === soloOwner);
  for (const owner of duenos) {
    const { data: aj } = await sb.from("office_settings").select("resumen_hora,pausa").eq("owner", owner).maybeSingle();
    if (aj?.pausa) continue;
    const { data: ult } = await sb.from("office_log").select("at").eq("owner", owner).eq("evento", "resumen").order("at", { ascending: false }).limit(1).maybeSingle();
    if (!tocaResumen(new Date(now), aj?.resumen_hora ?? 7, ult?.at ?? null)) continue;
    try { const hoyI = hoy; const { data: ya } = await sb.from("office_informes").select("id").eq("owner", owner).eq("fecha", hoyI).maybeSingle(); if (!ya && new Date(now).getUTCHours() >= (aj?.resumen_hora ?? 7)) await generarInforme(sb, owner, "ciclo", hoyI); } catch { /* el informe nunca rompe el ciclo */ }
    await log(owner, null, "resumen", resumenDiario((todos || []).filter((r: { owner: string }) => r.owner === owner), hoy)); out.resumenes++;
  }
  // Iniciativa propia: una cabra propone UNA idea (solo propuesta, queda "en revisión"). Tope diario, horario, bandeja y presupuesto.
  for (const owner of duenos) {
    try {
      if (!llmProvider() || await alto()) break;
      const { data: aj } = await sb.from("office_settings").select("pausa,presupuesto_dia").eq("owner", owner).maybeSingle();
      if (aj?.pausa) continue;
      const desde = hoy + "T00:00:00Z";
      const [{ count: ideasHoy }, { count: usadas }, { count: sinRevisar }, { data: prev }] = await Promise.all([
        sb.from("office_log").select("id", { count: "exact", head: true }).eq("owner", owner).eq("evento", "idea").gte("at", desde),
        sb.from("office_log").select("id", { count: "exact", head: true }).eq("owner", owner).eq("evento", "llm").gte("at", desde),
        sb.from("office_tasks").select("id", { count: "exact", head: true }).eq("owner", owner).eq("estado", "en_revision").like("instruccion", PREFIJO_IDEA + "%"),
        sb.from("office_tasks").select("instruccion").eq("owner", owner).like("instruccion", PREFIJO_IDEA + "%").order("created_at", { ascending: false }).limit(8),
      ]);
      if (!tocaIdea({ ahora: new Date(now), ideasHoy: ideasHoy || 0, sinRevisar: sinRevisar || 0, usadasHoy: usadas || 0, presupuestoDia: aj?.presupuesto_dia ?? 40 })) continue;
      const ag = elegirAutor(AGENTES, ideasHoy || 0, hoy);
      const ctx = await contextoDeAgente(sb, owner, ag.id, "ideas nuevas para el proyecto");
      const previas = (prev || []).map((r: { instruccion: string }) => r.instruccion.replace(PREFIJO_IDEA, "").slice(0, 80));
      await log(owner, null, "llm", `Idea propia de ${ag.nombre}`);
      const idea = parseIdea(await callLLM(promptIdea(ag, ctx, previas), [{ role: "user", content: "Propón tu idea ahora." }], 700));
      if (!idea) { await log(owner, null, "idea_fallida", `${ag.nombre}: la IA no devolvió una idea válida`); continue; }
      const { data: nueva, error: ie } = await sb.from("office_tasks").insert({ owner, instruccion: instruccionIdea(ag.nombre, idea.titulo), agente: ag.id, area: areaDb(ag.area), nivel: "A", estado: "en_revision", resultado: idea.cuerpo }).select("id").maybeSingle();
      if (ie) { await log(owner, null, "idea_fallida", "No se pudo guardar la idea"); continue; }
      await log(owner, nueva?.id ?? null, "idea", `${ag.nombre}: ${idea.titulo}`); out.ideas++;
    } catch { /* una idea fallida nunca rompe el ciclo */ }
  }
  // Estudio de vídeo: un guionista de YouTube Studio propone UN guion de vídeo por ciclo (solo propuesta en revisión; nada se produce ni se publica solo).
  for (const owner of duenos) {
    try {
      if (!llmProvider() || await alto()) break;
      const { data: aj } = await sb.from("office_settings").select("pausa,presupuesto_dia").eq("owner", owner).maybeSingle();
      if (aj?.pausa) continue;
      const desde = hoy + "T00:00:00Z";
      const [{ count: guionesHoy }, { count: usadas }, { count: sinRevisar }, { data: prev }] = await Promise.all([
        sb.from("office_log").select("id", { count: "exact", head: true }).eq("owner", owner).eq("evento", "guion").gte("at", desde),
        sb.from("office_log").select("id", { count: "exact", head: true }).eq("owner", owner).eq("evento", "llm").gte("at", desde),
        sb.from("office_tasks").select("id", { count: "exact", head: true }).eq("owner", owner).eq("estado", "en_revision").like("instruccion", PREFIJO_GUION + "%"),
        sb.from("office_tasks").select("instruccion").eq("owner", owner).like("instruccion", PREFIJO_GUION + "%").order("created_at", { ascending: false }).limit(8),
      ]);
      if (!tocaGuion({ ahora: new Date(now), guionesHoy: guionesHoy || 0, sinRevisar: sinRevisar || 0, usadasHoy: usadas || 0, presupuestoDia: aj?.presupuesto_dia ?? 40, maxDia: soloOwner ? MAX_GUIONES_DIA_MANUAL : undefined })) continue;
      const n = guionesHoy || 0; const ag = agentePorId(guionistaDe(n));
      if (!ag) continue;
      const recientes = (prev || []).map((r: { instruccion: string }) => (r.instruccion.match(/Campa[ñn]a ([ABC])/)?.[1] || ""));
      const { campana: camp, motivo: motivoCamp } = elegirCampana(recientes);
      const previas = (prev || []).map((r: { instruccion: string }) => r.instruccion.replace(PREFIJO_GUION, "").slice(0, 80));
      await log(owner, null, "llm", `Guion de ${ag.nombre}`);
      const g = parseGuion(await callLLM(promptGuion(ag.nombre, ag.rol, camp, previas, ag.id), [{ role: "user", content: "Propón tu guion ahora." }], 1100));
      if (!g) { await log(owner, null, "guion_fallido", `${ag.nombre}: la IA no devolvió un guion válido`); continue; }
      if (esRepetido(g.titulo, previas)) { await log(owner, null, "guion_rechazado", `${ag.nombre}: «${g.titulo}» repite un guion reciente`); continue; }
      const qc = controlCalidad(g.cuerpo);
      if (qc.estado === "Rechazado") { await log(owner, null, "guion_rechazado", `${ag.nombre}: ${qc.checks.filter((c) => !c.ok && c.critico).map((c) => c.texto).join("; ")}`); continue; }
      const cuerpo = `CONTROL DE CALIDAD: ${qc.ok ? "superado" : "REVISAR"}\nGuionista: ${ag.nombre} · Campaña ${camp.id} (${motivoCamp})\n` + qc.checks.map((c) => `${c.ok ? "✔" : "✘"} ${c.texto}${c.ok ? "" : " — " + c.explicacion}`).join("\n") + "\n\n" + g.cuerpo;
      const { data: nueva, error: ie } = await sb.from("office_tasks").insert({ owner, instruccion: instruccionGuion(ag.nombre, camp, g.titulo), agente: ag.id, area: areaDb(ag.area), nivel: "A", estado: "en_revision", resultado: cuerpo.slice(0, 4500) }).select("id").maybeSingle();
      if (ie) { await log(owner, null, "guion_fallido", "No se pudo guardar el guion"); continue; }
      await log(owner, nueva?.id ?? null, "guion", `${ag.nombre}: ${g.titulo}`); out.ideas++;
    } catch { /* un guion fallido nunca rompe el ciclo */ }
  }
  // Latido: prueba de que el ciclo corre. Si aún no existe la tabla (SQL 90 sin ejecutar) se ignora sin romper el ciclo.
  let latido = false;
  try {
    const { error: he } = await sb.from("office_heartbeat").upsert(duenos.map((owner) => ({ owner, ultimo_ciclo_at: new Date(now).toISOString(), ejecutadas: out.ejecutadas, fallos: out.fallos, bloqueadas: out.bloqueadas })), { onConflict: "owner" });
    latido = !he;
  } catch { latido = false; }
  return { ok: true as const, ...out, latido, sinIA: !llmProvider(), diag };
}

export type Origen = "cron" | "manual";
/** Envoltorio del ciclo: respeta DETENER OFICINA, registra cada ciclo (office_ciclos) y usa su índice único como cerrojo para que no corran dos a la vez. */
export async function correrCiclo(sb: SupabaseClient, soloOwner?: string, origen: Origen = "cron") {
  const par = await estadoParada(sb);
  const inicio = new Date().toISOString();
  if (!par.tablaOk) return cicloInterno(sb, soloOwner, async () => false); // SQL 98 sin ejecutar: comportamiento anterior
  // Cierra ciclos "abiertos" de hace más de 5 min (la función murió antes de cerrarlos)
  await sb.from("office_ciclos").update({ fin: inicio, resultado: "interrumpido", error: "El ciclo no terminó (tiempo agotado o función cortada)." }).is("fin", null).lt("inicio", new Date(Date.now() - 5 * 60000).toISOString());
  if (par.detenida) {
    await sb.from("office_ciclos").insert({ inicio, fin: inicio, origen, resultado: "parada", error: par.motivo });
    return { ok: true as const, parada: true, motivo: par.motivo, ejecutadas: 0, fallos: 0, bloqueadas: 0, resumenes: 0, pausadas: 0, ideas: 0, latido: false, sinIA: !llmProvider(), diag: [] as Diag[] };
  }
  const { data: fila, error: le } = await sb.from("office_ciclos").insert({ inicio, origen }).select("id").maybeSingle();
  if (le || !fila) {
    // Índice único: ya hay un ciclo en marcha
    await sb.from("office_ciclos").insert({ inicio, fin: inicio, origen, resultado: "omitido", error: "Ya había un ciclo en marcha." });
    return { ok: true as const, omitido: true, parada: false, motivo: null, ejecutadas: 0, fallos: 0, bloqueadas: 0, resumenes: 0, pausadas: 0, ideas: 0, latido: false, sinIA: !llmProvider(), diag: [] as Diag[] };
  }
  let ultima = 0; let detenida = false;
  const alto = async () => { if (detenida) return true; if (Date.now() - ultima < 3000) return false; ultima = Date.now(); detenida = (await estadoParada(sb)).detenida; return detenida; };
  try {
    const r = await cicloInterno(sb, soloOwner, alto);
    const ok = r.ok;
    await sb.from("office_ciclos").update(ok ? { fin: new Date().toISOString(), resultado: detenida ? "parada" : "ok", ejecutadas: r.ejecutadas, fallos: r.fallos, bloqueadas: r.bloqueadas, ideas: r.ideas, sin_ia: r.sinIA } : { fin: new Date().toISOString(), resultado: "error", error: String((r as { error?: string }).error || "error").slice(0, 300) }).eq("id", fila.id);
    return ok ? { ...r, parada: detenida, omitido: false, motivo: null as string | null } : r;
  } catch (e) {
    await sb.from("office_ciclos").update({ fin: new Date().toISOString(), resultado: "error", error: String((e as Error)?.message || e).slice(0, 300) }).eq("id", fila.id);
    return { ok: false as const, status: 500, error: "El ciclo falló: " + String((e as Error)?.message || e).slice(0, 120) };
  }
}
