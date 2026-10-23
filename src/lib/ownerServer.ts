import { createClient } from "@supabase/supabase-js";

/** Única cuenta propietaria: la defines con la variable de entorno OWNER_EMAIL (sin ella, NADIE tiene acceso: falla cerrado). Si defines OWNER_USER_ID, además debe coincidir el id inmutable del usuario. */
export const OWNER_EMAIL = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
export type OwnerCheck = { ok: true; uid: string; email: string } | { ok: false; status: number; error: string };

/** Verifica en el SERVIDOR el token de Supabase: correo verificado + correo propietario (+ id inmutable si OWNER_USER_ID existe). */
export async function verifyOwner(req: Request): Promise<OwnerCheck> {
  const tk = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!url || !key) return { ok: false, status: 503, error: "Configuración de Supabase incompleta." };
  if (!OWNER_EMAIL) return { ok: false, status: 503, error: "Falta la variable OWNER_EMAIL en el servidor." };
  if (!tk) return { ok: false, status: 401, error: "Inicia sesión." };
  const { data, error } = await createClient(url, key).auth.getUser(tk);
  const u = data?.user;
  if (error || !u) return { ok: false, status: 401, error: "Sesión no válida o caducada." };
  if (!u.email_confirmed_at) return { ok: false, status: 403, error: "La cuenta propietaria no tiene el correo verificado." };
  if ((u.email || "").toLowerCase() !== OWNER_EMAIL) return { ok: false, status: 403, error: "Acceso denegado." };
  const pinned = process.env.OWNER_USER_ID;
  if (pinned && pinned !== u.id) return { ok: false, status: 403, error: "Acceso denegado." };
  return { ok: true, uid: u.id, email: OWNER_EMAIL };
}
