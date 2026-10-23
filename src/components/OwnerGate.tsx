"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOwner } from "@/lib/useOwner";

/** Puerta de propietario: no monta el contenido hasta que el servidor confirma la cuenta. Las APIs vuelven a comprobarlo por su cuenta. */
export default function OwnerGate({ children }: { children: React.ReactNode }) {
  const st = useOwner();
  const path = usePathname() || "/admin";
  if (st === "owner") return <>{children}</>;
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", background: "#050b1a", color: "#e6f0ff" }}>
      <div>
        {st === "cargando" && <p>Verificando acceso…</p>}
        {st === "no-sesion" && <><p>Área privada del propietario.</p><Link href={`/login?next=${encodeURIComponent(path)}`} style={{ color: "#22d3ee" }}>Iniciar sesión</Link></>}
        {st === "denegado" && <><p><b>Acceso denegado.</b> Esta zona es solo para el propietario de esta oficina (variable OWNER_EMAIL).</p><Link href="/" style={{ color: "#22d3ee" }}>Volver al inicio</Link></>}
      </div>
    </div>
  );
}
