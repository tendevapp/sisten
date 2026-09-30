-- =====================================================================
-- Adiciona nova categoria 'pendente' (Em Branco Pendente) no controle de entregas
-- e atualiza os tramos das torres >= 16 que estavam em saw02 para o novo status.
-- =====================================================================

-- 1. Atualiza a constraint de categoria para incluir 'pendente'
alter table public.prod_tramos_entrega
  drop constraint if exists prod_tramos_entrega_etapa_categoria_check;

alter table public.prod_tramos_entrega
  add constraint prod_tramos_entrega_etapa_categoria_check
  check (etapa_categoria in ('expedido','patio','white','internos','saw03','saw02','nav01','pendente'));

-- 2. Atualiza os tramos a partir da torre 16 que ainda estão como saw02 para 'pendente'
update public.prod_tramos_entrega
set etapa_categoria = 'pendente',
    etapa_nome = 'PENDENTE',
    status_aguardando = 'Aguardando início de fabricação',
    dias_espera = 0,
    updated_at = now()
where torre_numero >= 16
  and etapa_categoria = 'saw02';
