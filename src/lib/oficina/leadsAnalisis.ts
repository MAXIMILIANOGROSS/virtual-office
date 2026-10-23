// Servidor: análisis SOLO LECTURA de leads. Calcula todo de forma determinista y devuelve agregados + ids; el modelo NUNCA recibe emails, teléfonos ni nombres.
export type LeadFila = { id: string; type: string; status: string | null; score: number | null; created_at: string; payload: Record<string, unknown> | null };
const CLAVES = { email: /^(e-?mail|correo)/i, telefono: /^(phone|tel|telefono|teléfono|whatsapp|movil|móvil)/i, nombre: /^(name|nombre|business|negocio|empresa)/i };
const valor = (p: Record<string, unknown> | null, re: RegExp): string => { if (!p) return ""; for (const [k, v] of Object.entries(p)) if (re.test(k) && (typeof v === "string" || typeof v === "number") && String(v).trim()) return String(v).trim(); return ""; };
export const normEmail = (s: string) => s.trim().toLowerCase();
export const normTel = (s: string) => s.replace(/[^\d]/g, "").replace(/^(00)?34(?=\d{9}$)/, "");
export type Analisis = {
  total: number; porTipo: Record<string, number>; porEstado: Record<string, number>; ultimos7dias: number;
  incompletos: { id: string; faltan: string[] }[]; duplicados: { claves: number; ids: string[][] }; seguimiento: { id: string; tipo: string; dias: number }[];
};
export function analizarLeads(leads: LeadFila[], ahora = Date.now()): Analisis {
  const por = (f: (l: LeadFila) => string) => leads.reduce<Record<string, number>>((m, l) => { const k = f(l) || "sin_dato"; m[k] = (m[k] || 0) + 1; return m; }, {});
  const incompletos: Analisis["incompletos"] = []; const grupos = new Map<string, string[]>(); const seg: Analisis["seguimiento"] = [];
  for (const l of leads) {
    const em = valor(l.payload, CLAVES.email), tel = valor(l.payload, CLAVES.telefono), nom = valor(l.payload, CLAVES.nombre);
    const faltan = [!em && !tel ? "contacto (email o teléfono)" : "", !nom ? "nombre" : ""].filter(Boolean);
    if (faltan.length) incompletos.push({ id: l.id, faltan });
    for (const k of [em && "e:" + normEmail(em), tel && normTel(tel).length >= 7 && "t:" + normTel(tel)]) if (k) grupos.set(k, [...(grupos.get(k) || []), l.id]);
    const dias = Math.floor((ahora - Date.parse(l.created_at)) / 86400000);
    if ((l.status === null || l.status === "new" || l.status === "nuevo") && dias >= 3) seg.push({ id: l.id, tipo: l.type, dias });
  }
  const dup = Array.from(grupos.values()).filter((ids) => new Set(ids).size > 1).map((ids) => Array.from(new Set(ids)));
  return { total: leads.length, porTipo: por((l) => l.type), porEstado: por((l) => l.status ?? ""), ultimos7dias: leads.filter((l) => ahora - Date.parse(l.created_at) <= 7 * 86400000).length,
    incompletos: incompletos.slice(0, 50), duplicados: { claves: dup.length, ids: dup.slice(0, 20) }, seguimiento: seg.sort((a, b) => b.dias - a.dias).slice(0, 30) };
}
export function promptLeads(base: string, a: Analisis): string {
  return `${base}\n\nEres el Analista de leads. Trabajas SOLO con este resumen calculado por el sistema (no tienes datos personales y no debes pedirlos). ` +
    `Escribe: "## Resumen", "## Problemas de datos" (incompletos y posibles duplicados, citando ids), "## Oportunidades de seguimiento" y "## Recomendaciones". ` +
    `No inventes cifras: usa solo las del resumen. No propongas borrar contactos ni enviar mensajes sin aprobación del CEO.\n\nRESUMEN (JSON):\n${JSON.stringify(a)}`;
}
