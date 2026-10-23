"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PROYECTO } from "@/oficina.config";

const NAV: [string, string][] = [["/oficina", "Oficina"], ["/oficinapublica", "Oficina pública"], ["/video-studio", "Vídeo Studio"], ["/youtube-studio", "YouTube Studio"]];

/** Marco mínimo del área privada: cabecera con el nombre del proyecto, enlaces a las salas y cierre de sesión. */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/oficina";
  const [email, setEmail] = useState("");
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email || "")); }, []);
  return (
    <div style={{ minHeight: "100vh", background: "#07182E", color: "#E6F0FF" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "10px 16px", borderBottom: "2px solid #FFD600" }}>
        <b style={{ letterSpacing: 1.2 }}>{(PROYECTO.nombre.trim() || "OFICINA VIRTUAL").toUpperCase()}</b>
        <nav aria-label="Salas" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {NAV.map(([h, l]) => <Link key={h} href={h} aria-current={path === h ? "page" : undefined} style={{ color: path === h ? "#FFD600" : "#CFE0FF", fontWeight: path === h ? 800 : 500, textDecoration: "none" }}>{l}</Link>)}
        </nav>
        <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>{email}</span>
        <button type="button" onClick={async () => { await supabase.auth.signOut(); location.href = "/login"; }} style={{ background: "transparent", color: "#FFD600", border: "1px solid #FFD600", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>Salir</button>
      </header>
      <div>{children}</div>
    </div>
  );
}
