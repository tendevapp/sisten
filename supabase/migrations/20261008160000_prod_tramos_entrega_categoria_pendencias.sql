-- Nova categoria 'pendencias' (vermelha) no Controle de Entrega: tramo parado por
-- pendência. A categoria 'pendente' continua existindo e passa a se chamar
-- "Aberto" na tela (só o rótulo muda; os dados não mudam).
alter table public.prod_tramos_entrega
  drop constraint if exists prod_tramos_entrega_etapa_categoria_check;

alter table public.prod_tramos_entrega
  add constraint prod_tramos_entrega_etapa_categoria_check
  check (etapa_categoria in ('expedido','patio','white','internos','saw03','saw02','nav01','pendente','pendencias'));
