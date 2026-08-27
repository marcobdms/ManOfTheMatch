-- ManOfTheMatch — initial schema
-- The ingest worker (service role) writes; the PWA (anon) only reads public tables.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- reference data
-- ---------------------------------------------------------------------------
create table competitions (
  id          text primary key,                 -- 'laliga' | 'ucl'
  name        text not null,
  short_name  text not null,
  type        text not null default 'league',   -- 'league' | 'cup'
  country     text,
  source_ids  jsonb not null default '{}'::jsonb -- {"footballData":"PD","apiFootball":140}
);

create table seasons (
  id          text primary key,                 -- '2026-27'
  start_date  date,
  end_date    date,
  is_current  boolean not null default false
);

create table teams (
  id            text primary key,               -- 'real-madrid'
  name          text not null,
  short_name    text not null,
  tla           text not null,                  -- 'RMA'
  crest_url     text,
  primary_color text,
  is_tracked    boolean not null default false, -- MVP: only Madrid & Barça
  source_ids    jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------
create table fixtures (
  id             uuid primary key default gen_random_uuid(),
  competition_id text not null references competitions(id),
  season_id      text not null references seasons(id),
  matchday       int,
  stage          text,
  home_team_id   text references teams(id),
  away_team_id   text references teams(id),
  kickoff_at     timestamptz not null,
  venue          text,
  status         text not null default 'SCHEDULED',
  minute         int,
  home_score     int,
  away_score     int,
  home_score_ht  int,
  away_score_ht  int,
  source_ids     jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  updated_at     timestamptz not null default now(),
  unique (competition_id, season_id, home_team_id, away_team_id, kickoff_at)
);
create index fixtures_kickoff_idx on fixtures (kickoff_at);
create index fixtures_status_idx on fixtures (status);

create table match_events (
  id              uuid primary key default gen_random_uuid(),
  fixture_id      uuid not null references fixtures(id) on delete cascade,
  type            text not null,                -- see MatchEventType in @motm/shared
  minute          int,
  minute_extra    int,
  team_id         text references teams(id),
  player_name     text,
  player_id       text,
  assist_name     text,
  detail          text,                         -- "de penalti", "falta táctica"...
  sort_key        int not null default 0,
  source          text,
  source_event_id text,
  created_at      timestamptz not null default now(),
  unique (fixture_id, source, source_event_id)
);
create index match_events_fixture_idx on match_events (fixture_id, minute, sort_key);

create table lineups (
  id           uuid primary key default gen_random_uuid(),
  fixture_id   uuid not null references fixtures(id) on delete cascade,
  team_id      text not null references teams(id),
  formation    text,
  is_starting  boolean not null default true,
  player_id    text,
  player_name  text not null,
  shirt_number int,
  position     text,
  grid         text,
  source       text,
  unique (fixture_id, team_id, player_name, is_starting)
);
create index lineups_fixture_idx on lineups (fixture_id);

create table player_match_stats (
  id            uuid primary key default gen_random_uuid(),
  fixture_id    uuid not null references fixtures(id) on delete cascade,
  team_id       text not null references teams(id),
  player_id     text,
  player_name   text not null,
  minutes       int,
  rating        numeric(3,1),
  goals         int default 0,
  assists       int default 0,
  shots         int default 0,
  shots_on      int default 0,
  passes        int default 0,
  pass_accuracy int,
  key_passes    int default 0,
  tackles       int default 0,
  duels_won     int default 0,
  dribbles      int default 0,
  touches       int default 0,
  xg            numeric(4,2),
  xa            numeric(4,2),
  yellow        int default 0,
  red           int default 0,
  source        text,
  raw           jsonb,
  unique (fixture_id, player_name, source)
);
create index pms_fixture_idx on player_match_stats (fixture_id);

create table standings (
  id             uuid primary key default gen_random_uuid(),
  competition_id text not null references competitions(id),
  season_id      text not null references seasons(id),
  team_id        text references teams(id),
  team_name      text not null,
  position       int not null,
  played         int,
  won            int,
  draw           int,
  lost           int,
  goals_for      int,
  goals_against  int,
  goal_diff      int,
  points         int,
  form           text,
  source         text,
  captured_at    timestamptz not null default now(),
  unique (competition_id, season_id, team_name, captured_at)
);
create index standings_comp_idx on standings (competition_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- content + notifications
-- ---------------------------------------------------------------------------
create table news (
  id           uuid primary key default gen_random_uuid(),
  team_id      text references teams(id),
  title        text not null,
  summary      text,
  url          text unique,
  image_url    text,
  source       text,
  published_at timestamptz,
  created_at   timestamptz not null default now()
);
create index news_published_idx on news (published_at desc);

create table push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  prefs        jsonb not null default '{"matchday":true,"kickoff":true,"goals":true}'::jsonb,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  fixture_id uuid references fixtures(id) on delete cascade,
  type       text not null,                    -- MATCHDAY | KICKOFF_SOON | GOAL
  title      text not null,
  body       text,
  team_id    text references teams(id),
  created_at timestamptz not null default now()
);
create index notifications_created_idx on notifications (created_at desc);

-- ---------------------------------------------------------------------------
-- ingest bookkeeping (service-role only)
-- ---------------------------------------------------------------------------
create table http_cache (
  cache_key     text primary key,
  etag          text,
  last_modified text,
  body          jsonb,
  fetched_at    timestamptz not null default now(),
  expires_at    timestamptz
);

create table sync_runs (
  id          uuid primary key default gen_random_uuid(),
  job         text not null,
  source      text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  items       int,
  error       text
);
create index sync_runs_job_idx on sync_runs (job, started_at desc);

-- ---------------------------------------------------------------------------
-- RLS: public read for content, no anon access to ops tables
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'competitions','seasons','teams','fixtures','match_events','lineups',
    'player_match_stats','standings','news','notifications'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (true)', t || '_read', t);
  end loop;
end $$;

alter table push_subscriptions enable row level security;
create policy push_insert on push_subscriptions for insert with check (true);
create policy push_update on push_subscriptions for update using (true) with check (true);

alter table http_cache enable row level security;   -- no policies -> service role only
alter table sync_runs enable row level security;    -- no policies -> service role only
