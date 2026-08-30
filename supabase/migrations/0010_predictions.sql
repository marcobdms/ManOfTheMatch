-- Previsiones pre-partido: cuotas (API-Football) + pronostico/comparativa +
-- argumentos de Fotmob (bad_form_team, h2h_undefeated...). Solo partidos
-- SCHEDULED en la ventana proxima (backend/src/jobs/syncPredictions.ts).
alter table fixtures add column if not exists predictions_synced_at timestamptz;

create table if not exists match_odds (
  id             uuid primary key default gen_random_uuid(),
  fixture_id     uuid not null references fixtures(id) on delete cascade,
  bookmaker_id   int not null,
  bookmaker_name text not null,
  home_odd       numeric(6,2),
  draw_odd       numeric(6,2),
  away_odd       numeric(6,2),
  updated_at     timestamptz not null default now(),
  unique (fixture_id, bookmaker_id)
);
create index if not exists match_odds_fixture_idx on match_odds (fixture_id);

create table if not exists match_predictions (
  fixture_id   uuid primary key references fixtures(id) on delete cascade,
  percent_home numeric(5,2),
  percent_draw numeric(5,2),
  percent_away numeric(5,2),
  form_home    numeric(5,2),
  form_away    numeric(5,2),
  att_home     numeric(5,2),
  att_away     numeric(5,2),
  def_home     numeric(5,2),
  def_away     numeric(5,2),
  fotmob_facts jsonb,          -- [{templateId, values}] — traducido en frontend
  updated_at   timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['match_odds','match_predictions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select using (true)', t || '_read', t);
  end loop;
end $$;
