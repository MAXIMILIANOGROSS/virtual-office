# Proceso de creación del Estudio de Marketing y Vídeo

1. **Brief**: se genera desde `oficina.config.ts` (marca, público, tono, web).
2. **Idea y guion**: los agentes de contenido proponen campañas (A/B/C) y guiones.
3. **Control de calidad** (`controlCalidad` en `studioVideo.ts`): longitud, enlace de la web, tono y claridad del mensaje.
4. **Producción**: carteles/anuncios por `ImageResponse`; el vídeo lo renderiza un worker local (`~/EstudioVideo`) que consulta `/api/studio/cola`.
5. **Aprobación humana**: nada se publica sin que el propietario lo apruebe.
6. **Informe**: resumen diario y métricas en la pestaña Informes.
