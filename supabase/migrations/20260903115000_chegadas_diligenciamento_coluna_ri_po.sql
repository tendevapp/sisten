-- Ja aplicada no projeto remoto (via MCP). Registrada aqui para o repositorio
-- refletir o schema.
--
-- Chegada fisica e diligenciamento sao do PEDIDO, nao do item de RM: com a RM
-- dividida em varios POs, marcar a chegada de um deles marcava o item inteiro.
-- Passam a ser identificados por ri_po (ri + pedido), a mesma chave de linha da
-- vw_sap_requisicoes_enriquecidas. A coluna `ri` continua para consultas por
-- item de RM.
alter table public.almoxarifado_chegadas add column if not exists ri_po text;
alter table public.almoxarifado_chegadas add column if not exists doc_compra text;
alter table public.sup_diligenciamento_itens add column if not exists ri_po text;

update public.almoxarifado_chegadas c
set doc_compra = p.doc_compra,
    ri_po = c.ri || '-' || coalesce(nullif(p.doc_compra, ''), 'SEM-PO')
from public.mv_pedido_atual_por_ri p
where p.ri = c.ri and c.ri_po is null;

update public.almoxarifado_chegadas
set ri_po = ri || '-SEM-PO'
where ri_po is null;

update public.sup_diligenciamento_itens
set ri_po = ri || '-' || coalesce(nullif(doc_compra, ''), 'SEM-PO')
where ri_po is null;

create index if not exists almoxarifado_chegadas_ri_idx on public.almoxarifado_chegadas (ri);
create index if not exists sup_diligenciamento_itens_ri_idx on public.sup_diligenciamento_itens (ri);
