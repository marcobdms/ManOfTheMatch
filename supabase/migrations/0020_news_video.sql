-- Vídeos en el feed de noticias (ruedas de prensa, goles, resúmenes). Solo se
-- guarda el ENLACE y la miniatura del proveedor: nada se rehospeda ni se
-- descarga, se abre siempre en YouTube.
alter table news add column if not exists video_url      text;
alter table news add column if not exists video_provider text;

-- 'VIDEO' se suma a los temas permitidos.
do $$ begin
  alter table news drop constraint if exists news_topic_chk;
  alter table news add constraint news_topic_chk check (topic is null or topic in
    ('ONCE','PREVIA','CRONICA','LESION','TECNICO','FICHAJES','VIDEO'));
end $$;

-- Un resumen de Champions puede ser el del PARTIDO o el recopilatorio de la
-- jornada (UEFA no siempre deja el partido suelto). La vista lo dice según esto.
alter table fixtures add column if not exists highlight_kind text;
do $$ begin
  alter table fixtures drop constraint if exists fixtures_highlight_kind_chk;
  alter table fixtures add constraint fixtures_highlight_kind_chk
    check (highlight_kind is null or highlight_kind in ('match','roundup'));
end $$;
