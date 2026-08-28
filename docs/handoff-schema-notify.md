# Handoff — schema + notificaciones (20 equipos + favorito por dispositivo)

Contrato fijado antes de tocar `apps/ingest` / `apps/web`, siguiendo la misma
convención que `handoff-backend.md` / `handoff-frontend.md`. Ampliación del MVP:
de 2 equipos "tracked" (Real Madrid + Barça) a los 20 de LaLiga, favorito por
dispositivo (sin login) y 4 tipos de notificación.

## 1. Los 20 `teams.id` (slugs, estables, no cambian)

```
real-madrid barcelona atletico-madrid athletic-bilbao villarreal real-betis
celta-vigo rayo-vallecano osasuna real-sociedad sevilla valencia getafe
alaves espanyol levante elche racing-santander deportivo malaga
```

Plantilla LaLiga 2026/27: 17 equipos de la 2025/26 + 3 ascendidos (Racing
Santander, Deportivo La Coruña, Málaga CF vía play-off). **Verificar este
listado contra la fuente oficial (laliga.com) antes de ir a producción** — se
obtuvo por búsqueda web desde este entorno (sin acceso directo a
football-data.org / API-Football, sin claves aquí), no por llamada en vivo a
las 3 fuentes de datos.

## 2. Origen de los ids numéricos por equipo — cambio de arquitectura

Antes: `packages/shared/TEAMS` traía `footballData` / `apiFootball` /
`theSportsDb` hardcodeados para los 2 equipos. **Eso no escala a 20 sin
inventar números** (un id equivocado mezclaría partidos de otro club en
silencio). Se mueve la fuente de verdad a la que el propio schema `0001`ya
preveía: la columna `teams.source_ids jsonb`, hoy sin usar por el código.

- `packages/shared/TEAMS` pasa a llevar solo `id` / `tla` / `name` (estático,
  sin red, tipado en compilación).
- `apps/ingest/src/lib/ids.ts` carga `teams.source_ids` de Supabase a un caché
  en memoria (`refreshTeamCache()`), refrescado al arrancar y en cada
  `syncFixtures` (dos veces al día). Los `teamSlugByFootballDataId` /
  `teamSlugByApiFootballId` / `teamSlugByTsdbId` resuelven contra ese caché.
- Un equipo sin `source_ids` todavía resuelto simplemente no cruza — sus
  fixtures se guardan igual (columnas `home_team_name`/`crest` de `0002`), solo
  sin alineaciones/eventos de API-Football hasta que se resuelva. Degrada bien,
  no rompe nada.
- `apps/ingest/src/scripts/resolveTeamIds.ts` (nuevo, ejecución manual una vez
  desplegado con claves reales) llama a las 3 fuentes, cruza por nombre y
  escribe `teams.source_ids` en Supabase. Imprime qué equipos NO pudo casar con
  confianza — esos se rellenan a mano por SQL.

## 3. `push_subscriptions` — favorito + preferencias

- Nueva columna `favorite_team_id text references teams(id)` (nullable — un
  dispositivo puede no tener favorito aún).
- `prefs jsonb` gana la clave `lineup` (default `true`), junto a las ya
  existentes `matchday` / `kickoff` / `goals`.
- Política `delete using (true)` (ya la traía `0003_reconcile.sql` — sin
  cambios, solo se confirma que sigue vigente en `0004`).

## 4. `NotificationType` (enum, `packages/shared`)

`'MATCHDAY' | 'KICKOFF_SOON' | 'LINEUP' | 'GOAL'` — las 4 llegan solo a los
dispositivos cuyo `favorite_team_id` sea uno de los dos equipos del partido, y
solo si `prefs.<clave>` es `true`.

## 5. Payload de push — sin cambios

`{ title: string, body: string, tag?: string, url?: string }`, tal cual
`apps/web/src/sw.ts` ya lo espera.

## 6. Presupuesto API-Football — decisión

`runDueMatchDetails` despachaba la fase `'events'` (1 req) en cada barrido de
5 min mientras un partido está en vivo (~18-20 despachos/partido). Con 20
equipos (varios partidos simultáneos un sábado) eso agota el cupo gratuito de
100/día solo con esa fase. **Se elimina la fase `'events'` del barrido en
vivo** — el timeline de TheSportsDB ya alimenta `match_events` en tiempo real
vía `liveLoop`. Queda `lineups` (1) + `full` post-partido (3) + re-sweep (3) =
4 req/partido, ~40/día en una jornada completa de 10 partidos.
