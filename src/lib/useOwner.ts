"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export type OwnerState = "cargando" | "no-sesion" | "denegado" | "owner";
/** Pregunta al servidor si la sesión es la del propietario. Nunca decide el navegador. */
export function useOwner(): OwnerState {
  const [st, setSt] = useState<OwnerState>("cargando");
  useEffect(() => {
    let vivo = true;
    const comprobar = async (token?: string) => {
      if (!token) { if (vivo) setSt("no-sesion"); return; }
      try {
        const r = await fetch("/api/admin/whoami", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const j = await r.json();
        if (vivo) setSt(j.owner === true ? "owner" : "denegado");
      } catch { if (vivo) setSt("denegado"); }
    };
    supabase.auth.getSession().then(({ data }) => comprobar(data.session?.access_token));
    const { data: l } = supabase.auth.onAuthStateChange((_e, s) => { comprobar(s?.access_token); });
    return () => { vivo = false; l.subscription.unsubscribe(); };
  }, []);
  return st;
}
