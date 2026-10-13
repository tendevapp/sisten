-- Etiqueta de identificação de material (prateleira do almoxarifado).
-- O cadastro do item guarda o que vai impresso além da localização
-- (posicao_estoque): descrição curta da etiqueta (vazia = a do SAP) e
-- aplicação ("PRODUÇÃO"). O mínimo sai em branco na etiqueta, preenchido à
-- mão. O QR leva só o código SAP — abre a Requisição no Balcão com o item;
-- editar estes campos só pede reimprimir o texto.
alter table public.alm_catalogo_itens
  add column if not exists etiqueta_descricao text,
  add column if not exists etiqueta_aplicacao text,
  add column if not exists etiqueta_impressa_em timestamptz;
