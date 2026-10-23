// Tipos comunes de la Intelligence Network. Sin imports: testeable.
export type Plataforma = "web" | "github" | "rss" | "busqueda" | "youtube";
export const PLATAFORMAS: Plataforma[] = ["web", "github", "rss", "busqueda", "youtube"];
export type EstadoConector = "operativa" | "limitada" | "no_configurada" | "fallida";
export type Seccion = "metadatos" | "licencia" | "documentacion" | "codigo" | "contenido" | "actividad";
export type Elemento = {
  plataforma: Plataforma;
  titulo: string;
  url: string;
  extracto: string;
  /** Hechos sacados por código de campos estructurados de la fuente (no los redacta un modelo). */
  hechos: string[];
  publicado: string | null;
  consultado: string;
  autor: string | null;
  metodo: string;
  seccion: Seccion;
  verificacion: "recuperado" | "sin_verificar";
  limitaciones: string[];
};
export type Salida = { ok: true; elementos: Elemento[]; ms: number } | { ok: false; error: string; estado: EstadoConector; ms: number };
export type Env = Record<string, string | undefined>;
export type Consulta =
  | { tipo: "web"; url: string }
  | { tipo: "github_repo"; owner: string; repo: string }
  | { tipo: "github_buscar"; q: string }
  | { tipo: "rss"; url: string }
  | { tipo: "busqueda"; q: string };
export const plataformaDe = (c: Consulta): Plataforma => (c.tipo === "web" ? "web" : c.tipo.startsWith("github") ? "github" : c.tipo === "rss" ? "rss" : "busqueda");
export const ETIQUETA: Record<EstadoConector, string> = { operativa: "Operativa", limitada: "Limitada", no_configurada: "Necesita configuración", fallida: "Ha fallado" };
