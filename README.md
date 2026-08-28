# ManOfTheMatch (MOTM)

PWA para iPhone sobre LaLiga. Sincroniza los **20 clubes de LaLiga**; cada
dispositivo elige un equipo favorito (sin login) para recibir sus
notificaciones (alineación, goles, partido hoy). Competiciones **LaLiga** +
**Champions**, temporada en curso.

`frontend` y `backend` son proyectos npm independientes (deploy por separado);
`npm run dev` en la raíz solo levanta los dos a la vez en local.

```
frontend  Vite + React + TS PWA         → Vercel
backend   worker Node (cron) de datos   → Coolify
supabase/ migraciones + seed            → Supabase
design/   mockups de Claude Design (vista "En vivo")
docs/     architecture.md · data-model.md · api-research.md
```

## Arranque

```bash
npm install && npm --prefix frontend install && npm --prefix backend install
npm run dev            # frontend + backend a la vez
```

Ver [`docs/architecture.md`](docs/architecture.md) para el flujo completo y las
variables de entorno. Los iconos PWA (`frontend/public/icons/pwa-*.png`) aún
hay que generarlos.
