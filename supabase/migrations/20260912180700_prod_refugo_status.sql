-- Produção — fechamento do ciclo UT: refugo, assinatura e pendência rastreável.

alter table public.prod_lancamentos drop constraint if exists prod_lancamentos_status_check;
alter table public.prod_lancamentos add constraint prod_lancamentos_status_check
  check (status in ('aprovado', 'reprovado', 'pendente', 'refugado'));

create or replace view public.prod_pendencias
with (security_invoker = true) as
with ultimo as (
  select distinct on (virola_id, etapa_id) *
    from public.prod_lancamentos
   where excluido_em is null
   order by virola_id, etapa_id, created_at desc
)
select
  u.virola_id, u.etapa_id, e.nome as etapa_nome, u.id as lancamento_id, u.codigo,
  u.status, u.projeto, u.torre_numero, u.tramo, u.virola, u.observacao, u.created_at
from ultimo u
join public.prod_etapas e on e.id = u.etapa_id
where u.status in ('reprovado', 'refugado');

grant select on public.prod_pendencias to authenticated;
