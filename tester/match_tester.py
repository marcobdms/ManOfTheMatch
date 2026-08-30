"""
ManOfTheMatch - Tester de Partido (full-match edition)
======================================================
Corre de inicio a fin del partido (90 min + descuento + descanso ~ 115 min max).
Uso:
  python match_tester.py                 # auto-detecta proximo partido, espera 1 min antes
  python match_tester.py --now           # empieza ya (util si ya hay partido)
  python match_tester.py --fixture <id>  # forza fixture concreto
  python match_tester.py --fixture <id> --now
"""

from __future__ import annotations
import argparse, asyncio, base64, json, os, sys, time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://jmavllfamaflchxjvwmh.supabase.co"
SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptYXZsbGZhbWFmbGNoeGp2d21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NTQ0ODcsImV4cCI6MjEwMzQzMDQ4N30"
    ".JzscEKzByH33A4aFOPReiKYw3qKPxMTiAFSlsAiDa5Y"
)
APP_URL = "https://manofthematch.app"

# Duracion total del test: cubre 90 min normales + 15 min descuento + 10 min margen
# Se detiene antes si el partido marca FINISHED
TEST_DURATION_S = 115 * 60   # 115 minutos
POLL_INTERVAL_S = 30         # muestra cada 30 segundos = ~230 muestras por partido

DELAY_WARN_S  = 90
DELAY_ERROR_S = 300

REPORTS_DIR = Path(__file__).parent / "reports"
SCREENSHOTS_DIR = REPORTS_DIR / "screenshots"

# Cada cuantas muestras hacer screenshot del browser (no en cada tick para no saturar)
SCREENSHOT_EVERY_N = 10  # cada 5 min

# ── Deps ──────────────────────────────────────────────────────────────────────
def _check_deps():
    missing = []
    try:
        import httpx
    except ImportError:
        missing.append("httpx")
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        missing.append("playwright")
    if missing:
        print(f"[tester] Faltan: {', '.join(missing)}")
        print(f"  pip install {' '.join(missing)}")
        if "playwright" in missing:
            print("  playwright install chromium")
        sys.exit(1)

_check_deps()
import httpx
from playwright.async_api import async_playwright, Page, Browser

# ── Dataclasses ───────────────────────────────────────────────────────────────
@dataclass
class Check:
    name: str
    passed: bool
    detail: str = ""
    latency_ms: float | None = None

@dataclass
class Sample:
    ts: datetime
    elapsed_min: float
    status: str | None
    minute: int | None
    home_score: int | None
    away_score: int | None
    events_count: int
    fotmob_count: int
    checks: list[Check] = field(default_factory=list)
    screenshot_b64: str | None = None

@dataclass
class Report:
    fixture_id: str
    home: str
    away: str
    kickoff_at: str
    started_at: datetime
    samples: list[Sample] = field(default_factory=list)
    static_checks: list[Check] = field(default_factory=list)
    first_live_delay_s: float | None = None
    finished_at: datetime | None = None

# ── Supabase helpers ─────────────────────────────────────────────────────────
HEADERS = {"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {SUPABASE_ANON_KEY}"}

async def sb_get(client: httpx.AsyncClient, path: str, params: dict) -> tuple[Any, float]:
    t0 = time.perf_counter()
    r = await client.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, params=params)
    lat = (time.perf_counter() - t0) * 1000
    r.raise_for_status()
    return r.json(), lat

async def get_fixture(client, fid):
    rows, lat = await sb_get(client, "fixtures", {
        "select": "id,status,minute,home_score,away_score,half_started_at,half_number,kickoff_at,home_team_name,away_team_name,last_synced_at",
        "id": f"eq.{fid}", "limit": "1",
    })
    return (rows[0] if rows else None), lat

async def get_events(client, fid):
    rows, lat = await sb_get(client, "match_events", {
        "select": "id,type,minute,player_name,source",
        "fixture_id": f"eq.{fid}", "order": "minute.asc",
    })
    return rows, lat

async def get_facts(client, fid):
    rows, lat = await sb_get(client, "match_facts", {
        "select": "*", "fixture_id": f"eq.{fid}", "limit": "1",
    })
    return (rows[0] if rows else None), lat

async def get_lineups(client, fid):
    rows, lat = await sb_get(client, "lineups", {
        "select": "id,team_id,player_name,position_x,position_y",
        "fixture_id": f"eq.{fid}",
    })
    return rows, lat

async def find_next_fixture(client):
    now_iso = datetime.now(timezone.utc).isoformat()
    live, _ = await sb_get(client, "fixtures", {
        "select": "id,status,kickoff_at,home_team_name,away_team_name",
        "status": "in.(LIVE,PAUSED)", "limit": "1",
    })
    if live:
        return live[0]
    rows, _ = await sb_get(client, "fixtures", {
        "select": "id,status,kickoff_at,home_team_name,away_team_name",
        "kickoff_at": f"gte.{now_iso}",
        "status": "in.(SCHEDULED)",
        "order": "kickoff_at.asc", "limit": "5",
    })
    return rows[0] if rows else None

# ── Static checks ─────────────────────────────────────────────────────────────
async def run_static_checks(client, fid) -> list[Check]:
    checks = []

    try:
        row, lat = await get_fixture(client, fid)
        checks.append(Check("Fixture en Supabase", row is not None,
                             f"status={row['status'] if row else 'NOT FOUND'}", lat))
    except Exception as e:
        checks.append(Check("Fixture en Supabase", False, str(e)))

    for table, label in [("teams", "Teams"), ("standings", "Standings"), ("competitions", "Competitions")]:
        try:
            rows, lat = await sb_get(client, table, {"select": "id", "limit": "5"})
            checks.append(Check(f"{label} tabla", len(rows) > 0, f"{len(rows)} filas", lat))
        except Exception as e:
            checks.append(Check(f"{label} tabla", False, str(e)))

    try:
        lineups, lat = await get_lineups(client, fid)
        has_xy = any(p.get("position_x") is not None for p in lineups)
        checks.append(Check("Lineups disponibles", len(lineups) > 0,
                             f"{len(lineups)} jugadores XY={'si' if has_xy else 'pendiente'}", lat))
    except Exception as e:
        checks.append(Check("Lineups disponibles", False, str(e)))

    return checks

# ── Screenshot ────────────────────────────────────────────────────────────────
async def take_screenshot(page: Page, fid: str, label: str) -> str | None:
    try:
        target = f"{APP_URL}/en-vivo"
        if not page.url.startswith(APP_URL):
            await page.goto(target, wait_until="networkidle", timeout=20000)
        await page.wait_for_timeout(2500)
        path = SCREENSHOTS_DIR / f"{fid}_{label}_{int(time.time())}.png"
        await page.screenshot(path=str(path), full_page=True)
        return base64.b64encode(path.read_bytes()).decode()
    except Exception as e:
        print(f"  [screenshot] {e}")
        return None

# ── Browser checks — siempre sobre /en-vivo ──────────────────────────────────
async def browser_checks(page: Page) -> list[Check]:
    checks = []
    try:
        # Garantizar que estamos en /en-vivo
        target = f"{APP_URL}/en-vivo"
        if not page.url.startswith(target):
            await page.goto(target, wait_until="networkidle", timeout=20000)
            await page.wait_for_timeout(2000)

        # Scoreboard — ScoreboardCard usa clases motm-score / motm-card
        score_el = await page.query_selector(
            '[class*="motm-score"], [class*="motm-card"], [class*="scoreboard"]')
        checks.append(Check("Marcador visible", score_el is not None,
                             "Detectado" if score_el else "No detectado"))

        # Timeline — MatchTimeline usa motm-tl
        tl = await page.query_selector('[class*="motm-tl"], [class*="timeline"]')
        checks.append(Check("Timeline visible", tl is not None,
                             "Detectada" if tl else "Sin timeline"))

        # Empty state — motm-empty solo aparece sin partido
        empty = await page.query_selector('.motm-empty')
        sin_partido = False
        if empty:
            txt = await empty.inner_text()
            sin_partido = "Sin partido" in txt
        checks.append(Check("No empty-state en partido", not sin_partido,
                             "OK" if not sin_partido else "ALERTA: muestra 'Sin partido'"))

        # Link a estadisticas (solo visible con partido activo)
        stats = await page.query_selector('a[href*="estadisticas"]')
        checks.append(Check("Link estadisticas", stats is not None,
                             "Presente" if stats else "No (sin partido o aun cargando)"))

        # Boton campanilla push
        bell = await page.query_selector('button[aria-pressed], button[aria-label*="notif"]')
        checks.append(Check("Boton notificaciones", bell is not None,
                             "Encontrado" if bell else "No encontrado"))

        # Shell / bottom nav — siempre debe estar
        nav = await page.query_selector('.motm-shell, [class*="bottom-nav"]')
        checks.append(Check("Shell/nav", nav is not None, "OK" if nav else "No encontrada"))

    except Exception as e:
        checks.append(Check("Browser checks", False, str(e)))
    return checks

# ── Single sample ─────────────────────────────────────────────────────────────
async def take_sample(client, page, fid, n, kickoff_dt, do_screenshot) -> Sample:
    now = datetime.now(timezone.utc)
    elapsed_min = (now - kickoff_dt).total_seconds() / 60
    checks = []
    events = []
    fixture_row = None
    fotmob_count = 0

    # Fixture
    try:
        row, lat = await get_fixture(client, fid)
        fixture_row = row
        if row:
            lag_s = None
            if row.get("last_synced_at"):
                ls_dt = datetime.fromisoformat(row["last_synced_at"].replace("Z", "+00:00"))
                lag_s = (now - ls_dt).total_seconds()
            elapsed_s = (now - kickoff_dt).total_seconds()
            detail = f"status={row['status']} min={row.get('minute')} score={row.get('home_score')}-{row.get('away_score')}"
            if lag_s is not None:
                detail += f" lag={lag_s:.0f}s"
            checks.append(Check("Fixture", True, detail, lat))

            if row["status"] == "SCHEDULED" and elapsed_s > 0:
                if elapsed_s > DELAY_ERROR_S:
                    checks.append(Check("Delay LIVE", False, f"SCHEDULED {elapsed_s:.0f}s post-kickoff - CRITICO"))
                elif elapsed_s > DELAY_WARN_S:
                    checks.append(Check("Delay LIVE", False, f"SCHEDULED {elapsed_s:.0f}s post-kickoff - AVISO"))

            if row["status"] == "LIVE":
                has_anchor = row.get("half_started_at") is not None
                checks.append(Check("Clock anchor", has_anchor,
                                    f"half={row.get('half_number')}" if has_anchor else "half_started_at NULL"))
                if lag_s is not None:
                    checks.append(Check("Sync lag", lag_s < 120,
                                        f"{lag_s:.0f}s {'OK' if lag_s < 120 else 'DEMASIADO ALTO'}"))
    except Exception as e:
        checks.append(Check("Fixture", False, str(e)))

    # Events
    try:
        events, lat = await get_events(client, fid)
        sources = list({e.get("source") for e in events if e.get("source")})
        checks.append(Check("Eventos historico", True,
                             f"{len(events)} eventos fuentes=[{', '.join(sources)}]", lat))
        fotmob_count = sum(1 for e in events if e.get("source") == "fotmob")
        if fixture_row and fixture_row.get("status") in ("LIVE", "PAUSED", "FINISHED"):
            checks.append(Check("Fotmob en historico", fotmob_count > 0,
                                f"{fotmob_count} eventos" if fotmob_count else "Sin Fotmob"))
        # Goles coherentes
        if fixture_row:
            goal_evs = [e for e in events if e.get("type") in ("GOAL", "OWN_GOAL", "PENALTY_GOAL")]
            total_goals = (fixture_row.get("home_score") or 0) + (fixture_row.get("away_score") or 0)
            checks.append(Check("Goles coherentes",
                                len(goal_evs) >= total_goals or total_goals == 0,
                                f"{len(goal_evs)} gol-eventos marcador={total_goals}"))
    except Exception as e:
        checks.append(Check("Eventos historico", False, str(e)))

    # Facts & lineups
    try:
        facts, lat = await get_facts(client, fid)
        checks.append(Check("Match facts", facts is not None,
                             "Presentes" if facts else "Pendientes", lat))
    except Exception as e:
        checks.append(Check("Match facts", False, str(e)))

    try:
        lineups, lat = await get_lineups(client, fid)
        has_xy = any(p.get("position_x") is not None for p in lineups)
        checks.append(Check("Lineups XY", len(lineups) > 0 and has_xy,
                             f"{len(lineups)} jugadores XY={'si' if has_xy else 'no'}", lat))
    except Exception as e:
        checks.append(Check("Lineups XY", False, str(e)))

    # Browser
    bc = await browser_checks(page)
    checks.extend(bc)

    # Screenshot solo cada N muestras para no saturar
    screenshot_b64 = None
    if do_screenshot:
        screenshot_b64 = await take_screenshot(page, fid, f"s{n:03d}")

    return Sample(
        ts=now,
        elapsed_min=elapsed_min,
        status=fixture_row.get("status") if fixture_row else None,
        minute=fixture_row.get("minute") if fixture_row else None,
        home_score=fixture_row.get("home_score") if fixture_row else None,
        away_score=fixture_row.get("away_score") if fixture_row else None,
        events_count=len(events),
        fotmob_count=fotmob_count,
        checks=checks,
        screenshot_b64=screenshot_b64,
    )

# ── HTML Report ────────────────────────────────────────────────────────────────
def render_html(report: Report) -> str:
    def badge(p):
        return '<span class="ok">OK</span>' if p else '<span class="fail">FAIL</span>'

    def chk_rows(checks):
        out = ""
        for c in checks:
            lat = f" <small>({c.latency_ms:.0f}ms)</small>" if c.latency_ms else ""
            out += f"<tr><td>{badge(c.passed)}</td><td>{c.name}{lat}</td><td>{c.detail}</td></tr>"
        return out

    total = sum(len(s.checks) for s in report.samples) + len(report.static_checks)
    failed = (sum(sum(1 for c in s.checks if not c.passed) for s in report.samples)
              + sum(1 for c in report.static_checks if not c.passed))
    ok = failed == 0

    # Timeline chart data (status over time)
    status_map = {"SCHEDULED": 0, "LIVE": 2, "PAUSED": 1, "FINISHED": 3}
    chart_labels = [f"{s.elapsed_min:.0f}" for s in report.samples]
    chart_status = [status_map.get(s.status or "", 0) for s in report.samples]
    chart_events = [s.events_count for s in report.samples]
    chart_fotmob = [s.fotmob_count for s in report.samples]

    samples_html = ""
    prev_score = None
    for i, s in enumerate(report.samples):
        score_str = f"{s.home_score}-{s.away_score}"
        score_changed = prev_score is not None and score_str != prev_score
        prev_score = score_str
        fails = sum(1 for c in s.checks if not c.passed)
        col = "#0a2a0a" if fails == 0 else "#2a0a0a"
        border = "2px solid #f80" if score_changed else "1px solid #1e1e1e"
        img = ""
        if s.screenshot_b64:
            img = f'<details><summary>Screenshot (min {s.minute})</summary><img src="data:image/png;base64,{s.screenshot_b64}" style="max-width:100%;border-radius:6px;margin-top:6px"></details>'
        goal_badge = " <span style='background:#f80;color:#000;padding:1px 6px;border-radius:10px;font-size:11px'>⚽ GOL</span>" if score_changed else ""
        samples_html += f"""<div class="samp" style="background:{col};border:{border}">
<h3 style="margin:0 0 4px">#{i+1} +{s.elapsed_min:.1f}min kickoff &mdash; {s.ts.strftime('%H:%M:%S UTC')}{goal_badge}</h3>
<p style="margin:0 0 6px;font-size:13px">{s.status} | min <b>{s.minute}</b> | <b>{score_str}</b> | eventos <b>{s.events_count}</b> (fotmob {s.fotmob_count}) | {'todo OK' if fails==0 else f'{fails} fallos'}</p>
{img}
<table><thead><tr><th>Estado</th><th>Check</th><th>Detalle</th></tr></thead><tbody>{chk_rows(s.checks)}</tbody></table>
</div>"""

    return f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>MOTM Tester — {report.home} vs {report.away}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
*{{box-sizing:border-box}}
body{{font-family:system-ui,sans-serif;background:#080808;color:#ddd;margin:0;padding:20px;max-width:1200px}}
h1{{border-bottom:2px solid #222;padding-bottom:10px;color:#fff}}
h2{{color:#999;margin-top:28px}}
h3{{margin:0 0 4px;color:#eee}}
.summary{{background:{'#0a2a0a' if ok else '#2a0a0a'};border-radius:10px;padding:20px;margin:16px 0}}
.grid{{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:10px 0}}
.card{{background:#111;border-radius:8px;padding:12px;text-align:center}}
.card .v{{font-size:1.6em;font-weight:bold;color:{'#5f5' if ok else '#f55'}}}
.card .l{{color:#555;font-size:11px;margin-top:2px}}
.samp{{border-radius:8px;padding:12px;margin:8px 0}}
table{{width:100%;border-collapse:collapse;margin-top:6px;font-size:12px}}
th{{background:#0d0d0d;padding:5px 8px;text-align:left;color:#666;font-weight:normal}}
td{{padding:4px 8px;border-top:1px solid #111;vertical-align:top}}
.ok{{background:#0a2a0a;color:#4f4;padding:1px 7px;border-radius:10px;font-size:11px}}
.fail{{background:#2a0a0a;color:#f44;padding:1px 7px;border-radius:10px;font-size:11px}}
details summary{{cursor:pointer;color:#666;font-size:12px}}
small{{color:#444}}
.chart-wrap{{background:#0d0d0d;border-radius:10px;padding:16px;margin:16px 0}}
</style></head><body>
<h1>ManOfTheMatch Tester &mdash; {report.home} vs {report.away}</h1>
<p style="color:#666">Kickoff: {report.kickoff_at} &nbsp;|&nbsp; Test: {report.started_at.strftime('%Y-%m-%d %H:%M UTC')} &nbsp;|&nbsp; Duracion: {f'{(report.finished_at - report.started_at).total_seconds()/60:.0f} min' if report.finished_at else 'en curso'}</p>

<div class="summary">
<h2 style="margin-top:0;color:#fff">{'✅ RESULTADO: PASÓ' if ok else '❌ RESULTADO: FALLOS DETECTADOS'}</h2>
<div class="grid">
<div class="card"><div class="v">{total}</div><div class="l">Checks totales</div></div>
<div class="card"><div class="v" style="color:{'#5f5' if failed==0 else '#f55'}">{failed}</div><div class="l">Fallos</div></div>
<div class="card"><div class="v">{len(report.samples)}</div><div class="l">Muestras</div></div>
<div class="card"><div class="v">{f"{report.first_live_delay_s:.0f}s" if report.first_live_delay_s else "N/A"}</div><div class="l">Delay LIVE</div></div>
<div class="card"><div class="v">{report.samples[-1].status if report.samples else "N/A"}</div><div class="l">Ultimo status</div></div>
<div class="card"><div class="v">{report.samples[-1].events_count if report.samples else 0}</div><div class="l">Eventos finales</div></div>
</div></div>

<div class="chart-wrap">
<canvas id="chart" height="80"></canvas>
</div>
<script>
new Chart(document.getElementById('chart'), {{
  type: 'line',
  data: {{
    labels: {json.dumps(chart_labels)},
    datasets: [
      {{label:'Status (0=SCHED 1=PAUSED 2=LIVE 3=FIN)', data:{json.dumps(chart_status)}, borderColor:'#4af', backgroundColor:'transparent', yAxisID:'y1', pointRadius:0}},
      {{label:'Eventos historico', data:{json.dumps(chart_events)}, borderColor:'#f80', backgroundColor:'transparent', yAxisID:'y2', pointRadius:0}},
      {{label:'Fotmob eventos', data:{json.dumps(chart_fotmob)}, borderColor:'#5f5', backgroundColor:'transparent', yAxisID:'y2', pointRadius:0}},
    ]
  }},
  options:{{responsive:true,plugins:{{legend:{{labels:{{color:'#999'}}}},title:{{display:true,text:'Evolucion del partido',color:'#bbb'}}}},
    scales:{{
      x:{{ticks:{{color:'#666'}},grid:{{color:'#111'}}}},
      y1:{{type:'linear',position:'left',ticks:{{color:'#4af'}},grid:{{color:'#111'}},min:0,max:3}},
      y2:{{type:'linear',position:'right',ticks:{{color:'#f80'}},grid:{{display:false}}}},
    }}
  }}
}});
</script>

<h2>Checks Estaticos (pre-partido)</h2>
<table><thead><tr><th>Estado</th><th>Check</th><th>Detalle</th></tr></thead><tbody>{chk_rows(report.static_checks)}</tbody></table>

<h2>Muestras durante el partido ({len(report.samples)} total)</h2>
{samples_html}

<p style="color:#333;margin-top:30px;font-size:11px">Generado: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')} | match_tester.py</p>
</body></html>"""

# ── Core runner ───────────────────────────────────────────────────────────────
async def run_test(fixture_id, kickoff_iso, home, away):
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

    report = Report(fixture_id, home, away, kickoff_iso, datetime.now(timezone.utc))
    kickoff_dt = datetime.fromisoformat(kickoff_iso.replace("Z", "+00:00"))

    print(f"\n[tester] {'='*60}")
    print(f"[tester] {home} vs {away}")
    print(f"[tester] Kickoff: {kickoff_iso}  Duration: {TEST_DURATION_S//60} min")
    print(f"[tester] {'='*60}\n")

    async with httpx.AsyncClient(timeout=30) as client:
        print("[tester] Checks estaticos...")
        report.static_checks = await run_static_checks(client, fixture_id)
        for c in report.static_checks:
            print(f"  {'OK' if c.passed else 'XX'} {c.name}: {c.detail}")

        print("\n[tester] Iniciando Playwright...")
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"]
            )
            page = await browser.new_page(viewport={"width": 390, "height": 844})
            try:
                await page.goto(f"{APP_URL}/en-vivo", wait_until="networkidle", timeout=20000)
                print("[tester] App cargada OK")
            except Exception as e:
                print(f"[tester] WARN app: {e}")

            end_ts = kickoff_dt.timestamp() + TEST_DURATION_S
            first_live_ts = None
            sample_n = 0
            finished_early = False

            print(f"[tester] Sondeando cada {POLL_INTERVAL_S}s hasta {TEST_DURATION_S//60} min post-kickoff\n")

            while time.time() < end_ts:
                sample_n += 1
                do_screenshot = (sample_n % SCREENSHOT_EVERY_N == 1)  # muestra 1, 11, 21...
                now_str = datetime.now(timezone.utc).strftime('%H:%M:%S')
                print(f"[tester] Muestra #{sample_n} ({now_str}) screenshot={'si' if do_screenshot else 'no'}")

                s = await take_sample(client, page, fixture_id, sample_n, kickoff_dt, do_screenshot)

                if s.status in ("LIVE", "PAUSED") and first_live_ts is None:
                    first_live_ts = s.ts
                    delay = (first_live_ts - kickoff_dt).total_seconds()
                    report.first_live_delay_s = delay
                    print(f"[tester] ** LIVE detectado! Delay={delay:.0f}s **")

                report.samples.append(s)

                fails = [c for c in s.checks if not c.passed]
                print(f"  {s.status} min={s.minute} {s.home_score}-{s.away_score} evs={s.events_count} fotmob={s.fotmob_count}")
                for c in fails:
                    print(f"  XX {c.name}: {c.detail}")

                # Terminar si el partido acabó y han pasado al menos 5 min desde el final
                if s.status == "FINISHED":
                    elapsed_since_kickoff = (s.ts - kickoff_dt).total_seconds() / 60
                    if elapsed_since_kickoff > 85:  # no terminar en el primer FINISHED (puede ser viejo)
                        print("[tester] Partido FINISHED — esperando 5 min mas para ultima captura...")
                        await asyncio.sleep(300)
                        final_s = await take_sample(client, page, fixture_id, sample_n + 1, kickoff_dt, True)
                        report.samples.append(final_s)
                        finished_early = True
                        break

                remaining = end_ts - time.time()
                if remaining > 0:
                    await asyncio.sleep(min(POLL_INTERVAL_S, remaining))

            await browser.close()

    report.finished_at = datetime.now(timezone.utc)

    slug = f"{fixture_id[:8]}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    html_path = REPORTS_DIR / f"report_{slug}.html"
    json_path = REPORTS_DIR / f"report_{slug}.json"

    html_path.write_text(render_html(report), encoding="utf-8")

    failed = (sum(sum(1 for c in s.checks if not c.passed) for s in report.samples)
              + sum(1 for c in report.static_checks if not c.passed))
    json_path.write_text(json.dumps({
        "fixture_id": fixture_id, "home": home, "away": away,
        "kickoff_at": kickoff_iso,
        "started_at": report.started_at.isoformat(),
        "finished_at": report.finished_at.isoformat(),
        "total_checks": sum(len(s.checks) for s in report.samples) + len(report.static_checks),
        "failed_checks": failed,
        "first_live_delay_s": report.first_live_delay_s,
        "samples": [{
            "ts": s.ts.isoformat(), "elapsed_min": s.elapsed_min,
            "status": s.status, "minute": s.minute,
            "home_score": s.home_score, "away_score": s.away_score,
            "events_count": s.events_count, "fotmob_count": s.fotmob_count,
            "checks": [{"name": c.name, "passed": c.passed, "detail": c.detail,
                        "latency_ms": c.latency_ms} for c in s.checks],
        } for s in report.samples],
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n[tester] REPORTE HTML: {html_path}")
    print(f"[tester] JSON:         {json_path}")
    print(f"[tester] Fallos: {failed}")

# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--now", action="store_true", help="Empezar sin esperar kickoff")
    parser.add_argument("--fixture", default=None, help="ID de fixture")
    args = parser.parse_args()

    async with httpx.AsyncClient(timeout=30) as client:
        if args.fixture:
            rows, _ = await sb_get(client, "fixtures", {
                "select": "id,kickoff_at,status,home_team_name,away_team_name",
                "id": f"eq.{args.fixture}", "limit": "1",
            })
            fixture = rows[0] if rows else None
        else:
            fixture = await find_next_fixture(client)

    if not fixture:
        print("[tester] No se encontro partido. Usa --fixture <id> o espera a que Supabase tenga fixtures.")
        sys.exit(1)

    fid = fixture["id"]
    kickoff_iso = fixture["kickoff_at"]
    kickoff_dt = datetime.fromisoformat(kickoff_iso.replace("Z", "+00:00"))
    home = fixture.get("home_team_name") or "Home"
    away = fixture.get("away_team_name") or "Away"

    print(f"[tester] Partido: {home} vs {away} | Kickoff: {kickoff_iso}")

    if not args.now:
        now_utc = datetime.now(timezone.utc)
        wait_s = kickoff_dt.timestamp() - 60 - now_utc.timestamp()
        if wait_s > 0:
            start_dt = datetime.fromtimestamp(kickoff_dt.timestamp() - 60, tz=timezone.utc)
            print(f"[tester] Esperando hasta {start_dt.strftime('%H:%M:%S UTC')} (1 min antes kickoff)")
            print(f"[tester] Espera: {wait_s/3600:.1f}h. Ctrl+C para cancelar.")
            try:
                await asyncio.sleep(wait_s)
            except (asyncio.CancelledError, KeyboardInterrupt):
                print("[tester] Cancelado.")
                return
        else:
            print("[tester] Kickoff ya inminente — empezando ahora.")

    await run_test(fid, kickoff_iso, home, away)

if __name__ == "__main__":
    asyncio.run(main())
