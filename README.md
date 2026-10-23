# Oficina Virtual

Una oficina 3D con **43 agentes de IA** (CIRO + 3 jefes de área + 26 especialistas + 13 del Estudio YouTube), un **Estudio de Marketing y Vídeo** con todo el proceso de creación y un **ciclo 24/7**. Viene **en blanco**: no sabe para quién trabaja hasta que se lo dices en un solo archivo.

> Los agentes son **perfiles con prompt** (rol, misión, palabras clave de enrutado), no modelos entrenados. Todo lo que producen son **propuestas**: nada se publica ni se gasta sin aprobación humana.

## Qué incluye
- Oficina 3D (three.js), vista isométrica, mapa y vista pública.
- Equipo de 43 agentes con enrutado por palabras clave, chat, tareas, conocimiento, canales y control.
- Estudio de marketing: carteles, anuncios, campañas, guiones y vídeo con control de calidad.
- Estudio YouTube, Intelligence (conectores e informes) e informes diarios.
- Ciclo 24/7 (GitHub Actions + `/api/oficina/ciclo`) con tareas, resúmenes e ideas.
- Proveedores de LLM gratuitos o de pago (Groq, Gemini, OpenRouter, Anthropic, OpenAI-compatible, Ollama) y búsqueda web (Exa/Serper/Tavily).

## Puesta en marcha (app completa)
1. `npm install`
2. Copia `.env.example` a `.env.local` y rellena Supabase, `OWNER_EMAIL`, `CRON_SECRET` y al menos una clave de LLM.
3. En Supabase, SQL Editor: pega y ejecuta `supabase/oficina.sql`, y después  
   `insert into public.oficina_admins (email) values ('tu-correo@ejemplo.com');`
4. Crea tu usuario en Supabase Auth (mismo correo que `OWNER_EMAIL`).
5. Edita **`src/oficina.config.ts`**: nombre, sector, público, tono, web, ciudad, colores.
6. `npm run dev` y abre `/oficina`.

## Ciclo 24/7
En GitHub: variable `OFICINA_URL` (tu dominio) y secreto `CRON_SECRET` (igual que en el servidor). El workflow `.github/workflows/oficina-ciclo.yml` llama al ciclo periódicamente.

## Instalarla en otro proyecto
```
node scripts/instalar.mjs /ruta/a/tu-proyecto
```
Copia el módulo (sin sobrescribir; usa `--forzar` si quieres), añade `three` y `@supabase/supabase-js`, y te indica los pasos. Requiere Next.js App Router con carpeta `src/`, alias `@/*` y `allowImportingTsExtensions`.

## Un solo archivo para personalizar
`src/oficina.config.ts` define proyecto, CEO, zona horaria, idioma y marca visual. Cada prompt de los 43 agentes se genera desde ahí.

## Tests
`npm test`

## Créditos y licencias
Código bajo MIT. Los modelos 3D de mobiliario son de Kenney (CC0), ver `THIRD_PARTY/`. Las imágenes de las cabras de `public/oficina` y `public/models/cabra` son arte de la oficina original: reemplázalas por las tuyas si redistribuyes.
