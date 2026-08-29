-- Ancla del reloj nativo del minuto: el frontend calcula minuto = ancla +
-- segundos transcurridos, sin depender de que liveLoop escriba cada minuto.
-- El backend solo mueve la ancla cuando la API confirma un cambio real
-- (inicio de parte, o el minuto salta más de lo esperado — tiempo añadido).
alter table fixtures add column if not exists half_started_at timestamptz;
alter table fixtures add column if not exists half_number smallint;
