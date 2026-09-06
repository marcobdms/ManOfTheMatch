-- 0017: noticias reescritas. Run after 0016. Idempotente.
-- La `news` de 0001 solo guardaba el titular ajeno; aquí se añade la pieza
-- propia (title/body reescritos por Groq) + atribución de imagen, que con
-- CC BY-SA es obligatoria.

alter table news add column if not exists body            text;
alter table news add column if not exists topic           text;
alter table news add column if not exists status          text not null default 'draft';
alter table news add column if not exists subject         text;
alter table news add column if not exists subject_qid     text;
alter table news add column if not exists original_title  text;
alter table news add column if not exists original_url    text;
alter table news add column if not exists original_source text;
alter table news add column if not exists original_author text;
alter table news add column if not exists fixture_id      uuid references fixtures(id) on delete set null;
alter table news add column if not exists image_author      text;
alter table news add column if not exists image_license     text;
alter table news add column if not exists image_license_url text;
alter table news add column if not exists image_source_url  text;
alter table news add column if not exists image_state     text not null default 'pending';
alter table news add column if not exists model           text;
alter table news add column if not exists rewritten_at    timestamptz;

-- ONCE/PREVIA/CRONICA se generan de datos propios; LESION/TECNICO/FICHAJES
-- salen del feed. El resto del feed se descarta en la ingesta.
do $$ begin
  alter table news add constraint news_topic_chk check (topic is null or topic in
    ('ONCE','PREVIA','CRONICA','LESION','TECNICO','FICHAJES'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table news add constraint news_status_chk check (status in ('draft','published','skipped'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table news add constraint news_image_state_chk check (image_state in ('pending','resolved','fallback'));
exception when duplicate_object then null; end $$;

create index if not exists news_status_pub_idx on news (status, published_at desc);
create index if not exists news_draft_idx on news (status, created_at) where status = 'draft';
create index if not exists news_team_idx on news (team_id, published_at desc);

-- 0001 dejó `news` con SELECT abierto. Ahora solo lo publicado sale fuera:
-- un draft es el titular ajeno sin reescribir, no debe llegar al cliente.
drop policy if exists news_read on news;
create policy news_read on news for select using (status = 'published');
