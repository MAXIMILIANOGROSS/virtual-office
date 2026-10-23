"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PROYECTO } from "@/oficina.config";

/** Acceso del propietario. El servidor vuelve a comprobar OWNER_EMAIL en cada llamada: esta pantalla solo inicia sesión. */
export default function Login() {
  const [email, setEmail] = useState(""); const [pass, setPass] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setBusy(false);
    if (error) { setMsg("No se pudo iniciar sesión: " + error.message); return; }
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/oficina";
  }
  const campo = { width: "100%", padding: 10, borderRadius: 8, border: "2px solid #FFD600", background: "#fff", color: "#07182E", fontSize: 15 } as const;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form onSubmit={entrar} style={{ width: "100%", maxWidth: 360, display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{PROYECTO.nombre.trim() ? `Oficina de ${PROYECTO.nombre.trim()}` : "Oficina virtual"}</h1>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>Acceso del propietario.</p>
        <label>Correo<input style={campo} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Contraseña<input style={campo} type="password" required autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} /></label>
        <button type="submit" disabled={busy} style={{ padding: "10px 16px", borderRadius: 10, border: 0, background: "#FFD600", color: "#07182E", fontWeight: 800, cursor: "pointer" }}>{busy ? "Entrando…" : "Entrar"}</button>
        {msg && <p role="alert" style={{ margin: 0, color: "#FF8A80", fontSize: 13 }}>{msg}</p>}
      </form>
    </main>
  );
}
