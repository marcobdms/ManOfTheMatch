-- Seed reference data for the MVP (Real Madrid + FC Barcelona, LaLiga + Champions).

insert into seasons (id, start_date, end_date, is_current) values
  ('2026-27', '2026-08-15', '2027-06-30', true)
on conflict (id) do nothing;

insert into competitions (id, name, short_name, type, country, source_ids) values
  ('laliga', 'LaLiga EA Sports', 'LaLiga', 'league', 'Spain',
     '{"footballData":"PD","apiFootball":140}'),
  ('ucl', 'UEFA Champions League', 'Champions', 'cup', 'Europe',
     '{"footballData":"CL","apiFootball":2}')
on conflict (id) do nothing;

insert into teams (id, name, short_name, tla, primary_color, is_tracked, source_ids) values
  ('real-madrid', 'Real Madrid CF', 'Real Madrid', 'RMA', '#1B2A4A', true,
     '{"footballData":86,"apiFootball":541}'),
  ('barcelona', 'FC Barcelona', 'Barcelona', 'BAR', '#6B1020', true,
     '{"footballData":81,"apiFootball":529}')
on conflict (id) do nothing;
