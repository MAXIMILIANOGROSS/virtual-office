// Servidor: flujo del Productor creativo. Lee el perfil y las reglas de marca, genera el texto, lo revisa con las reglas (determinista) y,
// si hay incumplimientos estrictos, intenta UNA corrección. No genera imágenes: lo dice explícitamente (las imágenes se piden desde "Carteles e imágenes").
import { PROYECTO } from "../../oficina.config.ts";
import { limpiarPerfil, promptPerfil, revisarReglas, type Regla, type Hallazgo } from "./perfilMarca.ts";
type Msg = { role: "user" | "assistant"; content: string };
export type DepsProd = { callLLM: (sys: string, msgs: Msg[], max: number) => Promise<string | null>; cargarMarca: () => Promise<{ kit: string; datos: unknown; reglas: Regla[] } | null> };
export type Produccion = { ok: true; texto: string; marca: string | null; aprobado: boolean; hallazgos: Hallazgo[] } | { ok: false; motivo: string };
export function seccionRevision(marca: string | null, aprobado: boolean, h: Hallazgo[]): string {
  if (!marca) return "\n\n## Revisión de marca\n⚠️ NO se aplicó ninguna marca: no existe perfil de marca. Crea uno en Marketing Studio → Marcas para que se apliquen sus reglas.";
  if (aprobado && !h.length) return `\n\n## Revisión de marca\n✅ Revisado contra las reglas de «${marca}»: sin incumplimientos.`;
  return `\n\n## Revisión de marca\n${aprobado ? "✅ Sin incumplimientos estrictos." : "❌ NO APROBADA: incumple reglas estrictas de la marca."} Marca: «${marca}».\n` + h.map((x) => `- ${x.severidad === "estricta" ? "ESTRICTA" : "estilo"}: «${x.termino}»${x.alternativa ? ` → usa «${x.alternativa}»` : ""}`).join("\n");
}
export const AVISO_IMAGEN = "\n\n## Imagen\nNo se ha generado ninguna imagen en esta tarea. Pídela desde «Carteles e imágenes» usando este texto como base.";
export async function producir(instruccion: string, promptBase: string, deps: DepsProd): Promise<Produccion> {
  const m = await deps.cargarMarca();
  const reglas = m?.reglas ?? []; const memoria = m ? promptPerfil(limpiarPerfil(m.datos ?? {}), reglas) : "";
  const sys = `${promptBase}\n\nEres el Productor creativo${PROYECTO.nombre.trim() ? " de " + PROYECTO.nombre.trim() : ""}. Redacta textos y variantes de campaña/anuncio en ${PROYECTO.idioma}. ` +
    `No inventes datos (precios, horarios, cifras): si faltan, escribe [DATO PENDIENTE]. No publiques nada: es un borrador.\n${memoria}`;
  let texto = await deps.callLLM(sys, [{ role: "user", content: instruccion }], 1500);
  if (!texto) return { ok: false, motivo: "El proveedor de IA no respondió." };
  let rev = revisarReglas(texto, reglas);
  if (m && !rev.aprobado) {
    const fix = await deps.callLLM(sys, [{ role: "user", content: instruccion }, { role: "assistant", content: texto }, { role: "user", content: "Corrige el texto: incumple estas reglas estrictas de marca: " + rev.hallazgos.filter((x) => x.severidad === "estricta").map((x) => `«${x.termino}»${x.alternativa ? ` (usa «${x.alternativa}»)` : ""}`).join(", ") + ". Devuelve solo el texto corregido." }], 1500);
    if (fix) { const r2 = revisarReglas(fix, reglas); if (r2.hallazgos.length <= rev.hallazgos.length) { texto = fix; rev = r2; } }
  }
  return { ok: true, texto: texto.trim() + seccionRevision(m?.kit ?? null, rev.aprobado, rev.hallazgos) + AVISO_IMAGEN, marca: m?.kit ?? null, aprobado: rev.aprobado, hallazgos: rev.hallazgos };
}
