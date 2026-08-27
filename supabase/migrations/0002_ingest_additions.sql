-- ManOfTheMatch — additive columns the ingest field mapping needs.
-- All nullable, all `if not exists` (idempotent). No changes to 0001.
-- Rationale lives in docs/handoff-backend.md.

-- fixtures --------------------------------------------------------------------
-- Only the two tracked teams get a `teams(id)` slug, so the *other* side of a
-- fixture has no teams row. Keep its display identity inline so the PWA can
-- render a match card straight from `fixtures` (api-research.md §6.3 / §6.4).
alter table fixtures add column if not exists home_team_name  text;
alter table fixtures add column if not exists away_team_name  text;
alter table fixtures add column if not exists home_team_crest text;
alter table fixtures add column if not exists away_team_crest text;

-- Post-match API-Football enrichment bookkeeping — distinct from the live
-- `last_synced_at` that liveLoop bumps every minute.
alter table fixtures add column if not exists detail_synced_at timestamptz;

-- lineups --------------------------------------------------------------------
-- api-research.md §6.6: "Also capture coach … no column yet." API-Football
-- `/fixtures/lineups` returns `coach.name` per team; stored per lineup row.
alter table lineups add column if not exists coach text;
