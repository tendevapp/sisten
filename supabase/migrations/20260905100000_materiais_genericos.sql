-- =====================================================================
-- Códigos SAP genéricos
--
-- A empresa usa, em poucos casos, um código de material que cobre vários
-- produtos diferentes — "NOTEBOOK" é o exemplo clássico: um Dell i5 de 8 GB e
-- um Alienware de 32 GB entram no mesmo código.
--
-- Isso muda o significado do vínculo e o da auditoria:
--   * vincular vários itens cotados distintos ao mesmo código não é erro de
--     casamento, é o comportamento correto;
--   * comparar preços dentro de um código genérico é comparar produtos
--     diferentes. "Pedido acima do menor preço cotado" ali pode ser só um
--     notebook melhor, não uma compra ruim.
--
-- Marcar o código aqui não muda o vínculo: muda a leitura. O histórico avisa
-- que aquele preço não é comparável linha a linha e a auditoria separa essas
-- linhas das divergências de verdade.
-- =====================================================================

create table if not exists public.sup_materiais_genericos (
  material_code text primary key,
  -- Por que o código é genérico: o que varia entre os itens que ele cobre.
  motivo text,
  marcado_por text references public.core_perfis(id),
  marcado_por_nome text,
  created_at timestamptz not null default now()
);

alter table public.sup_materiais_genericos enable row level security;

drop policy if exists sup_materiais_genericos_leitura on public.sup_materiais_genericos;
create policy sup_materiais_genericos_leitura on public.sup_materiais_genericos
  for select to authenticated using (true);

-- Marca e desmarca quem já cuida de cotação — é quem topa com o código
-- genérico ao curar os vínculos e ao olhar o histórico de preço.
drop policy if exists sup_materiais_genericos_escrita on public.sup_materiais_genericos;
create policy sup_materiais_genericos_escrita on public.sup_materiais_genericos
  for all to authenticated
  using (public.pode_gerir_cotacoes())
  with check (public.pode_gerir_cotacoes());

grant select, insert, update, delete on public.sup_materiais_genericos to authenticated;

-- ------------------------------------------------------------- auditoria
-- Mesma view de antes, agora dizendo se o material é genérico. As três
-- divergências continuam sendo calculadas do mesmo jeito — quem decide se a
-- linha conta como achado é a tela, que separa o genérico do resto em vez de
-- silenciá-lo.
-- `create or replace view` não aceita coluna nova no meio da lista; como
-- ninguém depende desta view, derrubar e recriar é mais honesto que
-- empurrar as colunas novas para o fim só para agradar o replace.
drop view if exists public.vw_cotacao_pedido_auditoria;

create view public.vw_cotacao_pedido_auditoria
with (security_invoker = true) as
with cotado as (
  select v.material_code,
         regexp_replace(coalesce(p.fornecedor_cnpj, ''), '\D', '', 'g') as cnpj,
         p.fornecedor_razao_social,
         p.id as proposta_id,
         it.id as proposta_item_id,
         it.descricao_produto,
         it.preco_unitario,
         it.quantidade,
         coalesce(p.data_emissao, p.created_at::date) as data_proposta
    from public.sup_cotacao_item_vinculos v
    join public.sup_cotacao_proposta_itens it on it.id = v.proposta_item_id
    join public.sup_cotacao_propostas p on p.id = it.proposta_id
   where v.status in ('auto', 'confirmado')
     and v.material_code is not null
     and it.preco_unitario is not null
),
po as (
  select po.id as po_id, po.doc_compra, po.item, po.data_doc, po.material, po.txt_breve,
         po.preco_liquido_unit, po.qtd_pedido, po.ri, po.reqc,
         coalesce(po.fornecedor_nome, po.fornecedor) as fornecedor_pedido,
         regexp_replace(coalesce(po.cnpj, po.cnpj_fornecedor, ''), '\D', '', 'g') as cnpj
    from public.sap_zl0132_po po
   where po.material is not null
     and po.preco_liquido_unit is not null
),
vigente as (
  select * from (
    select po.po_id, po.cnpj as cnpj_pedido, c.*,
           row_number() over (partition by po.po_id, c.cnpj order by c.data_proposta desc) as rn
      from po
      join cotado c
        on c.material_code = po.material
       and c.data_proposta between po.data_doc - 180 and po.data_doc
  ) t where rn = 1
),
resumo as (
  select po_id, min(preco_unitario) as menor_preco_cotado, count(distinct cnpj) as fornecedores_cotados
    from vigente group by po_id
),
menor as (
  select distinct on (po_id)
         po_id, cnpj as cnpj_menor_preco, fornecedor_razao_social as fornecedor_menor_preco
    from vigente
   order by po_id, preco_unitario, data_proposta desc
),
propria as (
  select po_id, proposta_id, proposta_item_id, descricao_produto, preco_unitario, quantidade, data_proposta
    from vigente where cnpj = cnpj_pedido
)
select po.po_id, po.doc_compra, po.item, po.data_doc, po.material, po.txt_breve, po.ri, po.reqc,
       po.fornecedor_pedido, po.cnpj as cnpj_pedido, po.preco_liquido_unit as preco_pedido, po.qtd_pedido,
       r.fornecedores_cotados, r.menor_preco_cotado,
       m.fornecedor_menor_preco, m.cnpj_menor_preco,
       pr.proposta_id, pr.proposta_item_id, pr.descricao_produto as descricao_cotada,
       pr.preco_unitario as preco_cotado_fornecedor, pr.quantidade as qtd_cotada, pr.data_proposta,
       (g.material_code is not null) as material_generico,
       g.motivo as motivo_generico,
       (po.preco_liquido_unit - pr.preco_unitario) as delta_preco_unit,
       ((po.preco_liquido_unit - r.menor_preco_cotado) * coalesce(po.qtd_pedido, 0)) as custo_versus_menor,
       (pr.preco_unitario is not null and po.preco_liquido_unit > pr.preco_unitario + 0.01) as div_preco,
       (po.cnpj is distinct from m.cnpj_menor_preco) as div_fornecedor,
       (pr.quantidade is not null
        and abs(coalesce(po.qtd_pedido, 0) - pr.quantidade) > 0.001) as div_quantidade
  from po
  join resumo r on r.po_id = po.po_id
  join menor m on m.po_id = po.po_id
  left join propria pr on pr.po_id = po.po_id
  left join public.sup_materiais_genericos g on g.material_code = po.material;

grant select on public.vw_cotacao_pedido_auditoria to authenticated;

-- ------------------------------------------------- benchmark por código SAP
-- O histórico de preço fica muito mais útil por código do que por texto: o
-- mesmo produto vem descrito de cinco jeitos por cinco fornecedores, e é o
-- vínculo que os junta. `itens_distintos` denuncia o código genérico mesmo
-- quando ninguém o marcou: muitas descrições diferentes sob um código só.
create or replace view public.vw_cotacao_preco_por_material
with (security_invoker = true) as
select v.material_code,
       max(v.material_descricao) as material_descricao,
       (g.material_code is not null) as material_generico,
       count(*) as cotacoes,
       count(distinct public.f_norm_cotacao(it.descricao_produto)) as itens_distintos,
       count(distinct p.fornecedor_cnpj) as fornecedores,
       min(it.preco_unitario) as menor_preco,
       avg(it.preco_unitario) as preco_medio,
       max(it.preco_unitario) as maior_preco,
       max(coalesce(p.data_emissao, p.created_at::date)) as ultima_cotacao
  from public.sup_cotacao_item_vinculos v
  join public.sup_cotacao_proposta_itens it on it.id = v.proposta_item_id
  join public.sup_cotacao_propostas p on p.id = it.proposta_id
  left join public.sup_materiais_genericos g on g.material_code = v.material_code
 where v.status in ('auto', 'confirmado')
   and v.material_code is not null
   and it.preco_unitario > 0
 group by v.material_code, g.material_code;

grant select on public.vw_cotacao_preco_por_material to authenticated;
