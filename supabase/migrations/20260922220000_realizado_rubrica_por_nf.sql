-- =====================================================================
-- Realizado por Rubrica passa a ser medido pela NOTA FISCAL (ZL0136), nao
-- mais pelo pedido colocado (ZL0132).
--
-- Por que: pedido e compromisso, nao realizado. A NF de entrada e o fato
-- gerador do custo, e a ZL0136 traz o CFOP, que separa o que e gasto do que
-- e so movimentacao fiscal (remessa, retorno, comodato, bonificacao).
--
-- Leitura de controladoria (snapshot de 22/09/2026, fornecedores 2026):
--   R$ 28,2 mi em linhas de NF de fornecedor, mas nem tudo e custo:
--   - CFOP x101/x102 (industrializacao) e material direto de producao;
--   - x556/x407 (uso e consumo) e servicos (NFS-e) sao as despesas de apoio;
--   - x352/x932 sao CT-e: o SAP liga o CT-e ao pedido do material
--     transportado, entao o grupo de mercadoria herdado e o do material
--     (ex.: "Estruturas Metalicas") - a rubrica certa e FRETE, pelo CFOP;
--   - x551/x406 e imobilizado (CAPEX), fora do realizado de custeio;
--   - x9xx e remessa/retorno (conserto, comodato, demonstracao): entra e sai
--     com o mesmo valor, nao e custo;
--   - saida com CFOP de devolucao (5201, 5556, 5553...) abate o realizado.
--
-- Resolucao da rubrica (primeira regra que casar):
--   1. CFOP com natureza inequivoca (frete, energia, comunicacao) - o CT-e
--      carrega a descricao do material transportado, entao a exclusao por
--      material nao vale para ele;
--   2. exclusao por padrao de material (fin_rubrica_exclusoes_material)
--      bloqueia as regras seguintes;
--   3. de-para por fornecedor;
--   4. de-para por codigo de servico SAP (novo tipo_chave 'servico' - cobre
--      NFS-e sem pedido, que nao tem grupo de mercadoria);
--   5. de-para por grupo de mercadoria.
--
-- Grupo de mercadoria do item (primeira fonte que casar):
--   pedido+item na ZL0132 -> catalogo de materiais (ZL0169) -> pedido+material
--   na ME2L -> pedido inteiro (ZL0132/ME2L) SO quando o pedido tem um unico
--   grupo, para nao chutar grupo em pedido misto.
--
-- Deduplicacao: o snapshot da ZL0136 tem linhas 100% identicas (fora id e
-- data de importacao) - 8 linhas / R$ 80 mil no snapshot atual. Mantem uma.
-- =====================================================================

-- 1. Novo tipo de chave no de-para: codigo de servico SAP (NFS-e)
alter table public.fin_rubrica_mapeamentos
  drop constraint if exists fin_rubrica_mapeamentos_tipo_chave_check;
alter table public.fin_rubrica_mapeamentos
  add constraint fin_rubrica_mapeamentos_tipo_chave_check
  check (tipo_chave in ('fornecedor', 'grupo_mercadoria', 'servico'));

-- 2. Base item a item, classificada
create or replace view public.vw_fin_nf_realizado_rubrica
with (security_invoker = true) as
with nf_bruta as (
  select
    z.*,
    row_number() over (
      partition by (to_jsonb(z) - 'id' - 'imported_at' - 'campos_extras')
      order by z.id
    ) as ordem_duplicidade
  from public.sap_zl0136_nf z
  where z.tipo_parceiro = 'V'
    and z.data_lancamento >= '2026-01-01'
), nf as (
  select
    n.*,
    substr(n.cfop, 1, 1) as cfop_direcao,
    substr(n.cfop, 2, 3) as cfop_operacao
  from nf_bruta n
  where n.ordem_duplicidade = 1
), po_item as (
  select p.doc_compra, ltrim(p.item, '0') as item, min(p.grp_mercads) as grupo
  from public.sap_zl0132_po p
  where p.doc_compra in (select pedido from nf)
    and nullif(btrim(p.grp_mercads), '') is not null
  group by 1, 2
), po_pedido as (
  select p.doc_compra, min(p.grp_mercads) as grupo
  from public.sap_zl0132_po p
  where p.doc_compra in (select pedido from nf)
    and nullif(btrim(p.grp_mercads), '') is not null
  group by 1
  having count(distinct p.grp_mercads) = 1
), me2l_material as (
  select m.documento_compras, m.material, min(m.grupo_mercadorias) as grupo
  from public.sap_me2l_pedido m
  where m.documento_compras in (select pedido from nf)
    and nullif(btrim(m.grupo_mercadorias), '') is not null
  group by 1, 2
), me2l_pedido as (
  select m.documento_compras, min(m.grupo_mercadorias) as grupo
  from public.sap_me2l_pedido m
  where m.documento_compras in (select pedido from nf)
    and nullif(btrim(m.grupo_mercadorias), '') is not null
  group by 1
  having count(distinct m.grupo_mercadorias) = 1
), classificada as (
  select
    nf.*,
    coalesce(pi.grupo, cat.grupo_mercadoria_codigo, mm.grupo, pp.grupo, mp.grupo) as grupo_mercadoria_codigo,
    case
      when pi.grupo is not null then 'pedido_item'
      when cat.grupo_mercadoria_codigo is not null then 'catalogo_material'
      when mm.grupo is not null then 'me2l_material'
      when pp.grupo is not null or mp.grupo is not null then 'pedido_grupo_unico'
    end as origem_grupo,
    case
      when nf.categoria_nota_fiscal in ('SE', 'SA', 'ZL', 'RL') then 'SERVICO'
      when nf.cfop_direcao in ('5', '6', '7')
        and nf.cfop_operacao in ('201', '202', '410', '411', '413', '503', '553', '555', '556', '660', '661', '662')
        then 'DEVOLUCAO'
      when nf.cfop_direcao in ('5', '6', '7') then 'SAIDA_SEM_CUSTO'
      when nf.cfop_operacao in ('352', '353', '354', '355', '356', '357', '360', '931', '932') then 'FRETE'
      when nf.cfop_operacao in ('251', '252', '253', '254', '255', '256', '257') then 'ENERGIA'
      when nf.cfop_operacao in ('301', '302', '303', '304', '305', '306', '307') then 'COMUNICACAO'
      when nf.cfop_operacao in ('101', '102', '111', '113', '116', '117', '118', '120', '121', '122', '124', '125', '401', '403') then 'MATERIAL_PRODUCAO'
      when nf.cfop_operacao in ('556', '407', '653') then 'USO_CONSUMO'
      when nf.cfop_operacao in ('551', '406', '552', '553', '554', '555') then 'IMOBILIZADO'
      when nf.cfop_operacao like '9%' and nf.cfop_operacao <> '949' then 'REMESSA_RETORNO'
      else 'OUTRAS_ENTRADAS'
    end as natureza
  from nf
  left join po_item pi on pi.doc_compra = nf.pedido and pi.item = ltrim(nf.item_pedido, '0')
  left join public.sap_zl0169_162_catalogo cat on cat.material_code = nf.material
  left join me2l_material mm on mm.documento_compras = nf.pedido and mm.material = nf.material
  left join po_pedido pp on pp.doc_compra = nf.pedido
  left join me2l_pedido mp on mp.documento_compras = nf.pedido
), com_rubrica as (
  select
    c.*,
    exists (
      select 1 from public.fin_rubrica_exclusoes_material ex
      where ex.ativo
        and coalesce(c.texto_breve_material, c.descricao_servico, '') ilike ex.padrao_material
    ) as excluido_por_material,
    case c.natureza
      when 'FRETE' then 'frete'
      when 'ENERGIA' then 'energia'
      when 'COMUNICACAO' then 'material_informatica'
    end as rubrica_cfop_codigo
  from classificada c
)
select
  c.id,
  c.id_parceiro as fornecedor_codigo,
  c.descricao_parceiro as fornecedor_nome,
  c.cnpj_parceiro as cnpj_fornecedor,
  nullif(ltrim(btrim(c.numero_documento_nove_posicoes), '0'), '') as numero_nf,
  c.series as serie_nf,
  c.categoria_nota_fiscal,
  c.cfop,
  c.data_documento,
  c.data_lancamento,
  c.pedido as numero_pedido,
  c.item_pedido,
  c.material,
  c.numero_servico,
  case
    when nullif(btrim(c.material), '') is not null then 'MATERIAL'
    when nullif(btrim(c.numero_servico), '') is not null then 'SERVICO'
    else 'SEM_ITEM'
  end as tipo_item,
  coalesce(
    nullif(btrim(c.texto_breve_material), ''),
    nullif(btrim(c.descricao_servico), ''),
    nullif(btrim(c.material), ''),
    nullif(btrim(c.numero_servico), '')
  ) as descricao_item,
  c.quantidade,
  c.unidade_medida,
  c.centro,
  c.natureza,
  c.natureza in ('MATERIAL_PRODUCAO', 'USO_CONSUMO', 'SERVICO', 'FRETE', 'ENERGIA', 'COMUNICACAO', 'DEVOLUCAO')
    as entra_realizado,
  case when c.natureza = 'DEVOLUCAO' then -coalesce(c.total, 0) else coalesce(c.total, 0) end as valor,
  c.grupo_mercadoria_codigo,
  gm.denominacao as grupo_mercadoria_nome,
  gm.classificacao_nivel1,
  gm.classificacao_nivel2,
  c.origem_grupo,
  r.id as rubrica_id,
  r.nome as rubrica_nome,
  case
    when r.id is null then null
    when rc.id is not null then 'cfop'
    when mf.rubrica_id is not null then 'fornecedor'
    when ms.rubrica_id is not null then 'servico'
    when mg.rubrica_id is not null then 'grupo_mercadoria'
  end as origem_rubrica,
  pg.valor_pago_rateado,
  pg.status_pagamento,
  pg.data_ultimo_pagamento,
  c.excluido_por_material
from com_rubrica c
left join public.fin_rubricas rc on rc.codigo = c.rubrica_cfop_codigo
left join public.fin_rubrica_mapeamentos mf
  on mf.tipo_chave = 'fornecedor' and mf.ativo and mf.chave_valor = c.id_parceiro
left join public.fin_rubrica_mapeamentos ms
  on ms.tipo_chave = 'servico' and ms.ativo and ms.chave_valor = c.numero_servico
left join public.fin_rubrica_mapeamentos mg
  on mg.tipo_chave = 'grupo_mercadoria' and mg.ativo and mg.chave_valor = c.grupo_mercadoria_codigo
left join public.fin_rubricas r
  on r.id = coalesce(
    rc.id,
    case when not c.excluido_por_material then coalesce(mf.rubrica_id, ms.rubrica_id, mg.rubrica_id) end
  )
left join public.cadastro_grupo_mercadoria gm on gm.codigo = c.grupo_mercadoria_codigo
left join public.vw_fin_faturas_fornecedor_item pg on pg.id = c.id;

grant select on public.vw_fin_nf_realizado_rubrica to authenticated;
revoke all on public.vw_fin_nf_realizado_rubrica from anon;

notify pgrst, 'reload schema';

-- 3. A view busca a ZL0132 por pedido; o indice unico existente nao tem
-- doc_compra na primeira coluna e custava ~5 ms por pedido (8 s no total).
create index if not exists idx_sap_zl0132_po_doc_compra_item on public.sap_zl0132_po (doc_compra, item);
