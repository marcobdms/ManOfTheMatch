-- 0019: los 31 clubes de la fase liga de Champions que NO son de LaLiga.
-- Run after 0018. Idempotente.
--
-- Con estas filas, `teamSlugByFootballDataId` (backend/src/lib/ids.ts) resuelve
-- el slug de cada equipo de Champions, así que syncFixtures y syncStandings les
-- ponen `team_id` en la siguiente pasada — y con eso llegan solos el escudo,
-- el perfil de equipo, favoritos, etc. Los 5 clubes españoles de Champions
-- (Madrid, Barça, Atleti, Betis, Villarreal) ya tienen su fila.
--
-- `is_tracked = false`: no entran en el filtro de "En vivo por equipo" ni en
-- el selector de equipo favorito (que es de LaLiga). El id es el mismo
-- basename que el SVG en frontend/src/assets/crests/ucl/.

insert into teams (id, name, short_name, tla, is_tracked, source_ids) values
  ('aek-athens',              'PAE AEK',                    'AEK Atenas',   'AEK', false, '{"footballData":1899}'),
  ('arsenal',                 'Arsenal FC',                 'Arsenal',      'ARS', false, '{"footballData":57}'),
  ('roma',                    'AS Roma',                    'Roma',         'ROM', false, '{"footballData":100}'),
  ('aston-villa',             'Aston Villa FC',             'Aston Villa',  'AVL', false, '{"footballData":58}'),
  ('bayern-munich',           'FC Bayern München',          'Bayern',       'BAY', false, '{"footballData":5}'),
  ('borussia-dortmund',       'Borussia Dortmund',          'Dortmund',     'BVB', false, '{"footballData":4}'),
  ('club-brugge',             'Club Brugge KV',             'Brujas',       'BRU', false, '{"footballData":851}'),
  ('como-1907',               'Como 1907',                  'Como',         'COM', false, '{"footballData":7397}'),
  ('fc-porto',                'FC Porto',                   'Oporto',       'POR', false, '{"footballData":503}'),
  ('fenerbahce',              'Fenerbahçe SK',              'Fenerbahçe',   'FEN', false, '{"footballData":613}'),
  ('feyenoord',               'Feyenoord Rotterdam',        'Feyenoord',    'FEY', false, '{"footballData":675}'),
  ('fk-bodo-glimt',           'FK Bodø/Glimt',              'Bodø/Glimt',   'BOD', false, '{"footballData":5721}'),
  ('galatasaray',             'Galatasaray SK',             'Galatasaray',  'GAL', false, '{"footballData":610}'),
  ('inter-milan',             'FC Internazionale Milano',   'Inter',        'INT', false, '{"footballData":108}'),
  ('lask',                    'LASK Linz',                  'LASK',         'LAS', false, '{"footballData":2016}'),
  ('losc-lille',              'Lille OSC',                  'Lille',        'LIL', false, '{"footballData":521}'),
  ('liverpool-fc',            'Liverpool FC',               'Liverpool',    'LIV', false, '{"footballData":64}'),
  ('manchester-city',         'Manchester City FC',         'Man City',     'MCI', false, '{"footballData":65}'),
  ('manchester-united',       'Manchester United FC',       'Man United',   'MUN', false, '{"footballData":66}'),
  ('paris-saint-germain-psg', 'Paris Saint-Germain FC',     'PSG',          'PSG', false, '{"footballData":524}'),
  ('psv-eindhoven',           'PSV',                        'PSV',          'PSV', false, '{"footballData":674}'),
  ('rb-leipzig',              'RB Leipzig',                 'Leipzig',      'RBL', false, '{"footballData":721}'),
  ('rc-lens',                 'Racing Club de Lens',        'Lens',         'LEN', false, '{"footballData":546}'),
  ('sabah-fk',                'Sabah FK',                   'Sabah',        'SAB', false, '{"footballData":10233}'),
  ('shakhtar-donetsk',        'FK Shakhtar Donetsk',        'Shakhtar',     'SHK', false, '{"footballData":1887}'),
  ('slavia-praha',            'SK Slavia Praha',            'Slavia Praga', 'SLA', false, '{"footballData":930}'),
  ('slovan-bratislava',       'ŠK Slovan Bratislava',       'Slovan',       'SLB', false, '{"footballData":7509}'),
  ('sporting-cp',             'Sporting Clube de Portugal', 'Sporting',     'SPO', false, '{"footballData":498}'),
  ('napoli',                  'SSC Napoli',                 'Nápoles',      'NAP', false, '{"footballData":113}'),
  ('vfb-stuttgart',           'VfB Stuttgart',              'Stuttgart',    'STU', false, '{"footballData":10}'),
  ('viking-fk',               'Viking FK',                  'Viking',       'VIK', false, '{"footballData":5720}')
on conflict (id) do nothing;
