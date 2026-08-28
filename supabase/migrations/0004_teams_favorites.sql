-- 0004: los 20 equipos de LaLiga + favorito por dispositivo.
-- Run after 0001 -> 0002 -> 0003. Idempotent.
-- Contexto completo: docs/handoff-schema-notify.md

-- ---------------------------------------------------------------------------
-- 1) Los 20 clubes de LaLiga 2026/27. `source_ids` se deja vacío salvo para
--    los 2 ya verificados (Real Madrid / Barcelona — mismos ids que traía
--    seed.sql, confirmados en vivo en docs/endpoint-check-2026-08-27.md). Los
--    ids numéricos del resto los rellena
--    `apps/ingest/src/scripts/resolveTeamIds.ts` una vez desplegado con claves
--    reales (docs/handoff-schema-notify.md §2 explica por qué no se inventan
--    aquí). `is_tracked` pasa a `true` para todos: ahora "tracked" = "club de
--    LaLiga", no una lista de 2. seed.sql ya NO siembra `teams` — esta
--    migración es la única fuente para esa tabla.
-- ---------------------------------------------------------------------------
insert into teams (id, name, short_name, tla, primary_color, is_tracked, source_ids) values
  ('real-madrid',       'Real Madrid CF',            'Real Madrid',       'RMA', '#1B2A4A', true,
     '{"footballData":86,"apiFootball":541,"theSportsDb":"133738"}'::jsonb),
  ('barcelona',         'FC Barcelona',               'Barcelona',         'BAR', '#6B1020', true,
     '{"footballData":81,"apiFootball":529,"theSportsDb":"133739"}'::jsonb),
  ('atletico-madrid',   'Club Atlético de Madrid',     'Atlético Madrid',   'ATM', '#C8102E', true, '{}'::jsonb),
  ('athletic-bilbao',   'Athletic Club',               'Athletic Bilbao',   'ATH', '#EE2523', true, '{}'::jsonb),
  ('villarreal',        'Villarreal CF',               'Villarreal',        'VIL', '#FFE100', true, '{}'::jsonb),
  ('real-betis',        'Real Betis Balompié',         'Betis',             'BET', '#00954C', true, '{}'::jsonb),
  ('celta-vigo',        'RC Celta de Vigo',            'Celta',             'CEL', '#8AC3EE', true, '{}'::jsonb),
  ('rayo-vallecano',    'Rayo Vallecano',               'Rayo Vallecano',    'RAY', '#E30613', true, '{}'::jsonb),
  ('osasuna',           'CA Osasuna',                   'Osasuna',           'OSA', '#D2001C', true, '{}'::jsonb),
  ('real-sociedad',     'Real Sociedad de Fútbol',      'Real Sociedad',     'RSO', '#0067B1', true, '{}'::jsonb),
  ('sevilla',           'Sevilla FC',                   'Sevilla',           'SEV', '#D0021B', true, '{}'::jsonb),
  ('valencia',          'Valencia CF',                  'Valencia',          'VAL', '#EE8600', true, '{}'::jsonb),
  ('getafe',            'Getafe CF',                    'Getafe',            'GET', '#005CA9', true, '{}'::jsonb),
  ('alaves',            'Deportivo Alavés',             'Alavés',            'ALA', '#1F4B96', true, '{}'::jsonb),
  ('espanyol',          'RCD Espanyol',                 'Espanyol',          'ESP', '#0A4C99', true, '{}'::jsonb),
  ('levante',           'Levante UD',                   'Levante',           'LEV', '#B0022A', true, '{}'::jsonb),
  ('elche',             'Elche CF',                     'Elche',             'ELX', '#058144', true, '{}'::jsonb),
  ('racing-santander',  'Real Racing Club',             'Racing Santander',  'RAC', '#00A650', true, '{}'::jsonb),
  ('deportivo',         'RC Deportivo',                 'Deportivo',         'DEP', '#0A5FAA', true, '{}'::jsonb),
  ('malaga',            'Málaga CF',                    'Málaga',            'MAL', '#1B6FB5', true, '{}'::jsonb)
on conflict (id) do update set
  name          = excluded.name,
  short_name    = excluded.short_name,
  tla           = excluded.tla,
  primary_color = excluded.primary_color,
  is_tracked    = true;
  -- source_ids NOT touched on conflict — a re-run of this migration never wipes
  -- ids that resolveTeamIds.ts (or a manual SQL fix) already wrote.

-- ---------------------------------------------------------------------------
-- 2) Favorito por dispositivo (sin login) en push_subscriptions.
-- ---------------------------------------------------------------------------
alter table push_subscriptions
  add column if not exists favorite_team_id text references teams(id);

create index if not exists push_subscriptions_favorite_idx
  on push_subscriptions (favorite_team_id);

-- New rows get the "lineup" pref by default too.
alter table push_subscriptions
  alter column prefs set default '{"matchday":true,"kickoff":true,"lineup":true,"goals":true}'::jsonb;

-- Backfill the "lineup" key onto rows created before this migration.
update push_subscriptions
  set prefs = prefs || '{"lineup":true}'::jsonb
  where not (prefs ? 'lineup');
