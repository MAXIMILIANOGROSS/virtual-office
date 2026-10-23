/** Validación de archivos generados por la fábrica creativa (lógica pura). Un archivo solo se da por "generado" si pasa esto. */
export const MAX_BYTES = 8 * 1024 * 1024, MIN_BYTES = 2000;
export type Mime = "image/png" | "image/jpeg" | "video/mp4";
export type Verificacion = { ok: true; mime: Mime; ext: string } | { ok: false; error: string };
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Comprueba firma real (no solo la extensión), tamaño y, en PNG, que termine con IEND. */
export function verificarArchivo(buf: Uint8Array): Verificacion {
  if (buf.length < MIN_BYTES) return { ok: false, error: "El archivo está vacío o es demasiado pequeño." };
  if (buf.length > MAX_BYTES) return { ok: false, error: "El archivo supera el máximo de 8 MB." };
  if (PNG.every((b, i) => buf[i] === b)) {
    const fin = Array.from(buf.slice(-8, -4)).map((c) => String.fromCharCode(c)).join("");
    return fin === "IEND" ? { ok: true, mime: "image/png", ext: "png" } : { ok: false, error: "El PNG está incompleto (le falta el final)." };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9) return { ok: true, mime: "image/jpeg", ext: "jpg" };
  if (String.fromCharCode(...buf.slice(4, 8)) === "ftyp") return { ok: true, mime: "video/mp4", ext: "mp4" };
  return { ok: false, error: "Formato no reconocido." };
}
/** Ruta segura dentro del bucket: <owner>/<fecha>-<slug>-<hash8>.<ext>. Nunca usa texto del usuario sin limpiar. */
export function rutaArchivo(owner: string, tipo: string, nombre: string, sha: string, ext: string, ahora = new Date()): string {
  const slug = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "archivo";
  return `${owner}/${ahora.toISOString().slice(0, 10)}-${tipo}-${slug}-${sha.slice(0, 8)}.${ext}`;
}
export const rutaEsDe = (ruta: string, owner: string) => ruta.startsWith(owner + "/") && !ruta.includes("..");
