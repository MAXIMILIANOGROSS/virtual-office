// Servidor: consumo y reembolso de cuota. Solo service_role puede llamar a las funciones SQL (el usuario no puede falsear su consumo).
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mensajeLimite } from "./cuotaLib";

export type Consumo = { ok: true; ref: string; sinLibro?: boolean } | { ok: false; status: number; error: string };
function cliente() { const u = process.env.NEXT_PUBLIC_SUPABASE_URL, k = process.env.SUPABASE_SERVICE_ROLE_KEY; return u && k ? createClient(u, k, { auth: { persistSession: false } }) : null; }
/** Comprueba y consume cuota de forma atómica ANTES de gastar recursos. Si el SQL 97 aún no está aplicado, sigue (sinLibro) para no romper lo existente. */
export async function consumir(uid: string, op: string, unidades = 1, refExterno?: string): Promise<Consumo> {
  const db = cliente(); const ref = (refExterno || randomUUID()).slice(0, 80); if (!db) return { ok: true, ref, sinLibro: true };
  const { data, error } = await db.rpc("usage_consume", { p_owner: uid, p_op: op, p_units: unidades, p_ref: ref });
  if (error) { if (/usage_consume|schema cache|does not exist|42883|PGRST202/i.test(`${error.code} ${error.message}`)) return { ok: true, ref, sinLibro: true }; console.error("usage_consume", error.code, error.message); return { ok: false, status: 503, error: `No se pudo comprobar tu cuota (${String(error.code || "")} ${String(error.message || "").slice(0, 140)}). Si dice "permission denied", revisa que SUPABASE_SERVICE_ROLE_KEY sea la clave service_role.` }; }
  const r = (data || {}) as Record<string, unknown>;
  if (r.ok === true) return { ok: true, ref };
  if (r.motivo === "limite") return { ok: false, status: 429, error: mensajeLimite(op, Number(r.usado), Number(r.limite), String(r.periodo || "mes")) };
  if (r.motivo === "operacion_no_incluida") return { ok: false, status: 403, error: "Tu plan no incluye esta operación." };
  return { ok: false, status: 400, error: "Operación no válida." };
}
/** Devuelve las unidades cuando la operación falla por nuestra parte o la del proveedor. */
export async function reembolsar(uid: string, ref: string) { const db = cliente(); if (!db) return; try { await db.rpc("usage_refund", { p_owner: uid, p_ref: ref }); } catch { /* best-effort */ } }
