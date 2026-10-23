/** Fondos de foto para anuncios y carteles. Pon tus imágenes (jpg) en /public/fondos y regístralas aquí. Viene vacío: sin fotos de ningún cliente. */
export const FONDOS: readonly { id: string; nombre: string; url: string }[] = [
  { id: "ninguno", nombre: "Degradado de marca (sin foto)", url: "" },
];
export const FONDO_POR_DEFECTO = "";
export const esFondoLocal = (u: string) => /^\/fondos\/[a-z0-9-]+\.jpg$/.test(u);
/** Una ruta local (/fondos/x.jpg) se convierte en URL absoluta del propio sitio; las https se dejan como están. */
export const resolverFoto = (u: string, base: string) => (esFondoLocal(u) ? new URL(u, base).toString() : u);
/** Id del selector según el valor guardado: un fondo conocido, "ninguno" (vacío) u "otra" (URL https propia). */
export const fondoSeleccionado = (u: string) => FONDOS.find((f) => f.url === u)?.id ?? "otra";
