/**
 * OFICINA VIRTUAL · configuración del proyecto.
 *
 * Este es el ÚNICO archivo que cambias para que las 43 cabras trabajen para un proyecto concreto.
 * Viene VACÍO a propósito: sin datos de ningún cliente. Rellena solo lo que quieras que las cabras sepan.
 * Los campos vacíos se ignoran (no se envían a la IA ni aparecen en los textos).
 */
export const PROYECTO = {
  /** Nombre del proyecto, empresa o cliente. Ej.: "Mi Marca" */
  nombre: "",
  /** Qué hace, en 1-2 frases. */
  descripcion: "",
  /** Sector o industria. */
  sector: "",
  /** A quién se dirige (clientes ideales). */
  publicoObjetivo: "",
  /** Por qué te eligen: la propuesta de valor en una frase. */
  propuestaDeValor: "",
  /** Tono de voz de la marca. Ej.: "cercano, claro, sin jerga". */
  tono: "",
  /** Web oficial (https://…). Si la rellenas, los controles de calidad solo permiten enlaces a este dominio. */
  web: "",
  /** Quién dirige: cómo se llama el CEO/propietario al que responden las cabras. */
  ceo: "",
  /** Ciudad o zona (solo informativa, para el reloj y el ambiente de la oficina). */
  ciudad: "",
  /** Coordenadas para el tiempo real (null = sin tiempo). */
  latitud: null as number | null,
  longitud: null as number | null,
  /** Zona horaria IANA para el horario de trabajo de las cabras (08:00-22:00). */
  zonaHoraria: "Europe/Madrid",
  /** Idioma de trabajo de las cabras. */
  idioma: "español de España con tuteo",
  /** Notas libres: restricciones, cosas que NO deben decir, contexto del mercado… */
  notas: "",
};

/** Nombre para usar en frases. Sin nombre configurado: "tu proyecto". */
export const nombreProyecto = (): string => PROYECTO.nombre.trim() || "tu proyecto";

/** Bloque de contexto del proyecto para los prompts. Solo incluye lo que has rellenado; si no hay nada, devuelve "". */
export function contextoProyecto(): string {
  const p = PROYECTO;
  const filas: [string, string][] = [
    ["Proyecto", p.nombre], ["Qué hace", p.descripcion], ["Sector", p.sector], ["Público objetivo", p.publicoObjetivo],
    ["Propuesta de valor", p.propuestaDeValor], ["Tono de marca", p.tono], ["Web oficial", p.web], ["Notas", p.notas],
  ];
  const l = filas.filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v.trim()}`);
  return l.length ? "CONTEXTO DEL PROYECTO (datos aportados por el CEO; no inventes nada más)\n" + l.join("\n") : "";
}

/** Cómo se llama a quien dirige. */
export const nombreCeo = (): string => PROYECTO.ceo.trim() || "el CEO";

/** Dominio oficial (sin www) o "" si no está configurado. */
export function dominioWeb(): string {
  try { return PROYECTO.web.trim() ? new URL(PROYECTO.web.trim()).hostname.replace(/^www\./, "") : ""; } catch { return ""; }
}

/** Hora (0-23) en la zona horaria configurada. */
export function horaLocal(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: PROYECTO.zonaHoraria || "UTC" }).format(d)) % 24;
}
/** Hora "HH:MM" en la zona horaria configurada. */
export function horaLocalTexto(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: PROYECTO.zonaHoraria || "UTC" }).format(d);
}

/**
 * Identidad visual para las imágenes que generan las cabras (carteles, anuncios, tarjetas).
 * Neutral por defecto. `logo` es una ruta dentro de /public (p. ej. "/brand/logo.png"); vacío = se dibuja el nombre del proyecto como texto.
 */
export const MARCA_VISUAL = {
  fondo: "#0F172A",
  acento: "#FACC15",
  texto: "#FFFFFF",
  suave: "#CBD5E1",
  logo: "",
};
/** Texto de la etiqueta superior de las imágenes: ciudad/mercado en mayúsculas (vacío = sin etiqueta). */
export const etiquetaImagen = (): string => PROYECTO.ciudad.trim().toUpperCase();
/** Texto de la firma inferior de las imágenes: dominio de la web, o el nombre. */
export const firmaImagen = (): string => (PROYECTO.web.trim() ? dominioWeb() : PROYECTO.nombre.trim());
