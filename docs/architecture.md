# ManOfTheMatch — arquitectura

PWA para iPhone sobre LaLiga. Los **20 clubes de LaLiga** están sincronizados;
cada dispositivo elige un equipo favorito (sin login) para sus notificaciones.
Competiciones **LaLiga** + **Champions**; temporada actual (2026/27).

## Flujo de datos

```
football-data.org ─┐
API-Football ──────┼─►  apps/ingest (Coolify, cron)  ──►  Supabase (Postgres)  ──►  apps/web (Vercel)
Understat (opc.) ──┘         · cachea en http_cache            · RLS: lectura pública        · PWA, solo lee Supabase
                             · Web Push (VAPID)                 · el worker escribe (service role)
```

La PWA **nunca** llama a una API externa. Si una fuente se cae, la app sigue
mostrando lo último ingerido.

## Paquetes

| Ruta | Qué es | Deploy |
|---|---|---|
| `apps/web` | Vite + React + TS, `vite-plugin-pwa`, React Router, TanStack Query, Framer Motion, Phosphor icons | Vercel |
| `apps/ingest` | Worker Node + TS (`tsx`), scheduler `croner`, `web-push` | Coolify (contenedor con `Dockerfile`) |
| `packages/shared` | Constantes y tipos (`COMPETITIONS`, `TEAMS`, `MatchEventType`, `POLL`) usados por web e ingest | — |
| `supabase/` | `migrations/0001_init.sql`, `seed.sql` | Supabase (hosted) |
| `design/` | Mockups `.dc.html` de Claude Design (vista En vivo) | Artifact |

## Cadencia de sincronización (dentro de tiers gratis)

- **Sin partido de Madrid/Barça**: `syncFixtures` + `syncStandings` 2×/día.
- **Desde T-2h**: refresco de previa/alineaciones cada ~15 min.
- **Partido en vivo**: `liveLoop` cada minuto (marcador + eventos + push de goles).
- **Post-partido**: `syncMatchDetail` una vez (timeline completo, ratings) — API-Football, muy cacheado (100 req/día).

Números afinados en `docs/api-research.md` (lo genera el workstream de APIs).

## Variables de entorno

- `apps/web/.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `apps/ingest/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FOOTBALL_DATA_TOKEN`, `API_FOOTBALL_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`

## Puesta en marcha local

```bash
npm install                                   # raíz (workspaces)
# Supabase: crear proyecto, correr supabase/migrations 0001→0002→0003→0004 + seed.sql
cp apps/web/.env.example  apps/web/.env.local  # rellenar
cp apps/ingest/.env.example apps/ingest/.env   # rellenar
npm run dev                                    # front (azul) + back (rojo) a la vez
```

`npm run dev` usa `concurrently`: front en http://localhost:5173, worker en
paralelo. Sin `apps/ingest/.env` el worker se queda en espera y avisa; el front
funciona igual. `npm run dev:front` / `npm run dev:back` los arrancan por separado.
