/** Límite de uso best-effort por usuario (memoria de la instancia serverless: frena abusos básicos, no es un límite global). */
const usos = new Map<string, number[]>();
export function permitido(clave: string, max = 10, ventanaMs = 600000, ahora = Date.now()): boolean {
  const v = (usos.get(clave) || []).filter((t) => ahora - t < ventanaMs); if (v.length >= max) { usos.set(clave, v); return false; }
  v.push(ahora); usos.set(clave, v); if (usos.size > 5000) for (const [k, a] of usos) if (!a.some((t) => ahora - t < ventanaMs)) usos.delete(k); return true;
}
export const _reiniciar = () => usos.clear();
