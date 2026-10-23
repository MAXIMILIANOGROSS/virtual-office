// Servidor: qué fuentes puede usar cada agente en la Intelligence Network. Se comprueba en el servidor antes de planificar; el contenido recuperado nunca los amplía.
// No se crean agentes nuevos: se reutilizan los roles existentes (investigación → analista de mercado, GitHub → revisor de licencias y repos, YouTube → investigador de YouTube, etc.).
import type { Plataforma } from "./tipos.ts";
const WEB: Plataforma[] = ["web", "busqueda", "rss"];
export const FUENTES_RED: Record<string, Plataforma[]> = {
  ciro: ["web", "github", "rss", "busqueda", "youtube"],
  "est-mercado": [...WEB],
  "est-competencia": [...WEB, "github"],
  "est-validacion": [...WEB],
  "tec-arquitecto": ["web", "github", "busqueda"],
  "tec-licencias": ["github", "web"],
  "tec-ia": ["web", "github", "busqueda"],
  "cre-contenido": [...WEB],
  "yt-investigador": [...WEB, "youtube"],
  "yt-viral": [...WEB, "youtube"],
};
export const AGENTES_RED = Object.keys(FUENTES_RED);
export const fuentesPermitidas = (agenteId: string): Plataforma[] => FUENTES_RED[agenteId] ?? [];
export const puedeInvestigar = (agenteId: string): boolean => fuentesPermitidas(agenteId).length > 0;
