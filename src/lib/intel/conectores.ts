// Servidor: conectores de lectura de la Intelligence Network. Solo lectura. Reproducen los backends que usa Agent-Reach v1.5.0 para sus canales
// "web" (Jina Reader), "github" (API de GitHub, igual que el CLI gh) y "rss" (feed). YouTube necesita yt-dlp (Python) y por eso no se ofrece en Vercel.
// Nunca devuelven datos inventados: si la fuente no responde o viene vacía, devuelven { ok:false } con el motivo.
import type { Elemento, Env, Salida, EstadoConector } from "./tipos.ts";
import { limpiarExterno, repoDeUrl, sinSecretos, urlPublica } from "./seguridad.ts";

type F = typeof fetch;
const UA = "OficinaVirtualIntelligence/1.0";
const hoy = () => new Date().toISOString().slice(0, 10);
const fallo = (error: string, estado: EstadoConector, t0: number): Salida => ({ ok: false, error: sinSecretos(error).slice(0, 300), estado, ms: Date.now() - t0 });
const msg = (e: unknown) => String((e as Error)?.message || e).slice(0, 120);

export function esPaginaAntibot(cuerpo: string): boolean {
  const s = cuerpo.slice(0, 4096).toLowerCase();
  const jina = s.includes("warning:") && s.includes("requiring captcha");
  const estructura = ["title: just a moment...", "## performing security verification", "title: attention required! | cloudflare"].some((m) => s.includes(m));
  return (jina && estructura) || (s.includes("title: attention required! | cloudflare") && (s.includes("ray id") || s.includes("/cdn-cgi/challenge-platform/")));
}

/** Lectura de cualquier página pública vía Jina Reader (mismo backend que el canal web de Agent-Reach). */
export async function leerWeb(url: string, env: Env = {}, f: F = fetch): Promise<Salida> {
  const t0 = Date.now(); const u = urlPublica(url); if (!u) return fallo("URL no permitida (solo páginas públicas http/https).", "fallida", t0);
  try {
    const h: Record<string, string> = { Accept: "text/plain", "User-Agent": UA }; if (env.JINA_API_KEY) h.Authorization = `Bearer ${env.JINA_API_KEY}`;
    const r = await f("https://r.jina.ai/" + u, { headers: h, signal: AbortSignal.timeout(25000) });
    if (r.status === 429 || r.status === 402) return fallo(`Jina Reader limitó la consulta (${r.status}). Configura JINA_API_KEY o espera.`, "limitada", t0);
    if (!r.ok) return fallo(`Jina Reader respondió ${r.status}.`, "fallida", t0);
    const cuerpo = (await r.text()).slice(0, 5 * 1024 * 1024);
    if (esPaginaAntibot(cuerpo)) return fallo("La página devolvió una verificación anti-bot; no se obtuvo el contenido.", "limitada", t0);
    const m = (k: string) => new RegExp("^" + k + ":\\s*(.+)$", "mi").exec(cuerpo)?.[1]?.trim() ?? null;
    const idx = cuerpo.search(/^Markdown Content:\s*$/m);
    const texto = limpiarExterno(idx >= 0 ? cuerpo.slice(idx).replace(/^Markdown Content:\s*/m, "") : cuerpo, 20000);
    if (texto.length < 40) return fallo("La página no devolvió contenido legible.", "fallida", t0);
    const el: Elemento = { plataforma: "web", titulo: limpiarExterno(m("Title") || u, 200), url: u, extracto: texto, hechos: [], publicado: m("Published Time"), consultado: hoy(), autor: null, metodo: "Jina Reader (r.jina.ai)", seccion: "contenido", verificacion: "recuperado", limitaciones: texto.length >= 20000 ? ["Contenido recortado a 20.000 caracteres."] : [] };
    return { ok: true, elementos: [el], ms: Date.now() - t0 };
  } catch (e) { return fallo("No se pudo leer la página: " + msg(e), "fallida", t0); }
}

const ghHeaders = (env: Env, raw = false): Record<string, string> => ({ Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", "User-Agent": UA, "X-GitHub-Api-Version": "2022-11-28", ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) });
const sinCuota = (r: Response) => r.status === 403 && r.headers.get("x-ratelimit-remaining") === "0";
const CUOTA_MSG = "GitHub agotó la cuota sin autenticar. Configura GITHUB_TOKEN (solo lectura de repos públicos).";

/** Repositorio público: metadatos, licencia, README (documentación), estructura raíz (código) y último commit. Cada parte se separa en su propio elemento. */
export async function leerRepoGithub(owner: string, repo: string, env: Env = {}, f: F = fetch): Promise<Salida> {
  const t0 = Date.now(); const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`; const web = `https://github.com/${owner}/${repo}`;
  const get = (p: string, raw = false) => f(base + p, { headers: ghHeaders(env, raw), signal: AbortSignal.timeout(20000) });
  try {
    const r = await get("");
    if (sinCuota(r)) return fallo(CUOTA_MSG, "limitada", t0);
    if (r.status === 404) return fallo(`El repositorio ${owner}/${repo} no existe o no es público.`, "fallida", t0);
    if (!r.ok) return fallo(`GitHub respondió ${r.status}.`, "fallida", t0);
    const j = (await r.json()) as Record<string, unknown>;
    if (typeof j.full_name !== "string") return fallo("GitHub devolvió una respuesta sin datos del repositorio.", "fallida", t0);
    const lic = (j.license ?? null) as { spdx_id?: string; name?: string } | null; const rama = String(j.default_branch || "main"); const c = hoy();
    const base_el = { plataforma: "github" as const, consultado: c, autor: owner, verificacion: "recuperado" as const };
    const els: Elemento[] = [];
    els.push({ ...base_el, titulo: `${j.full_name} · metadatos`, url: web, seccion: "metadatos", metodo: "API REST de GitHub /repos", publicado: typeof j.created_at === "string" ? j.created_at : null, extracto: limpiarExterno(j.description, 400), limitaciones: [],
      hechos: [`Estrellas: ${j.stargazers_count}`, `Lenguaje principal: ${j.language ?? "no indicado"}`, `Último push: ${j.pushed_at}`, `Rama por defecto: ${rama}`, `Archivado: ${j.archived ? "sí" : "no"}`, `Incidencias abiertas: ${j.open_issues_count}`, ...(Array.isArray(j.topics) && j.topics.length ? [`Temas: ${(j.topics as string[]).slice(0, 10).join(", ")}`] : [])] });
    // Licencia: archivo detectado por GitHub (licencia del CÓDIGO; no cubre recursos de terceros ni servicios).
    try {
      const rl = await get("/license");
      if (rl.ok) {
        const lj = (await rl.json()) as { license?: { spdx_id?: string; name?: string }; path?: string; html_url?: string };
        els.push({ ...base_el, titulo: `${j.full_name} · licencia`, url: lj.html_url || web, seccion: "licencia", metodo: "API REST de GitHub /license", publicado: null, extracto: "", limitaciones: ["Es la licencia declarada para el código del repositorio. No garantiza que los recursos (imágenes, modelos, datos) o los servicios externos tengan la misma licencia."], hechos: [`Licencia detectada: ${lj.license?.spdx_id ?? "desconocida"} (${lj.license?.name ?? "sin nombre"})`, `Archivo de licencia: ${lj.path ?? "no indicado"}`] });
      } else els.push({ ...base_el, titulo: `${j.full_name} · licencia`, url: web, seccion: "licencia", metodo: "API REST de GitHub /license", publicado: null, extracto: "", limitaciones: ["GitHub no detectó un archivo de licencia reconocible; sin licencia no hay permiso de uso garantizado."], verificacion: "sin_verificar", hechos: [`Campo license del repositorio: ${lic?.spdx_id ?? "ninguno"}`] });
    } catch (e) { els.push({ ...base_el, titulo: `${j.full_name} · licencia`, url: web, seccion: "licencia", metodo: "API REST de GitHub /license", publicado: null, extracto: "", verificacion: "sin_verificar", hechos: [], limitaciones: ["No se pudo consultar la licencia: " + msg(e)] }); }
    try {
      const rr = await get("/readme", true);
      if (rr.ok) { const t = limpiarExterno(await rr.text(), 12000); if (t) els.push({ ...base_el, titulo: `${j.full_name} · README`, url: web + "#readme", seccion: "documentacion", metodo: "API REST de GitHub /readme", publicado: null, extracto: t, hechos: [], limitaciones: t.length >= 12000 ? ["README recortado a 12.000 caracteres."] : [] }); }
    } catch { /* el README es opcional */ }
    try {
      const rc = await get("/contents/");
      if (rc.ok) { const arr = (await rc.json()) as { name?: string; type?: string }[]; if (Array.isArray(arr) && arr.length) els.push({ ...base_el, titulo: `${j.full_name} · estructura raíz`, url: `${web}/tree/${rama}`, seccion: "codigo", metodo: "API REST de GitHub /contents", publicado: null, extracto: "", limitaciones: ["Solo se lista la raíz; no se ha analizado el código."], hechos: [`Contenido de la raíz: ${arr.slice(0, 40).map((x) => (x.type === "dir" ? x.name + "/" : x.name)).join(", ")}`] }); }
    } catch { /* opcional */ }
    try {
      const rk = await get("/commits?per_page=1");
      if (rk.ok) { const a = (await rk.json()) as { sha?: string; commit?: { committer?: { date?: string }; message?: string } }[]; const k = a?.[0]; if (k?.sha) els.push({ ...base_el, titulo: `${j.full_name} · último commit`, url: `${web}/commit/${k.sha}`, seccion: "actividad", metodo: "API REST de GitHub /commits", publicado: k.commit?.committer?.date ?? null, extracto: limpiarExterno(k.commit?.message, 300), limitaciones: [], hechos: [`Commit: ${k.sha}`, `Fecha: ${k.commit?.committer?.date ?? "no indicada"}`] }); }
    } catch { /* opcional */ }
    return { ok: true, elementos: els, ms: Date.now() - t0 };
  } catch (e) { return fallo("No se pudo consultar GitHub: " + msg(e), "fallida", t0); }
}

/** Búsqueda de repositorios públicos. La licencia que muestra es la del código de cada repo. */
export async function buscarGithub(q: string, env: Env = {}, f: F = fetch): Promise<Salida> {
  const t0 = Date.now(); const consulta = limpiarExterno(q, 200); if (consulta.length < 2) return fallo("Consulta demasiado corta.", "fallida", t0);
  try {
    const r = await f("https://api.github.com/search/repositories?per_page=8&q=" + encodeURIComponent(consulta), { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
    if (sinCuota(r) || r.status === 429) return fallo(CUOTA_MSG, "limitada", t0);
    if (!r.ok) return fallo(`GitHub respondió ${r.status}.`, "fallida", t0);
    const j = (await r.json()) as { items?: Record<string, unknown>[] };
    const els: Elemento[] = (j.items ?? []).filter((x) => typeof x.html_url === "string" && typeof x.full_name === "string").map((x) => {
      const lic = (x.license ?? null) as { spdx_id?: string } | null;
      return { plataforma: "github" as const, titulo: String(x.full_name), url: String(x.html_url), extracto: limpiarExterno(x.description, 300), hechos: [`Estrellas: ${x.stargazers_count}`, `Licencia declarada del código: ${lic?.spdx_id ?? "ninguna detectada"}`, `Último push: ${x.pushed_at}`, `Lenguaje: ${x.language ?? "no indicado"}`], publicado: typeof x.created_at === "string" ? x.created_at : null, consultado: hoy(), autor: String((x.owner as { login?: string } | undefined)?.login ?? "") || null, metodo: "API REST de GitHub /search/repositories", seccion: "metadatos" as const, verificacion: "recuperado" as const, limitaciones: ["Resultado de búsqueda: comprueba la licencia de los recursos y la actividad antes de usarlo."] };
    });
    return els.length ? { ok: true, elementos: els, ms: Date.now() - t0 } : fallo("GitHub no devolvió repositorios para esa búsqueda.", "fallida", t0);
  } catch (e) { return fallo("No se pudo buscar en GitHub: " + msg(e), "fallida", t0); }
}

const etiqueta = (x: string, t: string) => new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i").exec(x)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim() ?? "";
/** Feed RSS/Atom (mismo propósito que el canal rss de Agent-Reach, que usa feedparser). */
export async function leerRss(url: string, f: F = fetch): Promise<Salida> {
  const t0 = Date.now(); const u = urlPublica(url); if (!u) return fallo("URL de feed no permitida.", "fallida", t0);
  try {
    const r = await f(u, { headers: { "User-Agent": UA, Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return fallo(`El feed respondió ${r.status}.`, "fallida", t0);
    const xml = (await r.text()).slice(0, 2 * 1024 * 1024);
    const bloques = xml.match(/<(entry|item)[\s>][\s\S]*?<\/\1>/gi) ?? [];
    const els: Elemento[] = [];
    for (const b of bloques.slice(0, 12)) {
      const titulo = limpiarExterno(etiqueta(b, "title"), 200);
      const enlace = /<link[^>]*href=["']([^"']+)["']/i.exec(b)?.[1] || etiqueta(b, "link"); const link = urlPublica(enlace); if (!titulo || !link) continue;
      els.push({ plataforma: "rss", titulo, url: link, extracto: limpiarExterno(etiqueta(b, "summary") || etiqueta(b, "description") || etiqueta(b, "content"), 400), hechos: [], publicado: etiqueta(b, "updated") || etiqueta(b, "pubDate") || etiqueta(b, "published") || null, consultado: hoy(), autor: etiqueta(b, "name") || etiqueta(b, "author") || null, metodo: "Feed RSS/Atom", seccion: "actividad", verificacion: "recuperado", limitaciones: [] });
    }
    return els.length ? { ok: true, elementos: els, ms: Date.now() - t0 } : fallo("El feed no contiene entradas legibles.", "fallida", t0);
  } catch (e) { return fallo("No se pudo leer el feed: " + msg(e), "fallida", t0); }
}

/** YouTube necesita yt-dlp (Python) y un trabajador con Node/JS runtime; no existe en Vercel. Se declara así, sin simular. */
export const YOUTUBE_NO_DISPONIBLE = "Requiere yt-dlp en un trabajador Python (Agent-Reach necesita Python ≥ 3.10). Aún no está instalado: no se simulan vídeos ni subtítulos.";
export { repoDeUrl };
