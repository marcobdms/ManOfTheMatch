-- 0006: autenticación con Supabase Auth (email + contraseña) y perfiles.
-- Run after 0001 -> 0002 -> 0003 -> 0004 -> 0005. Idempotent.
-- Contexto completo: docs/plan-2026-08-29.md (Agente B).
--
-- Confirmación de cuentas: NO hay verificación de email automatizada todavía
-- (vendría después con Resend). Marco activa cada cuenta a mano desde el
-- panel de Supabase (Authentication -> Users -> Confirm user). La UI explica
-- esto tras el registro y da un mensaje claro si alguien intenta entrar antes
-- de ser activado.
--
-- El favorito (equipo + preferencias de notificación) vive SOLO aquí, en BD.
-- No hay fallback a localStorage: `frontend/src/lib/favorite.ts` se elimina.

-- ---------------------------------------------------------------------------
-- 1) profiles — un perfil por usuario de auth.users, mismo id (1:1).
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  display_name       text,
  favorite_team_id   text references teams(id),
  prefs              jsonb not null default '{"matchday":true,"kickoff":true,"lineup":true,"goals":true}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles for select using (auth.uid() = id);

drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles for insert with check (auth.uid() = id);

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 2) Trigger: cada alta en auth.users crea su fila en profiles automáticamente.
--    security definer porque auth.users no es escribible/legible por el rol
--    que dispara el trigger de otro modo.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3) push_subscriptions: vincular la suscripción del dispositivo a un usuario
--    cuando hay sesión. Nullable — un dispositivo puede suscribirse antes de
--    iniciar sesión (comportamiento actual, sin romperlo).
--    FK contra `profiles` (no `auth.users` directamente): profiles.id ya
--    referencia auth.users(id) 1:1 (creado por el trigger de arriba), y así
--    PostgREST puede resolver `push_subscriptions.select('...,
--    profiles(favorite_team_id)')` como embed automático en notify.ts.
-- ---------------------------------------------------------------------------
alter table push_subscriptions
  add column if not exists user_id uuid references profiles(id) on delete set null;

create index if not exists push_subscriptions_user_idx
  on push_subscriptions (user_id);
