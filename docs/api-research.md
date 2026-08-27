# API research — football data sources (2026)

Workstream: API research for **ManOfTheMatch**.
Scope of the MVP this doc serves: **Real Madrid + FC Barcelona only**, **LaLiga + UEFA Champions League**, **season 2026/27 only**, **100% free tiers**.
Architecture reminder: the ingest worker (Coolify cron) is the only thing that calls these APIs; it writes to Supabase; the PWA only reads Supabase. So every limit below is a *per-worker* budget, not per-user.

Last verified: **2026-08-27**. Every rate limit / auth / coverage claim below was checked against live docs or a live API call this day (URLs in **Sources** at the bottom). Where a provider blocks automated fetching (API-Football is behind Cloudflare), the figure is cross-checked against 2–3 independent 2026 write-ups and flagged.

---

## 0. TL;DR recommendation

| Need | Primary (free) | Fallback (free) |
|---|---|---|
| 1. Fixtures / calendar | **football-data.org** `/competitions/{PD,CL}/matches` | TheSportsDB `eventsseason`/`eventsnext`; OpenLigaDB `la1` (LaLiga only) → also our own static table |
| 2. Live score + goal events | **TheSportsDB** `livescore.php` + `lookuptimeline.php` (poll during our matches) | API-Football `/fixtures?id=` + `/fixtures/events` (budget-limited); Fotmob `matchDetails` |
| 3. Full match timeline | **API-Football** `/fixtures/events` (1 post-match sweep) | TheSportsDB `lookuptimeline.php`; Fotmob `matchFacts.events` |
| 4. Lineups + formations | **API-Football** `/fixtures/lineups` | Fotmob `lineup` (x/y coords); TheSportsDB `lookuplineup.php` (no formation string) |
| 5. Player ratings + per-player stats | **API-Football** `/fixtures/players` | Fotmob `playerStats` + `playerOfTheMatch`; Sofascore `/event/{id}/lineups` |
| 6. Standings / league table | **football-data.org** `/competitions/{PD,CL}/standings` | TheSportsDB `lookuptable.php`; OpenLigaDB `getbltable/la1` |
| 7. xG (optional) | LaLiga: **Understat** (shot + player xG). UCL: **Fotmob** `shotmap` | API-Football `/fixtures/statistics` team-level `expected_goals` (inconsistent) |

**No viable free source** (see §5): player heatmaps / touch maps, "official" ratings, packing / xT / progressive-carry metrics, predicted line-ups, shot freeze-frames (StatsBomb 360) for the current season, live xG for UCL from a ToS-clean source.

**Keys to register for right now** (details in §7): football-data.org token, API-Football key. TheSportsDB can start on the shared test key `123`. Everything else (OpenLigaDB, Understat, Fotmob, Sofascore, StatsBomb) needs no key.

---

## 1. Comparison table

Legend: ✅ full & structured · 🟡 partial / crowd-sourced / needs work · ❌ not available on free · ⚠️ unofficial (ToS + breakage risk)

| Source | Free rate limit | Auth | LaLiga cover | UCL cover | Fixtures | Live / events | Lineups | Player ratings | Standings | xG | Reliability / ToS risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **football-data.org** | 10 req/min, no daily cap (registered free). Unauth: 100/24h, area+competition list only | `X-Auth-Token` header | ✅ `PD` / id 2014 (free tier) | ✅ `CL` / id 2001 (free tier) | ✅ dates, kickoff, matchday, stage, status, venue, HT/FT score — **delayed**, not real-time | 🟡 status + score only, **delayed**; ❌ goal/card/sub arrays are paid ("Deep Data" €29/mo) | ❌ paid | ❌ none, any tier | ✅ full, incl. CL league-phase | ❌ (paid stats add-on, still no shot xG) | **Low risk.** Stable since 2013, public "free forever" pledge, clear ToS, ETag support |
| **API-Football** (api-sports.io direct) | **100 req/day**, 10 req/min, resets 00:00 UTC | `x-apisports-key` header | ✅ league 140, season 2026 | ✅ league 2, season 2026 | ✅ everything incl. referee, venue, round | ✅ `/fixtures/events` (goal/card/subst/VAR, minute, scorer, assist); score refresh ~15 s | ✅ `/fixtures/lineups` formation + grid + coach | ✅ `/fixtures/players` `games.rating` + full stat line | ✅ `/standings` (incl. CL groups) | 🟡 team-level `expected_goals` in `/fixtures/statistics`, league-dependent; no per-shot | **Medium.** Commercial vendor, generous ToS for the free key, but 100/day is brutal and "historical seasons limited" on free — **verify 2026 access on signup** |
| **TheSportsDB** | 30 req/min (free). Test key `123` shared & throttled; personal key needs Premium $9/mo | v1: key in URL path. v2: `X-API-KEY` header (**Premium only**) | ✅ league 4335 | 🟡 league 4480 — 2026/27 only qualifiers loaded as of Aug 2026; league phase appears after the draw | ✅ `eventsseason` / `eventsnext` / `eventsround`: kickoff, venue, round, status, `idAPIfootball` cross-ref | 🟡 `livescore.php` **works on free**; `lookuptimeline.php` has goals+cards+subs+assist but **crowd-sourced → gaps & lag** | 🟡 `lookuplineup.php`: position + starter/sub + shirt #, **no formation string**, coverage varies | ❌ no numeric ratings on free | ✅ `lookuptable.php` incl. `strForm`, `strGroup` | ❌ | **Medium.** Community DB; late/partial for less-covered matches. Free tier explicitly supported (Patreon model). v2 + 2-min livescore is paid |
| **OpenLigaDB** | None documented; be polite | **None** (fully open) | 🟡 shortcut `la1` season `2026` — real fixtures + goals + basic table, community-entered (occasional wrong team, `location` often null) | ❌ `ucl` / `ucl2026` leagues exist but **0 matches** | 🟡 `getmatchdata/la1/2026`: teams, `matchDateTimeUTC`, matchday (`group`), finished flag | 🟡 `goals[]` only: minute, scorer, running score, `isPenalty`, `isOwnGoal` — **no cards/subs**, updated by volunteers | ❌ | ❌ | 🟡 `getbltable/la1/2026` | ❌ | **Medium-low for LaLiga fixtures, unusable for UCL.** CC0-ish open data, no ToS friction. Best used as a static fallback we copy into our own table |
| **Understat** | None (HTML scrape); ~1 req / match | None | ✅ league key `La_liga`, season `2026` | ❌ **domestic leagues only** | 🟡 `datesData` (fixtures w/ xG forecast) | ❌ no timeline | ❌ (roster only) | ❌ (no rating; has xG/xA per player) | 🟡 team table w/ xG/xGA/PPDA | ✅ **shot-level xG** (`shotsData`) + player `xG/xA/xGChain/xGBuildup` (`rostersData`) | **Medium.** Scraping ToS-grey; data embedded as `JSON.parse('…')` in `<script>`; stable format for years; ~1–2 h post-match to appear |
| **Fotmob** (unofficial) | None published; throttle to ~1 req / 3–5 s | **None**, but `matchDetails` needs a client-generated `x-mas` / `x-fm-req` header ⚠️ | ✅ league 87 | ✅ league 42 | ✅ `matches?date=` / `leagues?id=` | ✅ `matchFacts.events` (goal/card/sub/VAR, `ownGoal`, `goalDescription`="Penalty", running score) | ✅ `lineup` — formation + per-player `x/y` + `performance.rating` | ✅ `playerStats[pid]` + `playerOfTheMatch` (FotMob rating + full stat groups) | ✅ `table` block in `matchDetails` | ✅ `shotmap.shots[]` with `expectedGoals`, `x/y`, `expectedGoalsOnTarget` | **High risk.** No public API, ToS forbids scraping, `x-mas` header changes have broken scrapers repeatedly (see soccerdata #742). Use as enrichment only, cache hard |
| **Sofascore** (unofficial) | Aggressive; needs TLS-impersonation (`curl_cffi`) or you get 403 | **None**; Cloudflare + `X-Requested-With` quirks ⚠️ | ✅ uniqueTournament 8 | ✅ uniqueTournament 7 | ✅ `/sport/football/scheduled-events/{date}` | ✅ `/event/{id}/incidents` (period/goal/card/substitution/varDecision, `addedTime`) | ✅ `/event/{id}/lineups` formation + `statistics.rating` | ✅ best in class: `/event/{id}/lineups` `statistics.rating`, `/event/{id}/best-players` | ✅ `/unique-tournament/{id}/season/{sid}/standings/total` | ✅ `/event/{id}/shotmap` (`xg`, `xgot`, coords) | **High risk.** Company explicitly refuses to expose endpoints, blocks datacenter IPs (Coolify host may be blocked), rate-limits hard. Keep as a manual/last-resort fallback |
| **StatsBomb open data** | GitHub raw (no limit beyond GH's) | None | 🟡 La Liga **2004/05–2020/21** only (Barça-centric + full 2015/16) | 🟡 finals / older seasons to **2018/19** | ❌ nothing current | ✅ event-level for covered matches (historical) | ✅ historical | ❌ (has event data, not a rating) | ❌ | ✅ full shot xG + freeze-frames (historical) | **Low risk, wrong era.** CC-BY-NC "user agreement", superb quality, but **no 2026 data** → only useful later for model training, not the live product |

Sources considered and rejected for MVP: **Highlightly** (100 req/day free, similar squeeze to API-Football, newer/less proven), **Sportmonks** (free tier = Danish + Scottish leagues only — no LaLiga/UCL), **TheStatsAPI** (no permanent free tier), **api-football via RapidAPI** (free "Basic" plan historically locks to seasons 2021–2023 → useless for 2026/27; use the direct api-sports.io dashboard plan instead), **LaLiga's own dev portal** (enterprise, not self-serve free).

---

## 2. Recommended split per data need

Design principle: **football-data.org is the reliable spine** (fixtures + standings, low ToS risk, no daily cap). **API-Football is the scalpel** — 100 req/day is only enough if we spend it almost entirely on our 2 teams' matches (lineups, ratings, structured timeline). **TheSportsDB fills the live gap** (its `livescore.php` is free and its 30 req/min is comfortable). **Fotmob/Understat/Sofascore are enrichment**, cached hard, never on the critical path.

### 1 — Fixtures / calendar
- **Primary: football-data.org** — `GET /v4/competitions/PD/matches?season=2026` and `.../CL/matches?season=2026`. Gives matchday, `stage`, `status`, `utcDate`, HT/FT score, team ids. Twice-daily sync is plenty.
- **Fallback A: TheSportsDB** — `eventsnext.php?id={teamId}` (next 25 for a team, cross-league, includes `strVenue`, `intRound`, `idAPIfootball`) and `eventsseason.php?id=4335&s=2026-2027`. Use to fill venue/kickoff-time gaps and to get the API-Football fixture id mapping for free.
- **Fallback B: OpenLigaDB** — `getmatchdata/la1/2026` for LaLiga only; copy into our own `fixtures` rows as the offline static fallback the brief allows.
- **Seed once at season start: API-Football** — `/fixtures?team=541&season=2026` + `team=529` (2 calls) to lock in `fixture.id` for every Madrid/Barça match; store in `fixtures.source_ids.apiFootball`.
- Note: football-data "schedules delayed" only matters for last-minute rescheduling; re-sync daily and this is a non-issue for a calendar view.

### 2 — Live score + goal events (goal / own goal / penalty, minute + scorer)
- **Primary: TheSportsDB** — during a tracked match: `livescore.php?s=Soccer` every 60 s (filter to our `idEvent`), plus `lookuptimeline.php?id={idEvent}` every ~2 min for the scorer/minute/assist/penalty detail. Both free, well inside 30 req/min.
- **Enrich: API-Football** — `/fixtures?id={id}` + `/fixtures/events?fixture={id}` every 10–15 min *only while our match is live* (score/events refresh every 15 s server-side, so 10-min polling is fine and protects the 100/day budget). `type:"Goal"` + `detail:"Penalty"|"Own Goal"|"Normal Goal"`.
- **Fallback: Fotmob** `matchDetails` → `matchFacts.events.events[]` (`type:"Goal"`, `ownGoal`, `goalDescription`, `newScore`). Only if both above fail; needs the `x-mas` header.
- football-data.org **cannot** do this on free (delayed, no event arrays).

### 3 — Full match timeline (goals, yellow/red, subs, key events)
- **Primary: API-Football** `/fixtures/events?fixture={id}` — one sweep at FT and one ~2 h later (stats settle). Cleanest structure: `type` ∈ {Goal, Card, subst, Var}, `detail`, `time.elapsed`, `time.extra`, `player`, `assist`.
- **Fallback A: TheSportsDB** `lookuptimeline.php` — `strTimeline` ∈ {Goal, Card, subst}, `strTimelineDetail`, `intTime`, `strPlayer`, `strAssist`, `strHome`. Crowd-sourced → may be first-half-only for hours; re-poll.
- **Fallback B: Fotmob** `matchFacts.events` — also has `AddedTime` / `Half` markers and `swap[]` for subs.
- "Key events" beyond goals/cards/subs (big chances, key passes) exist only in Fotmob/Sofascore shotmaps → treat as optional, map to `CHANCE` / `KEY_PASS` if we pull the shotmap anyway for xG.

### 4 — Lineups + formations
- **Primary: API-Football** `/fixtures/lineups?fixture={id}` — `formation` string ("4-3-3"), `startXI[].player.grid` ("4:2"), `substitutes[]`, `coach`. Poll every 15 min from T-60 min until populated (usually ~T-40 min), then once more at kickoff for confirmed XI.
- **Fallback A: Fotmob** `lineup.homeTeam/awayTeam` — `formation` + `starters[].horizontalLayout.x/y` (nice for a pitch view) + `performance.rating` + `coach`.
- **Fallback B: TheSportsDB** `lookuplineup.php` — `strPosition`, `strSubstitute`, `intSquadNumber`; **no formation string**, so derive formation from positions or leave null.

### 5 — Player ratings + per-player match stats
- **Primary: API-Football** `/fixtures/players?fixture={id}` — `statistics[0].games.rating` (string "7.6"), plus minutes, shots, passes+accuracy, tackles, duels, dribbles, fouls, cards, penalties. One sweep ~2 h post-FT (ratings keep moving for the first hour).
- **Fallback A: Fotmob** — `playerStats[playerId].stats[].stats` (FotMob rating + grouped stats) and `matchFacts.playerOfTheMatch` (`rating.num`).
- **Fallback B: Sofascore** — `/event/{id}/lineups` → `players[].statistics.rating` (+ `expectedGoals`, `expectedAssists`, `touches`, `keyPass`). Best ratings, worst access story.
- **There is no "official" rating.** Each provider computes its own; if we ever show two sources, label them ("API-Football rating" vs "FotMob rating"). Store `source` on every `player_match_stats` row.

### 6 — Standings / league table
- **Primary: football-data.org** `/v4/competitions/PD/standings?season=2026` and `.../CL/standings?season=2026`. `standings[]` blocks are typed `TOTAL`/`HOME`/`AWAY`; for CL the block carries the 36-team league-phase table. Fields: `position, playedGames, won, draw, lost, points, goalsFor, goalsAgainst, goalDifference, form`.
- **Fallback A: TheSportsDB** `lookuptable.php?l=4335&s=2025-2026` (note season string format `YYYY-YYYY`). Has `strForm`, `strGroup` ("Primera División" / CL group).
- **Fallback B: OpenLigaDB** `getbltable/la1/2026` (LaLiga only).
- Snapshot into `standings` after every matchday (twice-daily idle cron already covers it).

### 7 — xG (optional)
- **LaLiga → Understat.** Scrape `https://understat.com/match/{understatMatchId}` for `shotsData` (per-shot `xG`, `X`, `Y`, `result`, `player`, `situation`) and `rostersData` (per-player `xG`, `xA`, `xGChain`, `xGBuildup`, `key_passes`). Map Understat match id from `https://understat.com/team/Real_Madrid/2026` `datesData`. One scrape ~2 h post-match.
- **UCL → Fotmob `shotmap`.** `matchDetails` → `shotmap.shots[]` with `expectedGoals`, `expectedGoalsOnTarget`, `x`, `y`, `situation`, `shotType`. This is the **only** free UCL xG and it is unofficial — cache it, never depend on it.
- **Fallback (both): API-Football** `/fixtures/statistics?fixture={id}` → per-team `type:"expected_goals"`. Present for top leagues but historically inconsistent — verify per fixture before display.
- Store on `player_match_stats.xg` / `.xa` (per-player) and consider a `fixtures`-level xG pair if we want match totals (add columns or a small `match_xg` table later).

---

## 3. Recommended sources — reference detail

### 3.1 football-data.org  (PRIMARY: fixtures, standings)

- **Base URL:** `https://api.football-data.org/v4`
- **Auth:** header `X-Auth-Token: <token>` on every request. Missing/invalid → `403`.
- **Rate limit (registered free):** 10 requests / minute, no stated daily cap. `X-Requests-Available-Minute` and `X-RequestCounter-Reset` come back in response headers — read them and back off.
- **Free competitions (all we need are in):** `PD` Primera División (id 2014), `CL` UEFA Champions League (id 2001). Also PL, BL1, SA, FL1, DED, PPL, ELC, BSA, WC, EC.
- **ETag:** send `If-None-Match`; `304` responses don't count as hard against you — use `http_cache` table.
- **Free-tier limitations that matter:** scores & schedules are **delayed** (not live); **no** line-ups, goals, bookings, substitutions, squads (that's the €29/mo "Deep Data" tier). Standings and the top-scorers list **are** free.

**Endpoints we call**

| Need | Request |
|---|---|
| Fixtures (season) | `GET /v4/competitions/PD/matches?season=2026` · `GET /v4/competitions/CL/matches?season=2026` |
| Fixtures (only our teams, cross-competition) | `GET /v4/teams/86/matches?season=2026&status=SCHEDULED` (Real Madrid) · `/v4/teams/81/matches?...` (Barça) |
| One match (score/status refresh) | `GET /v4/matches/{id}` |
| Standings | `GET /v4/competitions/PD/standings?season=2026` · `GET /v4/competitions/CL/standings?season=2026` |
| Top scorers (nice-to-have) | `GET /v4/competitions/PD/scorers?season=2026` |

**Response shape — `/competitions/{code}/matches`** (verified sample):

```json
{
  "filters": { "season": "2025" },
  "resultSet": { "count": 380, "first": "2025-04-01", "last": "2025-12-21", "played": 1 },
  "competition": { "id": 2013, "name": "Campeonato Brasileiro Serie A", "code": "BSA", "type": "LEAGUE" },
  "matches": [
    {
      "area": { "id": 2032, "name": "Brazil", "code": "BRA" },
      "competition": { "id": 2013, "name": "...", "code": "BSA", "type": "LEAGUE" },
      "season": { "id": 2351, "startDate": "2025-03-29", "endDate": "2025-12-21", "currentMatchday": 1, "winner": null },
      "id": 501001,
      "utcDate": "2025-04-01T22:00:00Z",
      "status": "FINISHED",                       // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | SUSPENDED | POSTPONED
      "matchday": 1,
      "stage": "REGULAR_SEASON",                  // for CL: LEAGUE_STAGE | LAST_16 | ...
      "group": null,
      "lastUpdated": "2025-04-02T01:00:00Z",
      "homeTeam": { "id": 1765, "name": "Flamengo", "shortName": "Flamengo", "tla": "FLA", "crest": "..." },
      "awayTeam": { "id": 1770, "name": "Palmeiras", "shortName": "Palmeiras", "tla": "PAL", "crest": "..." },
      "score": {
        "winner": "HOME_TEAM",                    // HOME_TEAM | AWAY_TEAM | DRAW | null
        "duration": "REGULAR",
        "fullTime": { "home": 2, "away": 1 },
        "halfTime": { "home": 1, "away": 0 }
      }
    }
  ]
}
```
(`/v4/matches/{id}` adds `referees[]`, `venue`, `attendance`, and — **paid only** — `goals[]`, `bookings[]`, `substitutions[]`, `homeTeam.lineup[]`.)

**Response shape — `/competitions/{code}/standings`** (verified sample):

```json
{
  "competition": { "id": 2002, "code": "BL1", "name": "Bundesliga" },
  "season": { "id": 1490, "currentMatchday": 30 },
  "standings": [
    {
      "stage": "REGULAR_SEASON",
      "type": "TOTAL",                            // TOTAL | HOME | AWAY
      "group": null,                              // CL: "LEAGUE_STAGE" (single 36-team table in new format)
      "table": [
        {
          "position": 1,
          "team": { "id": 3, "name": "Bayer 04 Leverkusen", "shortName": "Leverkusen", "tla": "B04", "crest": "..." },
          "playedGames": 30,
          "form": null,                           // often null on free tier
          "won": 25, "draw": 5, "lost": 0,
          "points": 80, "goalsFor": 75, "goalsAgainst": 20, "goalDifference": 55
        }
      ]
    }
  ]
}
```

---

### 3.2 API-Football (api-sports.io)  (PRIMARY: timeline, lineups, ratings/stats)

- **Base URL (direct dashboard plan — use this, not RapidAPI):** `https://v3.football.api-sports.io`
- **Auth:** header `x-apisports-key: <key>`. (On RapidAPI it'd be `x-rapidapi-key` + `x-rapidapi-host` — different product, don't mix.)
- **Free plan:** **100 requests / day**, 10 / minute, quota resets **00:00 UTC**. All endpoints unlocked; "historical seasons limited" on free. Multiple 2026 write-ups say the free plan "covers recent seasons" — **must confirm season=2026 returns data right after signup**; if not, API-Football drops to fallback-only and TheSportsDB/Fotmob carry lineups+ratings.
- **Our identifiers:** LaLiga `league=140`, UCL `league=2`, `season=2026`; Real Madrid `team=541`, Barcelona `team=529`. (These match `packages/shared/src/index.ts` — confirmed correct.)
- **Response envelope:** every response is `{ "get", "parameters", "errors", "results", "paging", "response": [...] }`. Watch `errors` (quota / param errors come back **200 OK** with a populated `errors` object).
- **Freshness:** `/fixtures` and `/fixtures/events` update ~every 15 s live; `/fixtures/statistics` ~every minute; ratings in `/fixtures/players` keep changing for ~1 h after FT.

**Endpoints we call**

| Need | Request |
|---|---|
| Season fixtures for a team (seed ids) | `GET /fixtures?team=541&season=2026` · `GET /fixtures?team=529&season=2026` |
| Fixtures by league+round | `GET /fixtures?league=140&season=2026&round=Regular Season - 3` |
| One fixture (live score) | `GET /fixtures?id={fixtureId}` |
| Live (all our tracked, cheap check) | `GET /fixtures?live=all` then filter to team 541/529 — 1 call covers both |
| Timeline | `GET /fixtures/events?fixture={fixtureId}` |
| Lineups | `GET /fixtures/lineups?fixture={fixtureId}` |
| Player ratings + stats | `GET /fixtures/players?fixture={fixtureId}` |
| Team stats + xG | `GET /fixtures/statistics?fixture={fixtureId}` |
| Standings | `GET /standings?league=140&season=2026` · `GET /standings?league=2&season=2026` |

**`/fixtures` element** (verified sample):

```json
{
  "fixture": {
    "id": 1378040,
    "referee": "Giuseppe Collu, Italy",
    "timezone": "UTC",
    "date": "2026-01-03T17:00:00+00:00",
    "timestamp": 1767459600,
    "periods": { "first": 1767459600, "second": null },
    "venue": { "id": null, "name": "Allianz Stadium", "city": "Turin" },
    "status": { "long": "First Half", "short": "1H", "elapsed": 45, "extra": 1 }
  },
  "league": { "id": 135, "name": "Serie A", "country": "Italy", "season": 2025, "round": "Regular Season - 18", "standings": true },
  "teams": {
    "home": { "id": 496, "name": "Juventus", "logo": "...", "winner": null },
    "away": { "id": 867, "name": "Lecce", "logo": "...", "winner": null }
  },
  "goals": { "home": 0, "away": 0 },
  "score": {
    "halftime": { "home": 0, "away": 0 },
    "fulltime": { "home": null, "away": null },
    "extratime": { "home": null, "away": null },
    "penalty": { "home": null, "away": null }
  }
}
```
`status.short`: `NS, TBD, 1H, HT, 2H, ET, BT, P, SUSP, INT, FT, AET, PEN, PST, CANC, ABD, AWD, WO, LIVE`.

**`/fixtures/events` element** (verified sample):

```json
{
  "time": { "elapsed": 25, "extra": null },
  "team": { "id": 463, "name": "Aldosivi", "logo": "..." },
  "player": { "id": 6126, "name": "F. Andrada" },
  "assist": { "id": null, "name": null },
  "type": "Goal",                       // Goal | Card | subst | Var
  "detail": "Normal Goal",              // Normal Goal | Own Goal | Penalty | Missed Penalty | Yellow Card | Red Card | Substitution 1 | Goal cancelled | Penalty confirmed
  "comments": null
}
```

**`/fixtures/lineups` element** (verified sample):

```json
{
  "team": { "id": 463, "name": "Aldosivi", "logo": "...", "colors": null },
  "coach": { "id": 3946, "name": "G. Hoyos", "photo": "..." },
  "formation": "4-3-3",
  "startXI": [
    { "player": { "id": 6258, "name": "L. Pocrnjic", "number": 1, "pos": "G", "grid": "1:1" } },
    { "player": { "id": 6261, "name": "L. Galeano", "number": 6, "pos": "D", "grid": "2:4" } }
  ],
  "substitutes": [
    { "player": { "id": 35845, "name": "H. Burbano", "number": 11, "pos": "M", "grid": null } }
  ]
}
```
`grid` is `"row:col"` from the back (row 1 = GK); good for a formation view.

**`/fixtures/players` element** (verified sample):

```json
{
  "team": { "id": 463, "name": "Aldosivi", "logo": "...", "update": "..." },
  "players": [
    {
      "player": { "id": 6258, "name": "Luciano Pocrnjic", "photo": "..." },
      "statistics": [
        {
          "games": { "minutes": 90, "number": 1, "position": "G", "rating": "7.1", "captain": true, "substitute": false },
          "offsides": null,
          "shots": { "total": 0, "on": 0 },
          "goals": { "total": null, "conceded": 0, "assists": null, "saves": 0 },
          "passes": { "total": 13, "key": 0, "accuracy": "44%" },
          "tackles": { "total": null, "blocks": 0, "interceptions": 0 },
          "duels": { "total": null, "won": null },
          "dribbles": { "attempts": 0, "success": 0, "past": null },
          "fouls": { "drawn": 0, "committed": 0 },
          "cards": { "yellow": 0, "red": 0 },
          "penalty": { "won": null, "commited": null, "scored": 0, "missed": 0, "saved": 0 }
        }
      ]
    }
  ]
}
```
`games.rating` is a **string** ("7.1"); `passes.accuracy` is a **string with `%`**. Parse accordingly.

**`/standings` element** (verified sample): `response[0].league.standings` is an **array of arrays** (one inner array per group; LaLiga has 1, CL new format has 1 of 36). Each row:

```json
{
  "rank": 15,
  "team": { "id": 490, "name": "Cagliari", "logo": "..." },
  "points": 18, "goalsDiff": -6, "group": "Serie A", "form": "LWDLW", "status": "same", "description": null,
  "all":  { "played": 18, "win": 4, "draw": 6, "lose": 8, "goals": { "for": 19, "against": 25 } },
  "home": { "played": 9, "win": 2, "draw": 3, "lose": 4, "goals": { "for": 10, "against": 13 } },
  "away": { "played": 9, "win": 2, "draw": 3, "lose": 4, "goals": { "for": 9, "against": 12 } },
  "update": "2026-01-04T00:00:00+00:00"
}
```

---

### 3.3 TheSportsDB  (PRIMARY: live score/timeline fallback; standings/fixtures fallback)

- **Base URL v1:** `https://www.thesportsdb.com/api/v1/json/{API_KEY}/` — key is a **path segment**. Start with the shared test key `123`; move to a personal key (Premium, $9/mo) if `123` throttling bites.
- **v2:** `https://www.thesportsdb.com/api/v2/json/...`, auth header `X-API-KEY` — **Premium only**, includes 2-min livescores & video. Not for us on free.
- **Rate limit (free):** 30 req/min; over → HTTP `429`.
- **Our ids:** LaLiga league `4335`, UCL league `4480`, Real Madrid team `133738`, Barcelona team `133739`. Season strings use `YYYY-YYYY` (e.g. `2026-2027`).
- **Cross-reference bonus:** events carry `idAPIfootball` — free mapping from a TheSportsDB event to the API-Football fixture id.

**Endpoints we call**

| Need | Request |
|---|---|
| Next matches for a team | `GET /eventsnext.php?id=133738` |
| Last matches for a team | `GET /eventslast.php?id=133738` |
| Whole season fixtures | `GET /eventsseason.php?id=4335&s=2026-2027` |
| One matchday / round | `GET /eventsround.php?id=4335&r=3&s=2026-2027` |
| Live scores (works on free!) | `GET /livescore.php?s=Soccer` (or `?l=4335`) |
| Timeline | `GET /lookuptimeline.php?id={idEvent}` |
| Lineup | `GET /lookuplineup.php?id={idEvent}` |
| Standings | `GET /lookuptable.php?l=4335&s=2025-2026` |
| Event detail | `GET /lookupevent.php?id={idEvent}` |

**`eventsnext.php` element** (verified live, Real Madrid):

```json
{
  "idEvent": "2506193",
  "idAPIfootball": "1570360",
  "strEvent": "Real Madrid vs Málaga",
  "strTimestamp": "2026-08-30T15:00:00",
  "dateEvent": "2026-08-30", "strTime": "15:00:00",
  "strSeason": "2026-2027",
  "idLeague": "4335", "strLeague": "Spanish La Liga",
  "intRound": "3",
  "strHomeTeam": "Real Madrid", "idHomeTeam": "133738",
  "strAwayTeam": "Málaga", "idAwayTeam": "133736",
  "intHomeScore": null, "intAwayScore": null,
  "idVenue": "16467", "strVenue": "Estadio Santiago Bernabéu",
  "strCountry": "Spain",
  "strStatus": "NS", "strPostponed": "no"
}
```

**`lookuptimeline.php` element** (verified live, Real Madrid 4–1 Real Sociedad):

```json
{
  "idTimeline": "1865949",
  "idEvent": "2506175",
  "idAPIfootball": "1570340",
  "strTimeline": "Goal",                 // Goal | Card | subst
  "strTimelineDetail": "Normal Goal",    // Normal Goal | Penalty | Own Goal | Yellow Card | Red Card
  "strHome": "Yes",                      // Yes = home team
  "intTime": "40",
  "strPlayer": "Kylian Mbappé", "idPlayer": "34216135",
  "strAssist": "Federico Valverde", "idAssist": "0",
  "idTeam": "133738", "strTeam": "Real Madrid",
  "strComment": "Foul",
  "strSeason": "2026-2027"
}
```
Caveat seen live: the day after the match, only first-half events were present — completeness lags. Re-poll for hours, and prefer API-Football's timeline for the canonical version.

**`lookuplineup.php` element** (verified live):

```json
{
  "idLineup": "961818",
  "idEvent": "2506175",
  "strPosition": "Goalkeeper",           // free text: "Goalkeeper", "Attacking Midfield", ...
  "strHome": "Yes",
  "strSubstitute": "No",                 // "Yes" for bench
  "intSquadNumber": "1",
  "strPlayer": "Thibaut Courtois", "idPlayer": "34145514",
  "idTeam": "133738", "strTeam": "Real Madrid"
}
```
No `formation` field — infer from `strPosition` counts or leave `lineups.formation` null when this is the source.

**`lookuptable.php` element** (verified live):

```json
{
  "intRank": "1",
  "idTeam": "133739", "strTeam": "Barcelona",
  "strLeague": "Spanish La Liga", "strSeason": "2025-2026",
  "strGroup": "Primera División",
  "intPlayed": "38", "intWin": "31", "intDraw": "1", "intLoss": "6",
  "intGoalsFor": "95", "intGoalsAgainst": "36", "intGoalDifference": "59",
  "intPoints": "94",
  "strForm": "LWLWW",
  "dateUpdated": "2026-06-12 23:01:12"
}
```
All numeric fields are **strings**.

---

### 3.4 OpenLigaDB  (FALLBACK: LaLiga fixtures + goals, static copy)

- **Base URL:** `https://api.openligadb.de` — **no key, no documented rate limit** (still: cache, ~1 call/min max).
- **LaLiga:** `leagueShortcut = la1`, `leagueSeason = 2026` (verified: 90+ real fixtures, Real Madrid / FC Barcelona present, goals + scorers on played matches, kickoff times on scheduled ones).
- **UCL:** `ucl` / `ucl2026` leagues are registered but return **0 matches** — do not use for Champions League.
- Community-entered → occasional inaccuracies, `location` frequently `null`, no cards/subs/lineups/ratings/xG.

**Endpoints**

| Need | Request |
|---|---|
| All LaLiga matches | `GET /getmatchdata/la1/2026` |
| One matchday | `GET /getmatchdata/la1/2026/3` |
| One team's matches | `GET /getmatchdata/la1/2026/{teamId}` |
| Single match | `GET /getmatchdata/{matchId}` |
| Table | `GET /getbltable/la1/2026` |
| Matchday list | `GET /getavailablegroups/la1/2026` |
| Last change timestamp (cheap poll) | `GET /getlastchangedate/la1/2026` |

**Match object** (verified live):

```json
{
  "matchID": 85355,
  "matchDateTime": "2026-08-28T19:00:00",
  "matchDateTimeUTC": "2026-08-28T17:00:00Z",
  "leagueName": "LaLiga EA Sports 2026/2027",
  "group": { "groupName": "3. Spieltag", "groupOrderID": 3, "groupID": 50601 },
  "team1": { "teamId": 1278, "teamName": "Racing Santander", "shortName": "Racing Santander", "teamIconUrl": "..." },
  "team2": { "teamId": 2533, "teamName": "Elche CF", "shortName": "Elche CF", "teamIconUrl": "..." },
  "matchIsFinished": false,
  "location": null,
  "matchResults": [],          // when played: [{ "resultName": "Endergebnis", "pointsTeam1": 4, "pointsTeam2": 1 }, { "resultName": "Halbzeit", ... }]
  "goals": [],                 // when played: see below
  "lastUpdateDateTime": "2026-08-03T14:06:42.3"
}
```
`goals[]` element (played match): `{ "goalID", "scoreTeam1", "scoreTeam2", "matchMinute", "goalGetterID", "goalGetterName", "isPenalty", "isOwnGoal", "isOvertime", "comment" }`.
`getbltable` row: `{ "teamInfoId", "teamName", "shortName", "teamIconUrl", "points", "opponentGoals", "goals", "matches", "won", "lost", "draw", "goalDiff" }`.

---

### 3.5 Understat  (PRIMARY xG for LaLiga)

- **URLs:** match page `https://understat.com/match/{id}`, team page `https://understat.com/team/Real_Madrid/2026`, league page `https://understat.com/league/La_liga/2026`. **No API, no key** — parse the JSON that's embedded in a `<script>` tag as `var shotsData = JSON.parse('…escaped…');`.
- **Coverage:** Big-5 domestic leagues + RPL. **La Liga yes, Champions League NO.**
- **Variables on the match page:** `shotsData` (`{"h":[…],"a":[…]}`), `rostersData` (per-player match aggregates), `match_info`.
- **Variable on the team/league page:** `datesData` (fixtures + result + team xG), `playersData`, `teamsData`.

**`shotsData` shot object** (per docs / worldfootballR):

```
id, minute, result (Goal|SavedShot|MissedShots|BlockedShot|ShotOnPost|OwnGoal),
X, Y (0–1 pitch coords), xG, player, player_id, h_a ("h"|"a"),
situation (OpenPlay|FromCorner|SetPiece|DirectFreekick|Penalty),
shotType (RightFoot|LeftFoot|Head|OtherBodyPart),
match_id, h_team, a_team, h_goals, a_goals, date, player_assisted, lastAction
```

**`rostersData` player object:**

```
id, player_id, player, position, positionOrder, time (minutes),
goals, own_goals, shots, xG, assists, xA, key_passes,
xGChain, xGBuildup, yellow_card, red_card, roster_in, roster_out, team_id, h_a
```

**`datesData` fixture object** (team/league page):

```
id, isResult (bool), datetime,
h: { id, title, short_title }, a: { id, title, short_title },
goals: { h, a }, xG: { h, a }, forecast: { w, d, l }
```

---

### 3.6 Fotmob  (enrichment: UCL xG, ratings/lineups fallback) — ⚠️ unofficial

- **Base URL:** `https://www.fotmob.com/api`
- **Auth:** none, **but** `GET /matchDetails` now rejects requests without a valid `x-mas` header (a base64 blob the site's obfuscated JS computes per request; also seen as `x-fm-req`). Options: (a) run a maintained wrapper that regenerates it, (b) load the match page in a headless browser and capture the XHR, (c) accept periodic breakage. This is the single biggest reason Fotmob is enrichment-only.
- **Rate limit:** none published; self-throttle to ~1 req / 3–5 s and cache aggressively.
- **Ids:** LaLiga league `87`, UCL league `42`, Real Madrid team `8633`, Barcelona team `8634` (resolve/verify via `/api/leagues?id=87` and the team pages).

**Endpoints**

| Need | Request |
|---|---|
| Matches on a date | `GET /api/matches?date=20260830` |
| League fixtures/table | `GET /api/leagues?id=87&type=league` |
| Match everything | `GET /api/matchDetails?matchId={id}` (needs `x-mas`) |

**`matchDetails` top-level keys** (verified sample): `matchFacts, liveticker, superlive, stats, playerStats, shotmap, lineup, table, h2h, momentum, highlightStories`.

**`matchFacts.events.events[]` element** (verified sample):

```json
{
  "type": "Goal",                       // Goal | Card | Substitution | AddedTime | Half
  "time": 8, "overloadTime": null,      // overloadTime = added minutes
  "eventId": 13949734,
  "player": { "id": 517767, "name": "Francisco Arancibia" },
  "isHome": true,
  "ownGoal": null,
  "goalDescription": null,              // "Penalty" etc.
  "assistStr": null, "assistPlayerId": null,
  "newScore": [1, 0],
  "card": "Yellow",                     // on Card events
  "swap": [ { "name": "...", "id": "1334883" }, { "name": "...", "id": "..." } ]   // on Substitution
}
```
`matchFacts.playerOfTheMatch`: `{ id, name:{firstName,lastName,fullName}, teamId, rating:{num:"9.3"}, minutesPlayed, stats:[…] }`.

**`lineup.homeTeam` / `.awayTeam`** (verified sample): `{ id, name, formation:"4-2-3-1", coach, averageStarterAge, starters:[…], subs:[…] }`; each starter:

```json
{
  "id": 1249298, "name": "Patrick Zubczuk",
  "shirtNumber": "1", "positionId": 11, "usualPlayingPositionId": 0,
  "horizontalLayout": { "x": 0.1, "y": 0.5 },
  "verticalLayout": { "x": 0.5, "y": 0.1 },
  "performance": { "rating": 5.7 },
  "firstName": "Patrick", "lastName": "Zubczuk"
}
```

**`playerStats[playerId]`** (verified sample): `{ name, id, optaId, teamId, teamName, isGoalkeeper, shirtNumber, positionId, usualPosition, stats:[ { title:"Top stats", key:"top_stats", stats:{ "FotMob rating":{stat:{value:5.77}}, "Minutes played":{...}, "Goals":{...}, "Assists":{...}, "Accurate passes":{stat:{value:26,total:34}}, "Chances created":{...} } }, { title:"Attack", ... }, ... ] }`.

**`shotmap.shots[]`** (structure): `{ id, eventType, teamId, playerId, playerName, x, y, min, minAdded, isBlocked, isOnTarget, expectedGoals, expectedGoalsOnTarget, shotType, situation, period, isOwnGoal, onGoalShot:{x,y,zoomRatio} }`.

---

### 3.7 Sofascore  (last-resort ratings/xG fallback) — ⚠️ unofficial

- **Base URL:** `https://api.sofascore.com/api/v1`
- **Auth:** none, but Cloudflare blocks plain `requests`/`curl` (TLS fingerprint) → need `curl_cffi` "impersonate" or a browser; datacenter IPs (our Coolify host) are often blocked outright. Rate limiting is aggressive.
- **Ids:** LaLiga `uniqueTournament=8`, UCL `uniqueTournament=7`, Real Madrid team `2829`, Barcelona team `2817`. Season id per competition via `GET /unique-tournament/8/seasons`.

**Endpoints:** `GET /event/{id}` · `/event/{id}/incidents` · `/event/{id}/lineups` · `/event/{id}/statistics` · `/event/{id}/best-players` · `/event/{id}/shotmap` · `/sport/football/scheduled-events/{YYYY-MM-DD}` · `/unique-tournament/{id}/season/{sid}/standings/total`.

**`/event/{id}/incidents` → `incidents[]`** (verified sample — types seen: `period`, `substitution`, `injuryTime`, `card`, `goal`, `varDecision`):

```json
{
  "incidentType": "card",              // goal | card | substitution | period | injuryTime | varDecision
  "incidentClass": "yellow",           // goal: regular|penalty|ownGoal ; card: yellow|red|yellowRed
  "time": 45, "addedTime": 1,
  "isHome": false,
  "player": { "id": 1065588, "name": "Diego Gómez", "shortName": "D. Gómez", "position": "M", "jerseyNumber": "25" },
  "playerIn": { ... }, "playerOut": { ... },   // substitution only
  "homeScore": 1, "awayScore": 1,              // goal only (running score)
  "reason": "Foul"                              // card only
}
```

**`/event/{id}/lineups`**: `{ confirmed, home:{ formation:"4-3-3", players:[ { player:{ id, name, jerseyNumber, position }, shirtNumber, substitute, captain, statistics:{ rating, minutesPlayed, goals, goalAssist, totalPass, accuratePass, expectedGoals, expectedAssists, touches, keyPass } } ] }, away:{…} }`.

---

### 3.8 StatsBomb open data  (future / training only — not MVP)

- **Access:** raw files on GitHub — `https://raw.githubusercontent.com/statsbomb/open-data/master/data/…` (`competitions.json`, then `matches/{compId}/{seasonId}.json`, `events/{matchId}.json`, `lineups/{matchId}.json`, `three-sixty/{matchId}.json`). Wrappers: `statsbombpy` (Python), `StatsBombR`.
- **Licence:** StatsBomb user agreement (free, non-commercial, attribution). Confirm before shipping anything derived.
- **Coverage (verified `competitions.json`):** La Liga **2004/05–2020/21** only (Barcelona-centric, plus full 2015/16); Champions League finals & older seasons to **2018/19**; recent tournaments up to Euro 2024 / Copa América 2024 / Bundesliga 2023/24. **Nothing for 2025/26 or 2026/27.**
- **Verdict:** irrelevant to the live product. Keep as a labelled dataset for a future xG/ratings model.

---

## 4. Polling plan (inside free limits)

Cadence lives in `packages/shared/src/index.ts` `POLL`. Two regimes: **idle** (no tracked match in progress) and **live** (a Madrid or Barça match is on).

### 4.1 Idle — no tracked match today
Cron twice a day (`0 6,18 * * *`, matches `POLL.idleCron`):

| Source | Calls per run | Runs/day | Calls/day |
|---|---|---|---|
| football-data.org — `PD` + `CL` matches | 2 | 2 | 4 |
| football-data.org — `PD` + `CL` standings | 2 | 2 | 4 |
| football-data.org — `PD` scorers | 1 | 1 | 1 |
| TheSportsDB — `eventsnext` ×2 teams | 2 | 2 | 4 |
| TheSportsDB — `lookuptable` ×2 comps | 2 | 1 | 2 |
| OpenLigaDB — `getlastchangedate` + `getmatchdata/la1` if changed | 1–2 | 2 | ~3 |
| API-Football — **nothing** (or 1 fixture sync/week) | 0 | — | 0 |
| **Total idle day** | | | **~22 requests**, spread across 4 providers |

Everything is 1–2 orders of magnitude below the limits. API-Football's 100/day budget is untouched on idle days.

### 4.2 Match day — one tracked match (~2 h window)
Pre-match from **T-90 min**, live loop every 60 s (`POLL.liveSeconds`), one post-match sweep.

| Phase | Source · endpoint | Cadence | Calls |
|---|---|---|---|
| Pre-match | API-Football `/fixtures/lineups` | every 15 min T-90→T-0 | ~4 |
| Pre-match | API-Football `/fixtures?id=` (confirm status/XI) | 2× near KO | 2 |
| Pre-match | football-data.org `/matches/{id}` | every 15 min | ~6 |
| **Live** | TheSportsDB `livescore.php` | 60 s × ~120 min | **~120** |
| **Live** | TheSportsDB `lookuptimeline.php` | every 3 min | ~40 |
| **Live** | API-Football `/fixtures?id=` + `/fixtures/events` | every 12 min (2 calls) | ~20 |
| **Live** | football-data.org `/matches/{id}` | every 5 min | ~24 |
| Post-FT | API-Football `/fixtures/events` | 2 sweeps (FT, FT+2h) | 2 |
| Post-FT | API-Football `/fixtures/lineups` | 1 | 1 |
| Post-FT | API-Football `/fixtures/players` | 3 (ratings settle) | 3 |
| Post-FT | API-Football `/fixtures/statistics` | 2 | 2 |
| Post-FT | API-Football `/standings` ×2 comps | 1 each | 2 |
| Post-FT | Understat (LaLiga) **or** Fotmob `matchDetails` (UCL) | 1–2 | ~2 |

**Per-provider totals for a one-match day:**

| Provider | Calls | vs limit |
|---|---|---|
| **API-Football** | **~38** | of 100/day — OK |
| TheSportsDB | ~165 | 30/min cap; spread out fine (peak ~1.5/min) |
| football-data.org | ~55 | 10/min cap; peak well under |
| Fotmob / Understat | ~2 | n/a |

### 4.3 Worst case — both teams play the same day (staggered kickoffs)
Two match windows. TheSportsDB and football-data.org scale linearly and stay legal. **API-Football would hit ~76 of 100** — still fits, but thin. Mitigation baked into the worker:
- Widen the API-Football live cadence to 20 min on double-match days.
- Drop `/fixtures/players` post-match polls from 3 → 2.
- If a 3rd tracked match lands in one UTC day (rare: LaLiga + midweek UCL overlap never puts both teams on the same calendar day, but a rescheduled game could), **skip API-Football live entirely** and take lineups/ratings from Fotmob, spending API-Football only on one post-match `/fixtures/events` + `/fixtures/players` sweep (~6 calls).

### 4.4 Rough monthly request count (2 teams)
~2.3 tracked match-days/week → ~10/month. `10 match-days × ~38 + 20 idle-days × ~2 = ~420 API-Football requests/month` (of a ~3,000/month-equivalent ceiling). TheSportsDB ~2,000/month, football-data.org ~1,700/month — both trivial against per-minute-only limits. **Comfortably free.**

---

## 5. What has NO viable free source

| Data | Why | Paid path (upgrade only) |
|---|---|---|
| **Player heatmaps / touch maps** | Only Fotmob (`/api/data/…` player heatmap) and Sofascore (`/event/{id}/player/{pid}/heatmap`) have it, both unofficial & fragile; nothing in a ToS-clean free tier | Sofascore/Fotmob data resellers; StatsBomb; Opta/StatsPerform |
| **"Official" player ratings** | No such thing exists — every rating (API-Football, FotMob, Sofascore, WhoScored) is a proprietary model. Free = pick one and label it | — (all are third-party models) |
| **Live xG for UCL from a clean source** | Understat has no UCL; API-Football team xG is inconsistent for UCL; only Fotmob/Sofascore shotmaps cover it, unofficially | StatsBomb, Opta, Stats Perform |
| **Advanced metrics** (PPDA, packing, xT, progressive carries, field tilt) | Understat gives PPDA for **LaLiga only**; nothing free for UCL or the rest | StatsBomb, Opta |
| **Predicted / probable line-ups pre-match** | No free source is reliable; Fotmob shows them but behind the `x-mas` wall and often wrong | Sportmonks, various |
| **Shot freeze-frames / StatsBomb 360** | Open data is historical; current season is enterprise | StatsBomb |
| **Referee assignments in advance, xG-based win probability, momentum** (nice-to-haves) | Only unofficial (Fotmob `momentum`, Sofascore `graph`) | — |

For the MVP, treat heatmaps, advanced metrics and predicted line-ups as **out of scope**; xG is "best-effort, LaLiga via Understat, UCL via Fotmob if it's up".

---

## 6. Field mapping → Supabase

Target tables from `supabase/migrations/0001_init.sql`. IDs in `competitions`/`teams`/`seasons` are our own slugs (`laliga`, `ucl`, `real-madrid`, `barcelona`, `2026-27`); external ids go in the `source_ids` jsonb. Keys used in `source_ids`: `footballData`, `apiFootball`, `theSportsDb`, `openLigaDb`, `fotmob`, `sofascore`, `understat`.

### 6.1 `competitions`

| Column | football-data.org | API-Football | TheSportsDB | OpenLigaDB |
|---|---|---|---|---|
| `id` (slug) | — (`PD`→`laliga`, `CL`→`ucl`) | — | — | — |
| `name` | `competition.name` | `league.name` | `strLeague` | `leagueName` |
| `short_name` | `competition.code` | `league.name` abbrev | — | `leagueShortcut` |
| `type` | `competition.type` (`LEAGUE`→`league`) | `league.type` | — | — |
| `country` | `area.name` | `league.country` | `strCountry` | — |
| `source_ids` | `{footballData:"PD", ...id 2014}` | `{apiFootball:140}` | `{theSportsDb:"4335"}` | `{openLigaDb:"la1"}` |

Fixed values: `laliga` → `{footballData:"PD"/2014, apiFootball:140, theSportsDb:"4335", openLigaDb:"la1", fotmob:87, sofascore:8, understat:"La_liga"}`; `ucl` → `{footballData:"CL"/2001, apiFootball:2, theSportsDb:"4480", fotmob:42, sofascore:7}`.

### 6.2 `seasons`
Single row `{ id:"2026-27", start_date, end_date, is_current:true }`. `start_date`/`end_date` from football-data `season.startDate`/`season.endDate` on any `PD` response.

### 6.3 `teams`

| Column | football-data.org | API-Football | TheSportsDB | OpenLigaDB | Fotmob | Sofascore |
|---|---|---|---|---|---|---|
| `id` (slug) | — | — | — | — | — | — |
| `name` | `homeTeam.name` | `teams.home.name` | `strHomeTeam` | `team1.teamName` | `lineup.homeTeam.name` | `event.homeTeam.name` |
| `short_name` | `.shortName` | — | `strTeamShort` | `team1.shortName` | — | `homeTeam.shortName` |
| `tla` | `.tla` | — | — | — | — | `homeTeam.nameCode` |
| `crest_url` | `.crest` | `teams.home.logo` | `strHomeTeamBadge` | `team1.teamIconUrl` | — | — |
| `source_ids` | `{footballData:86}` (RMA) / `81` (BAR) | `{apiFootball:541/529}` | `{theSportsDb:"133738"/"133739"}` | `{openLigaDb:<teamId>}` | `{fotmob:8633/8634}` | `{sofascore:2829/2817}` |

### 6.4 `fixtures`

| Column | football-data.org `/matches` | API-Football `/fixtures` | TheSportsDB `eventsnext/season` | OpenLigaDB `getmatchdata` |
|---|---|---|---|---|
| `competition_id` | map `competition.code` | map `league.id` | map `idLeague` | `la1`→`laliga` |
| `season_id` | `"2026-27"` (const) | from `league.season` | `strSeason` `2026-2027`→`2026-27` | `leagueSeason`→`2026-27` |
| `matchday` | `matchday` | `league.round` (parse int) | `intRound` | `group.groupOrderID` |
| `stage` | `stage` (+ `group`) | `league.round` (text) | — | `group.groupName` |
| `home_team_id` / `away_team_id` | map `homeTeam.id`/`awayTeam.id` | map `teams.home.id`/`away.id` | map `idHomeTeam`/`idAwayTeam` | map `team1.teamId`/`team2.teamId` |
| `kickoff_at` | `utcDate` | `fixture.date` (ISO w/ tz) | `strTimestamp` (assume UTC) | `matchDateTimeUTC` |
| `venue` | `venue` (`/matches/{id}`) | `fixture.venue.name` (+`city`) | `strVenue` | `location.locationStadium` (often null) |
| `status` | `status` → map ↓ | `fixture.status.short` → map ↓ | `strStatus` → map ↓ | `matchIsFinished` → `FINISHED`/`SCHEDULED` |
| `minute` | `minute` (`/matches/{id}`, paid detail) | `fixture.status.elapsed` (+`extra`) | from `livescore.php` `strProgress` | — |
| `home_score` / `away_score` | `score.fullTime.home/away` | `goals.home`/`goals.away` | `intHomeScore`/`intAwayScore` | `matchResults[?resultName="Endergebnis"].pointsTeam1/2` |
| `home_score_ht` / `away_score_ht` | `score.halfTime.home/away` | `score.halftime.home/away` | — (from timeline) | `matchResults[?resultName="Halbzeit"]…` |
| `source_ids` | `{footballData:<id>}` | `{apiFootball:<fixture.id>}` | `{theSportsDb:<idEvent>, apiFootball:<idAPIfootball>}` | `{openLigaDb:<matchID>}` |
| `last_synced_at` | now() | now() | now() | `lastUpdateDateTime` |

**Status mapping → `MatchStatus`** (`SCHEDULED | LIVE | PAUSED | FINISHED | POSTPONED | SUSPENDED`):

| our value | football-data | API-Football `status.short` | TheSportsDB `strStatus` |
|---|---|---|---|
| `SCHEDULED` | `SCHEDULED`, `TIMED` | `NS`, `TBD` | `NS`, `Not Started`, `""` |
| `LIVE` | `IN_PLAY` | `1H`, `2H`, `ET`, `BT`, `LIVE`, `P` | `1H`, `2H`, `ET`, `LIVE`, `"45"`, `"90"` |
| `PAUSED` | `PAUSED` | `HT` | `HT` |
| `FINISHED` | `FINISHED` | `FT`, `AET`, `PEN` | `FT`, `AET`, `Match Finished` |
| `POSTPONED` | `POSTPONED` | `PST` | `PPD`, `Postp.` |
| `SUSPENDED` | `SUSPENDED` | `SUSP`, `INT`, `ABD` | `SUSP`, `ABD`, `CANC` |

### 6.5 `match_events`

`type` ∈ `MatchEventType` (`GOAL, OWN_GOAL, PENALTY_GOAL, PENALTY_MISS, YELLOW, SECOND_YELLOW, RED, SUB, VAR, PERIOD, CORNER, KEY_PASS, CHANCE`).

| Column | API-Football `/fixtures/events` | TheSportsDB `lookuptimeline` | Fotmob `matchFacts.events` | Sofascore `/incidents` | OpenLigaDB `goals[]` |
|---|---|---|---|---|---|
| `type` | `type`+`detail` → map ↓ | `strTimeline`+`strTimelineDetail` → map ↓ | `type`+`goalDescription`+`ownGoal`+`card` → map ↓ | `incidentType`+`incidentClass` → map ↓ | always a goal; `isOwnGoal`→`OWN_GOAL`, `isPenalty`→`PENALTY_GOAL`, else `GOAL` |
| `minute` | `time.elapsed` | `intTime` | `time` | `time` | `matchMinute` |
| `minute_extra` | `time.extra` | — | `overloadTime` | `addedTime` | — |
| `team_id` | map `team.id` | map `idTeam` (or `strHome`) | `isHome` → home/away team | `isHome` → home/away team | derive from `scoreTeam1/2` delta |
| `player_name` | `player.name` | `strPlayer` | `player.name` / `fullName` | `player.name` (or `playerIn`) | `goalGetterName` |
| `player_id` | `player.id` | `idPlayer` | `player.id` / `playerId` | `player.id` | `goalGetterID` |
| `assist_name` | `assist.name` | `strAssist` | `assistStr` | (n/a in incidents) | — |
| `detail` | `detail` | `strTimelineDetail` / `strComment` | `goalDescription` | `reason` (cards) | `comment` |
| `sort_key` | index in array | `idTimeline` | index | index | `goalID` |
| `source` | `"apiFootball"` | `"theSportsDb"` | `"fotmob"` | `"sofascore"` | `"openLigaDb"` |
| `source_event_id` | none → `fixture:elapsed:type:player` hash | `idTimeline` | `eventId` | none → hash | `goalID` |

**Type mapping:**

| our `type` | API-Football | TheSportsDB | Fotmob | Sofascore |
|---|---|---|---|---|
| `GOAL` | `Goal`/`Normal Goal` | `Goal`/`Normal Goal` | `Goal`, `ownGoal` falsy, no "Penalty" | `goal`/`regular` |
| `PENALTY_GOAL` | `Goal`/`Penalty` | `Goal`/`Penalty` | `Goal` + `goalDescription:"Penalty"` | `goal`/`penalty` |
| `OWN_GOAL` | `Goal`/`Own Goal` | `Goal`/`Own Goal` | `Goal` + `ownGoal:true` | `goal`/`ownGoal` |
| `PENALTY_MISS` | `Var`/`Penalty cancelled` or `Missed Penalty` | `Missed Penalty` | `Penalty missed` | `inGamePenalty`/`missed` |
| `YELLOW` | `Card`/`Yellow Card` | `Card`/`Yellow Card` | `Card`/`Yellow` | `card`/`yellow` |
| `SECOND_YELLOW` | `Card`/`Second Yellow card` | `Card`/`Second Yellow` | `Card`/`YellowRed` | `card`/`yellowRed` |
| `RED` | `Card`/`Red Card` | `Card`/`Red Card` | `Card`/`Red` | `card`/`red` |
| `SUB` | `subst` | `subst` | `Substitution` (`swap[0]`=out,`swap[1]`=in) | `substitution` |
| `VAR` | `Var` | — | (in events as `AddedTime`? no) | `varDecision` |
| `PERIOD` | — | — | `Half` | `period` |

### 6.6 `lineups`

| Column | API-Football `/fixtures/lineups` | Fotmob `lineup` | TheSportsDB `lookuplineup` | Sofascore `/lineups` |
|---|---|---|---|---|
| `team_id` | map `team.id` | map `homeTeam.id` | map `idTeam` (or `strHome`) | map `home`/`away` |
| `formation` | `formation` | `homeTeam.formation` | **null** (no field) | `home.formation` |
| `is_starting` | in `startXI` vs `substitutes` | in `starters` vs `subs` | `strSubstitute=="No"` | `!players[].substitute` |
| `player_id` | `player.id` | `id` | `idPlayer` | `player.id` |
| `player_name` | `player.name` | `name` | `strPlayer` | `player.name` |
| `shirt_number` | `player.number` | `shirtNumber` | `intSquadNumber` | `player.jerseyNumber` / `shirtNumber` |
| `position` | `player.pos` (G/D/M/F) | `positionId` (map) | `strPosition` (free text) | `player.position` |
| `grid` | `player.grid` ("4:2") | `horizontalLayout.x/y` → `"x,y"` | — | `player.horizontalLayout`? → derive |
| `source` | `"apiFootball"` | `"fotmob"` | `"theSportsDb"` | `"sofascore"` |

Also capture `coach` (API-Football `coach.name`, Fotmob `homeTeam.coach`) — no column yet; stash in a future `fixtures.meta` or extend `lineups`.

### 6.7 `player_match_stats`

| Column | API-Football `/fixtures/players` `statistics[0]` | Fotmob `playerStats[pid]` | Sofascore `/lineups` `players[].statistics` | Understat `rostersData` |
|---|---|---|---|---|
| `team_id` | map parent `team.id` | map `teamId` | map home/away | map `team_id` |
| `player_id` | `player.id` | `id` | `player.id` | `player_id` |
| `player_name` | `player.name` | `name` | `player.name` | `player` |
| `minutes` | `games.minutes` | `stats[].stats["Minutes played"].stat.value` | `minutesPlayed` | `time` |
| `rating` | `games.rating` (string→numeric) | `stats["FotMob rating"].stat.value` | `rating` | — (no rating) |
| `goals` | `goals.total` | `"Goals"` | `goals` | `goals` |
| `assists` | `goals.assists` | `"Assists"` | `goalAssist` | `assists` |
| `shots` | `shots.total` | `"Total shots"` | `totalShots`/`shotsTotal` | `shots` |
| `shots_on` | `shots.on` | `"Shots on target"` | `onTargetScoringAttempt` | — |
| `passes` | `passes.total` | `"Touches"`/`"Accurate passes".total` | `totalPass` | — |
| `pass_accuracy` | `passes.accuracy` (`"44%"`→44) | `"Accurate passes"` value/total → % | `accuratePass`/`totalPass` | — |
| `key_passes` | `passes.key` | `"Chances created"` | `keyPass` | `key_passes` |
| `tackles` | `tackles.total` | `"Tackles won"` | `totalTackle` | — |
| `duels_won` | `duels.won` | `"Duels won"` | `duelWon` | — |
| `dribbles` | `dribbles.success` | `"Successful dribbles"` | `wonContest` | — |
| `touches` | — | `"Touches"` | `touches` | — |
| `xg` | (from `/fixtures/statistics`, team-level only) | `"Expected goals (xG)"` if present | `expectedGoals` | `xG` |
| `xa` | — | `"Expected assists (xA)"` if present | `expectedAssists` | `xA` |
| `yellow` / `red` | `cards.yellow` / `cards.red` | from events | `yellowCards`/`redCards` | `yellow_card`/`red_card` |
| `source` | `"apiFootball"` | `"fotmob"` | `"sofascore"` | `"understat"` |
| `raw` | whole `statistics[0]` | whole entry | whole `statistics` | whole roster entry |

Because ratings differ by provider, the `unique(fixture_id, player_name, source)` constraint is right — keep one row per source and let the UI pick.

### 6.8 `standings`

| Column | football-data.org `/standings` | API-Football `/standings` | TheSportsDB `lookuptable` | OpenLigaDB `getbltable` |
|---|---|---|---|---|
| `competition_id` | map `competition.code` | map `league.id` | map `l` param | `la1`→`laliga` |
| `season_id` | `"2026-27"` | from `league.season` | `strSeason`→`2026-27` | `2026-27` |
| `team_id` | map `table[].team.id` | map `team.id` | map `idTeam` | map `teamInfoId` |
| `team_name` | `team.name` | `team.name` | `strTeam` | `teamName` |
| `position` | `position` | `rank` | `intRank` | array index +1 |
| `played` | `playedGames` | `all.played` | `intPlayed` | `matches` |
| `won` / `draw` / `lost` | `won`/`draw`/`lost` | `all.win`/`all.draw`/`all.lose` | `intWin`/`intDraw`/`intLoss` | `won`/`draw`/`lost` |
| `goals_for` / `goals_against` | `goalsFor`/`goalsAgainst` | `all.goals.for`/`all.goals.against` | `intGoalsFor`/`intGoalsAgainst` | `goals`/`opponentGoals` |
| `goal_diff` | `goalDifference` | `goalsDiff` | `intGoalDifference` | `goalDiff` |
| `points` | `points` | `points` | `intPoints` | `points` |
| `form` | `form` (often null) | `form` (`"LWDLW"`) | `strForm` | — |
| `source` | `"footballData"` | `"apiFootball"` | `"theSportsDb"` | `"openLigaDb"` |

For **CL league phase**, football-data returns one 36-row `TOTAL` table (`group:"LEAGUE_STAGE"`); API-Football returns it under `league.standings[0]`. Store all 36 rows; the UI slices the top 8 / 9–24 / 25–36 cut lines itself.

---

## 7. API keys to register

| Provider | Needed? | Sign-up | What you get | Env var (per `docs/architecture.md`) |
|---|---|---|---|---|
| **football-data.org** | **Yes — do first** | https://www.football-data.org/client/register | Free token, email-verified, instant. 10 req/min, PD+CL included | `FOOTBALL_DATA_TOKEN` → header `X-Auth-Token` |
| **API-Football** (api-sports.io **direct**, NOT RapidAPI) | **Yes** | https://dashboard.api-football.com/register | Free key, 100 req/day, 10/min, all endpoints. **Check `?season=2026` returns data before relying on it** | `API_FOOTBALL_KEY` → header `x-apisports-key` |
| **TheSportsDB** | Optional now, recommended later | Test key `123` works immediately (no signup). Personal key = create account at https://www.thesportsdb.com/ then subscribe (Premium $9/mo) → key on profile page | Free: 30 req/min, v1 only, `livescore.php` included. Paid: v2 + 2-min livescore + private key | `THESPORTSDB_KEY` (default `"123"`) → URL path segment |
| **OpenLigaDB** | No key | — | Fully open, no auth, no quota | — |
| **Understat** | No key | — | Public HTML; scrape responsibly (1 req/match, cache) | — |
| **Fotmob** | No key | — | Unofficial; must generate `x-mas` header client-side | — |
| **Sofascore** | No key | — | Unofficial; needs TLS impersonation; datacenter IPs often blocked | — |
| **StatsBomb open data** | No key | — | GitHub raw; CC-BY-NC user agreement; historical only | — |

Minimum to build the MVP: **`FOOTBALL_DATA_TOKEN` + `API_FOOTBALL_KEY`**, with `THESPORTSDB_KEY="123"` as a zero-signup start.

---

## 8. Risks & watch-list

- **API-Football free-tier season lock.** The one unverifiable claim. If `season=2026` comes back empty on the free plan, the plan degrades to: lineups + ratings from **Fotmob** (accept `x-mas` fragility), timeline from **TheSportsDB**, everything else unchanged. Test on day one.
- **TheSportsDB timeline latency.** Observed: match finished, only first-half events present next day. Never treat TheSportsDB as the sole timeline for a finished match — reconcile against API-Football's `/fixtures/events` in the post-match sweep.
- **Fotmob `x-mas` header.** Broke third-party scrapers multiple times in 2024–2026. Pin a wrapper version, monitor, and have the worker fall back to Sofascore or "no xG for this UCL match" gracefully.
- **Sofascore IP blocking.** The Coolify host is a datacenter IP; Sofascore may 403 everything. Don't design any required path through it.
- **UCL 2026/27 fixtures.** As of 2026-08-27 the league-phase fixtures were freshly drawn; TheSportsDB/OpenLigaDB hadn't loaded them. football-data.org `CL` and API-Football `league=2` are the reliable UCL fixture sources — verify both populate the league phase within a few days of the draw.
- **football-data "delayed".** Fine for calendar and standings; it is *not* a live-score source. All live minute-by-minute comes from TheSportsDB `livescore.php` + API-Football.
- **Rating provenance.** If the UI ever shows a rating, label its source. There is no canonical number.

---

## 9. Sources (all consulted 2026-08-27)

- API-Football — getting started / rate limits: https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide · https://www.api-football.com/news/post/how-ratelimit-works · docs: https://www.api-football.com/documentation-v3 · pricing: https://www.api-football.com/pricing (all Cloudflare-gated to automated fetches; figures cross-checked below)
- API-Football sample responses (mirrors): https://github.com/fabricatorsltd/api-sports (`api-specs/football/*`) · https://raw.githubusercontent.com/newyeti/footy-sync/main/data/fixture_events.json · https://github.com/kecoli2/SoccerXApi (`Api-Football.postman_collection.json`)
- API-Football 2026 tier write-ups: https://highlightly.net/blogs/best-football-apis-in-2026 · https://www.thestatsapi.com/blog/thestatsapi-vs-api-football · https://www.thestatsapi.com/blog/free-football-api-alternatives · https://freeapihub.com/apis/api-football
- football-data.org — docs: https://www.football-data.org/documentation/quickstart · policies (rate limits): https://docs.football-data.org/general/v4/policies.html · auth: https://docs.football-data.org/general/v4/coding/java.html · pricing: https://www.football-data.org/pricing · lookup tables (competition codes/ids): https://docs.football-data.org/general/v4/lookup_tables.html
- football-data.org free-tier analysis: https://www.thestatsapi.com/blog/football-data-org-free-tier-limits-2026 · https://www.thestatsapi.com/blog/thestatsapi-vs-football-data-org
- football-data.org sample JSON: https://raw.githubusercontent.com/eduardoferreiradev/football-data-pipeline/main/data/sample/football_data_bsa_matches_sample.json · https://raw.githubusercontent.com/alexanderjamesrohrig/yekaterinburg/main/shared/JSON/football-data_standings.json
- TheSportsDB — docs: https://www.thesportsdb.com/documentation · free API page: https://www.thesportsdb.com/free_sports_api · pricing: https://www.thesportsdb.com/pricing · forum rate-limit threads: https://www.thesportsdb.com/forum_topic.php?t=5749 · https://www.thesportsdb.com/forum_topic.php?t=5762
- TheSportsDB — live calls made this session: `lookuptable.php?l=4335&s=2025-2026`, `eventsnext.php?id=133738`, `eventslast.php?id=133738`, `lookuptimeline.php?id=2506175`, `lookuplineup.php?id=2506175`, `eventsseason.php?id=4480&s=2026-2027`, `livescore.php?s=Soccer`, `search_all_leagues.php?c=Europe&s=Soccer` (base `https://www.thesportsdb.com/api/v1/json/123/`)
- OpenLigaDB — Swagger: https://api.openligadb.de/index.html · live calls: `getavailableleagues`, `getavailableleagues/2026`, `getmatchdata/la1/2026`, `getmatchdata/la1/2026/3`, `getbltable/la1/2026`, `getmatchdata/{cl,ucl,uefacl}/2026`
- Understat — scraping libraries/docs: https://understat.readthedocs.io/en/latest/classes/understat.html · https://collinb9.github.io/understatAPI/ · https://jaseziv.github.io/worldfootballR/articles/extract-understat-data.html · https://footballdotpy.medium.com/scrape-a-whole-leagues-worth-of-shot-and-xg-data-from-understat-75f1f112e874
- Fotmob (unofficial) — `x-mas` / `x-fm-req` header: https://github.com/probberechts/soccerdata/issues/742 · wrappers: https://github.com/bjrsti/fotmob · https://www.npmjs.com/package/@max-xoo/fotmob · https://github.com/federicorabanos/LanusStats/blob/main/LanusStats/fotmob.py · sample `matchDetails` JSON: https://raw.githubusercontent.com/enzoftware/futbolbigdata/main/data/fotmob/fotmob_5169244_raw.json
- Sofascore (unofficial) — endpoint reference: https://github.com/pseudo-r/Public-Sofascore-API · official "no API" FAQ: https://sofascore.helpscoutdocs.com/article/129-sports-data-api-availability · sample `incidents` JSON: https://raw.githubusercontent.com/bnjmnnnn/Mundial_2026_data/main/data/raw/incidents/incidents_15186891.json
- StatsBomb open data — repo: https://github.com/statsbomb/open-data · competitions list: https://raw.githubusercontent.com/statsbomb/open-data/master/data/competitions.json · Python: https://github.com/statsbomb/statsbombpy
- Rejected-source checks: Sportmonks free tier — https://www.sportmonks.com/blogs/free-vs-paid-football-apis-choosing-the-right-option-for-your-project/ · general 2026 landscape — https://footyapps.com/guide/free-football-apis
