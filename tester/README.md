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
```

## Qué testea

| Check | Descripción |
|-------|-------------|
| Fixture en Supabase | El partido existe y tiene datos |
| Teams / Standings / Competitions | Tablas base pobladas |
| Próximos partidos | Hay fixtures futuros |
| Lineups con XY | Alineaciones con posiciones del campo |
| Fixture status/score | Estado y marcador actualizándose |
| Delay LIVE | Mide cuánto tarda en pasar a LIVE |
| Clock anchor | `half_started_at` presente en partido LIVE |
| Sync lag | Tiempo desde el último `last_synced_at` (alerta >120s) |
| Histórico eventos | Número de eventos y fuentes (fotmob, apiFootball, theSportsDb) |
| Fotmob en histórico | La mejor fuente está presente |
| Goles vs marcador | Los eventos de gol coinciden con el marcador |
| Match facts | Stats presentes (posesión, tiros, etc.) |
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
