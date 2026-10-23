/** Adaptador de proveedores de imagen con IA (desacoplado: cambiar de proveedor = añadir una entrada). Lógica pura + una llamada de red aislada. */
export type Proveedor = { id: string; modelo: string; licencia: string; configurado: boolean };
export const PROMPT_MAX = 400;
export function limpiarPrompt(raw: unknown): { ok: true; prompt: string } | { ok: false; error: string } {
  const t = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, PROMPT_MAX) : "";
  return t.length < 8 ? { ok: false, error: "Describe la imagen con al menos unas palabras (8 caracteres)." } : { ok: true, prompt: t };
}
/** Proveedores disponibles según las variables de entorno del servidor (las claves nunca viajan al navegador). */
export function proveedores(env: Record<string, string | undefined>): Proveedor[] {
  return [{ id: "cloudflare", modelo: "@cf/black-forest-labs/flux-1-schnell", licencia: "FLUX.1 schnell: Apache-2.0 (uso comercial permitido); servicio gratuito con cuota diaria", configurado: !!(env.CF_ACCOUNT_ID && env.CF_API_TOKEN) }];
}
export function bytesDeBase64(b64: unknown): Uint8Array | null {
  if (typeof b64 !== "string" || b64.length < 100 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) return null;
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
export type Resultado = { ok: true; bytes: Uint8Array; proveedor: string; modelo: string } | { ok: false; error: string };
export async function generarCloudflare(prompt: string, env: Record<string, string | undefined>): Promise<Resultado> {
  const p = proveedores(env)[0]; if (!p.configurado) return { ok: false, error: "Falta configurar Cloudflare Workers AI (CF_ACCOUNT_ID y CF_API_TOKEN en Vercel)." };
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${p.modelo}`, { method: "POST", headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ prompt, steps: 6 }), signal: AbortSignal.timeout(50000) });
    if (r.status === 429) return { ok: false, error: "Se agotó la cuota gratuita de hoy en Cloudflare. Inténtalo mañana." };
    if (r.status === 401 || r.status === 403) return { ok: false, error: "Cloudflare rechazó la clave (revisa CF_API_TOKEN y que tenga permiso de Workers AI)." };
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.success) return { ok: false, error: "Cloudflare no pudo generar la imagen." };
    const bytes = bytesDeBase64(j?.result?.image); if (!bytes) return { ok: false, error: "Cloudflare devolvió una respuesta sin imagen válida." };
    return { ok: true, bytes, proveedor: p.id, modelo: p.modelo };
  } catch { return { ok: false, error: "No se pudo contactar con Cloudflare (tiempo agotado o sin conexión)." }; }
}
