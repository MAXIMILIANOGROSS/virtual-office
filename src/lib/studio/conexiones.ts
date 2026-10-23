/** Conexiones del Studio: lógica pura. «Conectado» solo si el worker/servidor lo ha comprobado hace poco. */
export type ConexionId = "motor_video" | "ia_local" | "voz" | "almacenamiento" | "youtube" | "analitica" | "social" | "n8n";
export type Def = { id: ConexionId; nombre: string; controlable: boolean; nota: string };
export const CONEXIONES: Def[] = [
  { id: "ia_local", nombre: "IA local (Ollama)", controlable: true, nota: "La comprueba el worker en tu Mac: Ollama debe responder en localhost:11434." },
  { id: "motor_video", nombre: "Motor de vídeo (MoneyPrinterTurbo)", controlable: true, nota: "La comprueba el worker: MoneyPrinterTurbo debe responder en localhost:8080." },
  { id: "voz", nombre: "Voz (TTS)", controlable: true, nota: "Pasa a Conectado cuando un vídeo real sale con pista de audio validada." },
  { id: "almacenamiento", nombre: "Almacenamiento de vídeo (disco local)", controlable: true, nota: "El worker comprueba que puede escribir en ~/EstudioVideo y que hay espacio." },
  { id: "youtube", nombre: "YouTube (subida privada)", controlable: true, nota: "El worker sube tus vídeos en privado cuando este Mac tiene las credenciales de YouTube. Publicar en abierto sigue bloqueado: lo haces tú en YouTube Studio." },
  { id: "analitica", nombre: "Analítica", controlable: false, nota: "Aún no existe: depende de YouTube." },
  { id: "social", nombre: "Instagram / TikTok", controlable: false, nota: "Fase 2: sus APIs exigen aprobación de apps." },
  { id: "n8n", nombre: "n8n", controlable: false, nota: "Descartado: su licencia es restrictiva. Se usa launchd + el worker." },
];
export const IDS = new Set<string>(CONEXIONES.map((c) => c.id));
export const CONTROLABLES = new Set<string>(CONEXIONES.filter((c) => c.controlable).map((c) => c.id));
export const FRESCO_MIN = 30;
export type Fila = { id: string; habilitada: boolean; ultimo_ok: string | null; detalle: string | null };
export type Estado = "conectado" | "desconectado" | "sin_respuesta" | "no_configurado" | "no_disponible";
export function estadoConexion(def: Def, f: Fila | undefined, ahora = Date.now()): { estado: Estado; detalle: string } {
  if (!def.controlable) return { estado: "no_disponible", detalle: def.nota };
  if (f && f.habilitada === false) return { estado: "desconectado", detalle: "Desconectado por ti: el worker no la usa." };
  if (!f || !f.ultimo_ok) return { estado: "no_configurado", detalle: def.nota };
  const min = (ahora - Date.parse(f.ultimo_ok)) / 60000;
  if (min <= FRESCO_MIN) return { estado: "conectado", detalle: f.detalle || "Comprobado hace " + Math.max(0, Math.round(min)) + " min." };
  return { estado: "sin_respuesta", detalle: "Sin señal desde hace " + Math.round(min) + " min. ¿Está el worker en marcha en tu Mac?" };
}
