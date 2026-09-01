-- Resumen en vídeo del partido (Fotmob -> YouTube). Se embebe con el
-- reproductor oficial, nunca se rehospeda el vídeo.
alter table fixtures add column if not exists highlight_url text;
alter table fixtures add column if not exists highlight_thumbnail text;
-- Último intento de buscarlo: el vídeo se publica minutos/horas DESPUÉS del
-- pitido final, así que hay que reintentar sin machacar a Fotmob.
alter table fixtures add column if not exists highlight_checked_at timestamptz;
