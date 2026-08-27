# Backend workstream — handoff

Owner: ingest worker (`apps/ingest`) + `supabase/`. Written for the frontend /
schema owner and whoever runs the deploy. Nothing here blocks the current build:
`npm run typecheck -w @motm/ingest` passes.

## Dependencies

No new npm dependencies were needed. The ingest workspace still runs on exactly
what was pre-installed (`@supabase/supabase-js`, `croner`, `web-push`, `tsx`,
`typescript`, `@types/node`, `@types/web-push`). No scraping libs were added —
Understat/Fotmob xG is not implemented (see "Not implemented" below).

## `0002_ingest_additions.sql` (new, additive, idempotent)

`§6` of `docs/api-research.md` needs a few fields `0001` doesn't have. All columns
are nullable and guarded with `if not exists`; `0001` is untouched.

| Column | Table | Why |
|---|---|---|
| `home_team_name`, `away_team_name`, `home_team_crest`, `away_team_crest` | `fixtures` | We only mint `teams(id)` slugs for the two tracked clubs, so the opponent side of every fixture has **no `teams` row**. These keep the opponent's display identity inline so the PWA can render a match card straight from `fixtures` with no join. Populated by `syncFixtures` from football-data.org `homeTeam`/`awayTeam` (for both sides). |
| `detail_synced_at` | `fixtures` | Marks when the API-Football post-match sweep last ran for a fixture. Distinct from `last_synced_at`, which `liveLoop` bumps every minute. Drives the "run once + one ratings re-sweep" logic. |
| `coach` | `lineups` | `api-research.md §6.6` explicitly: *"Also capture coach … no column yet."* API-Football `/fixtures/lineups` returns `coach.name` per team; stored (denormalised) on each lineup row for that team. |

Run order: `0001_init.sql` → `0002_ingest_additions.sql` → `seed.sql`.

## Requests for `packages/shared` (read-only for this workstream)

`apps/ingest/src/lib/ids.ts` currently hard-codes data that would be cleaner in
`@motm/shared`. Not urgent — the worker is fully functional as-is.

1. **TheSportsDB ids.** Add `theSportsDb` to each entry:
   - `COMPETITIONS.laliga.theSportsDb = '4335'`, `COMPETITIONS.ucl.theSportsDb = '4480'`
   - `TEAMS['real-madrid'].theSportsDb = '133738'`, `TEAMS.barcelona.theSportsDb = '133739'`
2. **Season-string helper** (or just a second constant): TheSportsDB wants
   `'2026-2027'` where we use `'2026-27'`. `ids.ts` has `tsdbSeason()` locally.
3. If the OpenLigaDB / Fotmob / Sofascore fallbacks are ever built, their ids
   (`api-research.md §6.1/§6.3`) belong there too.

When these land in shared, delete the corresponding consts/helpers from `ids.ts`.

## What each job calls

| Job (cron) | Endpoints |
|---|---|
| `syncFixtures` (`0 6,18 * * *` + on boot) | football-data.org `GET /v4/competitions/{PD,CL}/matches?season=2026`; then per tracked team `GET /v1/.../eventsnext.php?id={tsdbTeamId}` (TheSportsDB) to fold `source_ids.theSportsDb` + `.apiFootball` (`idAPIfootball`) onto the matching fixture — **0 API-Football requests**. |
| `syncStandings` (`30 6,18 * * *`) | football-data.org `GET /v4/competitions/{PD,CL}/standings?season=2026`. Inserts a fresh `standings` snapshot per run (`captured_at`). CL = one 36-row `TOTAL` table, all rows stored. |
| `liveLoop` (`* * * * *`) | Per fixture that is LIVE/PAUSED or kicks off within ±2 h: football-data.org `GET /v4/matches/{id}` (score/status, primary); TheSportsDB `livescore.php?s=Soccer` (one shared call, fills minute + score gaps); TheSportsDB `lookuptimeline.php?id={idEvent}` (diff `match_events`, `source='theSportsDb'`). GOAL push fires on a score increase for the tracked fixture. **0 API-Football requests.** |
| `runDueMatchDetails` → `syncMatchDetail` (`*/5 * * * *`) | API-Football `GET /fixtures/lineups`, `/fixtures/events`, `/fixtures/players` (all `?fixture={id}`). Budget-guarded. |

Real per-source cadence is governed by cache TTLs in the adapters
(`cachedJson` + `http_cache`), tuned to `api-research.md §4.2`: `getMatch` 90 s,
`livescore` 50 s, `lookuptimeline` 150 s, football-data matches/standings 1 h,
API-Football events/fixture 600 s, players 1 h, lineups 6 h.

## API-Football daily budget — worst case

API-Football is **kept out of the live loop entirely** (the task's `liveLoop`
spec routes live score/events through football-data.org + TheSportsDB). It is
spent only by `syncMatchDetail`, per tracked fixture:

| Phase | Trigger | Requests |
|---|---|---|
| `lineups` | LIVE/PAUSED, ≥20 min past kickoff, no API-Football lineups yet | 1 (`/fixtures/lineups`) |
| `full` | fixture FINISHED, never enriched | 3 (`events` + `lineups` + `players`) |
| `full` (ratings re-sweep) | FINISHED, enriched >2 h ago and <5 h past kickoff — happens once | 3 |
| **per tracked fixture** | | **7** |

- One tracked team plays: **7 / day**
- Both Madrid **and** Barça play (staggered — `api-research.md §4.3` worst case): **14 / day**
- Pathological (a rescheduled 3rd tracked match in one UTC day): **21 / day**
- Idle day: **0 / day**

All far under the 100/day free cap. Hard stop: `API_FOOTBALL_DAILY_BUDGET = 75`
in `apps/ingest/src/lib/budget.ts`, enforced before every dispatch (and once more
inside `syncMatchDetail`) by summing today's `sync_runs` rows where
`source = 'api-football'`: successful runs contribute their recorded `items`
(request count, counted by attempt so over-counting is safe); a run that errored
before writing `items` is charged a flat 3. So a *persistent* failure (e.g. the
`§8` season-lock) trips the guard after ~25 attempts instead of burning the real
quota all afternoon. This is well below `§4.2`'s ~38/match-day estimate because
that number assumed API-Football live polling we don't do.

## Behavioural notes / limitations

- **`lineups` and `player_match_stats` are tracked-team-only.** Both have a
  `team_id` **NOT NULL** FK to `teams` and we only have slugs for Madrid & Barça,
  so opponent rows are dropped (the `0001` author evidently intended this —
  `standings` has `team_name NOT NULL` + nullable `team_id`, these tables don't).
  MOTM voting over our own XI still works. If opponent lineups/ratings are wanted
  later, a `0003` would need `alter … drop not null` on `team_id` + a
  `player_name`-style identity column, **or** seed opponent clubs into `teams`.
- **Goal-push latency.** Per the `liveLoop` spec, football-data.org is the score
  primary and it is *delayed* (not real-time); TheSportsDB `livescore.php` only
  fills when football-data has no number. Expect a goal notification ~1–4 min
  after the goal. For faster pushes, flip the primary to TheSportsDB `livescore`
  in `liveLoop.syncOne` (research `§2` actually recommends this; the task spec
  says football-data first, so that's what's implemented).
- **`match_events` holds one row per source.** `liveLoop` writes
  `source='theSportsDb'` rows live; `syncMatchDetail` writes `source='apiFootball'`
  rows post-match (the canonical timeline, `api-research.md §8`). The unique key
  is `(fixture_id, source, source_event_id)`, so the same goal can appear twice
  with different `source`. The UI should prefer `apiFootball` when present and
  fall back to `theSportsDb` for the still-live case.
- **API-Football fixture ids** come free from the TheSportsDB `eventsnext`
  cross-ref in `syncFixtures` (`idAPIfootball`). If a competition isn't loaded in
  TheSportsDB yet (UCL league phase right after the draw — `api-research.md §8`),
  `source_ids.apiFootball` stays empty and `syncMatchDetail` simply skips that
  fixture until the id appears. Seed fallback (`GET /fixtures?team=…`, 2 calls)
  is intentionally **not** wired, to keep idle-day API-Football spend at zero.
- **`cachedJson` gained an optional `assertOk` hook** (`apps/ingest/src/lib/http.ts`,
  additive, backward-compatible). API-Football returns quota/param failures as
  HTTP 200 with a populated `errors` object; `assertOk` throws on those so the
  bad body is never written to `http_cache`.
- **Verify on first live run** (can't test here — no keys/Supabase):
  football-data.org `GET /v4/matches/{id}` is assumed to return the match object
  at the top level (v4 flattened it from v2's `{head2head, match}`). If it's
  wrapped, adjust `getMatch`'s return type + `liveLoop.syncOne` step 1.
  Also confirm API-Football `?season=2026` returns data on the free key
  (`api-research.md §8` flags this as the one unverifiable claim).

## Not implemented (out of scope for these tasks)

- **`MATCHDAY` / `KICKOFF_SOON` notifications** — only `GOAL` was in scope.
  `notify.ts` would need a `pushKickoff` / `pushMatchday` sibling to `pushGoal`,
  driven off `fixtures.kickoff_at` in `liveLoop` (the ±2 h scan already loads the
  right rows).
- **xG** (`player_match_stats.xg` / `.xa`) — left `null`. `api-research.md §7` is
  "best-effort": Understat (LaLiga) and Fotmob (UCL) are both HTML-scrape /
  unofficial and need libs we didn't add.
- **`news`** — no source chosen in the research; table stays empty.
- **API-Football / TheSportsDB as standings & fixtures *fallbacks*** — adapters
  are typed and ready (`getStandings`, `getLeagueTable`, `getSeasonEvents`,
  `getLineup`) but not wired; football-data.org is the sole writer for those.
