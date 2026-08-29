-- 0005: alineaciones con coordenadas reales (Fotmob) + snapshot listo para la UI.
-- Run after 0001 -> 0002 -> 0003 -> 0004. Idempotent.
-- Contexto completo: docs/plan-2026-08-29.md (Agente A — Alineaciones y cartas)

-- ---------------------------------------------------------------------------
-- 1) `lineups` no basta hoy: no tiene coordenadas ni datos de jugador (edad,
--    nacionalidad, valoración). Todo nullable — API-Football (fuente actual de
--    `lineups`) no trae nada de esto; solo Fotmob lo rellena.
-- ---------------------------------------------------------------------------
alter table lineups
  add column if not exists pos_x           numeric(4,3),  -- horizontalLayout.x  0..1
  add column if not exists pos_y           numeric(4,3),  -- horizontalLayout.y  0..1
  add column if not exists position_label  text,          -- 'POR','DFC','LI','MC','ED','DC' — etiqueta mostrada
  add column if not exists age             int,
  add column if not exists country         text,
  add column if not exists country_code    text,
  add column if not exists rating          numeric(3,1),  -- performance.rating de ese partido
  add column if not exists season_rating   numeric(3,1),
  add column if not exists market_value    bigint,
  add column if not exists photo_url       text,          -- para después; se deja null
  add column if not exists lineup_type     text,          -- 'confirmed' | 'predicted'
  add column if not exists captured_at     timestamptz default now();

-- ---------------------------------------------------------------------------
-- 2) `team_lineup_snapshots` — la tabla que consume la UI directamente: una
--    lectura por equipo, sin joins ni recomponer la formación en el cliente.
--    El caché que pidió el usuario vive aquí (en BD, no en localStorage).
-- ---------------------------------------------------------------------------
create table if not exists team_lineup_snapshots (
  team_id        text primary key references teams(id),
  fixture_id     uuid references fixtures(id) on delete set null,
  opponent_name  text,
  opponent_crest text,
  is_home        boolean,
  kickoff_at     timestamptz,
  formation      text,
  coach          text,
  lineup_type    text not null,          -- 'confirmed' | 'predicted' | 'last_played'
  players        jsonb not null,         -- array de LineupPlayer (ver docs/plan-2026-08-29.md §A1)
  source         text not null,          -- 'fotmob' | 'apiFootball'
  updated_at     timestamptz not null default now()
);

alter table team_lineup_snapshots enable row level security;
create policy team_lineup_snapshots_read on team_lineup_snapshots for select using (true);
