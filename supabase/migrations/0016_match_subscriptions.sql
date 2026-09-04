-- 0016: avisos de UN partido concreto, independientes del equipo favorito.
-- Run after 0015. Idempotent.
--
-- Caso de uso: estás viendo un partido que no es el de tu equipo y quieres
-- que te avisen de SUS goles, sin cambiar tu favorito ni recibir el resto de
-- avisos de ese club. Se suscribe el dispositivo (por `endpoint` de Web Push),
-- no la cuenta: es una decisión de "este partido, en este móvil", y funciona
-- igual con sesión iniciada o sin ella.
--
-- El endpoint es la URL de push del navegador. Conocerla no permite enviar
-- nada: hace falta la clave VAPID privada, que solo tiene el worker. Por eso
-- las políticas son permisivas, igual que en `push_subscriptions` (0001/0003).

-- `endpoint` es FK contra `push_subscriptions.endpoint` (UNIQUE desde 0001) por
-- dos motivos: si el dispositivo desactiva el push del todo, sus suscripciones
-- a partidos se borran solas por cascada; y PostgREST puede resolver el embed
-- `match_subscriptions -> push_subscriptions` que usa notify.ts para sacar las
-- claves de envío en una sola consulta.
create table if not exists match_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references fixtures(id) on delete cascade,
  endpoint   text not null references push_subscriptions(endpoint) on delete cascade,
  created_at timestamptz not null default now(),
  unique (fixture_id, endpoint)
);

create index if not exists match_subscriptions_fixture_idx
  on match_subscriptions (fixture_id);

alter table match_subscriptions enable row level security;

-- El cliente consulta siempre filtrando por su propio endpoint; necesita SELECT
-- para poder pintar el estado del botón al volver a entrar al partido.
drop policy if exists match_subs_select on match_subscriptions;
create policy match_subs_select on match_subscriptions for select using (true);

drop policy if exists match_subs_insert on match_subscriptions;
create policy match_subs_insert on match_subscriptions for insert with check (true);

drop policy if exists match_subs_delete on match_subscriptions;
create policy match_subs_delete on match_subscriptions for delete using (true);
