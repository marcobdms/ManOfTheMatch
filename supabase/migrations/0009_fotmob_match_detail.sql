-- Captura completa de Fotmob matchDetails (docs/plan-2026-08-29.md, Agente A
-- tarea 4). Poblado por `backend/src/jobs/syncMatchFacts.ts`, cadencia ~60s
-- (el CDN de Fotmob cachea 5min, no tiene sentido más rápido). Todo nullable
-- salvo claves — nunca inventamos un valor que Fotmob no dé.

-- Marca cuándo se hizo la pasada final de captura completa post-partido
-- (syncMatchFacts.ts) — evita repetir el barrido FINISHED en cada tick.
alter table fixtures add column if not exists detail_facts_synced_at timestamptz;

-- 1) Momentum: serie temporal, un punto por minuto de juego.
create table if not exists match_momentum (
  fixture_id uuid not null references fixtures(id) on delete cascade,
  minute     numeric(5,1) not null,          -- puede traer decimales (descuento)
  value      numeric(6,2) not null,          -- + equipo local domina, - visitante
  captured_at timestamptz not null default now(),
  primary key (fixture_id, minute)
);

-- 2) Stats de equipo: un par local/visitante por (periodo, grupo, título).
--    content.stats.Periods.{All,FirstHalf,SecondHalf}.stats[].stats[]
create table if not exists match_team_stats (
  id          uuid primary key default gen_random_uuid(),
  fixture_id  uuid not null references fixtures(id) on delete cascade,
  period      text not null,                 -- 'All' | 'FirstHalf' | 'SecondHalf'
  stat_group  text not null,                 -- 'Top stats' | 'Shots' | 'Expected goals (xG)' | 'Passes' | 'Defence' | 'Duels'
  stat_title  text not null,                 -- 'Ball possession', 'Big chances', 'Hit woodwork'...
  home_value  text,                          -- crudo tal cual lo da Fotmob (a veces "290 (81%)")
  away_value  text,
  sort_key    int not null default 0,
  updated_at  timestamptz not null default now(),
  unique (fixture_id, period, stat_group, stat_title)
);
create index if not exists match_team_stats_fixture_idx on match_team_stats (fixture_id, period);

-- 3) Player stats de Fotmob (independiente de `player_match_stats`, que es
--    de API-Football — fuentes distintas, no se pisan). content.playerStats.
create table if not exists match_player_stats_fotmob (
  id             uuid primary key default gen_random_uuid(),
  fixture_id     uuid not null references fixtures(id) on delete cascade,
  team_id        text references teams(id),
  fotmob_player_id text not null,
  player_name    text not null,
  rating         numeric(3,1),
  minutes_played int,
  touches        int,
  duels_won      int,
  duels_lost     int,
  passes_final_third text,                   -- Fotmob lo da ya formateado ("12/15")
  -- Portero (null para el resto):
  saves          int,
  goals_prevented numeric(4,2),
  xgot_faced     numeric(4,2),
  stats_raw      jsonb,                       -- `stats[].stats` completo, sin recortar
  shotmap        jsonb,                       -- disparos propios del jugador (subset de match_shots)
  updated_at     timestamptz not null default now(),
  unique (fixture_id, fotmob_player_id)
);
create index if not exists mpsf_fixture_idx on match_player_stats_fotmob (fixture_id);

-- 4) Disparos individuales. content.shotmap.shots[].
-- `match_shots` YA existe (creada por 0008_shot_events.sql, con datos reales
-- en producción y una unique en (fixture_id, source, source_shot_id)). Aquí
-- solo se añaden las columnas nuevas — nada de recrearla.
alter table match_shots add column if not exists fotmob_player_id text;
alter table match_shots add column if not exists is_from_inside_box boolean;
alter table match_shots add column if not exists shot_type text;

-- 5) Hechos del partido: una fila por fixture. content.matchFacts + extras.
create table if not exists match_facts (
  fixture_id       uuid primary key references fixtures(id) on delete cascade,
  potm_name        text,                       -- playerOfTheMatch
  potm_rating      numeric(3,1),
  stadium_name     text,
  stadium_city     text,
  stadium_capacity int,
  stadium_surface  text,
  referee_name     text,
  referee_stats    jsonb,                       -- stats de temporada del árbitro, tal cual
  attendance       int,
  insights         jsonb,                       -- content.matchFacts.insights[], frases ya redactadas
  top_players      jsonb,                       -- content.matchFacts.topPlayers
  attacking_zones  jsonb,                       -- content.attackingZones
  weather          jsonb,                       -- content.weather
  h2h              jsonb,                       -- content.h2h
  heatmap_url      text,
  source           text not null default 'fotmob',
  updated_at       timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array[
    'match_momentum','match_team_stats','match_player_stats_fotmob','match_shots','match_facts'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select using (true)', t || '_read', t);
  end loop;
end $$;
