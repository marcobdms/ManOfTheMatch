-- Clave estable de cada estadística de Fotmob ('BallPossesion', 'expected_goals'…).
-- El título viene en inglés y puede cambiar; la clave no, así que es lo que usa
-- el frontend para traducir y decidir formato.
alter table match_team_stats add column if not exists stat_key text;
create index if not exists match_team_stats_key_idx on match_team_stats (fixture_id, stat_key);
