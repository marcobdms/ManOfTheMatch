-- Seed reference data: season + competitions (LaLiga + Champions).
-- `teams` is seeded by migration 0004_teams_favorites.sql (all 20 LaLiga
-- clubs) — run this file AFTER 0004, not before, so the 20 rows exist first.

insert into seasons (id, start_date, end_date, is_current) values
  ('2026-27', '2026-08-15', '2027-06-30', true)
on conflict (id) do nothing;

insert into competitions (id, name, short_name, type, country, source_ids) values
  ('laliga', 'LaLiga EA Sports', 'LaLiga', 'league', 'Spain',
     '{"footballData":"PD","apiFootball":140}'),
  ('ucl', 'UEFA Champions League', 'Champions', 'cup', 'Europe',
     '{"footballData":"CL","apiFootball":2}')
on conflict (id) do nothing;
