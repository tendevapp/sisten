-- Corrige rótulos que foram gravados com codificação incorreta no seed inicial.
update public.prod_defeitos
   set nome = U&'Falta de fus\\00E3o'
 where codigo = 'FALTA_FUSAO';

update public.prod_defeitos
   set nome = U&'Ovaliza\\00E7\\00E3o'
 where codigo = 'OVALIZACAO';

-- Mantém os rótulos oficiais estáveis para novas instalações/replays.
insert into public.prod_defeitos (codigo, nome, descricao)
values
  ('POROSIDADE', 'Porosidade', U&'Indica\\00E7\\00E3o de porosidade no cord\\00E3o ou material'),
  ('FALTA_FUSAO', U&'Falta de fus\\00E3o', U&'Descontinuidade por falta de fus\\00E3o'),
  ('MORDEDURA', 'Mordedura', U&'Sulco ou redu\\00E7\\00E3o localizada no metal de base'),
  ('OVALIZACAO', U&'Ovaliza\\00E7\\00E3o', U&'Desvio geom\\00E9trico da se\\00E7\\00E3o circular'),
  ('EMPENO', 'Empeno', U&'Deforma\\00E7\\00E3o fora do alinhamento nominal'),
  ('DESALINHAMENTO', 'Desalinhamento', U&'Desvio de alinhamento entre componentes')
on conflict (codigo) do update
  set nome = excluded.nome, descricao = excluded.descricao;
