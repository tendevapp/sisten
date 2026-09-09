-- =====================================================================
-- Almoxarifado > Projetos — exclusão lógica no padrão do repo
--
-- O app inteiro marca exclusão lógica com `excluido_em is null` (ver
-- `src/lib/softDelete.ts`: `apenasVigentes` / `marcarExcluido`). As tabelas
-- de Projetos nasceram com uma coluna booleana redundante ao lado disso, o
-- que obrigaria a API a lembrar de um filtro diferente do resto do app —
-- exatamente o tipo de divergência que faz uma listagem esconder registro
-- que a outra mostra. Fica só `excluido_em`.
-- =====================================================================

drop view if exists public.vw_proj_saldo_almox;

drop index if exists public.idx_proj_mov_item;
drop index if exists public.idx_proj_nf_data;
drop index if exists public.idx_proj_ordens_status;
drop index if exists public.idx_proj_kits_status;
drop index if exists public.idx_proj_entregas_data;
drop index if exists public.idx_proj_sobr_data;

alter table public.proj_movimentos drop column if exists excluido;
alter table public.proj_notas_entrada drop column if exists excluido;
alter table public.proj_ordens_premontagem drop column if exists excluido;
alter table public.proj_kits drop column if exists excluido;
alter table public.proj_entregas_producao drop column if exists excluido;
alter table public.proj_sobressalentes drop column if exists excluido;

create index idx_proj_mov_item on public.proj_movimentos (projeto, item_id) where excluido_em is null;
create index idx_proj_nf_data on public.proj_notas_entrada (projeto, data_entrada desc) where excluido_em is null;
create index idx_proj_ordens_status on public.proj_ordens_premontagem (projeto, status, created_at desc) where excluido_em is null;
create index idx_proj_kits_status on public.proj_kits (projeto, tramo, status) where excluido_em is null;
create index idx_proj_entregas_data on public.proj_entregas_producao (projeto, data desc) where excluido_em is null;
create index idx_proj_sobr_data on public.proj_sobressalentes (projeto, data desc) where excluido_em is null;

create or replace view public.vw_proj_saldo_almox
with (security_invoker = true) as
select
  i.projeto,
  i.id as item_id,
  i.part_number,
  i.part_number_norm,
  i.cod_sap,
  i.descricao,
  i.description,
  i.fornecedor,
  i.uom,
  i.localizador,
  i.estoque_minimo,
  coalesce(sum(m.quantidade) filter (where m.quantidade > 0), 0) as entradas,
  coalesce(-sum(m.quantidade) filter (where m.quantidade < 0), 0) as saidas,
  coalesce(sum(m.quantidade) filter (where m.tipo = 'saida_sobressalente'), 0) * -1 as refugo,
  coalesce(sum(m.quantidade), 0) as saldo
from public.proj_itens i
left join public.proj_movimentos m
  on m.item_id = i.id and m.excluido_em is null
group by i.projeto, i.id, i.part_number, i.part_number_norm, i.cod_sap, i.descricao,
         i.description, i.fornecedor, i.uom, i.localizador, i.estoque_minimo;

comment on view public.vw_proj_saldo_almox is
  'Posicao do almoxarifado central por item. Substitui a aba consolidada da planilha (que aceitava saldo negativo).';

grant select on public.vw_proj_saldo_almox to anon, authenticated, service_role;

-- As duas RPCs que liam a coluna booleana.
create or replace function public.proj_concluir_premontagem(
  p_ordem_id uuid,
  p_kits jsonb,
  p_usuario jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_prontos integer;
  v_restantes integer;
begin
  select status into v_status from public.proj_ordens_premontagem where id = p_ordem_id and excluido_em is null;
  if not found then
    raise exception 'Ordem de pre-montagem nao encontrada.';
  end if;
  if v_status <> 'em_processamento' then
    raise exception 'A ordem ja esta %.', v_status;
  end if;

  update public.proj_kits k
     set status = 'pronto',
         codigo = coalesce(nullif(x->>'codigo',''), k.codigo),
         qualidade_ok = coalesce((x->>'qualidade_ok')::boolean, true),
         nao_conformidade = nullif(x->>'nao_conformidade',''),
         observacao = nullif(x->>'observacao',''),
         concluido_em = now(),
         concluido_por_nome = p_usuario->>'nome'
    from jsonb_array_elements(coalesce(p_kits, '[]'::jsonb)) x
   where k.ordem_id = p_ordem_id
     and k.tramo_unidade_id = x->>'tramo_unidade_id'
     and k.status = 'em_premontagem';

  get diagnostics v_prontos = row_count;

  if v_prontos = 0 then
    raise exception 'Nenhum kit desta ordem estava aguardando apontamento.';
  end if;

  update public.proj_tramos_gwjaco t
     set status = 'kit_pronto', updated_at = now()
   from public.proj_kits k
   where k.ordem_id = p_ordem_id and k.status = 'pronto' and t.id = k.tramo_unidade_id;

  select count(*) into v_restantes
  from public.proj_kits where ordem_id = p_ordem_id and status = 'em_premontagem' and excluido_em is null;

  if v_restantes = 0 then
    update public.proj_ordens_premontagem
       set status = 'concluida', concluida_em = now(), concluida_por_nome = p_usuario->>'nome'
     where id = p_ordem_id;
  end if;

  return jsonb_build_object('kits_concluidos', v_prontos, 'kits_restantes', v_restantes);
end;
$$;

create or replace function public.proj_entregar_producao(p_entrega jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_kit_id uuid := (p_entrega->>'kit_id')::uuid;
  v_projeto text := coalesce(p_entrega->>'projeto', 'GW_JACOBINA');
  v_kit record;
begin
  select k.* into v_kit from public.proj_kits k where k.id = v_kit_id and k.excluido_em is null;
  if not found then
    raise exception 'Kit nao encontrado.';
  end if;
  if v_kit.status <> 'pronto' then
    raise exception 'O kit % esta com status "%" — so kit pronto no buffer pode ser entregue.', v_kit.rastreio, v_kit.status;
  end if;

  insert into public.proj_entregas_producao
    (projeto, codigo, data, turno, subprojeto_id, kit_id, tramo, tramo_unidade_id,
     recebido_por_nome, observacao, criado_por_id, criado_por_nome)
  values
    (v_projeto, p_entrega->>'codigo', (p_entrega->>'data')::date, nullif(p_entrega->>'turno',''),
     nullif(p_entrega->>'subprojeto_id',''), v_kit_id, v_kit.tramo, v_kit.tramo_unidade_id,
     p_entrega->>'recebido_por_nome', nullif(p_entrega->>'observacao',''),
     nullif(p_entrega->>'criado_por_id','')::uuid, p_entrega->>'criado_por_nome')
  returning id into v_id;

  update public.proj_kits
     set status = 'entregue', entrega_id = v_id, entregue_em = now()
   where id = v_kit_id;

  update public.proj_tramos_gwjaco
     set status = 'entregue', updated_at = now()
   where id = v_kit.tramo_unidade_id;

  return jsonb_build_object('id', v_id, 'codigo', p_entrega->>'codigo', 'rastreio', v_kit.rastreio);
end;
$$;

revoke execute on function public.proj_concluir_premontagem(uuid, jsonb, jsonb) from anon;
revoke execute on function public.proj_entregar_producao(jsonb) from anon;
grant execute on function public.proj_concluir_premontagem(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.proj_entregar_producao(jsonb) to authenticated, service_role;
