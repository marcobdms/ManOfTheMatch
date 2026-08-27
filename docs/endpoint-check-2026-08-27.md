# Endpoint check — 2026-08-27 (durante FC Barcelona 1–0 Athletic Club, en vivo)

Probados con las keys reales. Resuelve los "verify on first live run" de los handoffs.

## football-data.org — ✅ (salvo Champions)

| Llamada | Resultado |
|---|---|
| `GET /v4/competitions/PD/matches?season=2026` | **200**, 380 partidos. LaLiga completa. |
| `GET /v4/matches/{id}` (id 564630) | **200**, **objeto plano** (`id` en la raíz, sin envoltorio `match`). `getMatch()` asumía bien. **`minute` viene `null`** en vivo → el minuto hay que sacarlo de TheSportsDB. |
| `GET /v4/competitions/PD/standings?season=2026` | **200**, 20 filas, `form` presente (formato `"W,W"`). |
| `GET /v4/competitions/CL/matches?season=2026` | **404** ❌. La Champions 2026/27 no está en el free tier todavía (sorteo reciente). `syncFixtures` ya lo captura y hace `continue`, no rompe. **Pendiente**: reintentar sin `?season`, o probar código `2001`, o esperar. LaLiga va entera. |

## API-Football — ⚠️ season bloqueada, pero el resto va

| Llamada | Resultado |
|---|---|
| `GET /status` | **200**. Plan Free, activo, **0/100** req hoy, reset 00:00 UTC. |
| `GET /fixtures?team=529&season=2026` | **200 con `errors.plan`** ❌: *"Free plans do not have access to this season, try from 2022 to 2024."* → **nunca pasar `season` > 2024 a API-Football.** |
| `GET /fixtures?team=529&live=all` | **200**, results=1 ✅. Devuelve el partido en vivo `1570335` con marcador, `status.short=2H`, `elapsed=65`. **El `live=all` ignora la restricción de season.** |
| `GET /fixtures/events?fixture=1570335` | **200**, 8 eventos ✅. Goles/tarjetas/cambios con `player` + `assist`. |
| `GET /fixtures/players?fixture=1570335` | **200**, 2 equipos, 22 jugadores, **con `rating`** ✅ (p. ej. Pau Cubarsí 7.3). |
| `GET /fixtures/lineups?fixture=1570335` | **200 pero results=0** ⚠️. Alineaciones vacías (¿ventana temporal / free? ¿transitorio?). Timeline y ratings sí llegan. A vigilar. |

**Conclusión**: el id de API-Football se obtiene del cruce con TheSportsDB (`idAPIfootball`), no de una query por season. Con ese id, `events` y `players` (ratings) funcionan en el plan Free para el partido actual. `syncMatchDetail` es viable **si el cruce de ids aporta el `apiFootball` id** (lo hace, ver abajo).

## TheSportsDB (key `123`) — ✅

| Llamada | Resultado |
|---|---|
| `GET /livescore.php?s=Soccer` | **200**, 35 partidos. Barcelona 1–0 Athletic Bilbao, `strProgress=64`, `strStatus=2H` → **de aquí sale el minuto** que football-data no da. |
| `GET /eventsnext.php?id=133739` | **200**, 1 evento: Barcelona vs Athletic Bilbao, **`idAPIfootball=1570335`** ✅, tsdb `133739`/`133727`. El cruce de ids funciona. |

## Acciones

1. `getFixturesByTeam()` default cambiado a `season=2024` + comentario "bloqueado en Free" (no está en la ruta crítica).
2. Champions: `syncFixtures` para CL devuelve 404 y se salta. Investigar fuente alternativa para el calendario UCL (o esperar a que football-data lo publique).
3. Sin cambios en `liveLoop` / `syncMatchDetail`: la ruta (football-data score + TheSportsDB minuto/timeline + API-Football events/players por `fixture` id del cruce) está probada y funciona hoy.
