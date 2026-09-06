-- 0018: la previsión con IA pasa a ser UNA por usuario y partido (antes: una
-- global por partido, regenerada en cada click). Run after 0017. Idempotente.
--
-- Los anónimos comparten la fila del uuid nil: sin sesión no hay a quién
-- atribuirla, y así el gasto de un visitante suelto sigue acotado a 1 llamada.

alter table match_ai_predictions
  add column if not exists user_id uuid not null default '00000000-0000-0000-0000-000000000000';

do $$ begin
  alter table match_ai_predictions drop constraint match_ai_predictions_pkey;
  alter table match_ai_predictions add primary key (fixture_id, user_id);
exception when others then null; end $$;

-- Cada uno ve la suya y la anónima; nunca la de otro usuario.
drop policy if exists match_ai_predictions_read on match_ai_predictions;
create policy match_ai_predictions_read on match_ai_predictions for select
  using (user_id = '00000000-0000-0000-0000-000000000000' or user_id = auth.uid());
