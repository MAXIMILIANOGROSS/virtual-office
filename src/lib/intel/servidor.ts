// Servidor (rutas API): autenticación de administrador, entorno acotado y utilidades comunes de la Intelligence Network.
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { permitido } from "@/lib/cabra/limite";
import { estadoParada } from "@/lib/oficina/control";
import type { Env } from "./tipos.ts";

export type Ctx = { sb: SupabaseClient; uid: string };
/** Misma barrera que la oficina: sesión válida + administrador. Devuelve el cliente con el JWT del usuario (RLS aplica). */
export async function autenticar(request: Request, limite?: { clave: string; max: number; ms: number }): Promise<Ctx | NextResponse> {
  const tk = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!tk || !url || !key) return NextResponse.json({ ok: false, error: "Inicia sesión." }, { status: 401 });
  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${tk}` } } });
  const { data: u, error: ue } = await sb.auth.getUser(tk); const uid = u?.user?.id;
  if (ue || !uid) return NextResponse.json({ ok: false, error: "Tu sesión ha caducado." }, { status: 401 });
  const { data: adm, error: ae } = await sb.rpc("oficina_is_admin");
  if (ae || adm !== true) return NextResponse.json({ ok: false, error: "La Intelligence Network es solo para Dirección (administrador)." }, { status: 403 });
  if (limite && !permitido(`${limite.clave}:${uid}`, limite.max, limite.ms)) return NextResponse.json({ ok: false, error: "Demasiadas peticiones seguidas. Espera un poco." }, { status: 429 });
  return { sb, uid };
}
export const esRespuesta = (x: Ctx | NextResponse): x is NextResponse => x instanceof NextResponse;
export async function paradaActiva(sb: SupabaseClient): Promise<string | null> { const p = await estadoParada(sb); return p.detenida ? `La oficina está DETENIDA${p.motivo ? `: ${p.motivo}` : ""}.` : null; }
/** Solo las variables que necesitan los conectores; nunca se devuelven al navegador ni se escriben en registros. */
export const envRed = (): Env => ({ GITHUB_TOKEN: process.env.GITHUB_TOKEN, JINA_API_KEY: process.env.JINA_API_KEY, EXA_API_KEY: process.env.EXA_API_KEY, SERPER_API_KEY: process.env.SERPER_API_KEY, TAVILY_API_KEY: process.env.TAVILY_API_KEY });
export const tablaFalta = (e: { message?: string; code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /relation .* does not exist|Could not find the table/i.test(e.message || ""));
export const SQL_FALTA = "Falta ejecutar el SQL 103 (TODO_CORRER_103_INTELLIGENCE.sql) en Supabase.";
