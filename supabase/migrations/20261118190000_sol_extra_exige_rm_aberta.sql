-- Solicitação Extraordinária (FRM.ALM-0013): só material com RM aberta
--
-- A extraordinária é a saída de material que ainda não tem saldo porque a NF
-- não foi lançada — então o material tem de estar sendo comprado. Material sem
-- RM aberta na ME5A não sai por aqui.
--
-- "RM aberta" = mesma regra da situação do material (alm_situacao_material /
-- Ctrl+K): linha da ME5A da última carga (ou de grupo que a última carga não
-- trouxe, até 365 dias), não eliminada nem concluída, e não atendida — sem
-- pedido, ou com pedido que ainda tem quantidade a entregar na ZL0132.
--
-- Fora da regra: retirada aberta pela Ficha de EPI (origem 'ficha_epi'; a
-- entrega de EPI não espera RM) e itens que o registro já tinha (edição).

create or replace function public.alm_rm_abertas(p_material text default null)
returns table (material text, descricao text, unidade text, rm text, pedido text, situacao text, data_solicitacao date)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with grupos_carga as (
    select distinct grupo_de_compradores as g
      from public.sap_me5a_rc
     where presente_ultima_carga is true and grupo_de_compradores is not null
  ),
  rc as (
    select r.material as mat, r.texto_breve, r.unidade_de_medida, r.requisicao_de_compra, r.item_reqc,
           nullif(trim(r.pedido), '') as pedido, r.data_da_solicitacao
      from public.sap_me5a_rc r
     where r.material is not null
       and (p_material is null or r.material = nullif(ltrim(upper(trim(p_material)), '0'), ''))
       and (r.presente_ultima_carga is true
            or (r.grupo_de_compradores not in (select g from grupos_carga)
                and r.data_da_solicitacao >= current_date - 365))
       and not coalesce(r.eliminado, false)
       and coalesce(r.concluida, '') <> 'X'
  ),
  pend as (
    select distinct on (z.doc_compra, z.material, coalesce(nullif(trim(z.itm_liberacao), ''), z.item, ''))
           z.doc_compra, z.material,
           case when coalesce(z.eflag_e, '') = 'L' or upper(coalesce(z.crf, '')) = 'X' then 0
                else greatest(coalesce(z.qtd_pedido, 0) - coalesce(z.qtd_fornecida, 0), 0) end as pendente
      from public.sap_zl0132_po z
     where z.doc_compra in (select rc.pedido from rc where rc.pedido is not null)
     order by z.doc_compra, z.material, coalesce(nullif(trim(z.itm_liberacao), ''), z.item, ''), z.modificado_em desc nulls last
  ),
  sit as (
    select rc.*,
           case
             when rc.pedido is null then 'sem_pedido'
             when exists (select 1 from pend p where p.doc_compra = rc.pedido and p.material = rc.mat and p.pendente > 0) then 'em_pedido'
             when exists (select 1 from pend p where p.doc_compra = rc.pedido and p.material = rc.mat) then 'atendida'
             else 'em_pedido'
           end as situacao
      from rc
  )
  select s.mat, nullif(trim(s.texto_breve), ''), nullif(trim(s.unidade_de_medida), ''),
         s.requisicao_de_compra || coalesce('/' || nullif(ltrim(coalesce(s.item_reqc, ''), '0'), ''), ''),
         s.pedido, s.situacao, s.data_da_solicitacao
    from sit s
   where s.situacao <> 'atendida'
   order by s.mat, s.data_da_solicitacao desc nulls last;
$$;
revoke all on function public.alm_rm_abertas(text) from public, anon;
grant execute on function public.alm_rm_abertas(text) to authenticated;

comment on function public.alm_rm_abertas(text) is
  'RMs abertas (ME5A não atendida) por material — a Solicitação Extraordinária só aceita material que está nesta lista.';

create or replace function public.alm_sol_extra_exige_rm()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sem_rm text;
begin
  if new.excluido_em is not null or coalesce(new.origem, '') = 'ficha_epi' then
    return new;
  end if;

  select string_agg(distinct trim(x->>'material'), ', ') into v_sem_rm
    from jsonb_array_elements(coalesce(new.itens, '[]'::jsonb)) x
   where nullif(trim(x->>'material'), '') is not null
     and (tg_op = 'INSERT' or not exists (
           select 1 from jsonb_array_elements(coalesce(old.itens, '[]'::jsonb)) o
            where public.alm_chave_material(o->>'material') = public.alm_chave_material(x->>'material')))
     and not exists (select 1 from public.alm_rm_abertas(x->>'material'));

  if v_sem_rm is not null then
    raise exception 'Sem RM aberta para: %. A solicitação extraordinária é só para material que está sendo comprado — abra a RM antes da retirada.', v_sem_rm
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.alm_sol_extra_exige_rm() from public, anon, authenticated;

drop trigger if exists trg_alm_sol_extra_exige_rm on public.alm_solicitacao_extra;
create trigger trg_alm_sol_extra_exige_rm
  before insert or update of itens, origem on public.alm_solicitacao_extra
  for each row execute function public.alm_sol_extra_exige_rm();
