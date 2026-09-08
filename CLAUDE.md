# ManOfTheMatch — notas para agentes

PWA de LaLiga + Champions. Tres piezas que se despliegan por separado:

| Pieza | Carpeta | Dónde vive |
|---|---|---|
| Frontend (Vite + React) + `api/predict.ts` (Edge Function) | `frontend/` | Vercel |
| Worker de crons (`croner`, sin servidor HTTP) | `backend/` | Coolify |
| Postgres + Storage + RLS | `supabase/migrations/` | Supabase |

## Despliegue: automático por webhook

**Vercel y Coolify hacen auto-deploy con cada push a `main`.** No hay paso
manual: al hacer `git push` se despliegan los dos. Consecuencias:

- **Un push es un despliegue a producción.** No hacer `push` sin pedirlo.
- Los scripts locales de `backend/` escriben con la `SUPABASE_SERVICE_ROLE_KEY`
  contra la Supabase **de producción** (no hay entorno de staging).
- Si Coolify muestra un commit que no está en `origin/main`, el worker está
  corriendo código viejo o de otra rama — comprobarlo con
  `git cat-file -t <sha>` antes de dar por hecho que un job está desplegado.

Las **migraciones NO se aplican solas**: el SQL de `supabase/migrations/` lo
ejecuta Marco a mano en Supabase.

## Scripts de mantenimiento (no son crons, no van en el deploy)

Se lanzan desde `backend/` con `backend/.env` relleno:

| Script | Para qué |
|---|---|
| `npm run resolve-ids` | ids de fuentes de los 20 clubes de LaLiga |
| `npm run resolve-ucl-ids` | ids de TheSportsDB de los 31 clubes de Champions. **Necesario**: sin ellos un UCL entre extranjeros no consigue id de API-Football y se queda sin cuotas ni previsión |
| `npm run resolve-photos` | fotos de jugadores (opcional, la carta funciona sin ellas) |
| `npm run sync-lineups-once` | fuerza una pasada de alineaciones |

## Cosas que ya han mordido

- `TeamId` son solo los **20 slugs de LaLiga**. Los clubes de Champions viven
  en `UCL_TEAMS` (`ALL_TEAMS` = ambos). Firmas que puedan recibir un club UCL
  van tipadas como `string`, no `TeamId`.
- `shared.ts` está **duplicado a mano** en `backend/src/lib/` y
  `frontend/src/lib/`: al tocar uno hay que tocar el otro.
- El plan Free de API-Football rechaza la temporada 2026, así que el id de
  fixture llega por el `idAPIfootball` que da TheSportsDB en `eventsnext`
  (`crossReferenceIds` en `syncFixtures.ts`).
- Groq: `openai/gpt-oss-20b` (noticias/narración) y `openai/gpt-oss-120b`
  (previsiones). Son modelos de razonamiento: sin `reasoning_effort: 'low'` y
  `max_tokens` holgado devuelven `json_validate_failed`.
- `frontend/vercel.json` tiene el rewrite de SPA. Sin él, cualquier ruta que no
  sea `/` da 404 al recargar o al abrir un enlace directo.
- Los `%` de un elemento `position: absolute` se resuelven contra la **caja de
  relleno** del contenedor, no contra su contenido (ver
  `components/Segmented.tsx`).

## Tester

`tester/match_tester.py` corre en GitHub Actions (`.github/workflows/match_tester.yml`)
cada 15 min en horario de partido y sube el informe como artifact. Para leerlo:
`gh run list --workflow=match_tester.yml` y `gh run download <id>`.
