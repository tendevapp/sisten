-- =====================================================================
-- Exclusao de rubrica por padrao de material (ILIKE em txt_breve).
--
-- O de-para por grupo_mercadoria funciona por CODIGO inteiro, mas o SAP as
-- vezes mistura itens de natureza diferente sob o mesmo codigo - ex.: os
-- codigos M11003001 (EPC) e M11003002 (EPI) sao majoritariamente EPI real
-- (botina, capacete, luva, mascara), mas "CINTA ELEVACAO ..." (cinta de
-- elevacao/rigging para icamento) tambem aparece la, e cinta de elevacao
-- nao e EPI nem EPC - e acessorio de icamento. Este mecanismo permite
-- excluir esses casos pontuais sem quebrar o restante do codigo.
-- =====================================================================

create table if not exists public.fin_rubrica_exclusoes_material (
  id uuid primary key default gen_random_uuid(),
  padrao_material text not null,
  motivo text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_fin_rubrica_exclusoes_padrao on public.fin_rubrica_exclusoes_material (padrao_material);

drop trigger if exists tr_fin_rubrica_exclusoes_updated_at on public.fin_rubrica_exclusoes_material;
create trigger tr_fin_rubrica_exclusoes_updated_at
  before update on public.fin_rubrica_exclusoes_material
  for each row execute function public.tocar_updated_at();

grant select, insert, update, delete on public.fin_rubrica_exclusoes_material to anon, authenticated, service_role;

alter table public.fin_rubrica_exclusoes_material enable row level security;

drop policy if exists "fin_rubrica_exclusoes_select_all" on public.fin_rubrica_exclusoes_material;
create policy "fin_rubrica_exclusoes_select_all"
  on public.fin_rubrica_exclusoes_material
  for select
  using (true);

drop policy if exists "fin_rubrica_exclusoes_all_authenticated" on public.fin_rubrica_exclusoes_material;
create policy "fin_rubrica_exclusoes_all_authenticated"
  on public.fin_rubrica_exclusoes_material
  for all
  using (true)
  with check (true);

insert into public.fin_rubrica_exclusoes_material (padrao_material, motivo) values
  ('%CINTA%ELEVA%', 'Cinta de elevação é acessório de içamento (rigging), não EPI/EPC — aparece misturada nos códigos SAP M11003001/M11003002')
on conflict (padrao_material) do nothing;

-- Reaplica as views de pedidos com a exclusao por material entrando ANTES da
-- resolucao por fornecedor/grupo_mercadoria.
drop view if exists public.vw_fin_pedidos_por_rubrica;
create view public.vw_fin_pedidos_por_rubrica with (security_invoker = true) as
select
  case
    when exists (
      select 1 from public.fin_rubrica_exclusoes_material ex
      where ex.ativo and p.txt_breve ilike ex.padrao_material
    ) then null
    else coalesce(mf.rubrica_id, mg.rubrica_id)
  end as rubrica_id,
  count(*) as qtd_itens,
  count(distinct p.doc_compra) as qtd_pedidos,
  sum(coalesce(p.valor_em_brl, p.valor_liquido, 0)) as valor_pedidos
from public.sap_zl0132_po p
left join public.fin_rubrica_mapeamentos mf
  on mf.tipo_chave = 'fornecedor'
  and mf.ativo
  and mf.chave_valor = coalesce(nullif(p.fornecedor_codigo, ''), nullif(p.cod_forn, ''))
left join public.fin_rubrica_mapeamentos mg
  on mg.tipo_chave = 'grupo_mercadoria'
  and mg.ativo
  and mg.chave_valor = p.grp_mercads
where p.data_doc >= '2026-01-01'
group by 1;

grant select on public.vw_fin_pedidos_por_rubrica to anon, authenticated, service_role;

drop view if exists public.vw_fin_pedidos_detalhe_rubrica;
create view public.vw_fin_pedidos_detalhe_rubrica with (security_invoker = true) as
select
  p.id,
  p.doc_compra,
  p.item,
  p.data_doc,
  coalesce(nullif(p.fornecedor_codigo, ''), nullif(p.cod_forn, '')) as fornecedor_codigo,
  coalesce(p.fornecedor_nome, p.fornecedor) as fornecedor_nome,
  p.cnpj_fornecedor,
  p.grp_mercads as grupo_mercadoria_codigo,
  gm.denominacao as grupo_mercadoria_nome,
  gm.classificacao_nivel1,
  gm.classificacao_nivel2,
  p.material as material_codigo,
  p.txt_breve as material_descricao,
  p.qtd_pedido,
  p.unidade_medida_pedido,
  p.preco_liquido_unit,
  p.contrato,
  p.item_contrato,
  p.tipo_doc_compra,
  p.requisitante,
  p.criado_por_pedido,
  p.cen_cen as centro,
  p.dep_dep as deposito,
  p.regiao_uf,
  p.moeda_1 as moeda,
  p.data_rc,
  p.reqc as requisicao_compra,
  coalesce(p.valor_em_brl, p.valor_liquido, 0) as valor,
  case
    when exists (
      select 1 from public.fin_rubrica_exclusoes_material ex
      where ex.ativo and p.txt_breve ilike ex.padrao_material
    ) then null
    else coalesce(mf.rubrica_id, mg.rubrica_id)
  end as rubrica_id,
  case
    when exists (
      select 1 from public.fin_rubrica_exclusoes_material ex
      where ex.ativo and p.txt_breve ilike ex.padrao_material
    ) then null
    else r.nome
  end as rubrica_nome,
  case
    when exists (
      select 1 from public.fin_rubrica_exclusoes_material ex
      where ex.ativo and p.txt_breve ilike ex.padrao_material
    ) then null
    when mf.rubrica_id is not null then 'fornecedor'
    when mg.rubrica_id is not null then 'grupo_mercadoria'
    else null
  end as origem_mapeamento
from public.sap_zl0132_po p
left join public.cadastro_grupo_mercadoria gm on gm.codigo = p.grp_mercads
left join public.fin_rubrica_mapeamentos mf
  on mf.tipo_chave = 'fornecedor'
  and mf.ativo
  and mf.chave_valor = coalesce(nullif(p.fornecedor_codigo, ''), nullif(p.cod_forn, ''))
left join public.fin_rubrica_mapeamentos mg
  on mg.tipo_chave = 'grupo_mercadoria'
  and mg.ativo
  and mg.chave_valor = p.grp_mercads
left join public.fin_rubricas r on r.id = coalesce(mf.rubrica_id, mg.rubrica_id)
where p.data_doc >= '2026-01-01';

grant select on public.vw_fin_pedidos_detalhe_rubrica to anon, authenticated, service_role;
