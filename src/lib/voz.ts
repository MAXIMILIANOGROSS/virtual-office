/** Voz del navegador (Web Speech API): gratis, sin servidor. El género es una estimación por nombre de voz. */
export type Idioma = "es" | "en" | "it";
export type Genero = "mujer" | "hombre";
export const IDIOMAS: Record<Idioma, { etiqueta: string; bcp: string }> = {
  es: { etiqueta: "Español", bcp: "es-ES" }, en: { etiqueta: "English", bcp: "en-GB" }, it: { etiqueta: "Italiano", bcp: "it-IT" },
};
const MUJER = /(monica|mónica|paulina|elvira|helena|lucia|lucía|marisol|laura|alice|elsa|federica|carla|samantha|serena|karen|moira|fiona|tessa|google.*(espa|ital|uk english female)|female|femenin|mujer|donna)/i;
const HOMBRE = /(jorge|diego|juan|pablo|alvaro|álvaro|enrique|luca|cosimo|alex|daniel|oliver|fred|tom|google.*uk english male|male|masculin|hombre|uomo)/i;
export type VozLite = { name: string; lang: string };

/** Limpia el texto para leerlo en voz alta (sin markdown ni símbolos). */
export function textoParaVoz(t: string): string {
  return String(t || "").replace(/```[\s\S]*?```/g, " ").replace(/[*#_`>]+/g, "").replace(/^\s*[-•]\s+/gm, "").replace(/https?:\/\/\S+/g, "enlace").replace(/\s+/g, " ").trim().slice(0, 1200);
}
/** Elige la mejor voz instalada para idioma+género; devuelve exacta=false si no se pudo distinguir el género. */
export function elegirVoz<T extends VozLite>(voces: T[], idioma: Idioma, genero: Genero): { voz: T | null; exacta: boolean } {
  const delIdioma = voces.filter((v) => v.lang.toLowerCase().startsWith(idioma));
  if (!delIdioma.length) return { voz: null, exacta: false };
  const re = genero === "mujer" ? MUJER : HOMBRE; const otro = genero === "mujer" ? HOMBRE : MUJER;
  const buena = delIdioma.find((v) => re.test(v.name) && !otro.test(v.name));
  if (buena) return { voz: buena, exacta: true };
  const neutra = delIdioma.find((v) => !otro.test(v.name));
  return { voz: neutra || delIdioma[0], exacta: false };
}
