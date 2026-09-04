-- Ja aplicada no projeto remoto (via MCP). Registrada aqui para o repositorio
-- refletir o schema.
--
-- Troca a chave primaria de `ri` (item de RM) para `ri_po` (item de RM + pedido).
--
-- Motivo: uma RM/item pode ter sido comprada em mais de um PO (quantidade
-- dividida entre fornecedores, saldo, reemissao). Chegada fisica e
-- diligenciamento sao do PEDIDO -- com PK em `ri`, marcar a chegada de um PO
-- marcava o item inteiro e o segundo PO nao tinha onde ser gravado.
--
-- As colunas ri_po (e doc_compra em almoxarifado_chegadas) ja foram criadas e
-- preenchidas pela migration `chegadas_diligenciamento_coluna_ri_po`.

alter table public.almoxarifado_chegadas alter column ri_po set not null;
alter table public.almoxarifado_chegadas drop constraint almoxarifado_chegadas_pkey;
alter table public.almoxarifado_chegadas add constraint almoxarifado_chegadas_pkey primary key (ri_po);

alter table public.sup_diligenciamento_itens alter column ri_po set not null;
alter table public.sup_diligenciamento_itens drop constraint sup_diligenciamento_itens_pkey;
alter table public.sup_diligenciamento_itens add constraint sup_diligenciamento_itens_pkey primary key (ri_po);
