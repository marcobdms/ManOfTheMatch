# ManOfTheMatch — Tester de Partido

Script de Python que monitoriza automáticamente un partido en vivo y genera un reporte HTML con screenshots.

## Instalación (una sola vez)

```bash
pip install httpx playwright
playwright install chromium
```

## Uso

```bash
cd tester

# Detecta el próximo partido y arranca 1 min antes del kickoff:
python match_tester.py

# Empieza inmediatamente (si ya hay partido en vivo o para debug):
python match_tester.py --now

# Forza un fixture concreto:
python match_tester.py --fixture <uuid-del-fixture>

# Contra un frontend servido en local (npm run build && npx vite preview --port 4173):
python match_tester.py --app-url http://localhost:4173

# Sin capturas de pantalla (mas rapido, solo checks de datos):
python match_tester.py --no-screenshots
```

No hay despliegue público de la app: los checks de navegador y las capturas
necesitan `--app-url` apuntando a un frontend servido localmente. Si no
responde, esos checks se omiten limpiamente (una vez, marcados SKIP) en vez
de fallar en cada muestra.

## Qué testea

| Check | Descripción |
|-------|-------------|
| Fixture en Supabase | El partido existe y tiene datos |
| Teams / Standings / Competitions | Tablas base pobladas |
| Migraciones aplicadas | `match_subscriptions` (0016), `profiles` (0006), `match_shots` (0008), `match_highlights` (0014). Si falta una se marca SKIP diciendo qué migración falta — explica fallos que si no parecen bugs de código |
| Teams con ids resueltos | Equipos sin `source_ids` de fotmob/espn: no cruzan con las fuentes y se quedan sin alineaciones ni eventos |
| **Recorrido de rutas** | Visita las 12 vistas (En vivo, Home, Próximos, Equipos, Clasificación, Perfil, y estadísticas/alineaciones/previsiones del partido) y comprueba que cada una **pinta contenido** y no lanza. Antes solo se miraba `/`, así que una vista podía estar en blanco y el tester pasaba |
| **Errores JS** | Excepciones sin capturar, `console.error` y respuestas HTTP 4xx/5xx. Es lo que detecta una pantalla en blanco por env var mal puesta (`supabaseUrl is required`) o un asset que falta |
| Lineups con XY (`pos_x`/`pos_y`) | Alineaciones con posiciones del campo |
| Fixture status/score | Estado y marcador actualizándose |
| Delay LIVE | Mide cuánto tarda en pasar a LIVE |
| Clock anchor | `half_started_at` presente en partido LIVE |
| Sync lag | Tiempo desde el último `last_synced_at` (alerta >120s) |
| Histórico eventos | Número de eventos y fuentes (fotmob, apiFootball, theSportsDb) |
| Fotmob en histórico | La mejor fuente está presente |
| Goles coherentes (dedup) | Replica `preferBestSource` del frontend (prioridad de fuente + dedup por tipo/minuto/jugador) y compara contra el marcador; reporta el bruto por fuente para ver duplicados |
| Match facts | Presentes si la tabla existe; si no (migración 0009 pendiente), se marca SKIP, no FAIL |
| Match shots | Disparos en `match_shots` (a puerta / totales) |
| Sync runs | Lee `sync_runs`: jobs con `ok=false`, jobs con `items=0` siempre, y workers duplicados (runs solapados del mismo job) |
| ESPN vs Supabase | Compara contra el scoreboard público de ESPN: mide cuánto tarda un gol de ESPN en aparecer en Supabase (la métrica de latencia más importante) y detecta marcador desincronizado |
| Marcador visible (browser) | El scoreboard se renderiza en la app |
| Timeline visible (browser) | El histórico aparece en pantalla |
| No empty-state durante partido | No muestra "Sin partido" cuando hay partido |
| Botón de notificaciones | La campanilla está presente |
| Navegación inferior | BottomNav visible |

## Output

Genera en `tester/reports/`:
- `report_<fixture_id>_<fecha>.html` — Reporte visual con screenshots incrustados
- `report_<fixture_id>_<fecha>.json` — Datos en bruto para analizar

## Enviar el reporte

Mañana, sube el archivo `.json` o `.html` y compártelo para analizar los resultados.
