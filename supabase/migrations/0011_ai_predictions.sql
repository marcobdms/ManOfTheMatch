-- Prevision con IA (Groq) bajo demanda desde frontend/api/predict.ts. Se
-- genera una vez por partido (grounded solo en match_odds/match_predictions,
-- ver esa funcion) y se cachea aqui — el resto de usuarios la leen sin
-- gastar otra llamada. Escritura via service role (bypassa RLS); lectura
-- publica igual que match_odds/match_predictions.
create table if not exists match_ai_predictions (
  fixture_id      uuid primary key references fixtures(id) on delete cascade,
  paragraph       text not null,
  predicted_result text not null check (predicted_result in ('home', 'draw', 'away')),
  pros            jsonb not null default '[]',
  cons            jsonb not null default '[]',
  model           text not null,
  generated_at    timestamptz not null default now()
);

alter table match_ai_predictions enable row level security;
drop policy if exists match_ai_predictions_read on match_ai_predictions;
create policy match_ai_predictions_read on match_ai_predictions for select using (true);
