// Servidor: barreras de la Intelligence Network. Todo lo recuperado de fuera es dato NO confiable; aquí se valida lo que entra (URLs, repos, parámetros)
// y se detectan instrucciones incrustadas en el contenido. Sin imports: testeable.
const HOST_PRIVADO = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.lan|metadata\.google\.internal)$/i;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Devuelve la URL normalizada solo si es http(s) pública: sin credenciales, sin puertos raros, sin hosts internos ni IPs privadas. */
export function urlPublica(entrada: unknown): string | null {
  if (typeof entrada !== "string" || entrada.length > 2000) return null;
  let u: URL; try { u = new URL(entrada.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || HOST_PRIVADO.test(h) || h.startsWith("[")) return null;
  const m = IPV4.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
  }
  u.hash = "";
  return u.toString();
}

const SEG = /^[A-Za-z0-9_.-]{1,100}$/;
/** owner/repo a partir de una URL de github.com. No acepta nada que no sea github.com. */
export function repoDeUrl(entrada: string): { owner: string; repo: string } | null {
  const u = urlPublica(entrada); if (!u) return null;
  const x = new URL(u); if (x.hostname !== "github.com" && x.hostname !== "www.github.com") return null;
  const p = x.pathname.split("/").filter(Boolean); if (p.length < 2) return null;
  const owner = p[0], repo = p[1].replace(/\.git$/i, "");
  return SEG.test(owner) && SEG.test(repo) && owner !== ".." && repo !== ".." ? { owner, repo } : null;
}

const PATRONES: [RegExp, string][] = [
  [/ignor(a|e|ar)\s+(todas?\s+)?(las\s+)?(instrucciones|reglas)\s+(anteriores|previas)/i, "ordena ignorar instrucciones previas"],
  [/ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above)\s+(instructions|rules|prompts?)/i, "ordena ignorar instrucciones previas"],
  [/disregard\s+(the\s+)?(system|previous|above)/i, "ordena descartar el sistema"],
  [/(system\s+prompt|prompt\s+del\s+sistema)/i, "menciona el prompt del sistema"],
  [/you\s+are\s+now\s+(a|an|in)\b|a\s+partir\s+de\s+ahora\s+eres/i, "intenta cambiar el rol del agente"],
  [/(reveal|print|send|exfiltrate|muestra|env[ií]a|revela)\b.{0,40}\b(api[\s_-]?key|token|secret|password|contrase[ñn]a|cookie|clave)/i, "pide revelar secretos"],
  [/(curl|wget)\s+[^\n|]{0,200}\|\s*(ba|z)?sh\b/i, "incluye una descarga y ejecución de scripts"],
  [/\b(rm\s+-rf|sudo\s+\w+|chmod\s+777)\b/i, "incluye comandos destructivos o con privilegios"],
  [/(execute|run|ejecuta)\s+(the\s+following|this|el\s+siguiente|este)\s+(command|code|script|comando|c[oó]digo)/i, "pide ejecutar comandos"],
  [/(publish|post|publica|env[ií]a)\s+.{0,30}\b(on\s+my\s+behalf|en\s+mi\s+nombre)/i, "pide publicar o enviar en nombre del usuario"],
];
/** Frases típicas de inyección de prompt dentro de contenido recuperado. No bloquea la lectura: avisa para tratarlo como dato. */
export function detectarInyeccion(texto: string): string[] {
  const out = new Set<string>(); const t = (texto || "").slice(0, 200_000);
  for (const [re, why] of PATRONES) if (re.test(t)) out.add(why);
  return [...out];
}

/** Oculta secretos reconocibles en cualquier texto que vaya a un registro, error o informe. */
export function sinSecretos(s: string): string {
  return String(s ?? "")
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secreto]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[secreto]")
    .replace(/\bjina_[A-Za-z0-9]{16,}\b/g, "[secreto]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, "[secreto]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]{12,}=*/gi, "$1[secreto]");
}

/** Recorta y limpia contenido externo (sin caracteres de control) antes de guardarlo o dárselo a un modelo. */
export function limpiarExterno(texto: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(texto ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}
