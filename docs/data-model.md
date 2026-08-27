# Modelo de datos (Supabase)

Ver `supabase/migrations/0001_init.sql`. Todo lo público lleva RLS con
`select using (true)`; `http_cache` y `sync_runs` son solo service-role;
`push_subscriptions` acepta insert/update anónimo pero no select.

| Tabla | Para qué | Fuente que la rellena |
|---|---|---|
| `competitions` | LaLiga, Champions + ids por fuente | seed |
| `seasons` | temporada actual | seed |
| `teams` | Madrid, Barça (`is_tracked`) + ids por fuente | seed |
| `fixtures` | calendario + marcador + estado + minuto | football-data.org (fallback: API-Football) |
| `match_events` | histórico del partido (gol, tarjeta, cambio, córner, pase clave…) | live: football-data.org · detalle: API-Football |
| `lineups` | 11 inicial + suplentes + formación | API-Football |
| `player_match_stats` | stats por jugador/partido + `rating` | API-Football (`statistics[0].games.rating`) · `xg`/`xa` de Understat (opc.) |
| `standings` | snapshots de la clasificación (con `form`) | football-data.org |
| `news` | feed de la pestaña Home | por definir (RSS/clubs) |
| `push_subscriptions` | suscripciones Web Push por dispositivo + `prefs` | la PWA (insert anónimo) |
| `notifications` | feed in-app; el worker escribe, la app lee | worker |
| `http_cache` | cache HTTP (ETag + TTL) para no agotar los tiers gratis | worker |
| `sync_runs` | traza de cada job (ok/error/items) | worker |

## Notificaciones del MVP

Tres tipos, todas derivadas de `fixtures` + `liveLoop`, con toggle por tipo en `prefs`:

- `MATCHDAY` — "Hoy juega el Madrid/Barça"
- `KICKOFF_SOON` — "El partido empieza en breve" (T-15/30 min)
- `GOAL` — "Gol del Madrid" / "Gol del rival"
