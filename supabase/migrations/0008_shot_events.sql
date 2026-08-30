-- Disparos del partido (Fotmob shotmap) — palos y ocasiones, que ni
-- TheSportsDB ni API-Football dan. Tabla propia, no encaja en match_events
-- (coordenadas + xG, no "tipo + jugador + minuto").
create table if not exists match_shots (
  id               uuid primary key default gen_random_uuid(),
  fixture_id       uuid not null references fixtures(id) on delete cascade,
  team_id          text references teams(id),
  player_name      text,
  minute           int,
  minute_extra     int,
  event_type       text not null,      -- Goal | Miss | AttemptSaved
  situation        text,               -- RegularPlay | FromCorner | SetPiece | FreeKick | FastBreak
  is_on_target     boolean,
  is_blocked       boolean,
  -- Fotmob NO distingue un balón al poste de un simple disparo desviado (sin
  -- flag de por medio) — verificado 2026-08-29 en un partido con misses
  -- reales, ningún campo lo señala. Se deja la columna reservada, siempre en
  -- false por ahora, antes que inventar una heurística que confundiría un
  -- tiro desviado normal con un palo real.
  is_woodwork      boolean not null default false,
  expected_goals    numeric(5,3),
  source           text not null default 'fotmob',
  source_shot_id   text,
  created_at       timestamptz not null default now(),
  unique (fixture_id, source, source_shot_id)
);
create index match_shots_fixture_idx on match_shots (fixture_id, minute);

alter table match_shots enable row level security;
create policy match_shots_read on match_shots for select using (true);
