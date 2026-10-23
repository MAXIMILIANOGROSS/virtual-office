import type { Metadata } from "next";
import { PROYECTO } from "@/oficina.config";
import "./globals.css";

export const metadata: Metadata = {
  title: PROYECTO.nombre.trim() ? `Oficina virtual · ${PROYECTO.nombre.trim()}` : "Oficina virtual",
  description: "Oficina virtual con agentes de IA, estudio de marketing y de vídeo.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="es"><body>{children}</body></html>);
}
