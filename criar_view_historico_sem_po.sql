-- =====================================================================
-- Histórico de fornecedores restrito aos materiais que hoje têm alguma
-- requisição "Sem PO" em aberto.
--
-- Contexto: a tela "Central de Compras" (Sem PO) precisa do HISTÓRICO
-- COMPLETO de fornecedores por material — inclusive compras muito antigas —
-- para sugerir a quem comprar quando não há PO ainda. Baixar
-- vw_historico_pedidos inteira (todas as compras, de todos os materiais,
-- de sempre) é caro em egress. Só precisamos das linhas cujo material
-- ainda está pendente (Sem PO); assim que o item ganha PO, ele some desta
-- view automaticamente (não precisa mais de sugestão de fornecedor).
--
-- Como view_enriched_requisicoes já calcula status_requisicao no servidor,
-- basta filtrar mv_historico_pedidos pelos materiais em aberto. O conjunto
-- resultante é pequeno (nº de materiais pendentes, não nº de compras
-- históricas), então pode ser baixado por completo, sem filtro de data.
-- =====================================================================

-- Índice de suporte para o lateral join de data_migo abaixo (evita seq scan +
-- sort na pedidosforn inteira, que estourava o statement_timeout de 8s do
-- role authenticated).
--
-- Atenção: pedidosforn tem DUAS colunas de fornecedor distintas — "cod_forn"
-- (legado, não usado por mv_historico_pedidos) e "fornecedor_codigo" (a que
-- mv_historico_pedidos usa, aliada para "cod_forn" na própria mv). O join
-- abaixo precisa casar com fornecedor_codigo, não com cod_forn.
create index if not exists idx_pedidosforn_material_fornecedor_codigo_doc_compra
  on public.pedidosforn (material, fornecedor_codigo, doc_compra);

create or replace view public.vw_historico_fornecedores_sem_po as
select
  h.*,
  c.telefone,
  c.email,
  c.classificacao,
  c.nome_fantasia,
  m.data_migo
from public.mv_historico_pedidos h
left join public.contatos c
  on c.cod_vendor = h.cod_forn
left join lateral (
  select max(p.data_migo) as data_migo
  from public.pedidosforn p
  where p.material = h.material
    and p.fornecedor_codigo = h.cod_forn
    and p.doc_compra = h.doc_compra
    and lower(coalesce(p.crf, '')) = 'x'
) m on true
where h.material in (
  select distinct v.material
  from public.view_enriched_requisicoes v
  where v.status_requisicao = 'Sem PO'
    and coalesce(v.codigo_de_eliminacao, v.eliminado, false) = false
    -- status_processamento 'B' = requisição bloqueada no SAP, aguardando liberação
    -- interna (ainda não é uma pendência real de compra) — excluída da tela.
    and coalesce(v.status_processamento, '') <> 'B'
);

grant select on public.vw_historico_fornecedores_sem_po to anon, authenticated;
