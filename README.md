# ManOfTheMatch (MOTM)

PWA de LaLiga: partidos en vivo minuto a minuto (marcador, goles, tarjetas,
alineaciones, disparos, momentum), calendario de próximos partidos,
clasificación, historial por equipo y previsiones pre-partido (cuotas de
3 casas de apuestas + pronóstico y argumentos). Cada dispositivo elige un
equipo favorito (login opcional) para recibir notificaciones push suyas
(alineación confirmada, goles, aviso de partido). Cubre los 20 clubes de
LaLiga, temporada en curso.

## Stack

- **Frontend**: React 19 + TypeScript + Vite, `react-router-dom`, TanStack
  Query, Framer Motion, Supabase JS. PWA instalable (`vite-plugin-pwa`,
  service worker propio). Deploy en Vercel.
- **Backend**: worker Node/TypeScript de sincronización (cron con `croner`),
  sin servidor HTTP propio — solo escribe a Supabase. Fuentes: football-data,
  API-Football, Fotmob y ESPN (combinadas según latencia/fiabilidad de cada
  dato). Deploy en Coolify.
- **Base de datos**: Supabase (Postgres + RLS).

```
frontend/  Vite + React + TS PWA         → Vercel
backend/   worker Node (cron) de datos   → Coolify
supabase/  migraciones + seed            → Supabase
design/    mockups de Claude Design (vista "En vivo")
docs/      architecture.md · data-model.md · api-research.md
tester/    monitor de partidos en vivo (GitHub Actions)
```

`frontend` y `backend` son proyectos npm independientes (deploy por
separado); `npm run dev` en la raíz solo levanta los dos a la vez en local.

## Arranque

```bash
npm install && npm --prefix frontend install && npm --prefix backend install
npm run dev            # frontend + backend a la vez
```

El backend local apunta al mismo `backend/.env` que producción — evita
dejarlo corriendo en paralelo al worker de Coolify (mismo Supabase y mismo
presupuesto diario de API-Football).

Ver [`docs/architecture.md`](docs/architecture.md) para el flujo completo y
las variables de entorno.
