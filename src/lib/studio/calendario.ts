/** Estudio de vídeo · planificador editorial de 7/14/30 días. Alterna categorías y ganchos y evita variaciones superficiales. Lógica pura. */
export type Cat = { id: string; nombre: string; publicos: ("principal" | "secundario" | "marca")[]; metrica: string };
export const CATEGORIAS: Cat[] = [
  { id: "captacion-principal", nombre: "Captación del público principal", publicos: ["principal"], metrica: "registros o contactos" },
  { id: "captacion-secundario", nombre: "Captación de empresas y partners", publicos: ["secundario"], metrica: "contactos comerciales" },
  { id: "presentacion", nombre: "Presentación del proyecto", publicos: ["marca", "principal", "secundario"], metrica: "visualizaciones y retención" },
  { id: "demo", nombre: "Demostración del producto", publicos: ["principal", "secundario"], metrica: "clics a la web" },
  { id: "educacion", nombre: "Contenido educativo", publicos: ["principal"], metrica: "retención y guardados" },
  { id: "consejos-clientes", nombre: "Consejos para clientes", publicos: ["principal"], metrica: "retención y compartidos" },
  { id: "consejos-profesionales", nombre: "Consejos para profesionales y empresas", publicos: ["secundario"], metrica: "clics y contactos" },
  { id: "historias", nombre: "Historias de marca", publicos: ["marca"], metrica: "alcance y comentarios" },
  { id: "detras-de-camaras", nombre: "Detrás de las cámaras", publicos: ["marca", "principal"], metrica: "alcance y compartidos" },
  { id: "producto", nombre: "Novedad real del producto", publicos: ["marca", "principal", "secundario"], metrica: "clics a la web" },
  { id: "faq", nombre: "Preguntas frecuentes", publicos: ["principal", "secundario"], metrica: "retención" },
  { id: "experimento", nombre: "Experimento creativo", publicos: ["marca", "principal", "secundario"], metrica: "comparación de ganchos" },
];
export const GANCHOS = ["pregunta", "dato verificable", "problema-solución", "historia breve", "reto", "antes y después"] as const;
export type Item = { dia: number; fecha: string; categoria: string; nombre: string; gancho: (typeof GANCHOS)[number]; formato: string; objetivoMedible: string; canal: string };

export function generarCalendario(o: { inicio: Date; dias: number; publico: "principal" | "secundario" | "marca"; canales: string[]; porDia?: number }): Item[] {
  const elegibles = CATEGORIAS.filter((c) => c.publicos.includes(o.publico)); const pool = elegibles.length >= 4 ? elegibles : CATEGORIAS;
  const out: Item[] = []; let k = 0; let ultima = "";
  for (let d = 0; d < o.dias; d++) {
    for (let v = 0; v < Math.min(3, o.porDia || 1); v++) {
      let c = pool[k % pool.length]; if (c.id === ultima) { k++; c = pool[k % pool.length]; }
      const f = new Date(o.inicio.getTime() + d * 86400000).toISOString().slice(0, 10);
      out.push({ dia: d + 1, fecha: f, categoria: c.id, nombre: c.nombre, gancho: GANCHOS[(k + d) % GANCHOS.length], formato: "9:16", objetivoMedible: c.metrica, canal: o.canales[(k) % o.canales.length] });
      ultima = c.id; k++;
    }
  }
  return out;
}
const pal = (s: string) => new Set(s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 3));
/** Similitud de Jaccard entre dos títulos (0-1). */
export function similitud(a: string, b: string): number { const A = pal(a), B = pal(b); if (!A.size || !B.size) return 0; let i = 0; A.forEach((w) => { if (B.has(w)) i++; }); return i / (A.size + B.size - i); }
export const esRepetido = (titulo: string, previos: string[], umbral = 0.6) => previos.some((p) => similitud(titulo, p) >= umbral);
