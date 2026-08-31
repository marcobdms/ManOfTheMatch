-- Fotos recortadas de jugador, resueltas una sola vez por
-- backend/src/scripts/resolvePlayerPhotos.ts y servidas desde el bucket
-- `player-photos` de Supabase Storage. La búsqueda es SIEMPRE dentro del
-- equipo: buscar por nombre a secas en fuentes externas devuelve personas
-- distintas (TheSportsDB da "Jay Rodriguez" si le pides "Rodri").
create table if not exists player_photos (
  team_id    text not null references teams(id) on delete cascade,
  name_key   text not null,              -- nombre normalizado sin acentos
  last_key   text not null,              -- solo apellido, para el segundo intento
  player_name text not null,
  photo_url  text not null,
  source     text not null,              -- 'thesportsdb' | 'api-football'
  updated_at timestamptz not null default now(),
  primary key (team_id, name_key)
);
create index if not exists player_photos_last_idx on player_photos (team_id, last_key);

alter table player_photos enable row level security;
drop policy if exists player_photos_read on player_photos;
create policy player_photos_read on player_photos for select using (true);
