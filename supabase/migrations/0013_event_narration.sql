-- Narración corta por evento (Groq, backend/src/lib/narrate.ts). Se genera
-- UNA vez al insertar un gol/gol-anulado real (liveTicker.ts /
-- liveTickerEspn.ts) y se cachea aquí mismo — todos los viewers leen la
-- misma frase, nadie vuelve a pedirla. NULL = sin narrar (fallback al texto
-- plano de siempre en el frontend).
alter table match_events add column if not exists narration text;
