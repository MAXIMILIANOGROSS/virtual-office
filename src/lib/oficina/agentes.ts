// Oficina virtual: plantilla de 43 agentes (CIRO + 3 jefes de departamento + 26 especialistas + 13 de YouTube Studio "clonados" de su jefe).
// IMPORTANTE (honestidad): no son 30 IA entrenadas ni procesos separados. Son 30 PERFILES (instrucciones + habilidades + límites) que usan el mismo
// modelo de IA configurado en el servidor (gratuito si usas Groq/Gemini/OpenRouter). Su "especialidad" viene de las instrucciones, no de entrenamiento propio.
import { FILAS_YT, instruccionesYT } from "../youtube/agentes-yt.ts";
import { PROYECTO, contextoProyecto, nombreCeo } from "../../oficina.config.ts";
export type Area = "direccion" | "estrategia" | "tecnologia" | "crecimiento" | "youtube";
/** Área que se guarda en la base de datos: la restricción de office_tasks solo admite 4 áreas, así que YouTube Studio se registra bajo «crecimiento». */
export const areaDb = (a: Area): "direccion" | "estrategia" | "tecnologia" | "crecimiento" => (a === "youtube" ? "crecimiento" : a);
export type Agente = { id: string; nombre: string; area: Area; rol: string; jefe: boolean; habilidades: string[]; palabras: string[] };

export const AREAS: Record<Area, { nombre: string; mision: string }> = {
  direccion: { nombre: "Dirección y coordinación", mision: "Convertir las órdenes del CEO en trabajo concreto, delegarlo, revisarlo y presentar solo las decisiones que necesitan al CEO." },
  estrategia: { nombre: "Estrategia, negocio y finanzas", mision: "Que el proyecto sea un negocio viable, diferenciado y rentable: qué construir, qué vender, a quién y cómo crecer." },
  tecnologia: { nombre: "Tecnología, producto e IA", mision: "Construir, mantener y mejorar la tecnología del proyecto y automatizar las operaciones." },
  youtube: { nombre: "YouTube Studio", mision: "Producir, optimizar y analizar vídeos de YouTube con aprobación humana: nada se publica sin tu permiso." },
  crecimiento: { nombre: "Marketing, ventas y cliente", mision: "Que más personas y negocios descubran el proyecto, se queden y se conviertan en relaciones duraderas." },
};

type Fila = [string, string, Area, string, boolean, string, string];
// id, nombre, área, rol, jefe, habilidades (|), palabras de enrutado (|)
const F: Fila[] = [
  ["ciro", "CIRO", "direccion", "Asistente ejecutivo del CEO", true, "Planificar|Delegar|Priorizar|Informes ejecutivos|Detectar bloqueos", "organiza|prioridad|resumen|informe|agenda|manana|pendiente|bloque"],
  ["strategy", "CREW STRATEGY", "estrategia", "Directora de negocio, estrategia y finanzas", true, "Estrategia|Modelos de negocio|Finanzas|Priorización|Informes para Dirección", "estrategia|negocio|modelo|monetiza|ingreso|rentab|inversi"],
  ["tech", "CREW TECH", "tecnologia", "Director de tecnología, producto e IA", true, "Arquitectura|Desarrollo|IA y agentes|Seguridad|Despliegue", "tecnolog|codigo|app|programa|desarroll|arquitectura|servidor"],
  ["growth", "CREW GROWTH", "crecimiento", "Directora comercial, marketing y cliente", true, "Marketing|Ventas|Atención al cliente|Comunidad|Crecimiento", "marketing|ventas|cliente|campana|crecimiento|captar|colabor"],
  ["est-mercado", "Analista de mercado", "estrategia", "Investiga mercado, tendencias y segmentos", false, "Investigación|Segmentación|Tendencias", "mercado|tendencia|segmento|demanda|tamano"],
  ["est-competencia", "Inteligencia competitiva", "estrategia", "Compara competidores y alternativas", false, "Benchmark|Posicionamiento|Alternativas", "competidor|competencia|alternativa|benchmark|similar"],
  ["est-finanzas", "Modelador financiero", "estrategia", "Proyecciones, márgenes y escenarios", false, "Proyecciones|Márgenes|Escenarios", "financ|margen|proyecci|escenario|break|flujo"],
  ["est-precios", "Precios y monetización", "estrategia", "Diseña precios, planes y fuentes de ingreso", false, "Precios|Suscripciones|Paquetes", "precio|tarifa|suscripci|plan|pro|monetizaci"],
  ["est-presupuesto", "Presupuestos y costes", "estrategia", "Controla costes y presupuestos", false, "Presupuesto|Costes|Control de gasto", "presupuesto|coste|gasto|cuanto cuesta|ahorr"],
  ["est-riesgos", "Riesgos y cumplimiento", "estrategia", "Riesgos, RGPD y cumplimiento (no es asesoría legal)", false, "Riesgos|RGPD|Cumplimiento", "riesgo|rgpd|privacidad|legal|normativa|cumplimiento"],
  ["est-validacion", "Validación de hipótesis", "estrategia", "Diseña experimentos baratos para validar ideas", false, "Experimentos|MVP|Métricas", "valida|hipotesis|experimento|prueba piloto|mvp"],
  ["est-alianzas", "Alianzas estratégicas", "estrategia", "Socios, patrocinios y acuerdos", false, "Alianzas|Patrocinios|Acuerdos", "alianza|socio|patrocin|acuerdo|colaboraci"],
  ["tec-arquitecto", "Arquitecto de software", "tecnologia", "Diseña la arquitectura y decide qué reutilizar", false, "Arquitectura|Diseño de sistemas|Decisiones técnicas", "arquitectura|disena|estructura|reutiliz|escalab"],
  ["tec-frontend", "Frontend y UX", "tecnologia", "Interfaces, accesibilidad y experiencia", false, "React/Next|Accesibilidad|UX", "pantalla|interfaz|diseno|ux|boton|movil|responsive"],
  ["tec-backend", "Backend y APIs", "tecnologia", "APIs, integraciones y lógica de servidor", false, "APIs|Integraciones|Node", "api|backend|endpoint|integra|webhook"],
  ["tec-datos", "Base de datos y SQL", "tecnologia", "Esquemas, SQL, RLS y migraciones", false, "Postgres|RLS|Migraciones", "sql|base de datos|tabla|supabase|migraci"],
  ["tec-qa", "QA y pruebas", "tecnologia", "Pruebas automatizadas y detección de errores", false, "Tests|Reproducir bugs|Regresiones", "test|prueba|bug|error|falla|no funciona"],
  ["tec-seguridad", "Seguridad", "tecnologia", "Seguridad, permisos, secretos y abuso", false, "Permisos|Secretos|Amenazas", "seguridad|permiso|clave|hack|vulnerab|abuso"],
  ["tec-devops", "DevOps y despliegue", "tecnologia", "Despliegue, Vercel, Cloudflare y monitorización", false, "Vercel|Cloudflare|Monitorización", "despliega|deploy|vercel|cloudflare|servidor|hosting"],
  ["tec-ia", "Ingeniero de agentes IA", "tecnologia", "Prompts, modelos, memoria y herramientas de IA", false, "Prompts|Modelos gratuitos|Evaluación", "ia|modelo|prompt|agente|llm|chatbot"],
  ["tec-licencias", "Revisor de licencias y repos", "tecnologia", "Verifica licencias y mantenimiento de repositorios", false, "Licencias|Dependencias|Auditoría", "licencia|repositorio|github|open source|dependencia"],
  ["cre-marca", "Marca y posicionamiento", "crecimiento", "Voz de marca, mensajes y propuesta de valor", false, "Marca|Mensajes|Propuesta de valor", "marca|posiciona|mensaje|identidad|propuesta de valor"],
  ["cre-contenido", "Contenido y redes", "crecimiento", "Calendario editorial y publicaciones", false, "Contenido|Redes|Calendario", "contenido|redes|instagram|tiktok|publicaci|post"],
  ["cre-seo", "SEO y web", "crecimiento", "Posicionamiento en buscadores y landing", false, "SEO|Landing|Conversión web", "seo|google|buscador|landing|web"],
  ["cre-ventas", "Prospección y ventas B2B", "crecimiento", "Prospección de clientes potenciales y propuestas comerciales", false, "Prospección|Propuestas|Seguimiento", "prospect|cliente potencial|propuesta comercial|lead|reunion|presupuesto|cierre"],
  ["cre-canales", "Canales y partners", "crecimiento", "Distribución, partners y acuerdos con terceros", false, "Canales|Partners|Acuerdos comerciales", "canal|partner|distribuci|afiliad|reseller|integraci|marketplace"],
  ["cre-soporte", "Atención al cliente", "crecimiento", "Preguntas frecuentes, incidencias y escalado", false, "FAQ|Incidencias|Escalado", "soporte|atencion|incidencia|queja|reclamacion|ayuda"],
  ["cre-mensajeria", "WhatsApp y comunicaciones", "crecimiento", "Respuestas y plantillas para WhatsApp, correo y teléfono", false, "WhatsApp|Correo|Guiones de llamada", "whatsapp|correo|email|llamada|telefono|mensaje|plantilla"],
  ["cre-comunidad", "Comunidad y retención", "crecimiento", "Activación, retención y embajadores", false, "Retención|Comunidad|Referidos", "comunidad|retenci|usuarios activos|embajador|referido"],
  ["cre-analitica", "Analítica y conversión", "crecimiento", "Embudos, métricas y optimización", false, "Embudo|Métricas|Experimentos", "analitica|metrica|conversi|embudo|kpi|dato"],
];

// YouTube Studio: especialistas audiovisuales dentro del departamento de crecimiento (no se añade un área nueva para no tocar la restricción de la base de datos).
const YT: Fila[] = FILAS_YT.map(([id, nombre, rol, h, p]) => [id, nombre, "youtube", rol, false, h, p]);
const aAg = (f: Fila): Agente => { const [id, nombre, area, rol, jefe, h, p] = f; return { id, nombre, area, rol, jefe, habilidades: h.split("|"), palabras: p.split("|") }; };
export const AGENTES: Agente[] = [...F, ...YT].map(aAg);
/** Sala YouTube Studio (13 agentes): forman parte de la plantilla de 43 y se coordinan con CIRO. */
export const AGENTES_YT: Agente[] = AGENTES.filter((a) => a.area === "youtube");
export const agentePorId = (id: string): Agente | undefined => AGENTES.find((a) => a.id === id);
export const JEFE_DE: Record<Area, string> = { direccion: "ciro", estrategia: "strategy", tecnologia: "tech", crecimiento: "growth", youtube: "ciro" };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Elige el agente más adecuado por palabras clave (especialistas puntúan doble que jefes). Sin coincidencias: responde CIRO. */
export function enrutar(instruccion: string): Agente {
  const t = norm(instruccion); let mejor: Agente | null = null; let max = 0;
  for (const a of AGENTES) { let n = 0; for (const w of a.palabras) if (w.length <= 4 ? new RegExp(`\\b${w}\\b`).test(t) : t.includes(w)) n += a.jefe ? 1 : 2; if (n > max) { max = n; mejor = a; } }
  return mejor ?? AGENTES[0];
}

/** Instrucciones del sistema de un agente. Fijas y auditables: dicen qué hace, qué NO puede hacer y cómo debe ser honesto. */
export function promptDe(a: Agente): string {
  const ar = AREAS[a.area];
  return [
    `Eres ${a.nombre}, ${a.rol}, en la oficina virtual${PROYECTO.nombre.trim() ? " de " + PROYECTO.nombre.trim() : ""}. Trabajas para ${nombreCeo()}.`,
    contextoProyecto(),
    `Departamento: ${ar.nombre}. Misión: ${ar.mision}`,
    `Habilidades: ${a.habilidades.join(", ")}.`,
    `REGLAS: responde en ${PROYECTO.idioma}. Estructura: Resumen, Datos y supuestos, Riesgos, Recomendación, Próximos pasos.`,
    "No inventes cifras, clientes, ingresos, estudios, precios ni funcionalidades. Si no sabes algo o no tienes datos, dilo y propón cómo conseguirlos. Distingue hechos, hipótesis y recomendaciones.",
    `No puedes enviar mensajes, llamar, publicar, pagar ni modificar sistemas: solo preparas borradores y propuestas para que ${nombreCeo()} las apruebe. Nunca digas que has hecho algo que no has hecho.`,
    "No eres asesor legal ni financiero titulado: señala cuándo hace falta un profesional.",
  ].filter(Boolean).join("\n") + instruccionesYT(a.id);
}
