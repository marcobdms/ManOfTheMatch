# ManOfTheMatch (MOTM)

PWA para iPhone sobre LaLiga. MVP centrado en **Real Madrid** y **FC Barcelona**,
competiciones **LaLiga** + **Champions**, temporada en curso.

Monorepo (npm workspaces):

```
apps/web        Vite + React + TS PWA        → Vercel
apps/ingest     worker Node (cron) de datos  → Coolify
packages/shared constantes y tipos comunes
supabase/       migraciones + seed           → Supabase
design/         mockups de Claude Design (vista "En vivo")
docs/           architecture.md · data-model.md · api-research.md
```

## Arranque

```bash
npm install
npm run dev            # apps/web  → http://localhost:5173
npm run ingest:dev     # apps/ingest (necesita .env)
```

Ver [`docs/architecture.md`](docs/architecture.md) para el flujo completo y las
variables de entorno. Los iconos PWA (`apps/web/public/icons/pwa-*.png`) aún
hay que generarlos.
