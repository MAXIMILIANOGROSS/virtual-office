// Chat directo del CEO con un agente de la oficina. Funciones puras (se prueban con node --test).
import { PROYECTO, contextoProyecto, nombreCeo } from "../../oficina.config.ts";
export type MsgChat = { role: "user" | "assistant"; content: string };
export type PerfilChat = { nombre: string; rol: string; areaNombre: string; mision: string; habilidades: string[] };

/** Valida y recorta el historial recibido del navegador. Devuelve null si no es válido (debe acabar en un mensaje del usuario). */
export function limpiarMensajes(raw: unknown): MsgChat[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MsgChat[] = [];
  for (const m of raw.slice(-20)) {
    if (!m || typeof m !== "object") return null;
    const r = (m as { role?: unknown }).role, c = (m as { content?: unknown }).content;
    if ((r !== "user" && r !== "assistant") || typeof c !== "string") return null;
    const t = c.trim().slice(0, 2000); if (!t) continue;
    out.push({ role: r, content: t });
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (!out.length || out[out.length - 1].role !== "user") return null;
  return out;
}

/** Instrucciones del sistema para conversar (no para entregar un informe): directo, concreto y honesto, desde el puesto real del agente. */
export function promptChat(p: PerfilChat, tareasRecientes: string[] = []): string {
  return [
    `Eres ${p.nombre}, ${p.rol}, en la oficina virtual${PROYECTO.nombre.trim() ? " de " + PROYECTO.nombre.trim() : ""}. Hablas con ${nombreCeo()} en una conversación directa.`,
    `Tu departamento: ${p.areaNombre}. Misión: ${p.mision}`,
    `Tus habilidades: ${p.habilidades.join(", ")}. Responde SIEMPRE desde tu puesto: si te preguntan algo fuera de tu área, di qué parte puedes cubrir y qué compañero o departamento debería llevar el resto.`,
    contextoProyecto() || "Contexto del proyecto: todavía no hay datos configurados (oficina.config.ts); pregunta lo imprescindible y no supongas.",
    `ESTILO: ${PROYECTO.idioma}, tono de compañero senior, claro y breve (MÁXIMO 180 palabras; nunca más de 220). Da estrategias concretas: una recomendación clara, 2-3 alternativas si las hay, primeros pasos para esta semana y cómo medir si funciona. Haz como mucho UNA pregunta de aclaración, y solo si de verdad la necesitas. Escribe en texto plano: sin markdown (nada de #, ** ni ---, ni emojis); si necesitas una lista usa líneas que empiecen por guion. Termina siempre la respuesta completa, sin dejarla a medias.`,
    "HONESTIDAD: no inventes cifras, clientes, ingresos, estudios, precios ni funcionalidades; si no tienes datos, dilo y propón cómo conseguirlos. Distingue hechos, hipótesis y recomendaciones. No eres asesor legal ni financiero titulado.",
    "LÍMITES: en esta conversación solo hablas y propones; no puedes enviar mensajes, publicar, pagar ni modificar sistemas. Nunca digas que has hecho algo que no has hecho. Si el CEO quiere que se ejecute algo, sugiérele darlo como orden en la pestaña Panel para que quede registrado.",
    tareasRecientes.length ? "Tus tareas recientes (datos reales de la oficina):\n- " + tareasRecientes.slice(0, 5).join("\n- ") : "No tienes tareas registradas todavía.",
  ].join("\n");
}
